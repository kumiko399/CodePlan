const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createCloseHandler } = require("./close-window.cjs");
const { desktopPreferences } = require("./preferences.cjs");
function fixture(action, overrides = {}) {
  const calls = [];
  const window = {
    isDestroyed: () => false,
    hide: () => calls.push("hide"),
    minimize: () => calls.push("minimize"),
  };
  const handler = createCloseHandler({
    getWindow: () => window,
    isQuitting: () => false,
    canHideToTray: () => true,
    getCloseAction: () => action,
    quit: () => calls.push("quit"),
    onError: () => calls.push("error"),
    ...overrides,
  });
  return {
    calls,
    handler,
    event: { preventDefault: () => calls.push("prevent") },
  };
}
test("saved minimize hides without a dialog and falls back to the taskbar during startup", async () => {
  const ready = fixture("minimize");
  await ready.handler(ready.event);
  assert.deepEqual(ready.calls, ["prevent", "hide"]);
  const starting = fixture("minimize", { canHideToTray: () => false });
  await starting.handler(starting.event);
  assert.deepEqual(starting.calls, ["prevent", "minimize"]);
});
test("saved exit uses managed quit; duplicate close events cannot overlap exit guards", async () => {
  let finish,
    quitting = false;
  const item = fixture("exit", {
    isQuitting: () => quitting,
    quit: () =>
      new Promise((resolve) => {
        item.calls.push("quit");
        finish = resolve;
      }),
  });
  const first = item.handler(item.event);
  await item.handler(item.event);
  assert.deepEqual(item.calls, ["prevent", "quit", "prevent"]);
  finish();
  await first;
  quitting = true;
  await item.handler(item.event);
  assert.deepEqual(item.calls, ["prevent", "quit", "prevent"]);
});
test("exit failure keeps the window open and allows retry", async () => {
  const item = fixture("exit", {
    quit: async () => {
      throw Error("failed");
    },
  });
  await item.handler(item.event);
  await item.handler(item.event);
  assert.deepEqual(item.calls, ["prevent", "error", "prevent", "error"]);
});
test("close preference survives restart, rejects invalid IPC values and preserves last state on failed write", (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "codeplan-preferences-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const storage = desktopPreferences(directory);
  assert.equal(storage.get().closeAction, "minimize");
  storage.setCloseAction("exit");
  assert.equal(desktopPreferences(directory).get().closeAction, "exit");
  assert.throws(() => storage.setCloseAction("../../bad"));
  assert.equal(storage.get().closeAction, "exit");
  const temporary = path.join(directory, "desktop-preferences.json.tmp");
  fs.mkdirSync(temporary);
  assert.throws(() => storage.setCloseAction("minimize"));
  assert.equal(storage.get().closeAction, "exit");
  assert.equal(desktopPreferences(directory).get().closeAction, "exit");
  const file = path.join(directory, "desktop-preferences.json");
  fs.writeFileSync(file, "{corrupted");
  assert.equal(desktopPreferences(directory).get().closeAction, "minimize");
  assert.equal(fs.readFileSync(file, "utf8"), "{corrupted");
});
