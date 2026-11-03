// Actual settings controls and close events against isolated Electron + MySQL.
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
process.env.CODEPLAN_DATA_DIR = path.join(
  root,
  ".local",
  `close-verification-${Date.now()}`,
);
let prompts = 0,
  window,
  connection,
  completed = false;
dialog.showMessageBox = async () => {
  prompts++;
  throw Error("Close must not ask minimize or exit");
};
require("../desktop/main.cjs");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(check, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(100);
  }
  throw Error("Close behavior check timed out");
}
const run = (code) => window.webContents.executeJavaScript(code);
async function request(endpoint, method = "GET", body) {
  const response = await fetch(connection.base + "/api" + endpoint, {
    method,
    headers: {
      "X-App-Token": connection.token,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(response.ok, true);
  return response.json();
}
async function settingsPage() {
  await run("location.hash = '#/settings'; void 0");
  await wait(() =>
    run(
      "!!document.querySelector('[data-testid=close-exit] input:not(:disabled)')",
    ),
  );
}
async function select(action) {
  await run(
    `document.querySelector('[data-testid=close-${action}] input').click()`,
  );
  await wait(() =>
    run(
      `window.codeplan.desktopPreferences().then(p => p.closeAction === '${action}')`,
    ),
  );
  await wait(() =>
    run(
      `document.querySelector('[data-testid=close-${action}] input').checked && !document.querySelector('[data-testid=close-${action}] input').disabled`,
    ),
  );
}
const watchdog = setTimeout(() => {
  console.error("Close test timed out");
  app.quit();
}, 180000);
app.whenReady().then(async () => {
  try {
    await wait(async () => {
      window = BrowserWindow.getAllWindows()[0];
      if (!window?.webContents.getURL().startsWith("http://127.0.0.1:"))
        return false;
      return run("!!document.querySelector('[data-testid=save-data]')");
    }, 120000);
    window.webContents.setBackgroundThrottling(false);
    connection = await run("window.codeplan.connection()");
    await settingsPage();
    assert.equal(
      await run(
        "window.codeplan.desktopPreferences().then(p => p.closeAction)",
      ),
      "minimize",
    );
    window.close();
    await wait(() => !window.isVisible());
    await request("/tasks");
    app.emit("second-instance", {}, []);
    await wait(() => window.isVisible());
    await select("exit");
    window.webContents.reload();
    await settingsPage();
    assert.equal(
      await run(
        "document.querySelector('[data-testid=close-exit] input').checked",
      ),
      true,
    );
    const settings = await request("/settings");
    await request("/settings", "PUT", {
      ...settings,
      language: "en",
      theme: "dark",
    });
    window.webContents.reload();
    await settingsPage();
    assert.equal(
      await run(
        "document.querySelector('[data-testid=desktop-settings]').textContent.includes('Exit application')",
      ),
      true,
    );
    await select("minimize");
    window.minimize();
    app.emit("second-instance", {}, []);
    await wait(() => !window.isMinimized() && window.isVisible());
    window.close();
    await wait(() => !window.isVisible());
    await request("/tasks");
    window.show();
    await select("exit");
    // Cancellation by an edit/focus guard still prevents shutdown; this is not a close-choice dialog.
    await run("window.codeplanBeforeExit = async () => false; void 0");
    window.close();
    await delay(300);
    assert.equal(window.isVisible(), true);
    await request("/tasks");
    fs.writeFileSync(
      path.join(root, ".local/close-settings.png"),
      (await window.webContents.capturePage()).toPNG(),
    );
    await run("window.codeplanBeforeExit = async () => true; void 0");
    completed = true;
    window.close();
  } catch (error) {
    console.error(error);
    app.quit();
  }
});
app.on("will-quit", (event) => {
  event.preventDefault();
  clearTimeout(watchdog);
  (async () => {
    try {
      assert.equal(completed, true);
      await assert.rejects(
        fetch(connection.base + "/api/health", {
          signal: AbortSignal.timeout(2000),
        }),
      );
      assert.equal(prompts, 0);
      fs.writeFileSync(
        path.join(root, ".local/close-verification.json"),
        JSON.stringify(
          {
            passed: true,
            checks: [
              "settings controls persist selection",
              "Chinese and English dark settings",
              "minimize and reopen keeps service alive",
              "exit guard cancellation respected",
              "direct exit stops service",
              "no close-choice dialogs",
            ],
          },
          null,
          2,
        ),
      );
      console.log(
        "PASS: saved close settings, no choice dialog, minimize/reopen, guarded direct exit.",
      );
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  })();
});
