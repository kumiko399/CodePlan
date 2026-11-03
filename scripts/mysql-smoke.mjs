import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url),
  { launch } = require("../desktop/runtime.cjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, ".local", `mysql-verification-${Date.now()}`);
let runtime;
async function call(endpoint, method = "GET", body) {
  const headers = { "X-App-Token": runtime.token };
  if (body && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const response = await fetch(runtime.base + "/api" + endpoint, {
    method,
    headers,
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok)
    throw new Error(
      `${method} ${endpoint}: ${response.status} ${await response.text()}`,
    );
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const day = "2026-10-22";
try {
  runtime = await launch({ root, dataDir, onProgress: console.log });
  assert.equal((await fetch(runtime.base + "/api/tasks")).status, 401);
  const problem = await call("/problems", "POST", {
    platform: "力扣中国",
    number: "1",
    title: "两数之和",
    url: "https://leetcode.cn/problems/two-sum/",
    difficulty: "easy",
    tags: "数组,哈希表",
    notes: "练习查找补数",
  });
  const input = {
    title: "完成两数之和",
    category: "algorithm",
    planDate: day,
    taskTime: null,
    priority: "high",
    notes: "先自己思考",
    status: "todo",
    problemId: problem.id,
    reminderTime: null,
  };
  const task = await call("/tasks", "POST", input);
  const now = new Date();
  now.setMinutes(now.getMinutes() - 1);
  const local = now.toLocaleString("sv-SE").replace(" ", "T");
  await call("/attempts", "POST", {
    problemId: problem.id,
    taskId: task.id,
    attemptedAt: local,
    result: "passed",
    minutes: 20,
    notes: "哈希表 O(n)",
  });
  await call("/attempts", "POST", {
    problemId: problem.id,
    taskId: task.id,
    attemptedAt: local,
    result: "passed",
    minutes: 12,
    notes: "再次验证",
  });
  assert.equal((await call("/tasks"))[0].status, "done");
  const actualDay = local.slice(0, 10);
  const stats = await call(`/statistics?from=${actualDay}&to=${actualDay}`);
  assert.equal(stats.passed, 1);
  assert.equal(stats.attempts, 2);
  await call(`/reflections/${day}`, "PUT", {
    content: "本地 MySQL 端到端验收记录",
  });
  const file = await call("/backups", "POST");
  const zipped = await fetch(runtime.base + "/api/backups/" + file.name, {
    headers: { "X-App-Token": runtime.token },
  }).then((r) => r.blob());
  await call(`/tasks/${task.id}`, "DELETE");
  assert.equal((await call("/attempts")).length, 2);
  const form = new FormData();
  form.append("file", zipped, "backup.zip");
  const preview = await call("/restore/preview", "POST", form);
  await call("/restore", "POST", { token: preview.token });
  assert.equal((await call("/tasks"))[0].id, task.id);
  await runtime.stop();
  runtime = null;
  runtime = await launch({ root, dataDir, onProgress: console.log });
  assert.equal((await call("/tasks"))[0].title, input.title);
  assert.equal(
    (await call("/reflections"))[0].content,
    "本地 MySQL 端到端验收记录",
  );
  const settings = await call("/settings");
  await call("/settings", "PUT", { ...settings, repeatEnabled: true });
  const start = new Date().toLocaleDateString("sv-SE");
  await call("/rules", "POST", {
    title: "每日运动",
    category: "sport",
    priority: "low",
    notes: "",
    taskTime: null,
    reminderTime: null,
    startDate: start,
    endDate: null,
    frequency: "daily",
    weekdays: "",
    problemId: null,
    active: true,
  });
  const tasks = await call("/tasks");
  assert.equal(tasks.filter((t) => t.ruleId).length, 30);
  fs.writeFileSync(
    path.join(root, ".local", "mysql-verification.json"),
    JSON.stringify(
      {
        passed: true,
        checks: [
          "authentication",
          "task CRUD",
          "attempt deduplication",
          "backup preview and restore",
          "restart persistence",
          "repeat generation",
        ],
        database: path.relative(root, dataDir),
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: real MySQL HTTP workflow, backup/restore, deduplication and persistence across restart.",
  );
} finally {
  await runtime?.stop();
}
