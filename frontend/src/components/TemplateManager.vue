<script setup>
import { ref, reactive, computed } from "vue";
import { useI18n } from "vue-i18n";
import { api } from "../api.js";
import { usePlanner } from "../store.js";
import { categories, categoryLabel } from "../lib/categories.js";
import { dateKey } from "../lib/dates.js";
import { showError, confirmAction } from "../lib/feedback.js";
import SubtaskEditor from "./SubtaskEditor.vue";
const { t } = useI18n(),
  store = usePlanner(),
  open = ref(false),
  busy = ref(false),
  selected = ref([]),
  base = ref(dateKey()),
  preview = ref(null),
  creating = ref(null),
  requestId = ref(""),
  form = reactive({ name: "", items: [] });
const templates = computed(
  () =>
    store.workspace.extras
      ?.filter((r) => r.kind === "template")
      .map((r) => ({ id: r.recordId, ...JSON.parse(r.payload) })) || [],
);
function item() {
  return {
    title: "",
    category: "study",
    priority: "medium",
    notes: "",
    problemId: null,
    offset: 0,
    subtasks: [],
  };
}
function edit(template) {
  Object.assign(
    form,
    { id: null, name: "", items: [item()] },
    template ? JSON.parse(JSON.stringify(template)) : {},
  );
  open.value = true;
}
function fromTasks() {
  const tasks = store.tasks.filter((task) => selected.value.includes(task.id));
  if (!tasks.length) return;
  const first = [...tasks].sort((a, b) =>
    a.planDate.localeCompare(b.planDate),
  )[0].planDate;
  edit({
    name: "",
    items: tasks.map((task) => ({
      ...item(),
      title: task.title,
      category: task.category,
      priority: task.priority,
      notes: task.notes,
      problemId: task.problemId,
      offset: Math.round(
        (new Date(task.planDate + "T12:00:00") -
          new Date(first + "T12:00:00")) /
          86400000,
      ),
      subtasks: JSON.parse(JSON.stringify(task.details.subtasks)).map((s) => ({
        ...s,
        done: false,
      })),
    })),
  });
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  try {
    for (const i of form.items)
      if (i.category !== "algorithm") i.problemId = null;
    if (form.id) await api.put(`/templates/${form.id}`, form);
    else await api.post("/templates", form);
    open.value = false;
    await store.load();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
async function remove(id) {
  if (!(await confirmAction(t("deletePrompt")))) return;
  try {
    await api.delete(`/templates/${id}`);
    await store.load();
  } catch (e) {
    showError(e);
  }
}
async function prepare(template) {
  if (busy.value || !base.value) return;
  busy.value = true;
  try {
    preview.value = await api.get(
      `/templates/${template.id}/preview?day=${base.value}`,
    );
    creating.value = { id: template.id, day: base.value };
    requestId.value = crypto.randomUUID();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
async function create() {
  if (busy.value) return;
  busy.value = true;
  try {
    await api.post(`/templates/${creating.value.id}/create`, {
      day: creating.value.day,
      requestId: requestId.value,
    });
    preview.value = null;
    await store.load();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <p class="hint">{{ t("templateHint") }}</p>
  <div class="filters">
    <el-select
      v-model="selected"
      multiple
      collapse-tags
      :placeholder="t('chooseTasks')"
      ><el-option
        v-for="task in store.tasks"
        :key="task.id"
        :value="task.id"
        :label="task.planDate + ' · ' + task.title" /></el-select
    ><el-button :disabled="!selected.length" @click="fromTasks">{{
      t("saveAsTemplate")
    }}</el-button
    ><el-button @click="edit()">＋ {{ t("templates") }}</el-button>
  </div>
  <label
    >{{ t("baseDate") }}
    <el-date-picker v-model="base" :clearable="false" value-format="YYYY-MM-DD"
  /></label>
  <article v-for="template in templates" :key="template.id" class="task-row">
    <div class="task-body">
      <strong>{{ template.name }}</strong>
      <p>{{ template.items.length }} {{ t("tasks") }}</p>
    </div>
    <el-button :disabled="busy" @click="prepare(template)">{{
      t("previewTemplate")
    }}</el-button
    ><el-button :disabled="busy" @click="edit(template)">{{
      t("edit")
    }}</el-button
    ><el-button
      :disabled="busy"
      type="danger"
      text
      @click="remove(template.id)"
      >{{ t("delete") }}</el-button
    >
  </article>
  <el-dialog
    v-model="open"
    :title="t('templates')"
    width="700px"
    append-to-body
    :close-on-click-modal="false"
    ><el-form :disabled="busy" label-position="top"
      ><el-form-item :label="t('templateName')"
        ><el-input v-model="form.name" maxlength="100"
      /></el-form-item>
      <div
        v-for="(row, index) in form.items"
        :key="index"
        class="template-item"
      >
        <h3>
          {{ index + 1 }}
          <el-button
            type="danger"
            text
            :disabled="form.items.length === 1"
            @click="form.items.splice(index, 1)"
            >{{ t("delete") }}</el-button
          >
        </h3>
        <el-form-item :label="t('title')"
          ><el-input v-model="row.title" maxlength="100"
        /></el-form-item>
        <div class="form-grid">
          <el-form-item :label="t('category')"
            ><el-select v-model="row.category"
              ><el-option
                v-for="c in categories"
                :key="c.id"
                :value="c.id"
                :label="categoryLabel(c.id, t)"
                :disabled="!c.active" /></el-select></el-form-item
          ><el-form-item :label="t('priority')"
            ><el-select v-model="row.priority"
              ><el-option
                v-for="p in ['high', 'medium', 'low']"
                :key="p"
                :value="p"
                :label="t(p)" /></el-select
          ></el-form-item>
        </div>
        <el-form-item :label="t('offsetDays')"
          ><el-input-number
            v-model="row.offset"
            :min="-365"
            :max="365" /></el-form-item
        ><el-form-item v-if="row.category === 'algorithm'" :label="t('problem')"
          ><el-select v-model="row.problemId" clearable
            ><el-option
              v-for="p in store.problems"
              :key="p.id"
              :value="p.id"
              :label="p.title" /></el-select></el-form-item
        ><el-form-item :label="t('notes')"
          ><el-input
            v-model="row.notes"
            type="textarea"
            maxlength="20000" /></el-form-item
        ><SubtaskEditor v-model="row.subtasks" />
      </div>
      <el-button
        :disabled="form.items.length >= 50"
        @click="form.items.push(item())"
        >＋ {{ t("addTask") }}</el-button
      ></el-form
    ><template #footer
      ><el-button :loading="busy" @click="save">{{
        t("save")
      }}</el-button></template
    ></el-dialog
  >
  <el-dialog
    :model-value="!!preview"
    :title="t('previewTemplate')"
    width="600px"
    append-to-body
    :before-close="
      () => {
        if (!busy) preview = null;
      }
    "
    ><p>{{ t("templateCreateCount", { count: preview?.length || 0 }) }}</p>
    <p v-for="(row, index) in preview" :key="index">
      {{ row.planDate }} · {{ categoryLabel(row.category, t) }} ·
      {{ row.title }}
    </p>
    <template #footer
      ><el-button :loading="busy" @click="create">{{
        t("confirm")
      }}</el-button></template
    ></el-dialog
  >
</template>
