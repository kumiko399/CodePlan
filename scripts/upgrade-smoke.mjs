import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url),
  { launch } = require("../desktop/runtime.cjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, ".local", `upgrade-verification-${Date.now()}`);
const resources = path.join(
  root,
  "release",
  "1.1.1",
  "win-unpacked",
  "resources",
);
if (!fs.existsSync(path.join(resources, "backend", "app.jar")))
  throw Error("Build 1.1.1 is required for the legacy upgrade test.");
let runtime;
async function call(endpoint, method = "GET", body) {
  const response = await fetch(runtime.base + "/api" + endpoint, {
    method,
    headers: {
      "X-App-Token": runtime.token,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok)
    throw Error(`${endpoint}: ${response.status} ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
try {
  runtime = await launch({ root, dataDir, resources, onProgress: console.log });
  const task = await call("/tasks", "POST", {
    title: "升级前的真实 MySQL 数据",
    category: "course",
    planDate: "2026-10-23",
    priority: "medium",
    notes: "必须保留原内容",
    status: "todo",
    taskTime: null,
    problemId: null,
    reminderTime: null,
  });
  const backup = await call("/backups", "POST");
  const original = await fetch(runtime.base + "/api/backups/" + backup.name, {
    headers: { "X-App-Token": runtime.token },
  }).then((r) => r.blob());
  await runtime.stop();
  runtime = null;
  runtime = await launch({ root, dataDir, onProgress: console.log });
  assert.equal((await call("/tasks"))[0].id, task.id);
  assert.equal((await call("/workspace")).extras.length, 0);
  assert.ok(
    fs
      .readdirSync(path.join(dataDir, "upgrades"))
      .some((name) => name.startsWith("before-v2-") && name.endsWith(".zip")),
  );
  await call("/tasks/" + task.id, "PUT", {
    ...task,
    details: {
      deadlineDate: "2026-10-24",
      deadlineTime: null,
      subtasks: [],
      deletedAt: null,
    },
  });
  assert.equal(
    (await call("/workspace")).extras.filter((row) => row.kind === "task")
      .length,
    1,
  );
  const upload = new FormData();
  upload.append("file", original, "legacy-v1.zip");
  const preview = await call("/restore/preview", "POST", upload);
  await call("/restore", "POST", { token: preview.token });
  assert.equal((await call("/tasks"))[0].notes, "必须保留原内容");
  assert.equal((await call("/workspace")).extras.length, 0);
  await runtime.stop();
  runtime = null;
  runtime = await launch({ root, dataDir, onProgress: console.log });
  assert.equal((await call("/tasks"))[0].id, task.id);
  fs.writeFileSync(
    path.join(root, ".local/upgrade-verification.json"),
    JSON.stringify(
      {
        passed: true,
        checks: [
          "real 1.1.1 MySQL data preserved on upgrade",
          "upgrade protection archive created",
          "new fields persisted",
          "legacy v1 ZIP restored",
          "migration restart idempotent",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: real legacy database upgrade, v1 restore, restart persistence.",
  );
} finally {
  await runtime?.stop();
}
