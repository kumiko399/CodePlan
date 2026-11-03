import { test } from "node:test";
import assert from "node:assert/strict";
import { codeTokens } from "../frontend/src/lib/code-tokens.js";
import { filterProblems } from "../frontend/src/lib/problem-filters.js";
test("highlighting preserves every character and returns text rather than executable HTML", () => {
  const code =
    '  if (a < b) {\n  return "<script>alert(1)</script>"; // 中文\n}\n';
  for (const language of ["java", "javascript", "python", "cpp", "text"]) {
    const tokens = codeTokens(code, language);
    assert.equal(tokens.map((t) => t.text).join(""), code);
    assert.ok(
      tokens.every((t) => Object.keys(t).sort().join(",") === "text,type"),
    );
  }
  assert.ok(
    codeTokens(code, "java").some(
      (t) => t.type === "keyword" && t.text === "return",
    ),
  );
});
test("tags match any selected value while other filters combine and results stay unique", () => {
  const problems = [
    {
      id: "1",
      title: "one",
      tags: "数组, 哈希表,数组",
      difficulty: "easy",
      details: { favorite: true, challenge: true },
    },
    {
      id: "2",
      title: "two",
      tags: "",
      difficulty: "hard",
      details: { favorite: false, challenge: true },
    },
  ];
  const filters = {
    search: "",
    difficulty: "",
    tags: ["tag:数组", "tag:哈希表"],
    favorite: true,
    challenge: true,
    passed: "yes",
  };
  assert.deepEqual(
    filterProblems(problems, filters, new Set(["1"])).map((p) => p.id),
    ["1"],
  );
  assert.equal(
    filterProblems(problems, { ...filters, passed: "no" }, new Set(["1"]))
      .length,
    0,
  );
  assert.deepEqual(
    filterProblems(
      problems,
      { ...filters, favorite: false, tags: ["none:"], passed: "" },
      new Set(["1"]),
    ).map((p) => p.id),
    ["2"],
  );
});
