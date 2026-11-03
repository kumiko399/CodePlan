<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import { usePlanner } from "../store.js";
import { api } from "../api.js";
import { dateKey, orderTasks } from "../lib/dates.js";
import { showError, confirmAction } from "../lib/feedback.js";
import TemplateManager from "../components/TemplateManager.vue";
import TrashPanel from "../components/TrashPanel.vue";
import TaskEditor from "../components/TaskEditor.vue";
import TaskList from "../components/TaskList.vue";
import { categories, categoryLabel } from "../lib/categories.js";
import { useDraft } from "../lib/drafts.js";
import CalendarBoard from "../components/CalendarBoard.vue";
import { upcomingTasks } from "../lib/deadlines.js";
import DraftNotice from "../components/DraftNotice.vue";
import WeatherSummary from "../components/WeatherSummary.vue";
const props = defineProps({ mode: String }),
  store = usePlanner(),
  { t, locale } = useI18n();
const editor = ref(false),
  editing = ref(null),
  selected = ref(dateKey()),
  search = ref(""),
  category = ref(""),
  status = ref(""),
  priority = ref(""),
  filterDay = ref("");
const reflectionOpen = ref(false),
  reflectionText = ref(""),
  initialReflection = ref(""),
  saving = ref(false);
const reflectionDraft = useDraft(reflectionText, () => store.workspace);
const hasFilters = computed(
  () =>
    !!(
      search.value ||
      category.value ||
      status.value ||
      priority.value ||
      filterDay.value
    ),
);
function clearFilters() {
  search.value =
    category.value =
    status.value =
    priority.value =
    filterDay.value =
      "";
}
const filterSummary = computed(() =>
  [
    search.value,
    category.value && categoryLabel(category.value, t),
    status.value && t(status.value),
    priority.value && t(priority.value),
    filterDay.value,
  ]
    .filter(Boolean)
    .join(" · "),
);
const savingData = ref(false),
  savedAt = ref(null),
  saveFailed = ref(false);
const saveStatus = computed(() => {
  if (store.error) return t("disconnected");
  if (savingData.value) return t("savingData");
  if (saveFailed.value) return t("dataSaveFailed");
  if (savedAt.value)
    return t("dataSavedAt", {
      time: savedAt.value.toLocaleTimeString(
        locale.value === "zh" ? "zh-CN" : "en-US",
      ),
    });
  return t("saveDataHint");
});
async function saveData() {
  if (savingData.value) return;
  savingData.value = true;
  saveFailed.value = false;
  try {
    await api.post("/backups");
    savedAt.value = new Date();
    ElMessage.success(t("dataSaved"));
  } catch (e) {
    saveFailed.value = true;
    showError(e);
  } finally {
    savingData.value = false;
  }
}
watch(
  () => props.mode,
  () => {
    selected.value = dateKey();
    search.value = "";
    category.value = "";
    status.value = "";
    priority.value = "";
    filterDay.value = "";
  },
);
const trashOpen = ref(false),
  templatesOpen = ref(false);
const allDeadlines = ref(false);
const upcoming = computed(() =>
  upcomingTasks(store.tasks, new Date(), allDeadlines.value),
);
const todayTasks = computed(() =>
  store.tasks.filter((t) => t.planDate === dateKey()),
);
const done = computed(
  () => todayTasks.value.filter((t) => t.status === "done").length,
);
const visible = computed(() =>
  orderTasks(
    store.tasks.filter((task) => {
      if (props.mode === "today" && task.planDate !== dateKey()) return false;
      if (props.mode === "calendar" && task.planDate !== selected.value)
        return false;
      return (
        (!search.value ||
          `${task.title} ${task.notes}`
            .toLowerCase()
            .includes(search.value.toLowerCase())) &&
        (!category.value || task.category === category.value) &&
        (!status.value || task.status === status.value) &&
        (!priority.value || task.priority === priority.value) &&
        (!filterDay.value || task.planDate === filterDay.value)
      );
    }),
  ),
);
const overdue = computed(() =>
  orderTasks(
    store.tasks.filter((t) => t.planDate < dateKey() && t.status !== "done"),
  ),
);
function add() {
  editing.value = null;
  editor.value = true;
}
function edit(task) {
  editing.value = task;
  editor.value = true;
}
const changing = new Set();
async function toggle(task) {
  if (changing.has(task.id)) return;
  changing.add(task.id);
  try {
    let confirmIncomplete = false;
    if (
      task.status !== "done" &&
      task.details?.subtasks?.some((s) => !s.done)
    ) {
      if (!(await confirmAction(t("incompletePrompt")))) return;
      confirmIncomplete = true;
    }
    await api.put(`/tasks/${task.id}`, {
      ...task,
      confirmIncomplete,
      status: task.status === "done" ? "todo" : "done",
    });
    await store.load();
  } catch (e) {
    showError(e);
  } finally {
    changing.delete(task.id);
  }
}
async function remove(task) {
  if (changing.has(task.id)) return;
  changing.add(task.id);
  try {
    if (!(await confirmAction(t("deleteTaskPrompt", { title: task.title }))))
      return;
    await api.delete(`/tasks/${task.id}`);
    await store.load();
  } catch (e) {
    showError(e);
  } finally {
    changing.delete(task.id);
  }
}
async function reflect() {
  reflectionText.value =
    store.reflections.find((r) => r.day === selected.value)?.content || "";
  initialReflection.value = reflectionText.value;
  reflectionOpen.value = true;
  await reflectionDraft.begin(`reflection:${selected.value}`);
}
async function closeReflection(done) {
  if (saving.value) return;
  if (
    initialReflection.value !== reflectionText.value &&
    !(await confirmAction(t("keepEditingDraft")))
  )
    return;
  try {
    await reflectionDraft.leave();
  } catch (e) {
    return showError(e);
  }
  reflectionOpen.value = false;
  if (typeof done === "function") done();
}
async function saveReflection() {
  if (saving.value || reflectionDraft.pending.value) return;
  saving.value = true;
  try {
    await api.put(`/reflections/${selected.value}`, {
      content: reflectionText.value,
    });
    await reflectionDraft.committed();
    reflectionOpen.value = false;
    ElMessage.success(t("saved"));
    await store.load();
  } catch (e) {
    showError(e);
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <header class="page-header">
    <div>
      <p class="eyebrow">
        {{
          new Date().toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long",
          })
        }}
      </p>
      <h1>{{ mode === "today" ? t("welcome") : t(mode) }}</h1>
      <p>{{ t(`${mode}Subtitle`) }}</p>
    </div>
    <div class="page-actions">
      <el-button v-if="mode === 'tasks'" @click="templatesOpen = true"
        >📋 {{ t("templates") }}</el-button
      >
      <el-button v-if="mode === 'tasks'" @click="trashOpen = true"
        >🗑 {{ t("trash") }} ({{ store.trash.length }})</el-button
      >
      <el-button
        v-if="mode === 'today'"
        data-testid="save-data"
        size="large"
        :loading="savingData"
        :disabled="store.loading"
        :title="t('saveDataHint')"
        @click="saveData"
        >💾 {{ t("saveData") }}</el-button
      >
      <el-button data-testid="add-task" type="primary" size="large" @click="add"
        >＋ {{ t("addTask") }}</el-button
      >
    </div>
  </header>
  <p
    v-if="mode === 'today'"
    class="save-status"
    :class="{ 'save-error': saveFailed }"
    role="status"
    aria-live="polite"
  >
    {{ saveStatus }}
  </p>
  <WeatherSummary v-if="mode === 'today'" />
  <div v-if="mode === 'today'" class="summary-grid">
    <div class="summary-card">
      <span>{{ t("planned") }}</span
      ><strong
        >{{ todayTasks.length }}<small> / {{ t("tasks") }}</small></strong
      >
    </div>
    <div class="summary-card">
      <span>{{ t("completed") }}</span
      ><strong>{{ done }}<small class="accent">✓</small></strong>
    </div>
    <div class="summary-card">
      <span>{{ t("completion") }}</span
      ><strong>{{
        todayTasks.length
          ? Math.round((done / todayTasks.length) * 100) + "%"
          : "—"
      }}</strong>
      <div class="progress-track">
        <i
          :style="{
            width: todayTasks.length
              ? (done / todayTasks.length) * 100 + '%'
              : '0%',
          }"
        ></i>
      </div>
    </div>
  </div>
  <section v-if="mode === 'today'" class="panel">
    <div class="section-header">
      <h2>
        ⏳ {{ t("upcoming") }} <span class="count">{{ upcoming.length }}</span>
      </h2>
      <el-switch v-model="allDeadlines" :active-text="t('allDeadlines')" />
    </div>
    <p class="hint">{{ allDeadlines ? t("allDeadlines") : t("nextSeven") }}</p>
    <TaskList
      :tasks="upcoming"
      show-date
      @edit="edit"
      @toggle="toggle"
      @delete="remove"
    />
  </section>
  <CalendarBoard
    v-if="mode === 'calendar'"
    @select="selected = $event"
    @add="
      selected = $event;
      add();
    "
    @edit="edit"
    @toggle="toggle"
    @delete="remove"
    @reflect="
      selected = $event;
      reflect();
    "
  />
  <section v-if="mode !== 'calendar'" id="calendar-day-list" class="panel">
    <div class="section-header">
      <h2>
        {{
          mode === "today"
            ? t("focus")
            : mode === "calendar"
              ? selected + " · " + t("selectedDay")
              : t("tasks")
        }}
        <span class="count">{{ visible.length }}</span>
      </h2>
      <el-button v-if="mode !== 'tasks'" text @click="reflect"
        >✎ {{ t("reflection") }}</el-button
      >
    </div>
    <div class="filters">
      <el-input
        v-model="search"
        clearable
        :placeholder="t('search')"
      /><el-select
        v-model="category"
        clearable
        :placeholder="t('category')"
        data-testid="category-filter"
        popper-class="category-filter-options"
        ><el-option
          v-for="c in categories"
          :key="c.id"
          :value="c.id"
          :label="categoryLabel(c.id, t)" /></el-select
      ><el-select v-model="status" clearable :placeholder="t('status')"
        ><el-option
          v-for="s in ['todo', 'doing', 'done']"
          :key="s"
          :value="s"
          :label="t(s)" /></el-select
      ><el-select
        v-if="mode === 'tasks'"
        v-model="priority"
        clearable
        :placeholder="t('priority')"
        ><el-option
          v-for="p in ['high', 'medium', 'low']"
          :key="p"
          :value="p"
          :label="t(p)" /></el-select
      ><el-date-picker
        v-if="mode === 'tasks'"
        v-model="filterDay"
        value-format="YYYY-MM-DD"
        :placeholder="t('date')"
      />
    </div>
    <div v-if="hasFilters" class="filter-feedback" role="status">
      <span
        >{{ filterSummary }} ·
        {{ t("matching", { count: visible.length }) }}</span
      >
      <el-button text @click="clearFilters">{{ t("resetFilters") }}</el-button>
    </div>
    <p v-if="hasFilters && !visible.length" class="empty-state">
      {{ t("noMatches") }}
    </p>
    <TaskList
      v-else
      :tasks="visible"
      :show-date="mode === 'tasks'"
      @edit="edit"
      @delete="remove"
      @toggle="toggle"
      ><el-button type="primary" plain @click="add"
        >＋ {{ t("addTask") }}</el-button
      ></TaskList
    >
  </section>
  <section v-if="mode === 'today' && overdue.length" class="panel">
    <div class="section-header">
      <h2>
        {{ t("overdue") }} <span class="count">{{ overdue.length }}</span>
      </h2>
    </div>
    <TaskList
      :tasks="overdue"
      show-date
      @edit="edit"
      @delete="remove"
      @toggle="toggle"
    />
  </section>
  <div v-if="mode === 'today'" class="reflection-banner">
    <div>
      <span class="eyebrow">DAILY REFLECTION</span>
      <h3>{{ t("reflection") }}</h3>
      <p>
        {{
          store.reflections
            .find((r) => r.day === selected)
            ?.content?.slice(0, 110) || t("reflectionPlaceholder")
        }}
      </p>
    </div>
    <el-button @click="reflect">{{ t("edit") }} ↗</el-button>
  </div>
  <el-dialog v-model="templatesOpen" :title="t('templates')" width="800px"
    ><TemplateManager
  /></el-dialog>
  <el-dialog v-model="trashOpen" :title="t('trash')" width="760px"
    ><TrashPanel
  /></el-dialog>
  <TaskEditor
    v-model="editor"
    :task="editing"
    :day="mode === 'calendar' ? selected : dateKey()"
  />
  <el-dialog
    v-model="reflectionOpen"
    :title="selected + ' · ' + t('reflection')"
    width="620px"
    :before-close="closeReflection"
    :close-on-click-modal="false"
    ><DraftNotice :draft="reflectionDraft" /><el-input
      :disabled="saving || !!reflectionDraft.pending.value"
      v-model="reflectionText"
      type="textarea"
      :rows="10"
      maxlength="20000"
      :placeholder="t('reflectionPlaceholder')"
    />
    <p class="hint">{{ t("reflectionHint") }}</p>
    <template #footer
      ><el-button @click="closeReflection">{{ t("cancel") }}</el-button
      ><el-button
        type="primary"
        :loading="saving"
        :disabled="!!reflectionDraft.pending.value"
        @click="saveReflection"
        >{{ t("save") }}</el-button
      ></template
    ></el-dialog
  >
</template>
