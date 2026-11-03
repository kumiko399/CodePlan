import { reactive } from "vue";
export const requestState = reactive({
  pending: 0,
  revision: 0,
  offline: false,
  failed: false,
  savedAt: null,
});
let desktopConnection;
async function connection() {
  if (window.codeplan && !desktopConnection)
    desktopConnection = await window.codeplan.connection();
  return desktopConnection;
}
export async function request(path, options = {}) {
  const { isolated = false, ...fetchOptions } = options;
  const writing = !isolated && options.method && options.method !== "GET";
  if (writing) {
    requestState.pending++;
    requestState.revision++;
    requestState.failed = false;
  }
  try {
    const local = await connection();
    const headers = { ...options.headers };
    if (local) headers["X-App-Token"] = local.token;
    let body = options.body;
    if (body != null && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    const response = await fetch(`${local?.base || ""}/api${path}`, {
      ...fetchOptions,
      headers,
      body,
      signal: options.signal || AbortSignal.timeout(60000),
    });
    if (!isolated) requestState.offline = false;
    if (!response.ok) {
      const failure = await response
        .json()
        .catch(() => ({ code: "OPERATION_FAILED" }));
      const error = new Error(failure.code || "OPERATION_FAILED");
      error.http = true;
      throw error;
    }
    if (writing) requestState.savedAt = new Date();
    if (options.blob) return response.blob();
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch (error) {
    if (!isolated && !error.http) requestState.offline = true;
    if (writing) requestState.failed = true;
    throw error;
  } finally {
    if (writing) {
      requestState.pending--;
      requestState.revision++;
    }
  }
}
export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  put: (path, body) => request(path, { method: "PUT", body }),
  delete: (path) => request(path, { method: "DELETE" }),
};
export function openLink(url) {
  if (!/^https?:\/\//i.test(url)) return;
  if (window.codeplan) window.codeplan.openExternal(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
