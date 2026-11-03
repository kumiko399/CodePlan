import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { categories } from "../frontend/src/lib/categories.js";

test("every UI category is accepted by Java validation and statistics, including the original backup IDs", () => {
  const java = fs.readFileSync(
    new URL(
      "../backend/src/main/java/dev/codeplan/model/Categories.java",
      import.meta.url,
    ),
    "utf8",
  );
  const backendIds = java.match(/PATTERN = "([^"]+)"/)[1].split("|");
  assert.deepEqual(
    categories.map((category) => category.id),
    backendIds,
  );
  for (const id of ["study", "life", "sport", "algorithm"])
    assert.ok(backendIds.includes(id));
  assert.equal(new Set(backendIds).size, backendIds.length);
});
