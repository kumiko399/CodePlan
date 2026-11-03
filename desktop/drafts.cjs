const fs = require("node:fs");
const path = require("node:path");
// One fixed local file, never a renderer-supplied path. Invalid files are preserved.
function draftStorage(directory) {
  const file = path.join(directory, "drafts.json");
  function validate(value) {
    if (!value || Array.isArray(value) || typeof value !== "object")
      throw new Error("INVALID_DRAFTS");
    const bytes = JSON.stringify(value);
    if (
      Buffer.byteLength(bytes) > 2 * 1024 * 1024 ||
      Object.keys(value).some((k) =>
        ["__proto__", "constructor", "prototype"].includes(k),
      )
    )
      throw new Error("INVALID_DRAFTS");
    return bytes;
  }
  return {
    read() {
      if (!fs.existsSync(file)) return {};
      if (fs.statSync(file).size > 2 * 1024 * 1024)
        throw new Error("INVALID_DRAFTS");
      const value = JSON.parse(fs.readFileSync(file, "utf8"));
      validate(value);
      return value;
    },
    write(value) {
      const bytes = validate(value);
      fs.mkdirSync(directory, { recursive: true });
      const temporary = file + ".tmp";
      fs.writeFileSync(temporary, bytes, { mode: 0o600 });
      fs.renameSync(temporary, file);
    },
  };
}
module.exports = { draftStorage };
