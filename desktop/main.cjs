const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  Notification,
  dialog,
  ipcMain,
  nativeImage,
  shell,
} = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  { launch } = require("./runtime.cjs"),
  { createCloseHandler } = require("./close-window.cjs"),
  { notificationPayload } = require("./notifications.cjs");
app.setName("CodePlan");
app.setAppUserModelId("dev.codeplan.desktop");
// Hidden acceptance tests must always use a separate data directory.
const backgroundTest =
  process.env.CODEPLAN_BACKGROUND_TEST === "1" &&
  !!process.env.CODEPLAN_DATA_DIR;
if (backgroundTest)
  dialog.showErrorBox = (title, message) => console.error(title, message);
if (process.env.CODEPLAN_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.CODEPLAN_DATA_DIR));
let mainWindow,
  tray,
  runtime,
  runtimePromise,
  server,
  uiOrigin = "",
  timer,
  quitting = false,
  stopped = false;
const single = app.requestSingleInstanceLock();
if (!single || process.argv.includes("--quit")) app.quit();
else {
  app.on("second-instance", (_event, argv) => {
    if (argv.includes("--quit")) {
      requestExit();
      return;
    }
    showMainWindow();
  });
  app
    .whenReady()
    .then(start)
    .catch(async (e) => {
      if (quitting) return;
      dialog.showErrorBox(
        "CodePlan 启动失败 / Startup failed",
        `${e.message}\n\nLogs: ${path.join(app.getPath("userData"), "logs")}`,
      );
      app.quit();
    });
}
let askingToExit = false;
async function requestExit() {
  if (askingToExit || quitting) return;
  askingToExit = true;
  try {
    if (uiOrigin && mainWindow && !mainWindow.isDestroyed()) {
      showMainWindow();
      const allowed = await mainWindow.webContents.executeJavaScript(
        "window.codeplanBeforeExit ? window.codeplanBeforeExit() : true",
      );
      if (!allowed) return;
    }
    app.quit();
  } catch {
    dialog.showErrorBox(
      "CodePlan",
      "无法保留编辑，请返回应用保存后重试。 / Could not preserve edits. Save and retry.",
    );
  } finally {
    askingToExit = false;
  }
}
function showMainWindow() {
  if (backgroundTest) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
function icon() {
  const pixels = Buffer.alloc(32 * 32 * 4);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 4;
      const ink =
        (x >= 8 && x <= 15 && Math.abs(y - 14) === x - 8) ||
        (y === 22 && x >= 18 && x <= 25);
      pixels[i] = ink ? 245 : 108;
      pixels[i + 1] = ink ? 248 : 132;
      pixels[i + 2] = ink ? 245 : 99;
      pixels[i + 3] = 255;
    }
  return nativeImage.createFromBitmap(pixels, { width: 32, height: 32 });
}
function validExternal(value) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
function serve(uiDirectory) {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname.startsWith("/api/")) {
        if (req.headers["x-app-token"] !== runtime.token) {
          res.writeHead(401);
          res.end();
          return;
        }
        if (Number(req.headers["content-length"] || 0) > 21 * 1024 * 1024) {
          res.writeHead(413);
          res.end();
          return;
        }
        const proxy = http.request(
          `${runtime.base}${req.url}`,
          {
            method: req.method,
            headers: { ...req.headers, host: `127.0.0.1:${runtime.port}` },
          },
          (response) => {
            res.writeHead(response.statusCode, response.headers);
            response.pipe(res);
          },
        );
        proxy.on("error", () => {
          if (!res.headersSent) res.writeHead(502);
          res.end();
        });
        req.on("aborted", () => proxy.destroy());
        req.pipe(proxy);
        return;
      }
      let relative;
      try {
        relative = decodeURIComponent(url.pathname);
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      const file = path.resolve(
        uiDirectory,
        "." + (relative === "/" ? "/index.html" : relative),
      );
      if (
        !file.startsWith(path.resolve(uiDirectory) + path.sep) ||
        !fs.existsSync(file) ||
        !fs.statSync(file).isFile()
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      const mime =
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".svg": "image/svg+xml",
          ".png": "image/png",
        }[path.extname(file)] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": mime,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; frame-src 'none'",
      });
      fs.createReadStream(file).pipe(res);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () =>
      resolve(`http://127.0.0.1:${server.address().port}`),
    );
  });
}
function register(name, handler) {
  ipcMain.handle(name, (event, ...args) => {
    if (
      !event.senderFrame ||
      event.senderFrame !== mainWindow?.webContents.mainFrame ||
      new URL(event.senderFrame.url).origin !== uiOrigin
    )
      throw new Error("Untrusted frame");
    return handler(...args);
  });
}
async function start() {
  const root = path.resolve(__dirname, ".."),
    resources = app.isPackaged ? process.resourcesPath : null,
    dataDir = app.getPath("userData"),
    preferences = require("./preferences.cjs").desktopPreferences(dataDir);
  mainWindow = new BrowserWindow({
    show: !backgroundTest,
    width: 1320,
    height: 900,
    minWidth: 850,
    minHeight: 620,
    title: "CodePlan · 码上计划",
    backgroundColor: "#f5f6f3",
    icon: icon(),
    autoHideMenuBar: true,
    webPreferences: {
      backgroundThrottling: !backgroundTest,
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.on(
    "close",
    createCloseHandler({
      getWindow: () => mainWindow,
      isQuitting: () => quitting,
      canHideToTray: () => !!tray && !tray.isDestroyed(),
      getCloseAction: () => preferences.get().closeAction,
      quit: requestExit,
      onError: () =>
        dialog.showErrorBox(
          "CodePlan",
          "无法关闭窗口，请重试。\nCould not close the window. Please retry.",
        ),
    }),
  );
  await mainWindow.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(
        '<html><body style="font-family:Segoe UI,Microsoft YaHei;background:#f5f6f3;display:grid;place-items:center;height:90vh;color:#63846c"><div><h1>&gt;_ CodePlan</h1><p id="progress">正在准备你的计划空间 / Preparing your workspace…</p></div></body></html>',
      ),
  );
  if (quitting || mainWindow.isDestroyed()) return;
  runtimePromise = launch({
    root,
    dataDir,
    resources,
    onProgress: (message) => {
      if (!mainWindow.isDestroyed())
        mainWindow.webContents
          .executeJavaScript(
            `document.getElementById('progress').textContent=${JSON.stringify(message)}`,
          )
          .catch(() => {});
    },
  });
  runtime = await runtimePromise;
  if (quitting) return;
  uiOrigin = await serve(
    resources
      ? path.join(resources, "ui")
      : path.join(root, "frontend", "dist"),
  );
  const drafts = require("./drafts.cjs").draftStorage(dataDir);
  register("desktop-preferences", () => preferences.get());
  register("set-close-action", (action) => preferences.setCloseAction(action));
  register("read-drafts", () => drafts.read());
  register("write-drafts", (value) => drafts.write(value));
  register("connection", () => ({ base: uiOrigin, token: runtime.token }));
  register("choose-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  register("open-backup-directory", async () => {
    const result = await fetch(`${runtime.base}/api/maintenance`, {
      headers: { "X-App-Token": runtime.token },
    });
    if (!result.ok) throw new Error("OPERATION_FAILED");
    const directory = (await result.json()).backupDirectory;
    fs.mkdirSync(directory, { recursive: true });
    const error = await shell.openPath(directory);
    if (error) throw new Error("OPERATION_FAILED");
  });
  register("open-external", async (value) => {
    if (!validExternal(value)) throw new Error("INVALID_URL");
    await shell.openExternal(value);
  });
  register("test-notification", () => {
    if (backgroundTest) return false;
    if (!Notification.isSupported()) return false;
    new Notification({
      title: "CodePlan",
      body: "桌面提醒已准备就绪 / Desktop reminders are ready.",
    }).show();
    return true;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (validExternal(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== uiOrigin) event.preventDefault();
  });
  tray = new Tray(icon());
  tray.setToolTip("CodePlan · 码上计划");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开 / Open", click: showMainWindow },
      { label: "退出 / Exit", click: requestExit },
    ]),
  );
  tray.on("double-click", showMainWindow);
  await mainWindow.loadURL(uiOrigin);
  if (process.env.CODEPLAN_CONNECTION_FILE)
    fs.writeFileSync(
      process.env.CODEPLAN_CONNECTION_FILE,
      JSON.stringify({ origin: uiOrigin, port: runtime.port }),
      { mode: 0o600 },
    );
  let polling = false;
  async function reminders() {
    if (backgroundTest) return;
    if (polling || quitting || !Notification.isSupported()) return;
    polling = true;
    try {
      const headers = { "X-App-Token": runtime.token };
      const settingsResponse = await fetch(`${runtime.base}/api/settings`, {
        headers,
        signal: AbortSignal.timeout(3000),
      });
      if (!settingsResponse.ok) return;
      const settings = await settingsResponse.json();
      const focusResponse = await fetch(
        runtime.base + "/api/focus/notifications",
        { method: "POST", headers, signal: AbortSignal.timeout(3000) },
      );
      if (focusResponse.ok)
        for (const body of await focusResponse.json())
          if (settings.remindersEnabled)
            new Notification({ title: "CodePlan", body, icon: icon() }).show();
      if (!settings.remindersEnabled) return;
      const response = await fetch(`${runtime.base}/api/reminders/claim`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) return;
      const payload = notificationPayload(await response.json(), settings);
      if (payload) {
        const notification = new Notification({ ...payload, icon: icon() });
        notification.on("click", showMainWindow);
        notification.show();
      }
    } catch {
    } finally {
      polling = false;
    }
  }
  timer = setInterval(reminders, 30000);
  reminders();
  for (const child of runtime.children)
    child.on("exit", () => {
      if (!quitting) {
        dialog.showErrorBox(
          "CodePlan",
          "本地服务意外停止，请重新打开应用。\nA local service stopped. Please restart the app.",
        );
        app.quit();
      }
    });
}
app.on("before-quit", (event) => {
  if (stopped) return;
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  clearInterval(timer);
  server?.close();
  Promise.resolve(runtimePromise)
    .then((service) => service?.stop())
    .catch(() => {})
    .finally(() => {
      tray?.destroy();
      stopped = true;
      app.quit();
    });
});
