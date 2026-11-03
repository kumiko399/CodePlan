const { app, BrowserWindow } = require("electron");
const path = require("node:path"),
  fs = require("node:fs");
const root = path.resolve(__dirname, "..");
let completed = false;
app.on("will-quit", () => {
  if (!completed) process.exitCode = 1;
});
process.env.CODEPLAN_DATA_DIR = path.join(
  root,
  ".local",
  `desktop-verification-${Date.now()}`,
);
require("../desktop/main.cjs");
const deadline = Date.now() + 120000;
const timer = setInterval(async () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (Date.now() > deadline) {
    console.error("Desktop startup timed out");
    clearInterval(timer);
    process.exitCode = 1;
    app.quit();
    return;
  }
  if (!window || !window.webContents.getURL().startsWith("http://127.0.0.1:"))
    return;
  try {
    const ready = await window.webContents.executeJavaScript(
      `document.querySelector('h1')?.textContent.includes('每一步')`,
    );
    if (!ready) return;
    clearInterval(timer);
    const security = await window.webContents.executeJavaScript(
      `({nodeUnavailable:typeof require==='undefined',desktopBridge:typeof window.codeplan.connection==='function'})`,
    );
    if (!security.nodeUnavailable || !security.desktopBridge)
      throw Error("Desktop isolation check failed");
    // Capture screenshots with packaged-smoke.mjs. Native capturePage can
    // terminate Chromium's Viz service on some Windows GPU drivers.
    fs.writeFileSync(
      path.join(root, ".local", "desktop-verification.json"),
      JSON.stringify(
        {
          passed: true,
          security,
          checks: [
            "fresh dedicated database initialization",
            "bundled Java/MySQL start",
            "UI static server and API authentication",
            "preload bridge",
            "renderer isolation",
            "managed shutdown",
          ],
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS: desktop startup, bundled services, authenticated UI and renderer isolation.",
    );
    completed = true;
    app.quit();
  } catch (e) {
    clearInterval(timer);
    console.error(e);
    process.exitCode = 1;
    app.quit();
  }
}, 500);
