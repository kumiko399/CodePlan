const { app, BrowserWindow, dialog } = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
process.env.CODEPLAN_DATA_DIR = path.join(
  root,
  ".local",
  `calendar-ui-${Date.now()}`,
);
dialog.showErrorBox = (_t, message) => {
  console.error(message);
  app.quit();
};
require("../desktop/main.cjs");
let window,
  connection,
  complete = false,
  stage = "startup";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (code) => window.webContents.executeJavaScript(code);
async function wait(check, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await (typeof check === "string" ? run(check) : check())) return;
    await delay(100);
  }
  throw Error("Calendar timeout: " + stage + " / " + check);
}
async function request(endpoint, method = "GET", body) {
  const r = await fetch(connection.base + "/api" + endpoint, {
    method,
    headers: {
      "X-App-Token": connection.token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw Error(endpoint + ": " + r.status + " " + (await r.text()));
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
async function clickText(text) {
  await wait(
    `[...document.querySelectorAll('button')].some(e=>e.checkVisibility()&&!e.disabled&&e.textContent.trim()===${JSON.stringify(text)})`,
  );
  await run(
    `(()=>{const e=[...document.querySelectorAll('button')].filter(e=>e.checkVisibility()&&!e.disabled&&e.textContent.trim()===${JSON.stringify(text)}).at(-1);if(!e) throw Error('Button missing');e.click();})()`,
  );
}
const key = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = key(new Date()),
  shift = (n) => {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() + n);
    return key(d);
  };
async function drag(id, day) {
  await run(
    `(()=>{const task=document.querySelector('.calendar-task[data-task-id="${id}"]'),target=document.querySelector('.calendar-cell[data-day="${day}"]');const data=new DataTransfer();task.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));target.dispatchEvent(new DragEvent('dragover',{bubbles:true,dataTransfer:data,cancelable:true}));if(!target.classList.contains('drop-target')) {/* Vue patches next tick */}target.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data,cancelable:true}));})()`,
  );
}
async function screenshot(name) {
  await run(
    "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
  );
  await delay(250);
  fs.writeFileSync(
    path.join(root, ".local", name),
    (await window.webContents.capturePage()).toPNG(),
  );
}
const watchdog = setTimeout(() => {
  console.error("Timeout", stage);
  app.quit();
}, 180000);
app.whenReady().then(async () => {
  try {
    await wait(async () => {
      window = BrowserWindow.getAllWindows()[0];
      return (
        window?.webContents.getURL().startsWith("http://127.0.0.1:") &&
        (await run('!!document.querySelector("[data-testid=add-task]")'))
      );
    }, 120000);
    window.webContents.setBackgroundThrottling(false);
    connection = await run("window.codeplan.connection()");
    const ids = [];
    for (let i = 0; i < 12; i++) {
      const task = await request("/tasks", "POST", {
        title:
          i === 0
            ? "篮球训练与体能恢复：这是一个很长的任务名称，需要在当天详情中完整显示"
            : "日历验收任务 " + i,
        category: i % 2 ? "study" : "sport",
        planDate: today,
        taskTime: i === 0 ? "09:00" : null,
        priority: i === 0 ? "high" : "low",
        notes: "备注完整显示 <script>window.CALENDAR_INJECTED=true</script>",
        status: i > 9 ? "done" : "todo",
        details: {
          deadlineDate: i === 1 ? shift(-1) : null,
          deadlineTime: null,
          deletedAt: null,
          emoji: i === 0 ? "🏀" : null,
          subtasks: [{ id: "step" + i, title: "准备器材", done: i > 9 }],
        },
      });
      ids.push(task.id);
    }
    const delayed = await request("/tasks", "POST", {
      title: "延期任务快捷处理",
      category: "study",
      planDate: shift(-1),
      priority: "high",
      notes: "保留原备注",
      status: "todo",
    });
    const custom = await request("/categories", "POST", {
      name: "实验室",
      emoji: "🔬",
      color: "teal",
      active: true,
    });
    await request("/tasks", "POST", {
      title: "实验记录",
      category: custom.id,
      planDate: shift(1),
      priority: "medium",
      notes: "",
      status: "todo",
    });
    window.webContents.reload();
    await wait(() => !window.webContents.isLoading());
    await run("location.hash='#/calendar';void 0");
    await wait('document.querySelectorAll(".calendar-task").length>=4');
    stage = "compact month";
    const cell = `document.querySelector('.calendar-cell[data-day="${today}"]')`;
    assert.equal(
      await run(`${cell}.querySelectorAll('.calendar-task').length`),
      3,
    );
    assert.ok(
      await run(`${cell}.querySelector('.more').textContent.includes('9')`),
    );
    assert.equal(
      await run(
        `document.querySelector('.calendar-task[data-task-id="${ids[0]}"] .calendar-task-emoji').textContent`,
      ),
      "🏀",
    );
    assert.equal(
      await run('!!document.querySelector(".calendar-task.late")'),
      true,
    );
    assert.equal(
      await run(
        'document.querySelectorAll(".calendar-cell button button").length',
      ),
      0,
    );
    assert.ok(
      await run(
        `${cell}.querySelector('.calendar-task').title.includes('篮球训练与体能恢复')`,
      ),
    );
    window.setSize(1660, 1050);
    await delay(300);
    await run(`${cell}.querySelector('.more').click()`);
    await wait('!!document.querySelector(".calendar-side")');
    assert.equal(
      await run('document.querySelectorAll(".calendar-side .day-task").length'),
      12,
    );
    assert.equal(await run("window.CALENDAR_INJECTED===undefined"), true);
    assert.equal(await run(`${cell}.querySelector('progress').value`), 2);
    assert.equal(await run(`${cell}.querySelector('progress').max`), 12);
    assert.ok(
      await run(
        `document.querySelector('.calendar-task[data-task-id="${ids[1]}"] .calendar-task-state').title.includes('已超过截止时间')`,
      ),
    );
    assert.equal(
      await run("document.documentElement.scrollWidth<=window.innerWidth+1"),
      true,
    );
    await delay(500);
    await screenshot("calendar-wide.png");
    stage = "filters";
    await run(
      'document.querySelector("[data-testid=calendar-hide-done] input").click()',
    );
    await wait(
      'document.querySelectorAll(".calendar-side .day-task").length===10',
    );
    await run(
      'document.querySelector("[data-testid=calendar-category-filter] .el-select__wrapper").click()',
    );
    await wait(
      '[...document.querySelectorAll(".el-select-dropdown__item")].some(e=>e.checkVisibility()&&e.textContent.includes("运动"))',
    );
    await run(
      '[...document.querySelectorAll(".el-select-dropdown__item")].find(e=>e.checkVisibility()&&e.textContent.includes("运动")).click()',
    );
    await wait(
      'document.querySelectorAll(".calendar-side .day-task").length===5',
    );
    assert.equal(await run(`${cell}.querySelector('progress').value`), 2);
    assert.equal(await run(`${cell}.querySelector('progress').max`), 12);
    assert.equal(
      await run(`document.querySelector('.calendar-side progress').max`),
      12,
    );
    await clickText("清除筛选");
    await wait(
      'document.querySelectorAll(".calendar-side .day-task").length===12',
    );
    stage = "quick add emoji";
    await run(
      `document.querySelector('.calendar-cell[data-day="${shift(2)}"] .calendar-quick-add').click()`,
    );
    await wait('!!document.querySelector("[data-testid=task-emoji-picker]")');
    assert.equal(
      await run(
        `[...document.querySelectorAll('.el-dialog input')].some(e=>e.value==='${shift(2)}')`,
      ),
      true,
    );
    await run(
      `(()=>{const e=document.querySelector('.el-dialog .el-input input[maxlength="100"]');e.value='修复日历 Bug';e.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[aria-label="选择图标 🐛"]').click();})()`,
    );
    await clickText("保存");
    await wait(
      `!!document.querySelector('.calendar-cell[data-day="${shift(2)}"] .calendar-task')`,
    );
    assert.equal(
      await run(
        `document.querySelector('.calendar-cell[data-day="${shift(2)}"] .calendar-task-emoji').textContent`,
      ),
      "🐛",
    );
    stage = "failed drag and undo";
    await run(
      'window.realFetch=window.fetch;window.fetch=(url,options)=>options?.method==="PUT" && String(url).includes("/api/tasks/")?Promise.resolve(new Response(JSON.stringify({code:"OPERATION_FAILED"}),{status:500,headers:{"Content-Type":"application/json"}})):window.realFetch(url,options);void 0',
    );
    await drag(ids[0], shift(1));
    await window.webContents.capturePage({ stayHidden: true, stayAwake: true });
    await wait(
      '![...document.querySelectorAll(".el-message-box")].some(e=>e.checkVisibility())',
    );
    await wait(
      'document.querySelector(".calendar-v2").getAttribute("aria-busy")==="false"',
    );
    assert.equal(
      (await request("/tasks")).find((t) => t.id === ids[0]).planDate,
      today,
    );
    assert.ok(
      await run(`${cell}.querySelector('[data-task-id="${ids[0]}"]')!==null`),
    );
    await run("window.fetch=window.realFetch;void 0");
    await drag(ids[0], shift(1));
    await wait('!!document.querySelector(".calendar-undo")');
    const moved = (await request("/tasks")).find((t) => t.id === ids[0]);
    assert.equal(moved.planDate, shift(1));
    await request("/tasks/" + moved.id, "PUT", {
      ...moved,
      notes: "改期后的新备注",
    });
    await clickText("撤销改期");
    await wait('!document.querySelector(".calendar-undo")');
    const restored = (await request("/tasks")).find((t) => t.id === ids[0]);
    assert.equal(restored.planDate, today);
    assert.equal(restored.notes, "改期后的新备注");
    stage = "narrow drawer and completion";
    await run(`${cell}.querySelector('.calendar-date').click()`);
    window.setSize(850, 740);
    await wait(
      '!!document.querySelector(".el-drawer [data-testid=calendar-detail]")',
    );
    assert.equal(
      await run('document.querySelectorAll(".el-drawer .day-task").length'),
      12,
    );
    assert.equal(
      await run("document.documentElement.scrollWidth<=window.innerWidth+1"),
      true,
    );
    await run(
      `document.querySelector('.el-drawer .day-task[data-task-id="${ids[0]}"] .day-task-title').click()`,
    );
    await wait('!!document.querySelector("[data-testid=task-emoji-picker]")');
    assert.equal(
      await run(
        `document.querySelector('[aria-label="选择图标 🏀"]').getAttribute('aria-pressed')`,
      ),
      "true",
    );
    await clickText("取消");
    await run('document.querySelector(".el-drawer__close-btn").click()');
    await wait(
      '!document.querySelector(".el-drawer [data-testid=calendar-detail]")',
    );
    await delay(3200);
    await run(`${cell}.scrollIntoView({block:'center'})`);
    await screenshot("calendar-narrow.png");
    stage = "delayed task quick actions and progress";
    window.setSize(1660, 1050);
    await delay(300);
    const delayedCell = `document.querySelector('.calendar-cell[data-day="${shift(-1)}"]')`;
    if (!(await run(`!!${delayedCell}`))) {
      await run(
        `document.querySelector('.calendar-navigation button').click()`,
      );
      await wait(`!!${delayedCell}`);
    }
    assert.ok(
      await run(
        `${delayedCell}.querySelector('.calendar-task.delayed .calendar-task-state').title.includes('计划日期')`,
      ),
    );
    await run(`${delayedCell}.querySelector('.calendar-date').click()`);
    await wait('!!document.querySelector(".calendar-side .day-task")');
    await clickText("移到今天");
    await wait(
      async () =>
        (await request("/tasks")).find((t) => t.id === delayed.id).planDate ===
        today,
    );
    await wait('!!document.querySelector(".calendar-undo")');
    await clickText("撤销改期");
    await wait('!document.querySelector(".calendar-undo")');
    assert.equal(
      (await request("/tasks")).find((t) => t.id === delayed.id).planDate,
      shift(-1),
    );
    await clickText("改期");
    await wait(
      '!!document.querySelector("[data-testid=calendar-reschedule-date]")',
    );
    await clickText("保存"); // Defaults to today; uses the same safe move path.
    await wait(
      async () =>
        (await request("/tasks")).find((t) => t.id === delayed.id).planDate ===
        today,
    );
    await wait(
      '!document.querySelector("[data-testid=calendar-reschedule-date]")',
    );
    assert.equal(
      (await request("/tasks")).find((t) => t.id === delayed.id).notes,
      "保留原备注",
    );
    await clickText("撤销改期");
    await wait('!document.querySelector(".calendar-undo")');
    await clickText("标为完成");
    await wait(
      async () =>
        (await request("/tasks")).find((t) => t.id === delayed.id).status ===
        "done",
    );
    await wait(`${delayedCell}.querySelector('progress').value===1`);
    assert.equal(
      await run(
        `${delayedCell}.querySelectorAll('.calendar-task.delayed').length`,
      ),
      0,
    );
    await clickText("回到今天");
    await run(`${cell}.querySelector('.calendar-date').click()`);
    const missedRow = `document.querySelector('.calendar-side .day-task[data-task-id="${ids[1]}"]')`;
    await wait(`!!${missedRow}`);
    assert.ok(
      await run(`${missedRow}.textContent.includes('改期不会改变截止时间')`),
    );
    assert.ok(
      await run(
        `[...${missedRow}.querySelectorAll('button')].find(e=>e.textContent.trim()==='移到今天').disabled`,
      ),
    );
    stage = "deadline warning cancellation";
    await drag(ids[1], shift(1));
    await wait('!!document.querySelector(".el-message-box")');
    assert.ok(
      await run(
        `document.querySelector('.el-message-box').textContent.includes('仅修改计划日期')`,
      ),
    );
    await run(
      `document.querySelector('.el-message-box__btns .el-button:not(.el-button--primary)').click()`,
    );
    await wait(
      'document.querySelector(".calendar-v2").getAttribute("aria-busy")==="false"',
    );
    assert.equal(
      (await request("/tasks")).find((t) => t.id === ids[1]).planDate,
      today,
    );
    await window.webContents.capturePage({ stayHidden: true, stayAwake: true });
    await wait(
      '![...document.querySelectorAll(".el-message-box")].some(e=>e.checkVisibility())',
    );
    await run(
      `(()=>{const button=[...${missedRow}.querySelectorAll('button')].find(e=>e.textContent.trim()==='标为完成');button.click();button.click();})()`,
    );
    await wait('!!document.querySelector(".el-message-box")');
    await delay(250);
    assert.equal(
      await run(
        `[...document.querySelectorAll('.el-message-box')].filter(e=>e.checkVisibility()).length`,
      ),
      1,
    );
    await run(
      `document.querySelector('.el-message-box__btns .el-button--primary').click()`,
    );
    await wait(
      async () =>
        (await request("/tasks")).find((t) => t.id === ids[1]).status ===
        "done",
    );
    await wait(`${cell}.querySelector('progress').value===3`);
    assert.equal(
      await run(`${missedRow}.querySelectorAll('.calendar-delay').length`),
      0,
    );
    await screenshot("calendar-status-progress.png");
    const settings = await request("/settings");
    await request("/settings", "PUT", {
      ...settings,
      language: "en",
      theme: "dark",
    });
    window.webContents.reload();
    await wait(() => !window.webContents.isLoading());
    await wait(
      'document.querySelector(".calendar-v2") && document.documentElement.classList.contains("dark")',
    );
    assert.equal(
      await run("document.documentElement.scrollWidth<=window.innerWidth+1"),
      true,
    );
    await run(
      '[...document.querySelectorAll(".el-radio-button")].find(e=>e.textContent.includes("Week")).click()',
    );
    await wait('document.querySelectorAll(".calendar-cell").length===7');
    await screenshot("calendar-dark-week.png");
    complete = true;
    fs.writeFileSync(
      path.join(root, ".local/calendar-verification.json"),
      JSON.stringify(
        {
          passed: true,
          checks: [
            "12 tasks capped at 3 rows",
            "emoji and long title",
            "wide details and narrow drawer",
            "category and status filters",
            "quick add with persistent emoji",
            "failed move preserved date",
            "undo kept latest notes",
            "dark English week view",
            "850px no horizontal overflow",
            "plan delay versus deadline missed with explicit reasons",
            "all-task progress unchanged by filters",
            "move to today, reschedule, undo and completion",
          ],
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS: compact emoji calendar, responsive details, filters, quick add, failed move and undo.",
    );
  } catch (error) {
    console.error(stage, error);
    console.error(
      await run("document.body.innerText.slice(-2400)").catch(() => ""),
    );
  } finally {
    clearTimeout(watchdog);
    await run("window.codeplanExiting=true;void 0").catch(() => {});
    app.quit();
  }
});
app.on("will-quit", (event) => {
  event.preventDefault();
  app.exit(complete ? 0 : 1);
});
