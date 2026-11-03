const fs = require("node:fs");
const path = require("node:path");
// Machine-local window behavior, available even before the backend starts.
function desktopPreferences(directory) {
  const file = path.join(directory, "desktop-preferences.json");
  function read() {
    try {
      if (fs.statSync(file).size > 1024) return { closeAction: "minimize" };
      const value = JSON.parse(fs.readFileSync(file, "utf8"));
      return {
        closeAction: value.closeAction === "exit" ? "exit" : "minimize",
      };
    } catch {
      return { closeAction: "minimize" };
    }
  }
  let current = read();
  return {
    get: () => ({ ...current }),
    setCloseAction(action) {
      if (!["minimize", "exit"].includes(action))
        throw Error("INVALID_CLOSE_ACTION");
      const next = { closeAction: action };
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(file + ".tmp", JSON.stringify(next), { mode: 0o600 });
      fs.renameSync(file + ".tmp", file);
      current = next;
      return { ...current };
    },
  };
}
module.exports = { desktopPreferences };
