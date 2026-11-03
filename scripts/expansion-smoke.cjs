// Isolated real desktop: draft persistence, failed saves and retained editing UI.
const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
process.env.CODEPLAN_DATA_DIR = path.join(
  root,
  ".local",
  `expansion-ui-${Date.now()}`,
);
dialog.showErrorBox = (_title, message) => {
  console.error(message);
  process.exitCode = 1;
  app.quit();
};
require("../desktop/main.cjs");
let window,
  complete = false;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let stage = "startup";
const watchdog = setTimeout(() => {
  console.error("Timed out at stage:", stage);
  app.quit();
}, 180000);
const run = async (code) => {
  try {
    return await window.webContents.executeJavaScript(code);
  } catch (error) {
    console.error("Failed application check:", code);
    throw error;
  }
};
async function wait(code, limit = 15000) {
  const end = Date.now() + limit;
  while (Date.now() < end) {
    if (await run(code)) return;
    await delay(100);
  }
  console.error(await run("document.body.innerText.slice(-5000)"));
  console.error(
    await run(
      '[...document.querySelectorAll(".el-dialog")].map(e=>({width:e.offsetWidth,text:e.textContent.slice(0,80),parent:e.parentElement.outerHTML.slice(0,200)}))',
    ),
  );
  throw new Error(`UI check timed out: ${code}`);
}
async function click(text) {
  const find = `(()=>{const candidates=[...document.querySelectorAll('button')].filter(e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) && !e.disabled && !e.classList.contains('is-loading') && e.textContent.trim()===${JSON.stringify(text)}); const modal=candidates.filter(e=>e.closest('.el-dialog,.el-message-box'));return (modal.length?modal:candidates).at(-1)})()`;
  await wait(`!!${find}`);
  await run(`${find}.click()`);
}
async function fill(selector, text) {
  await run(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(text)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
}
app.whenReady().then(async () => {
  try {
    const end = Date.now() + 120000;
    while (Date.now() < end) {
      window = BrowserWindow.getAllWindows()[0];
      if (
        window?.webContents.getURL().startsWith("http://127.0.0.1:") &&
        (await run('!!document.querySelector("[data-testid=add-task]")'))
      )
        break;
      await delay(200);
    }
    await wait('!!document.querySelector("[data-testid=add-task]")');
    stage = "navigation and draft";
    console.log(stage);
    window.webContents.setBackgroundThrottling(false);
    const consoleErrors = [];
    window.webContents.on("console-message", (event) => {
      if (event.level === "error") consoleErrors.push(event.message);
    });
    for (let i = 0; i < 6; i++) {
      const point = await run(
        `(()=>{const r=document.querySelectorAll('.sidebar nav a')[${i}].getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`,
      );
      window.webContents.sendInputEvent({ type: "mouseMove", ...point });
      await wait(
        `getComputedStyle(document.querySelectorAll('.sidebar nav a')[${i}]).transform!=='none'`,
      );
      window.webContents.sendInputEvent({ type: "mouseMove", x: 0, y: 0 });
      await wait(
        `getComputedStyle(document.querySelectorAll('.sidebar nav a')[${i}]).transform==='none'`,
      );
    }
    await run('document.querySelector("[data-testid=add-task]").click()');
    await wait('!!document.querySelector(".el-dialog input")');
    await fill(".el-dialog input", "草稿重启验收");
    await wait('document.body.textContent.includes("草稿已保留")');
    const stored = await run("window.codeplan.readDrafts()");
    assert.equal(Object.values(stored)[0].payload.fields.title, "草稿重启验收");
    window.webContents.on("will-prevent-unload", (event) =>
      event.preventDefault(),
    );
    window.reload();
    await delay(500);
    await wait('!!document.querySelector("[data-testid=add-task]")');
    await run('document.querySelector("[data-testid=add-task]").click()');
    await wait('document.body.textContent.includes("发现此记录的本地草稿")');
    await click("恢复草稿");
    await wait(
      'document.querySelector(".el-dialog input")?.value === "草稿重启验收"',
    );
    await run(
      `window.actualFetch=window.fetch;window.fetch=(url,options)=>String(url).includes('/api/tasks')&&options?.method==='POST'?Promise.reject(new TypeError('offline')):window.actualFetch(url,options);void 0`,
    );
    await click("保存");
    await wait('document.body.textContent.includes("本地服务断开")');
    assert.equal(
      await run('document.querySelector(".el-dialog input").value'),
      "草稿重启验收",
    );
    await run("window.fetch=window.actualFetch;void 0");
    await wait(
      '[...document.querySelectorAll(".el-dialog button")].some(e=>e.textContent.trim()==="保存" && !e.disabled && !e.classList.contains("is-loading"))',
    );
    await click("保存");
    await wait('!document.querySelector(".el-dialog")?.offsetWidth');
    await wait(
      '[...document.querySelectorAll(".task-title")].some(e=>e.textContent.trim().endsWith("草稿重启验收"))',
    );
    assert.equal(
      Object.keys(await run("window.codeplan.readDrafts()")).length,
      0,
    );
    await fill(".filters input", "没有这项任务");
    await wait('document.body.textContent.includes("没有符合筛选条件")');
    await click("清除筛选");
    await wait(
      '[...document.querySelectorAll(".task-title")].some(e=>e.textContent.trim().endsWith("草稿重启验收"))',
    );
    await run(
      `window.testCall=async (endpoint,method='GET',body)=>{ const c=await window.codeplan.connection();const response=await fetch(c.base+'/api'+endpoint,{method,headers:{'X-App-Token':c.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!response.ok)throw Error(await response.text());const text=await response.text();return text?JSON.parse(text):null;};void 0`,
    );
    await run(
      `(async()=>{const task=(await window.testCall('/tasks'))[0];await window.testCall('/tasks/'+task.id,'PUT',{...task,details:{deadlineDate:task.planDate,deadlineTime:'23:59',subtasks:[{id:crypto.randomUUID(),title:'先阅读题目',done:false}],deletedAt:null}})})()`,
    );
    window.reload();
    await delay(500);
    await wait('!!document.querySelector(".deadline-label")');
    await run('document.querySelector(".task-title").click()');
    await wait(
      'document.querySelector(".subtask-row input.el-input__inner")?.value === "先阅读题目"',
    );
    await run(
      'document.querySelector(".subtask-row .el-checkbox input").click()',
    );
    await click("保存");
    await wait('!document.querySelector(".el-dialog")?.offsetWidth');
    await wait('document.body.textContent.includes("1/1")');
    await run(
      '[...document.querySelectorAll(".sidebar nav a")].find(e=>e.getAttribute("href").includes("tasks")).click()',
    );
    await wait('!!document.querySelector(".task-title")');
    await click("删除");
    await wait('!!document.querySelector(".el-message-box")');
    await click("确认");
    await wait('!document.querySelector(".task-title")');
    await run(
      '[...document.querySelectorAll(".page-actions button")].find(e=>e.textContent.includes("回收站")).click()',
    );
    await wait(
      'document.querySelector(".el-dialog")?.textContent.includes("草稿重启验收")',
    );
    await click("恢复任务");
    await wait('!!document.querySelector(".task-title")');
    await run(
      '[...document.querySelectorAll(".el-dialog")].filter(e=>e.offsetWidth).at(-1).querySelector(".el-dialog__headerbtn").click()',
    );
    await wait(
      '![...document.querySelectorAll(".el-dialog")].some(e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))',
    );
    await wait(
      '![...document.querySelectorAll(".el-dialog")].some(e=>e.offsetWidth)',
    );
    stage = "focus and background";
    console.log(stage);
    await click("🍅 开始专注");
    await wait('!!document.querySelector(".focus-bar")');
    window.hide();
    await delay(6000);
    window.show();
    assert.equal(
      await run(
        `(async()=>{const c=await window.codeplan.connection();const data=await fetch(c.base+'/api/focus',{headers:{'X-App-Token':c.token}}).then(r=>r.json());return data.records[0].spans.reduce((n,s)=>n+(new Date(s.end)-new Date(s.start))/1000,0)>=5})()`,
      ),
      true,
      "Minimized focus keeps verified intervals",
    );
    await click("暂停");
    await wait(
      'document.querySelector(".focus-bar")?.textContent.includes("已暂停")',
    );
    await click("继续");
    await wait(
      'document.querySelector(".focus-bar")?.textContent.includes("专注中")',
    );
    await click("结束并保存");
    await wait('!document.querySelector(".focus-bar")');
    stage = "exit draft protection";
    console.log(stage);
    await run('document.querySelector("[data-testid=add-task]").click()');
    await wait('!!document.querySelector(".el-dialog input")');
    await fill(".el-dialog input", "退出时保留的草稿");
    await wait('document.body.textContent.includes("草稿已保留")');
    const cancelledExit = run("window.codeplanBeforeExit()");
    await wait(
      'document.querySelector(".el-message-box")?.textContent.includes("保留草稿后退出")',
    );
    await run('document.querySelector(".el-message-box__headerbtn").click()');
    assert.equal(await cancelledExit, false);
    await wait(
      '![...document.querySelectorAll(".el-message-box")].some(e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))',
    );
    console.log("cancel draft exit passed");
    const keptExit = run("window.codeplanBeforeExit()");
    await click("保留草稿后退出");
    assert.equal(await keptExit, true);
    console.log("keep draft exit passed");
    assert.equal(
      Object.values(await run("window.codeplan.readDrafts()")).some(
        (d) => d.payload.fields?.title === "退出时保留的草稿",
      ),
      true,
    );
    await run("window.codeplanExiting=false");
    await click("取消");
    await wait(
      'document.querySelector(".el-message-box")?.textContent.includes("关闭后会保留")',
    );
    await click("确认");
    await wait(
      '![...document.querySelectorAll(".el-dialog")].some(e=>e.offsetWidth)',
    );
    await click("🍅 开始专注");
    await wait('!!document.querySelector(".focus-bar")');
    stage = "exit focus protection";
    console.log(stage);
    const focusCancelExit = run("window.codeplanBeforeExit()");
    await wait(
      'document.querySelector(".el-message-box")?.textContent.includes("专注计时尚未结束")',
    );
    await click("取消");
    assert.equal(await focusCancelExit, false);
    console.log("cancel focus exit passed");
    await wait(
      '![...document.querySelectorAll(".el-message-box")].some(e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))',
    );
    const focusSaveExit = run("window.codeplanBeforeExit()");
    await wait(
      'document.querySelector(".el-message-box")?.textContent.includes("专注计时尚未结束")',
    );
    await click("确认");
    assert.equal(await focusSaveExit, true);
    await run("window.codeplanExiting=false");
    await wait('!document.querySelector(".focus-bar")');
    stage = "templates and calendar";
    console.log(stage);
    await run(
      `window.testCall=async (endpoint,method='GET',body)=>{const c=await window.codeplan.connection();const r=await fetch(c.base+'/api'+endpoint,{method,headers:{'X-App-Token':c.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error(await r.text());const text=await r.text();return text?JSON.parse(text):null;};void 0`,
    );
    await run(`(async()=>{
      const category=await window.testCall('/categories','POST',{name:'实验室',emoji:'🔬',color:'teal',active:true});
      const template=await window.testCall('/templates','POST',{name:'实验安排',items:[{title:'模板生成实验',category:category.id,priority:'medium',notes:'记录过程',problemId:null,offset:0,subtasks:[]}]});
      const problem=await window.testCall('/problems','POST',{platform:'练习',title:'笔记验收',number:'test',difficulty:'easy',tags:'数组,哈希表',notes:'旧笔记',details:{idea:'保留思路',timeComplexity:'O(n)',spaceComplexity:'O(1)',pitfalls:'边界',code:'<script>window.BAD_CODE=true</script>'+String.fromCharCode(10)+'  return 1;',language:'javascript',favorite:true,challenge:true}});
      return {category,template,problem};
    })()`);
    window.reload();
    await delay(500);
    await wait('!!document.querySelector(".task-title")');
    await click("📋 任务模板");
    await wait('document.body.textContent.includes("实验安排")');
    await click("预览并创建");
    await wait('document.body.textContent.includes("将创建 1 项任务")');
    await click("确认");
    await wait('!document.body.textContent.includes("将创建 1 项任务")');
    await run(
      `document.querySelector('[aria-label="任务模板"] .el-dialog__headerbtn').click()`,
    );
    await wait(
      '![...document.querySelectorAll(".el-dialog")].some(e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))',
    );
    await wait(
      '[...document.querySelectorAll(".task-title")].some(e=>e.textContent.includes("模板生成实验"))',
    );
    assert.equal(
      await run('document.body.textContent.includes("🔬 实验室")'),
      true,
    );
    await run(
      '[...document.querySelectorAll(".sidebar nav a")].find(e=>e.getAttribute("href").includes("calendar")).click()',
    );
    await wait('document.querySelectorAll(".calendar-cell").length>=28');
    await run(
      '[...document.querySelectorAll(".el-radio-button")].find(e=>e.textContent.includes("周视图")).click()',
    );
    await wait('document.querySelectorAll(".calendar-cell").length===7');
    await run(
      `(()=>{const task=document.querySelector('.calendar-task'),target=[...document.querySelectorAll('.calendar-cell')].find(e=>!e.contains(task));const data=new DataTransfer();task.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));window.dropDay=target.dataset.day;target.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:data}));})()`,
    );
    await wait(
      '[...document.querySelectorAll(".el-message-box")].some(e=>e.checkVisibility() && e.textContent.includes("截止")) || [...document.querySelectorAll(".calendar-cell")].find(e=>e.dataset.day===window.dropDay)?.querySelector(".calendar-task")',
    );
    if (
      await run(
        '[...document.querySelectorAll(".el-message-box")].some(e=>e.checkVisibility() && e.textContent.includes("截止"))',
      )
    )
      await click("确认");
    await wait(
      '[...document.querySelectorAll(".calendar-cell")].find(e=>e.dataset.day===window.dropDay)?.querySelector(".calendar-task")',
    );
    window.setSize(850, 740);
    await delay(300);
    assert.equal(
      await run("document.documentElement.scrollWidth<=window.innerWidth+1"),
      true,
      "Minimum desktop width must not overflow",
    );
    window.setSize(1320, 900);
    await run(
      '[...document.querySelectorAll(".sidebar nav a")].find(e=>e.getAttribute("href").includes("statistics")).click()',
    );
    stage = "weekly report and notes";
    console.log(stage);
    await wait('document.body.textContent.includes("本周复盘")');
    await fill("textarea", "本周完成了验收");
    await wait('document.body.textContent.includes("草稿已保留")');
    await click("保存");
    await wait('document.body.textContent.includes("已保存")');
    await run(
      '[...document.querySelectorAll(".sidebar nav a")].find(e=>e.getAttribute("href").includes("algorithms")).click()',
    );
    await wait('document.body.textContent.includes("笔记验收")');
    await click("编辑");
    await wait('!!document.querySelector(".code-preview")');
    assert.equal(
      await run(
        'window.BAD_CODE===undefined && document.querySelector(".code-preview code").textContent.includes("<script>")',
      ),
      true,
    );
    assert.equal(
      await run('document.querySelectorAll(".syntax-keyword").length>0'),
      true,
    );
    await click("保存");
    await wait(
      '![...document.querySelectorAll(".el-dialog")].some(e=>e.offsetWidth)',
    );
    const connection = await run("window.codeplan.connection()");
    stage = "theme and screenshot";
    console.log(stage);
    const settings = await fetch(connection.base + "/api/settings", {
      headers: { "X-App-Token": connection.token },
    }).then((r) => r.json());
    await fetch(connection.base + "/api/settings", {
      method: "PUT",
      headers: {
        "X-App-Token": connection.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...settings, theme: "dark", language: "en" }),
    });
    window.reload();
    await delay(500);
    await wait(
      'document.documentElement.lang==="en" && document.documentElement.classList.contains("dark")',
    );
    await run(
      '[...document.querySelectorAll(".sidebar nav a")].find(e=>e.getAttribute("href").includes("calendar")).click()',
    );
    await wait('!!document.querySelector(".calendar-grid")');
    window.webContents.debugger.attach("1.3");
    const screenshot = await window.webContents.debugger.sendCommand(
      "Page.captureScreenshot",
    );
    fs.writeFileSync(
      path.join(root, ".local/expansion-calendar.png"),
      Buffer.from(screenshot.data, "base64"),
    );
    window.webContents.debugger.detach();
    assert.equal(
      await run("document.documentElement.scrollWidth<=window.innerWidth+1"),
      true,
    );
    assert.deepEqual(
      consoleErrors.filter(
        (message) =>
          !message.startsWith("Blocked attempt to show a 'beforeunload'"),
      ),
      [],
      "No unexpected renderer errors",
    );
    complete = true;
    fs.writeFileSync(
      path.join(root, ".local/expansion-ui-verification.json"),
      JSON.stringify(
        {
          passed: true,
          checks: [
            "six navigation hover targets",
            "draft survives reload via desktop file",
            "explicit draft restore",
            "failed save retains input",
            "successful save clears draft",
            "filter reset preserves data",
            "deadline display and subtask edit",
            "trash delete and restore",
            "focus pause/resume/end and minimized intervals",
            "template preview and create",
            "custom category display",
            "week calendar and drag reschedule",
            "850px window without overflow",
            "weekly reflection",
            "code text safety and highlighting",
            "English and dark theme",
          ],
          consoleErrors,
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS: complete expansion desktop workflow, including dark/English and narrow layout.",
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(watchdog);
    await run("window.codeplanExiting=true").catch(() => {});
    app.quit();
  }
});
app.on("will-quit", (event) => {
  event.preventDefault();
  app.exit(complete ? 0 : 1);
});
