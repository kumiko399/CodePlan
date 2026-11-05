// Exercises the real packaged executable with a fresh database and no developer runtimes in PATH.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import runtime from "../desktop/runtime.cjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopPackage = JSON.parse(
  fs.readFileSync(path.join(root, "desktop/package.json"), "utf8"),
);
const exe = path.resolve(
  process.env.CODEPLAN_TEST_EXE ||
    path.resolve(
      root,
      "desktop",
      desktopPackage.build.directories.output,
      "win-unpacked/CodePlan.exe",
    ),
);
const directory = path.join(
  root,
  ".local",
  `packaged-verification-${Date.now()}`,
);
fs.mkdirSync(directory, { recursive: true });
const connectionFile = path.join(directory, "connection.json");
const debugPort = await runtime.freePort();
const env = {
  ...process.env,
  CODEPLAN_DATA_DIR: directory,
  CODEPLAN_BACKGROUND_TEST: "1",
  CODEPLAN_CONNECTION_FILE: connectionFile,
  PATH: path.join(process.env.SystemRoot, "System32"),
};
delete env.JAVA_HOME;
delete env.MYSQL_HOME;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const child = spawn(exe, [`--remote-debugging-port=${debugPort}`], {
  env,
  stdio: "ignore",
  windowsHide: true,
});
let childError;
child.on("error", (error) => {
  childError = error;
});
async function until(check, timeout = 150000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (childError) throw childError;
    if (await check()) return;
    await delay(500);
  }
  throw Error("Packaged application verification timed out");
}
let ws;
try {
  await until(() => {
    if (child.exitCode != null)
      throw Error(`Application exited early: ${child.exitCode}`);
    return fs.existsSync(connectionFile);
  });
  const connection = JSON.parse(fs.readFileSync(connectionFile, "utf8"));
  const sourceVersion = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  ).version;
  const health = await (
    await fetch(`http://127.0.0.1:${connection.port}/api/health`)
  ).json();
  assert.equal(
    health.version,
    sourceVersion,
    "Installed backend matches source version",
  );
  assert.equal((await fetch(connection.origin)).status, 200);
  assert.equal((await fetch(`${connection.origin}/api/tasks`)).status, 401);
  const pages = await (
    await fetch(`http://127.0.0.1:${debugPort}/json/list`)
  ).json();
  const page = pages.find(
    (page) => page.type === "page" && page.url.startsWith(connection.origin),
  );
  assert.ok(page, "Packaged page is loaded");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let next = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(entry?.timeout);
      message.error
        ? entry?.reject(Error(message.error.message))
        : entry?.resolve(message.result);
    }
  });
  function command(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++next;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(Error(`Debugger command timed out: ${method}`));
      }, 15000);
      pending.set(id, { resolve, reject, timeout });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await command("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
    return result.result.value;
  }
  await until(
    async () =>
      evaluate("document.querySelector('h1')?.textContent.includes('每一步')"),
    15000,
  );
  await until(() => evaluate('!!document.querySelector(".home-almanac")'));
  assert.equal(
    await evaluate(
      'document.querySelector(".home-almanac").textContent.includes("农历") && document.querySelectorAll(".almanac-activities li").length > 0',
    ),
    true,
  );
  const almanacDate = await evaluate(
    'document.querySelector(".home-almanac").dataset.date',
  );
  await evaluate(
    'document.querySelector("[data-testid=almanac-prev]").click()',
  );
  await until(
    async () =>
      (await evaluate(
        'document.querySelector(".home-almanac").dataset.date',
      )) !== almanacDate,
  );
  await evaluate(
    'document.querySelector("[data-testid=almanac-today]").click()',
  );
  await until(
    async () =>
      (await evaluate(
        'document.querySelector(".home-almanac").dataset.date',
      )) === almanacDate,
  );
  assert.ok(
    fs.existsSync(
      path.join(
        path.dirname(exe),
        "resources/licenses/lunar-javascript-LICENSE.txt",
      ),
    ),
  );
  const state = await evaluate(`(async () => {
    const c = await window.codeplan.connection();
    const result = await fetch(c.base + '/api/tasks', {headers: {'X-App-Token': c.token}});
    return {nodeUnavailable: typeof require === 'undefined', apiStatus: result.status, tasks: await result.json()};
  })()`);
  assert.equal(state.nodeUnavailable, true);
  assert.equal(state.apiStatus, 200);
  assert.deepEqual(state.tasks, []);
  const expansion = await evaluate(`(async () => {
    const c = await window.codeplan.connection();
    const get = async (url) => {
      const r = await fetch(c.base + '/api' + url, {headers: {'X-App-Token': c.token}});
      if (!r.ok) throw Error(url + ': ' + r.status);
      return r.json();
    };
    return {workspace: await get('/workspace'), trash: await get('/trash'), focus: await get('/focus'), draftsAvailable: typeof window.codeplan.readDrafts === 'function'};
  })()`);
  assert.ok(expansion.workspace.databaseId);
  assert.deepEqual(expansion.trash, []);
  assert.ok(expansion.focus);
  assert.equal(expansion.draftsAvailable, true);
  assert.equal(
    await evaluate(`(async () => {
    const c=await window.codeplan.connection();
    const now=new Date(), day=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    const response=await fetch(c.base+'/api/tasks',{method:'POST',headers:{'X-App-Token':c.token,'Content-Type':'application/json'},body:JSON.stringify({title:'安装版图标验收',category:'sport',planDate:day,priority:'medium',notes:'',status:'todo',details:{deadlineDate:null,deadlineTime:null,subtasks:[],deletedAt:null,emoji:'🏀'}})});
    if(!response.ok) throw Error('Task emoji rejected');
    const task=await response.json();
    const workspace=await (await fetch(c.base+'/api/workspace',{headers:{'X-App-Token':c.token}})).json();
    return JSON.parse(workspace.extras.find(r=>r.kind==='task'&&r.recordId===task.id).payload).emoji;
  })()`),
    "🏀",
  );
  assert.equal(
    await evaluate(
      "window.codeplan.desktopPreferences().then(p => p.closeAction)",
    ),
    "minimize",
  );
  assert.equal(
    await evaluate(
      "window.codeplan.setCloseAction('exit').then(p => p.closeAction)",
    ),
    "exit",
  );
  assert.equal(
    await evaluate(
      `document.querySelector('[data-testid="save-data"]')?.textContent.includes('保存数据')`,
    ),
    true,
  );
  await evaluate(`document.querySelector('[data-testid="save-data"]').click()`);
  await until(
    async () =>
      evaluate(
        `document.querySelector('.save-status')?.textContent.includes('已于')`,
      ),
    15000,
  );
  await evaluate("location.hash='#/calendar';void 0");
  await until(() =>
    evaluate(
      '!!document.querySelector(".calendar-v2") && document.querySelectorAll(".calendar-cell").length>=28',
    ),
  );
  await command("Page.reload");
  await until(() => evaluate('!!document.querySelector(".calendar-task")'));
  assert.equal(
    await evaluate('document.querySelector(".calendar-progress progress").max'),
    1,
  );
  assert.equal(
    await evaluate(
      'document.querySelector(".calendar-progress progress").value',
    ),
    0,
  );
  assert.equal(
    await evaluate(
      'document.querySelector(".calendar-legend").textContent.includes("截止超期")',
    ),
    true,
  );
  // CDP screenshot capture can hang on native hidden Windows surfaces.
  // Visual checks use weather-smoke.cjs capturePage({stayHidden:true,stayAwake:true}).
  console.log(
    "Packaged checks use DOM assertions; screenshot QA is a separate hidden Electron test.",
  );
  ws.close();
  ws = undefined;
  const quit = spawn(exe, ["--quit"], {
    env,
    stdio: "ignore",
    windowsHide: true,
  });
  await new Promise((resolve, reject) => {
    quit.on("exit", resolve);
    quit.on("error", reject);
  });
  await until(() => child.exitCode != null, 30000);
  assert.equal(child.exitCode, 0);
  await assert.rejects(
    fetch(`http://127.0.0.1:${connection.port}/api/health`, {
      signal: AbortSignal.timeout(2000),
    }),
  );
  fs.writeFileSync(
    path.join(root, ".local/packaged-verification.json"),
    JSON.stringify(
      {
        passed: true,
        executable: exe,
        checks: [
          "packaged resources",
          "fresh MySQL initialization",
          "no JAVA_HOME or MYSQL_HOME",
          "system-only PATH",
          "renderer isolation",
          "home almanac, lunar entries, date navigation and bundled MIT license",
          "calendar status legend and daily completion progress",
          "authenticated API",
          "expanded workspace, trash, focus and desktop drafts",
          "graceful quit and backend exit",
        ],
        directory,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: packaged executable, bundled runtimes, authenticated UI, clean shutdown.",
  );
} finally {
  ws?.close();
  if (child.exitCode == null && child.pid) {
    const quit = spawn(exe, ["--quit"], {
      env,
      stdio: "ignore",
      windowsHide: true,
    });
    quit.on("error", () => {});
  }
}
