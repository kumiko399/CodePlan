import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  { launch } = require("../desktop/runtime.cjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, ".local", "development");
const lock = path.join(root, ".local", "dev.pid");
fs.mkdirSync(path.dirname(lock), { recursive: true });
if (fs.existsSync(lock)) {
  const pid = Number(fs.readFileSync(lock, "utf8"));
  try {
    process.kill(pid, 0);
    throw new Error(
      "A development instance is already running. Stop its terminal first.",
    );
  } catch (e) {
    if (e.code !== "ESRCH") throw e;
  }
}
fs.writeFileSync(lock, String(process.pid));
let runtime,
  stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await runtime?.stop();
  fs.rmSync(lock, { force: true });
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  runtime = await launch({ root, dataDir, onProgress: console.log });
  fs.writeFileSync(
    path.join(root, ".local", "connection.json"),
    JSON.stringify({ port: runtime.port, token: runtime.token }),
    { mode: 0o600 },
  );
  console.log("Backend ready. In another terminal run: npm run dev");
  for (const child of runtime.children)
    child.on("exit", () => {
      if (!stopping) {
        console.error("A managed service exited.");
        stop();
      }
    });
} catch (e) {
  console.error(e.message);
  fs.rmSync(lock, { force: true });
  process.exit(1);
}
