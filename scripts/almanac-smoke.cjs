// Hidden renderer, isolated profile, real local backend; clock/network overrides are test-only.
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
process.env.CODEPLAN_BACKGROUND_TEST = "1";
process.env.CODEPLAN_DATA_DIR = path.join(
  root,
  ".local",
  `almanac-ui-${Date.now()}`,
);
dialog.showErrorBox = (_t, m) => console.error(m);
require("../desktop/main.cjs");
let win,
  ok = false;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (s) => win.webContents.executeJavaScript(s);
async function wait(s, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await (typeof s === "function" ? s() : run(s))) return;
    await delay(100);
  }
  throw Error("Timeout: " + s);
}
const click = (selector) =>
  run(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function shot(name) {
  await delay(500);
  await win.webContents.capturePage({ stayHidden: true });
  await delay(200);
  fs.writeFileSync(
    path.join(root, ".local", name),
    (await win.webContents.capturePage({ stayHidden: true })).toPNG(),
  );
}
const watchdog = setTimeout(() => {
  console.error("Almanac watchdog");
  app.quit();
}, 180000);
app.whenReady().then(async () => {
  try {
    await wait(async () => {
      win = BrowserWindow.getAllWindows()[0];
      return (
        win?.webContents.getURL().startsWith("http://127.0.0.1:") &&
        (await run('!!document.querySelector(".home-almanac")'))
      );
    }, 120000);
    assert.equal(win.isVisible(), false);
    await wait('!document.querySelector("[data-testid=save-data]").disabled');
    const connection = await run("window.codeplan.connection()");
    async function api(p, method = "GET", body) {
      const r = await fetch(connection.base + "/api" + p, {
        method,
        headers: {
          "X-App-Token": connection.token,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.ok(r.ok);
      return r.status === 204 ? null : r.json();
    }
    const before = await api("/tasks");
    win.setSize(1500, 1000);
    await delay(300);
    assert.ok(
      await run(
        `(()=>{const a=document.querySelector('.home-almanac').getBoundingClientRect(),h=document.querySelector('.page-header').getBoundingClientRect();return a.left>=h.right&&Math.abs(a.top-h.top)<5})()`,
      ),
    );
    await shot("almanac-wide.png");
    const today = await run(
      'document.querySelector(".home-almanac").dataset.date',
    );
    await click("[data-testid=almanac-prev]");
    await wait(
      `document.querySelector('.home-almanac').dataset.date!==${JSON.stringify(today)}`,
    );
    await click("[data-testid=almanac-next]");
    await wait(
      `document.querySelector('.home-almanac').dataset.date===${JSON.stringify(today)}`,
    );
    win.webContents.debugger.attach("1.3");
    await win.webContents.debugger.sendCommand(
      "Emulation.setFocusEmulationEnabled",
      { enabled: true },
    );
    await run(`document.querySelector('.almanac-nav input').focus()`);
    await wait(
      `!![...document.querySelectorAll('.el-date-table td.available')].find(e=>e.checkVisibility()&&!e.classList.contains('current')&&!e.classList.contains('disabled'))`,
    );
    await run(
      `[...document.querySelectorAll('.el-date-table td.available')].find(e=>e.checkVisibility()&&!e.classList.contains('current')&&!e.classList.contains('disabled')).click()`,
    );
    await wait(
      `document.querySelector('.home-almanac').dataset.date!==${JSON.stringify(today)}`,
    );
    await click("[data-testid=almanac-today]");
    win.webContents.debugger.detach();
    // Same day's values do not depend on requests; offline calendar remains interactive.
    await run(
      `window.savedFetch=window.fetch;window.fetch=async()=>{throw Error('Test offline')};window.RealDate=Date;window.mockTime=new RealDate(2024,1,10,23,59,59).getTime();window.Date=class extends RealDate{constructor(...a){super(...(a.length?a:[window.mockTime]))}static now(){return window.mockTime}};window.dispatchEvent(new Event('focus'))`,
    );
    await wait(
      `document.querySelector('.home-almanac').dataset.date==='2024-02-10'`,
    );
    assert.ok(
      await run(
        `document.querySelector('.almanac-date').textContent.includes('正月初一')`,
      ),
    );
    assert.ok(
      await run(
        `[...document.querySelectorAll('.almanac-activities ul')].every(e=>e.children.length<=3)`,
      ),
    );
    await click("[data-testid=almanac-expand]");
    await wait(
      `document.querySelector('[data-testid=almanac-expand]').getAttribute('aria-expanded')==='true'`,
    );
    assert.ok(
      await run(
        `document.querySelector('.almanac-activities').querySelectorAll('li').length>6`,
      ),
    );
    await click("[data-testid=almanac-expand]");
    await run("window.mockTime=new RealDate(2024,1,11,0,0,1).getTime()");
    await wait(
      `document.querySelector('.home-almanac').dataset.date==='2024-02-11'`,
      4000,
    );
    await click("[data-testid=almanac-prev]");
    await run(
      `window.mockTime=new RealDate(2024,2,1,12).getTime();document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'))`,
    );
    assert.equal(
      await run(`document.querySelector('.home-almanac').dataset.date`),
      "2024-02-10",
    );
    await click("[data-testid=almanac-today]");
    await wait(
      `document.querySelector('.home-almanac').dataset.date==='2024-03-01'`,
    );
    await run(
      `window.Date=window.RealDate;window.fetch=window.savedFetch;window.dispatchEvent(new Event('focus'))`,
    );
    assert.deepEqual(await api("/tasks"), before);
    await click("[data-testid=save-data]");
    await wait(
      `document.querySelector('.save-status').textContent.includes('已')`,
    );
    await click("[data-testid=add-task]");
    await wait(
      `!![...document.querySelectorAll('.el-dialog')].find(e=>e.checkVisibility())`,
    );
    await run(
      `[...document.querySelectorAll('.el-dialog__footer button')].find(e=>e.textContent.trim()==='取消').click()`,
    );
    await wait(
      `![...document.querySelectorAll('.el-overlay')].some(e=>e.checkVisibility())`,
    );
    await click(".weather-home-link");
    await wait(`location.hash.includes('weather')`);
    assert.equal(await run(`!!document.querySelector('.home-almanac')`), false);
    await run(`location.hash='#/today'`);
    await wait(`!!document.querySelector('.home-almanac')`);
    await wait(
      `document.querySelector('.home-almanac').dataset.date===${JSON.stringify(today)}`,
    );
    win.setSize(850, 1000);
    await run(`document.documentElement.classList.add('dark')`);
    await delay(400);
    assert.ok(
      await run(
        `(()=>{const a=document.querySelector('.home-almanac').getBoundingClientRect(),h=document.querySelector('.page-header').getBoundingClientRect(),w=document.querySelector('.weather-summary').getBoundingClientRect();return a.top>=h.bottom&&w.top>=a.bottom&&document.documentElement.scrollWidth<=innerWidth})()`,
      ),
    );
    await shot("almanac-dark-narrow.png");
    assert.equal(
      await run(
        `getComputedStyle(document.querySelector('.almanac-yi h3')).color`,
      ),
      "rgb(136, 204, 158)",
    );
    assert.equal(
      await run(
        `getComputedStyle(document.querySelector('.almanac-ji h3')).color`,
      ),
      "rgb(237, 165, 148)",
    );
    const settings = await api("/settings");
    await api("/settings", "PUT", { ...settings, language: "en" });
    await win.webContents.reload();
    await wait(
      `document.querySelector('.home-almanac')?.textContent.includes('Daily almanac')`,
    );
    assert.ok(
      await run(
        `document.querySelector('.home-almanac').textContent.includes('Chinese')`,
      ),
    );
    // Keyboard event dispatched within a hidden renderer, no native window focus.
    win.webContents.debugger.attach("1.3");
    await win.webContents.debugger.sendCommand(
      "Emulation.setFocusEmulationEnabled",
      { enabled: true },
    );
    await run(`document.querySelector('[data-testid=almanac-prev]').focus()`);
    await win.webContents.debugger.sendCommand("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      text: "\r",
    });
    await win.webContents.debugger.sendCommand("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    });
    await wait(
      `document.querySelector('.home-almanac').dataset.date!==${JSON.stringify(today)}`,
    );
    win.webContents.debugger.detach();
    await shot("almanac-english.png");
    assert.equal(win.isVisible(), false);
    ok = true;
    console.log(
      "PASS: almanac layout, picker/arrows/today, expand, offline, midnight/wake, keyboard, English/dark/narrow, save/add/weather regression.",
    );
  } catch (e) {
    console.error(e);
    console.error(
      await run(
        `JSON.stringify({inputs:[...document.querySelectorAll('.almanac-nav input')].map(e=>e.outerHTML),pop:[...document.querySelectorAll('.el-picker-panel')].map(e=>({html:e.outerHTML.slice(0,2200),visible:e.checkVisibility()})),cells:[...document.querySelectorAll('td')].slice(0,12).map(e=>e.className)})`,
      ).catch(() => ""),
    );
    console.error(
      await run("document.body.innerText.slice(-1500)").catch(() => ""),
    );
  } finally {
    clearTimeout(watchdog);
    await run("window.codeplanExiting=true;void 0").catch(() => {});
    app.quit();
  }
});
app.on("will-quit", (e) => {
  e.preventDefault();
  app.exit(ok ? 0 : 1);
});
