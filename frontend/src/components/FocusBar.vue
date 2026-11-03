<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import {
  focusState,
  currentFocus,
  loadFocus,
  focusAction,
  focusSeconds,
} from "../lib/focus.js";
import { confirmAction } from "../lib/feedback.js";
const { t } = useI18n(),
  now = ref(new Date());
const remaining = computed(() => {
  const f = currentFocus.value;
  if (!f) return 0;
  if (f.status === "rest")
    return Math.max(
      0,
      f.restMinutes * 60 - (now.value - new Date(f.phaseStart)) / 1000,
    );
  return Math.max(
    0,
    f.focusMinutes * 60 -
      focusSeconds(f) -
      (f.status === "running"
        ? Math.min(5, Math.max(0, (now.value - new Date(f.lastTick)) / 1000))
        : 0),
  );
});
const clock = computed(
  () =>
    `${Math.floor(remaining.value / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(remaining.value % 60)
      .toString()
      .padStart(2, "0")}`,
);
let poll, timer;
onMounted(() => {
  loadFocus().catch(() => {});
  poll = setInterval(() => loadFocus().catch(() => {}), 5000);
  timer = setInterval(() => (now.value = new Date()), 1000);
});
onBeforeUnmount(() => {
  clearInterval(poll);
  clearInterval(timer);
});
async function act(action) {
  if (action === "cancel" && !(await confirmAction(t("focusCancelPrompt"))))
    return;
  focusAction(action).catch(() => {});
}
</script>
<template>
  <aside
    v-if="currentFocus"
    class="focus-bar"
    role="region"
    :aria-label="t('focusTimer')"
  >
    <div>
      <strong>🍅 {{ currentFocus.title }} · {{ clock }}</strong>
      <p>{{ t("focus_" + currentFocus.status) }}</p>
    </div>
    <el-button
      v-if="currentFocus.status === 'running'"
      :disabled="focusState.busy"
      @click="act('pause')"
      >{{ t("pause") }}</el-button
    >
    <el-button
      v-if="['paused', 'interrupted'].includes(currentFocus.status)"
      :disabled="focusState.busy"
      @click="act('resume')"
      >{{ t("resume") }}</el-button
    >
    <el-button :disabled="focusState.busy" @click="act('finish')">{{
      t("finishFocus")
    }}</el-button>
    <el-button :disabled="focusState.busy" text @click="act('cancel')">{{
      t("cancelFocus")
    }}</el-button>
  </aside>
</template>
