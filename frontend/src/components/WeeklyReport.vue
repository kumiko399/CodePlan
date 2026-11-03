<script setup>
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { usePlanner } from "../store.js";
import { api } from "../api.js";
import { dateKey, shiftDate } from "../lib/dates.js";
import { showError } from "../lib/feedback.js";
import { useDraft } from "../lib/drafts.js";
import DraftNotice from "./DraftNotice.vue";
const { t } = useI18n(),
  store = usePlanner(),
  day = ref(dateKey()),
  report = ref(null),
  content = ref(""),
  busy = ref(false),
  saved = ref(false);
const draft = useDraft(content, () => store.workspace);
async function load() {
  if (busy.value || !day.value) return;
  busy.value = true;
  saved.value = false;
  try {
    await draft.leave();
    report.value = await api.get(`/weekly?day=${day.value}`);
    day.value = report.value.from;
    content.value = report.value.review;
    await draft.begin(`week:${report.value.from}`);
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
async function move(delta) {
  if (busy.value) return;
  day.value = shiftDate(day.value, delta);
  await load();
}
async function save() {
  if (busy.value || draft.pending.value) return;
  busy.value = true;
  saved.value = false;
  try {
    await api.put(`/weekly/${report.value.from}`, { content: content.value });
    await draft.committed();
    await draft.begin(`week:${report.value.from}`);
    saved.value = true;
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <section class="panel">
    <div class="section-header">
      <h2>📅 {{ t("weeklyReport") }}</h2>
      <div class="page-actions">
        <el-button :disabled="busy" @click="move(-7)">‹</el-button
        ><el-date-picker
          v-model="day"
          :disabled="busy"
          :clearable="false"
          value-format="YYYY-MM-DD"
          @change="load"
        /><el-button :disabled="busy" @click="move(7)">›</el-button>
      </div>
    </div>
    <p class="hint">{{ t("weeklyBasis") }}</p>
    <template v-if="report"
      ><p>{{ report.from }} — {{ report.to }}</p>
      <div class="summary-grid weekly-metrics">
        <div class="summary-card">
          <span>{{ t("completed") }}</span
          ><strong>{{ report.completed }}/{{ report.total }}</strong>
        </div>
        <div class="summary-card">
          <span>{{ t("focusMinutes") }}</span
          ><strong>{{ Math.floor(report.focusSeconds / 60) }}</strong>
        </div>
        <div class="summary-card">
          <span>{{ t("attempts") }}</span
          ><strong>{{ report.attempts }}</strong>
        </div>
        <div class="summary-card">
          <span>{{ t("passedProblems") }}</span
          ><strong>{{ report.passed }}</strong>
        </div>
        <div class="summary-card">
          <span>{{ t("reschedules") }}</span
          ><strong>{{ report.reschedules.length }}</strong>
        </div>
        <div class="summary-card">
          <span>{{ t("unfinished") }}</span
          ><strong>{{ report.unfinished.length }}</strong>
        </div>
      </div>
      <details v-if="report.unfinished.length">
        <summary>{{ t("unfinished") }}</summary>
        <p v-for="task in report.unfinished" :key="task.id">
          {{ task.planDate }} · {{ task.title }}
        </p>
      </details>
      <details v-if="report.focusHistory?.length">
        <summary>{{ t("focusHistory") }}</summary>
        <p v-for="(record, index) in report.focusHistory" :key="index">
          {{ record.title }} · {{ record.startedAt.replace("T", " ") }} —
          {{ record.endedAt.replace("T", " ") || t("focus_running") }} ·
          {{ Math.floor(record.seconds / 60) }} min {{ record.seconds % 60 }} s
          · {{ t("focusResult_" + record.outcome) }}
        </p>
      </details>
      <h3>{{ t("weeklyReview") }}</h3>
      <DraftNotice :draft="draft" />
      <el-input
        v-model="content"
        :disabled="busy || !!draft.pending.value"
        type="textarea"
        :rows="4"
        maxlength="20000"
      />
      <el-button
        :loading="busy"
        :disabled="!!draft.pending.value"
        @click="save"
        >{{ t("save") }}</el-button
      ><span v-if="saved" role="status">{{ t("saved") }}</span>
    </template>
  </section>
</template>
