import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const local = path.join(root, ".local", "connection.json");
const connection = fs.existsSync(local)
  ? JSON.parse(fs.readFileSync(local, "utf8").replace(/^\uFEFF/, ""))
  : {};
export default defineConfig({
  plugins: [vue()],
  base: "./",
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${connection.port || 18765}`,
        headers: {
          "X-App-Token": connection.token || process.env.APP_TOKEN || "",
        },
      },
    },
  },
  build: { chunkSizeWarningLimit: 1600 },
});
