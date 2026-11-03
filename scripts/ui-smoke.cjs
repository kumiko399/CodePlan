// Tests only our own local application, in an isolated hidden Electron window.
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
app.setPath("userData", path.join(root, ".local", "ui-test-profile"));
app.disableHardwareAcceleration();
let window;
async function wait(check) {
  for (let i = 0; i < 100; i++) {
    if (await window.webContents.executeJavaScript(check)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("UI assertion timed out: " + check);
}
async function run(code) {
  return window.webContents.executeJavaScript(code);
}
async function screenshot(name) {
  await run(
    "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
  );
  const png = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error("Screenshot frame timeout")),
      10000,
    );
    window.webContents.once("paint", (_event, _dirty, image) => {
      clearTimeout(timeout);
      resolve(image.toPNG());
    });
    window.webContents.invalidate();
  });
  fs.writeFileSync(path.join(root, ".local", name), png);
}
app.whenReady().then(async () => {
  window = new BrowserWindow({
    show: false,
    width: 1400,
    height: 1000,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      offscreen: true,
    },
  });
  const errors = [];
  let originalSettings, createdId;
  const label = `UI 验收：学习 Java ${Date.now()}`;
  const taskElement = `[...document.querySelectorAll('.task-title')].find(e=>e.textContent.trim().endsWith(${JSON.stringify(label)}))`;
  window.webContents.on("console-message", (event) => {
    if (event.level === "error") errors.push(event.message);
  });
  try {
    await window.loadURL("http://127.0.0.1:5173/");
    originalSettings = await run(`fetch('/api/settings').then(r=>r.json())`);
    await run(
      `fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify({ ...originalSettings, language: "zh", theme: "light" })})})`,
    );
    await new Promise((resolve) => {
      window.webContents.once("did-finish-load", resolve);
      window.reload();
    });
    await wait(`document.querySelector('h1')?.textContent.includes('每一步')`);
    for (let i = 0; i < 7; i++) {
      const point = await run(
        `(()=>{const r=document.querySelectorAll('.sidebar nav a')[${i}].getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`,
      );
      window.webContents.sendInputEvent({ type: "mouseMove", ...point });
      await wait(
        `getComputedStyle(document.querySelectorAll('.sidebar nav a')[${i}]).transform !== 'none'`,
      );
      assert.equal(await run(`location.hash.includes('today')`), true);
      window.webContents.sendInputEvent({ type: "mouseMove", x: 0, y: 0 });
      await wait(
        `getComputedStyle(document.querySelectorAll('.sidebar nav a')[${i}]).transform === 'none'`,
      );
    }
    window.webContents.debugger.attach("1.3");
    await window.webContents.debugger.sendCommand(
      "Emulation.setEmulatedMedia",
      { features: [{ name: "prefers-reduced-motion", value: "reduce" }] },
    );
    const firstNav = await run(
      `(()=>{const r=document.querySelector('.sidebar nav a').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`,
    );
    window.webContents.sendInputEvent({ type: "mouseMove", ...firstNav });
    assert.equal(
      await run(
        `getComputedStyle(document.querySelector('.sidebar nav a')).transform`,
      ),
      "none",
    );
    window.webContents.sendInputEvent({ type: "mouseMove", x: 0, y: 0 });
    await window.webContents.debugger.sendCommand(
      "Emulation.setEmulatedMedia",
      { features: [] },
    );
    window.webContents.debugger.detach();
    await run(`document.querySelector('[data-testid="add-task"]').click()`);
    await wait(
      `document.querySelector('[role="dialog"] input[maxlength="100"]') !== null`,
    );
    await run(
      `document.querySelector('[data-testid="task-category"]').click()`,
    );
    await wait(
      `[...document.querySelectorAll('.task-category-options [role="option"]')].some(e=>e.textContent.trim()==='🎓 课程')`,
    );
    assert.equal(
      await run(
        `document.querySelector('.task-category-options')?.querySelectorAll('[role="option"]').length`,
      ),
      14,
    );
    await run(
      `[...document.querySelectorAll('.task-category-options [role="option"]')].find(e=>e.textContent.trim()==='🎓 课程').click()`,
    );
    await run(
      `(()=>{const input=document.querySelector('[role="dialog"] input[maxlength="100"]');input.value=${JSON.stringify(label)};input.dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.trim()==='保存').click()})()`,
    );
    await wait(`!!(${taskElement})`);
    assert.equal(
      await run(
        `(${taskElement}).closest('.task-row').querySelector('.category-pill').textContent.trim()`,
      ),
      "🎓 课程",
    );
    createdId = await run(
      `fetch('/api/tasks').then(r=>r.json()).then(tasks=>tasks.find(t=>t.title===${JSON.stringify(label)}).id)`,
    );
    await new Promise((resolve) => {
      window.webContents.once("did-finish-load", resolve);
      window.reload();
    });
    await wait(`!!(${taskElement})`);
    await run(
      `document.querySelector('[data-testid="category-filter"]').click()`,
    );
    await wait(
      `[...document.querySelectorAll('.category-filter-options [role="option"]')].some(e=>e.textContent.trim()==='🎓 课程')`,
    );
    await run(
      `[...document.querySelectorAll('.category-filter-options [role="option"]')].find(e=>e.textContent.trim()==='🎓 课程').click()`,
    );
    await wait(`!!(${taskElement})`);
    await run(
      `(${taskElement}).closest('.task-row').querySelector('input[type="checkbox"]').click()`,
    );
    await wait(
      `(${taskElement})?.closest('.task-row').classList.contains('finished')`,
    );
    await screenshot("today.png");
    const beforeBackups = await run(
      `fetch('/api/backups').then(r=>r.json()).then(rows=>rows.length)`,
    );
    await run(`document.querySelector('[data-testid="save-data"]').click()`);
    await wait(
      `document.querySelector('.save-status')?.textContent.includes('已于')`,
    );
    assert.equal(
      await run(
        `fetch('/api/backups').then(r=>r.json()).then(rows=>rows.length)`,
      ),
      beforeBackups + 1,
    );
    // A failed backup must never show a new successful save or alter existing tasks.
    await run(
      `window.originalFetch = window.fetch; window.fetch = (url, options) => String(url).endsWith('/api/backups') && options?.method === 'POST' ? Promise.resolve(new Response(JSON.stringify({code:'BACKUP_WRITE_FAILED'}),{status:500,headers:{'Content-Type':'application/json'}})) : window.originalFetch(url, options); document.querySelector('[data-testid="save-data"]').click()`,
    );
    await wait(
      `document.querySelector('.save-status')?.classList.contains('save-error')`,
    );
    assert.equal(await run(`!!(${taskElement})`), true);
    await run(
      `window.fetch=window.originalFetch; delete window.originalFetch; document.querySelector('[data-testid="save-data"]').click()`,
    );
    await wait(
      `!document.querySelector('.save-status.save-error') && document.querySelector('.save-status')?.textContent.includes('已于')`,
    );
    await run(`location.hash='#/calendar'`);
    await wait(`document.querySelectorAll('.calendar-cell').length>=28`);
    assert.equal(
      await run(
        `[...document.querySelectorAll('.calendar-task')].some(e=>e.querySelector('.calendar-task-emoji')?.textContent==='🎓' && e.querySelector('.calendar-task-name')?.textContent.includes(${JSON.stringify(label)}))`,
      ),
      true,
    );
    await screenshot("calendar.png");
    await run(`location.hash='#/algorithms'`);
    await wait(`document.querySelector('h1')?.textContent==='算法'`);
    await run(`location.hash='#/statistics'`);
    await wait(`document.querySelector('.chart canvas') !== null`);
    await wait(
      `[...document.querySelectorAll('.bar-row .category-pill')].some(e=>e.textContent==='🎓 课程')`,
    );
    await run(`location.hash='#/settings'`);
    await wait(`document.querySelector('h1')?.textContent==='设置'`);
    await run(
      `[...document.querySelectorAll('.el-radio-button')].find(e=>e.textContent.trim()==='深色').click()`,
    );
    await wait(`document.documentElement.classList.contains('dark')`);
    await wait(
      `[...document.querySelectorAll('.el-radio-button.is-active')].some(e=>e.textContent.trim()==='深色') && !document.querySelector('.el-radio-group[aria-disabled="true"]')`,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    await screenshot("dark-settings.png");
    await run(
      `[...document.querySelectorAll('.el-radio-button')].find(e=>e.textContent.trim()==='浅色').click()`,
    );
    await wait(`!document.documentElement.classList.contains('dark')`);
    await run(`document.querySelector('.setting-row .el-select').click()`);
    await wait(
      `[...document.querySelectorAll('[role="option"]')].some(e=>e.textContent.trim()==='English')`,
    );
    await run(
      `[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.trim()==='English').click()`,
    );
    await wait(`document.querySelector('h1')?.textContent==='Settings'`);
    await run(`document.querySelector('.setting-row .el-select').click()`);
    await wait(
      `[...document.querySelectorAll('[role="option"]')].some(e=>e.textContent.trim()==='简体中文')`,
    );
    await run(
      `[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.trim()==='简体中文').click()`,
    );
    await wait(`document.querySelector('h1')?.textContent==='设置'`);
    const overflow = await run(
      `document.documentElement.scrollWidth>window.innerWidth`,
    );
    assert.equal(overflow, false);
    assert.equal(errors.length, 0, errors.join("\n"));
    fs.writeFileSync(
      path.join(root, ".local", "ui-verification.json"),
      JSON.stringify(
        {
          passed: true,
          checks: [
            "create task",
            "reload persistence",
            "complete task",
            "home save creates a backup; failure and retry preserve tasks",
            "calendar complete weeks",
            "14 category choices; new category creation, filter, calendar emoji/title and statistics",
            "algorithm page",
            "statistics chart",
            "theme switch",
            "language switch",
            "no horizontal overflow",
            "all seven navigation hover effects and reduced-motion preference",
          ],
          consoleErrors: errors,
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS: local UI task creation, completion, reload, navigation, charts and theme.",
    );
  } catch (e) {
    console.error(e);
    fs.writeFileSync(
      path.join(root, ".local", "ui-error.png"),
      (await window.webContents.capturePage()).toPNG(),
    );
    process.exitCode = 1;
  } finally {
    try {
      if (!createdId)
        createdId = await run(
          `fetch('/api/tasks').then(r=>r.json()).then(tasks=>tasks.find(t=>t.title===${JSON.stringify(label)})?.id)`,
        );
      if (createdId)
        await run(`fetch('/api/tasks/${createdId}',{method:'DELETE'})`);
      if (originalSettings)
        await run(
          `fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(originalSettings)})})`,
        );
    } catch (e) {
      console.error("Test cleanup failed:", e.message);
      process.exitCode = 1;
    }
    window.destroy();
    app.exit(process.exitCode || 0);
  }
});
