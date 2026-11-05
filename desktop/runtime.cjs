const fs = require("node:fs"),
  path = require("node:path"),
  net = require("node:net"),
  crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const random = () => crypto.randomBytes(24).toString("hex");
async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}
function execute(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, ...options });
    let error = "";
    child.stderr?.on("data", (c) => (error += c.toString().slice(0, 4000)));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Process failed (${path.basename(file)}, ${code}): ${error.slice(-1500)}`,
            ),
          ),
    );
  });
}
async function waitFor(check, timeout, process) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (process?.startupError) throw process.startupError;
    if (process?.exitCode != null)
      throw new Error(
        "The managed service exited. Check the application logs.",
      );
    try {
      if (await check()) return;
    } catch {}
    await delay(500);
  }
  throw new Error("Service startup timed out. Check the application logs.");
}
function sqlQuote(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
function readCredentials(directory) {
  const filename = path.join(directory, "credentials.json");
  if (fs.existsSync(filename))
    return JSON.parse(fs.readFileSync(filename, "utf8"));
  const value = { password: random(), rootPassword: random() };
  fs.writeFileSync(filename, JSON.stringify(value), { mode: 0o600 });
  return value;
}
function resolvePaths(root, resources) {
  const runtime = resources || path.join(root, "runtime");
  const javaHome = process.env.JAVA_HOME || path.join(runtime, "java");
  const mysqlHome = process.env.MYSQL_HOME || path.join(runtime, "mysql");
  return {
    java: resources
      ? path.join(runtime, "java", "bin", "java.exe")
      : path.join(javaHome, "bin", "java.exe"),
    mysqlHome: resources ? path.join(runtime, "mysql") : mysqlHome,
    jar: resources
      ? path.join(resources, "backend", "app.jar")
      : path.join(root, "backend", "target", "codeplan-0.1.1.jar"),
  };
}
async function launch({ root, dataDir, resources, onProgress = () => {} }) {
  const paths = resolvePaths(root, resources),
    mysql = path.join(paths.mysqlHome, "bin", "mysqld.exe"),
    mysqlClient = path.join(paths.mysqlHome, "bin", "mysql.exe"),
    mysqlAdmin = path.join(paths.mysqlHome, "bin", "mysqladmin.exe");
  for (const file of [paths.java, mysql, mysqlClient, mysqlAdmin, paths.jar])
    if (!fs.existsSync(file))
      throw new Error(`Missing runtime component: ${file}`);
  fs.mkdirSync(dataDir, { recursive: true });
  const dbDir = path.join(dataDir, "database"),
    logs = path.join(dataDir, "logs");
  fs.mkdirSync(logs, { recursive: true });
  const credentials = readCredentials(dataDir),
    dbPort = await freePort(),
    port = await freePort(),
    token = random(),
    children = [];
  const rootConfig = path.join(dataDir, "mysql-root.ini"),
    clientConfig = path.join(dataDir, "mysql-client.ini"),
    initFile = path.join(dataDir, "initialize.sql");
  fs.writeFileSync(
    rootConfig,
    `[client]\nuser=root\npassword=${credentials.rootPassword}\nhost=127.0.0.1\nport=${dbPort}\n`,
    { mode: 0o600 },
  );
  fs.writeFileSync(
    clientConfig,
    `[client]\nuser=codeplan\npassword=${credentials.password}\nhost=127.0.0.1\nport=${dbPort}\n`,
    { mode: 0o600 },
  );
  function start(file, args, env) {
    const log = fs.openSync(path.join(logs, path.basename(file) + ".log"), "a");
    let child;
    try {
      child = spawn(file, args, {
        windowsHide: true,
        env: env || process.env,
        stdio: ["ignore", log, log],
      });
    } finally {
      fs.closeSync(log);
    }
    children.push(child);
    child.on("error", (error) => {
      child.startupError = error;
    });
    return child;
  }
  let stopping = false;
  async function exited(child) {
    if (!child || !child.pid || child.exitCode != null) return;
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        child.kill();
      }, 15000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      if (child.exitCode != null) {
        clearTimeout(timeout);
        resolve();
      }
    });
  }
  async function stop() {
    if (stopping) return;
    stopping = true;
    const java = children[1];
    if (java && java.exitCode == null) java.kill();
    await exited(java);
    const db = children[0];
    if (db && db.exitCode == null) {
      try {
        await execute(
          mysqlAdmin,
          [`--defaults-file=${rootConfig}`, "shutdown"],
          { timeout: 15000 },
        );
      } catch {
        db.kill();
      }
    }
    await exited(db);
  }
  try {
    if (!fs.existsSync(path.join(dbDir, "mysql"))) {
      onProgress("正在初始化本地数据库 / Initializing local database…");
      fs.mkdirSync(dbDir, { recursive: true });
      await execute(
        mysql,
        [
          "--no-defaults",
          "--initialize-insecure",
          `--basedir=${paths.mysqlHome}`,
          `--datadir=${dbDir}`,
          "--console",
        ],
        { timeout: 120000 },
      );
    }
    const marker = path.join(dataDir, "initialized");
    const args = [
      "--no-defaults",
      `--basedir=${paths.mysqlHome}`,
      `--datadir=${dbDir}`,
      `--port=${dbPort}`,
      "--bind-address=127.0.0.1",
      "--mysqlx=0",
      "--innodb-buffer-pool-size=64M",
      "--max-connections=20",
      "--console",
    ];
    if (!fs.existsSync(marker)) {
      fs.writeFileSync(
        initFile,
        `CREATE DATABASE IF NOT EXISTS codeplan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\nCREATE USER IF NOT EXISTS 'codeplan'@'localhost' IDENTIFIED BY ${sqlQuote(credentials.password)};\nGRANT ALL PRIVILEGES ON codeplan.* TO 'codeplan'@'localhost';\nALTER USER 'root'@'localhost' IDENTIFIED BY ${sqlQuote(credentials.rootPassword)};\n`,
        { mode: 0o600 },
      );
      args.push(`--init-file=${initFile.replaceAll("\\", "/")}`);
    }
    onProgress("正在启动本地数据库 / Starting database…");
    const db = start(mysql, args);
    await waitFor(
      async () => {
        await execute(
          mysqlClient,
          [`--defaults-file=${clientConfig}`, "-e", "SELECT 1"],
          { timeout: 2000, stdio: ["ignore", "ignore", "pipe"] },
        );
        return true;
      },
      60000,
      db,
    );
    fs.writeFileSync(marker, "1");
    if (fs.existsSync(initFile)) fs.unlinkSync(initFile);
    onProgress("正在启动应用服务 / Starting application…");
    const java = start(paths.java, ["-Xms64m", "-Xmx256m", "-jar", paths.jar], {
      ...process.env,
      APP_PORT: String(port),
      DB_PORT: String(dbPort),
      DB_PASSWORD: credentials.password,
      APP_TOKEN: token,
      APP_DATA_DIR: dataDir,
    });
    await waitFor(
      async () => {
        const r = await fetch(`http://127.0.0.1:${port}/api/health`, {
          signal: AbortSignal.timeout(1500),
        });
        return r.ok && (await r.json()).status === "ok";
      },
      90000,
      java,
    );
    return {
      port,
      token,
      dbPort,
      base: `http://127.0.0.1:${port}`,
      stop,
      children,
    };
  } catch (e) {
    await stop();
    throw e;
  }
}
module.exports = { launch, resolvePaths, sqlQuote, freePort };
