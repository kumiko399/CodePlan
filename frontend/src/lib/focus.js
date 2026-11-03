import { reactive, computed } from "vue";
import { api } from "../api.js";
import { confirmAction, showError } from "./feedback.js";
import { i18n } from "../i18n.js";
export const focusState = reactive({
  records: [],
  preferences: [25, 5],
  busy: false,
});
export const currentFocus = computed(() =>
  focusState.records.find((f) =>
    ["running", "paused", "interrupted", "rest"].includes(f.status),
  ),
);
let loading;
export async function loadFocus(force = false) {
  if (loading && !force) return loading;
  if (loading) await loading.catch(() => {});
  loading = api
    .get("/focus")
    .then((data) => Object.assign(focusState, data))
    .finally(() => (loading = null));
  return loading;
}
export async function focusAction(action, taskId) {
  if (focusState.busy) return;
  focusState.busy = true;
  try {
    if (action === "start") await api.post("/focus", { taskId });
    else if (currentFocus.value)
      await api.post(`/focus/${currentFocus.value.id}/${action}`);
    await loadFocus(true);
  } catch (error) {
    showError(error);
    throw error;
  } finally {
    focusState.busy = false;
  }
}
window.codeplanFocusExit = async () => {
  await loadFocus(true);
  if (!currentFocus.value) return true;
  if (!(await confirmAction(i18n.global.t("focusExitPrompt")))) return false;
  await focusAction("finish");
  return true;
};
export const focusSeconds = (record) =>
  record.spans.reduce(
    (sum, s) => sum + (new Date(s.end) - new Date(s.start)) / 1000,
    0,
  );
