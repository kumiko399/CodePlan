import { ref, watch, onBeforeUnmount } from "vue";
import { ElMessageBox } from "element-plus";
import { i18n } from "../i18n.js";
import { requestState } from "../api.js";

let drafts,
  queue = Promise.resolve();
const editors = new Set();
async function read() {
  if (!drafts)
    drafts = window.codeplan?.readDrafts
      ? await window.codeplan.readDrafts()
      : JSON.parse(localStorage.getItem("codeplan-drafts") || "{}");
  return drafts;
}
function write() {
  const copy = JSON.parse(JSON.stringify(drafts));
  const pending = queue
    .catch(() => {})
    .then(() =>
      window.codeplan?.writeDrafts
        ? window.codeplan.writeDrafts(copy)
        : localStorage.setItem("codeplan-drafts", JSON.stringify(copy)),
    );
  queue = pending;
  return pending;
}
const clone = (value) => JSON.parse(JSON.stringify(value));
export function useDraft(value, workspace) {
  const state = ref(""),
    pending = ref(null);
  let key = "",
    baseline = "",
    epoch = "",
    timer,
    enabled = false;
  const serialize = () => JSON.stringify(value.value);
  const dirty = () => enabled && baseline !== serialize();
  async function flush() {
    clearTimeout(timer);
    if (!dirty() || pending.value) return;
    try {
      await read();
      drafts[key] = {
        payload: clone(value.value),
        epoch,
        savedAt: new Date().toISOString(),
      };
      await write();
      state.value = "draftSaved";
    } catch {
      state.value = "draftFailed";
      throw new Error("DRAFT_WRITE_FAILED");
    }
  }
  async function begin(identity) {
    enabled = false;
    clearTimeout(timer);
    pending.value = null;
    key = `${workspace().databaseId}:${identity}`;
    epoch = workspace().epoch;
    baseline = serialize();
    state.value = "";
    try {
      pending.value = (await read())[key] || null;
    } catch {
      state.value = "draftFailed";
    }
    enabled = true;
  }
  function restore() {
    if (!pending.value) return;
    value.value = clone(pending.value.payload);
    pending.value = null;
    state.value = "draftSaved";
  }
  async function discard() {
    clearTimeout(timer);
    await read();
    delete drafts[key];
    await write();
    pending.value = null;
    state.value = "";
  }
  async function committed() {
    baseline = serialize();
    enabled = false;
    try {
      await discard();
    } catch {
      state.value = "draftFailed";
    }
  }
  async function leave() {
    await flush();
    enabled = false;
  }
  watch(
    value,
    () => {
      if (!dirty() || pending.value) return;
      state.value = "draftSaving";
      clearTimeout(timer);
      timer = setTimeout(() => flush().catch(() => {}), 300);
    },
    { deep: true },
  );
  const editor = { dirty, flush, discard };
  editors.add(editor);
  onBeforeUnmount(() => {
    flush().catch(() => {});
    editors.delete(editor);
  });
  return { state, pending, begin, restore, discard, committed, leave };
}
window.codeplanBeforeExit = async () => {
  const t = i18n.global.t;
  if (requestState.pending) {
    await ElMessageBox.alert(t("waitForSave"), t("brand"));
    return false;
  }
  const active = [...editors].filter((e) => e.dirty());
  let discardOnExit = false;
  if (active.length) {
    try {
      await ElMessageBox.confirm(t("exitDraftPrompt"), t("brand"), {
        confirmButtonText: t("keepDraftExit"),
        cancelButtonText: t("discardExit"),
        distinguishCancelAndClose: true,
        closeOnClickModal: false,
      });
    } catch (action) {
      if (action !== "cancel") return false;
      discardOnExit = true;
    }
  }
  try {
    if (window.codeplanFocusExit && !(await window.codeplanFocusExit()))
      return false;
    await Promise.all(
      active.map((e) => (discardOnExit ? e.discard() : e.flush())),
    );
    window.codeplanExiting = true;
    return true;
  } catch {
    await ElMessageBox.alert(t("draftFailed"), t("brand"));
    return false;
  }
};
window.addEventListener("beforeunload", (event) => {
  if (!window.codeplanExiting && [...editors].some((e) => e.dirty())) {
    event.preventDefault();
    event.returnValue = "";
  }
});
