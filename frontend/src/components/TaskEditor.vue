<script setup>
import { ref, reactive, watch, computed, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import { usePlanner } from "../store.js";
import { api } from "../api.js";
import { dateKey } from "../lib/dates.js";
import { categories, categoryLabel, categoryEmoji } from "../lib/categories.js";
import { taskEmojis } from "../lib/calendar.js";
import { showError, confirmAction } from "../lib/feedback.js";
import { useDraft } from "../lib/drafts.js";
import SubtaskEditor from "./SubtaskEditor.vue";
import DraftNotice from "./DraftNotice.vue";
import TaskWeatherHint from "./TaskWeatherHint.vue";
import { plannedAfterDeadline } from "../lib/deadlines.js";
const props = defineProps({
  modelValue: Boolean,
  task: Object,
  day: String,
  problem: Object,
});
const emit = defineEmits(["update:modelValue", "saved"]);
const store = usePlanner(),
  { t } = useI18n();
const form = reactive({}),
  busy = ref(false),
  original = ref(""),
  scope = ref("this");
const draftValue = computed({
  get: () => ({ fields: form, scope: scope.value }),
  set: async (value) => {
    scope.value = value.scope || "this";
    await nextTick();
    Object.assign(form, value.fields);
  },
});
const draft = useDraft(draftValue, () => store.workspace);
const rule = computed(() =>
  store.rules.find((r) => r.id === props.task?.ruleId),
);
watch(
  () => props.modelValue,
  async (value) => {
    if (!value) return;
    Object.keys(form).forEach((k) => delete form[k]);
    scope.value = "this";
    Object.assign(
      form,
      {
        details: {
          deadlineDate: null,
          deadlineTime: null,
          subtasks: [],
          deletedAt: null,
          emoji: null,
        },
        title: props.problem?.title || "",
        category: props.problem ? "algorithm" : "study",
        planDate: props.day || dateKey(),
        taskTime: null,
        priority: "medium",
        notes: "",
        status: "todo",
        problemId: props.problem?.id || null,
        reminderTime: null,
        frequency: "none",
        weekdays: [],
        endDate: null,
      },
      JSON.parse(JSON.stringify(props.task || {})),
    );
    original.value = JSON.stringify(form);
    await draft.begin(
      `task:${props.task?.id || `new:${form.planDate}:${form.problemId || "general"}`}`,
    );
  },
);
watch(scope, (value) => {
  if (value === "following" && rule.value)
    Object.assign(form, {
      ...JSON.parse(JSON.stringify(rule.value)),
      details: {
        deadlineDate: null,
        deadlineTime: null,
        subtasks: JSON.parse(JSON.stringify(rule.value.subtasks || [])),
        deletedAt: null,
      },
      planDate: rule.value.startDate,
      weekdays: rule.value.weekdays.split(",").filter(Boolean),
    });
  else if (props.task)
    Object.assign(form, JSON.parse(JSON.stringify(props.task)), {
      frequency: "none",
      weekdays: [],
      endDate: null,
    });
});
async function close(done) {
  if (busy.value) return;
  if (
    original.value !== JSON.stringify(form) &&
    !(await confirmAction(t("keepEditingDraft")))
  )
    return;
  try {
    await draft.leave();
  } catch (e) {
    return showError(e);
  }
  emit("update:modelValue", false);
  if (typeof done === "function") done();
}
async function save() {
  if (busy.value || draft.pending.value) return;
  if (!form.title?.trim() || !form.planDate)
    return ElMessage.warning(t("required"));
  if (form.endDate && form.endDate < form.planDate)
    return ElMessage.warning(t("invalidRange"));
  if (plannedAfterDeadline(form) && !(await confirmAction(t("afterDeadline"))))
    return;
  let confirmIncomplete = false;
  if (
    form.status === "done" &&
    props.task?.status !== "done" &&
    form.details.subtasks.some((s) => !s.done)
  ) {
    if (!(await confirmAction(t("incompletePrompt")))) return;
    confirmIncomplete = true;
  }
  if (form.details.subtasks.some((s) => !s.title.trim()))
    return ElMessage.warning(t("required"));
  busy.value = true;
  try {
    if (!form.details.deadlineDate) form.details.deadlineTime = null;
    const body = {
      ...form,
      confirmIncomplete,
      problemId: form.category === "algorithm" ? form.problemId || null : null,
      taskTime: form.taskTime || null,
      reminderTime: form.reminderTime || null,
    };
    if (
      (!props.task && form.frequency !== "none") ||
      scope.value === "following"
    ) {
      const input = {
        ...body,
        subtasks: form.details.subtasks,
        startDate: form.planDate,
        endDate: form.endDate || null,
        frequency: form.frequency === "none" ? "daily" : form.frequency,
        weekdays: form.weekdays.join(","),
        active: true,
      };
      if (scope.value === "following")
        await api.put(`/rules/${rule.value.id}`, input);
      else await api.post("/rules", input);
    } else if (props.task) await api.put(`/tasks/${props.task.id}`, body);
    else await api.post("/tasks", body);
    await draft.committed();
    emit("saved");
    emit("update:modelValue", false);
    ElMessage.success(t("saved"));
    await store.load();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <el-dialog
    :model-value="modelValue"
    :title="t(task ? 'editTask' : 'addTask')"
    width="580px"
    :before-close="close"
    :close-on-click-modal="false"
  >
    <DraftNotice :draft="draft" />
    <el-form
      :disabled="busy || !!draft.pending.value"
      label-position="top"
      @submit.prevent="save"
    >
      <el-form-item v-if="rule" :label="t('editScope')"
        ><el-radio-group v-model="scope"
          ><el-radio-button value="this">{{ t("onlyThis") }}</el-radio-button
          ><el-radio-button value="following">{{
            t("following")
          }}</el-radio-button></el-radio-group
        ></el-form-item
      >
      <p v-if="scope === 'following'" class="hint">{{ t("ruleNote") }}</p>
      <el-form-item :label="t('title')" required
        ><el-input v-model="form.title" maxlength="100" show-word-limit
      /></el-form-item>
      <div class="form-grid">
        <el-form-item :label="t('category')"
          ><el-select
            v-model="form.category"
            data-testid="task-category"
            popper-class="task-category-options"
            ><el-option
              v-for="c in categories.filter(
                (c) => c.active || c.id === form.category,
              )"
              :key="c.id"
              :label="categoryLabel(c.id, t)"
              :value="c.id" /></el-select></el-form-item
        ><el-form-item :label="t('priority')"
          ><el-select v-model="form.priority"
            ><el-option
              v-for="p in ['high', 'medium', 'low']"
              :key="p"
              :label="t(p)"
              :value="p" /></el-select
        ></el-form-item>
      </div>
      <el-form-item v-if="form.category === 'algorithm'" :label="t('problem')"
        ><el-select
          v-model="form.problemId"
          clearable
          filterable
          :placeholder="t('noProblem')"
          ><el-option
            v-for="p in store.problems"
            :key="p.id"
            :value="p.id"
            :label="p.title" /></el-select
      ></el-form-item>
      <el-form-item
        v-if="scope === 'this' && form.frequency === 'none'"
        :label="t('taskEmoji')"
      >
        <div class="emoji-picker" data-testid="task-emoji-picker">
          <button
            type="button"
            :aria-pressed="!form.details.emoji"
            @click="form.details.emoji = null"
          >
            {{ categoryEmoji(form.category) }} {{ t("followCategory") }}
          </button>
          <button
            v-for="emoji in taskEmojis"
            :key="emoji"
            type="button"
            :aria-label="t('chooseTaskEmoji', { emoji })"
            :aria-pressed="form.details.emoji === emoji"
            @click="form.details.emoji = emoji"
          >
            {{ emoji }}
          </button>
        </div>
      </el-form-item>
      <div class="form-grid">
        <el-form-item :label="t('date')" required
          ><el-date-picker
            v-model="form.planDate"
            value-format="YYYY-MM-DD"
            :clearable="false" /></el-form-item
        ><el-form-item :label="t('time')"
          ><el-time-picker
            v-model="form.taskTime"
            value-format="HH:mm"
            format="HH:mm"
            :placeholder="t('allDay')"
        /></el-form-item>
      </div>
      <template v-if="scope === 'this' && form.frequency === 'none'">
        <div class="form-grid">
          <el-form-item :label="t('deadline')"
            ><el-date-picker
              v-model="form.details.deadlineDate"
              value-format="YYYY-MM-DD"
          /></el-form-item>
          <el-form-item :label="t('deadlineTime')"
            ><el-time-picker
              v-model="form.details.deadlineTime"
              :disabled="!form.details.deadlineDate"
              value-format="HH:mm"
              format="HH:mm"
          /></el-form-item>
        </div>
        <p class="hint">{{ t("deadlineHint") }}</p>
      </template>
      <TaskWeatherHint :date="form.planDate" :time="form.taskTime" />
      <el-form-item :label="t('status')"
        ><el-radio-group v-model="form.status"
          ><el-radio-button
            v-for="s in ['todo', 'doing', 'done']"
            :key="s"
            :value="s"
            >{{ t(s) }}</el-radio-button
          ></el-radio-group
        ></el-form-item
      >
      <template v-if="!task || scope === 'following'"
        ><el-form-item :label="t('repeat')"
          ><el-select
            v-model="form.frequency"
            :disabled="!store.settings.repeatEnabled"
            ><el-option
              v-for="f in ['none', 'daily', 'weekly']"
              :key="f"
              :label="t(f)"
              :value="f" /></el-select
          ><span class="hint">{{ t("repeatHint") }}</span></el-form-item
        >
        <div v-if="form.frequency !== 'none'">
          <el-form-item
            v-if="form.frequency === 'weekly'"
            :label="t('weekdays')"
            ><el-checkbox-group v-model="form.weekdays"
              ><el-checkbox-button
                v-for="(d, i) in [
                  'monday',
                  'tuesday',
                  'wednesday',
                  'thursday',
                  'friday',
                  'saturday',
                  'sunday',
                ]"
                :key="d"
                :value="String(i + 1)"
                >{{ t(d) }}</el-checkbox-button
              ></el-checkbox-group
            ></el-form-item
          ><el-form-item :label="t('endDate')"
            ><el-date-picker v-model="form.endDate" value-format="YYYY-MM-DD"
          /></el-form-item></div
      ></template>
      <el-form-item :label="t('reminder')"
        ><el-time-picker
          v-model="form.reminderTime"
          value-format="HH:mm"
          format="HH:mm"
          :placeholder="t('optional')"
        /><span class="hint">{{ t("reminderHint") }}</span></el-form-item
      >
      <el-form-item :label="t('subtasks')"
        ><SubtaskEditor v-if="form.details" v-model="form.details.subtasks"
      /></el-form-item>
      <el-form-item :label="t('notes')"
        ><el-input
          v-model="form.notes"
          type="textarea"
          :rows="3"
          maxlength="20000"
      /></el-form-item>
    </el-form>
    <template #footer
      ><el-button @click="close">{{ t("cancel") }}</el-button
      ><el-button
        type="primary"
        :loading="busy"
        :disabled="!!draft.pending.value"
        @click="save"
        >{{ t("save") }}</el-button
      ></template
    >
  </el-dialog>
</template>
