const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { draftStorage } = require("./drafts.cjs");
test("drafts persist across app instances and invalid writes preserve the previous file", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codeplan-draft-"));
  try {
    const storage = draftStorage(directory);
    storage.write({
      "db:task:a": { payload: { title: "复习 <script> 代码" } },
    });
    assert.deepEqual(draftStorage(directory).read(), storage.read());
    assert.throws(() =>
      storage.write({ oversized: "a".repeat(2 * 1024 * 1024) }),
    );
    assert.equal(
      storage.read()["db:task:a"].payload.title,
      "复习 <script> 代码",
    );
    fs.writeFileSync(path.join(directory, "drafts.json"), "broken");
    assert.throws(() => storage.read());
    assert.equal(
      fs.readFileSync(path.join(directory, "drafts.json"), "utf8"),
      "broken",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
