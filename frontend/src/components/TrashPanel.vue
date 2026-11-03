<script setup>
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { usePlanner } from "../store.js";
import { api } from "../api.js";
import { showError, confirmAction } from "../lib/feedback.js";
import { categoryLabel } from "../lib/categories.js";
const { t } = useI18n(),
  store = usePlanner(),
  busy = ref(false);
async function act(task, purge) {
  if (busy.value) return;
  if (purge && !(await confirmAction(t("purgePrompt", { title: task.title }))))
    return;
  busy.value = true;
  try {
    if (purge) await api.delete(`/trash/${task.id}`);
    else await api.post(`/trash/${task.id}/restore`);
    await store.load();
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <p class="hint">{{ t("trashHint") }}</p>
  <el-empty v-if="!store.trash.length" :description="t('trashEmpty')" />
  <article v-for="task in store.trash" :key="task.id" class="task-row">
    <div class="task-body">
      <strong>{{ task.title }}</strong>
      <p>{{ categoryLabel(task.category, t) }} · {{ task.planDate }}</p>
      <small
        >{{ t("deletedAt") }}
        {{ task.details.deletedAt.replace("T", " ") }}</small
      >
    </div>
    <el-button :disabled="busy" @click="act(task, false)">{{
      t("restoreTask")
    }}</el-button>
    <el-button :disabled="busy" type="danger" plain @click="act(task, true)">{{
      t("purge")
    }}</el-button>
  </article>
</template>
