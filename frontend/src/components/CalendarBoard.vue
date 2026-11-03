<script setup>
import {
  computed,
  reactive,
  ref,
  onMounted,
  onBeforeUnmount,
  watch,
} from "vue";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import { usePlanner } from "../store.js";
import { api } from "../api.js";
import { dateKey, shiftDate } from "../lib/dates.js";
import {
  compactMonth,
  groupCalendar,
  calendarDelay,
  calendarProgress,
} from "../lib/calendar.js";
import {
  categories,
  categoryLabel,
  categoryStyle,
  taskEmoji,
} from "../lib/categories.js";
import { plannedAfterDeadline } from "../lib/deadlines.js";
import { showError, confirmAction } from "../lib/feedback.js";
import CalendarDay from "./CalendarDay.vue";
import CalendarProgress from "./CalendarProgress.vue";
const emit = defineEmits([
  "select",
  "add",
  "edit",
  "toggle",
  "delete",
  "reflect",
]);
const store = usePlanner(),
  { t, locale } = useI18n();
const selected = ref(dateKey()),
  month = ref(new Date()),
  mode = ref("month"),
  detailOpen = ref(false);
const filters = reactive({
  category: "",
  status: "",
  priority: "",
  hideDone: false,
});
const wideQuery = window.matchMedia("(min-width: 1440px)"),
  wide = ref(wideQuery.matches);
const now = ref(new Date()),
  dragDay = ref(""),
  dragId = ref(""),
  busy = ref(false),
  undo = ref(null);
const rescheduleTask = ref(null),
  rescheduleDate = ref("");
let clock, undoTimer;
const resize = () => {
  wide.value = wideQuery.matches;
};
onMounted(() => {
  wideQuery.addEventListener("change", resize);
  clock = setInterval(() => {
    now.value = new Date();
  }, 30000);
});
onBeforeUnmount(() => {
  wideQuery.removeEventListener("change", resize);
  clearInterval(clock);
  clearTimeout(undoTimer);
});
const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const grouped = computed(() => groupCalendar(store.tasks, filters));
const progress = computed(() => calendarProgress(store.tasks));
const filtered = computed(
  () =>
    !!(
      filters.category ||
      filters.status ||
      filters.priority ||
      filters.hideDone
    ),
);
const filterSummary = computed(() =>
  [
    filters.category && categoryLabel(filters.category, t),
    filters.status && t(filters.status),
    filters.priority && t(filters.priority),
    filters.hideDone && t("hideCompleted"),
  ]
    .filter(Boolean)
    .join(" · "),
);
const dayTasks = computed(() => grouped.value[selected.value] || []);
const dayTotal = computed(
  () => store.tasks.filter((task) => task.planDate === selected.value).length,
);
const reflectionDays = computed(
  () => new Set(store.reflections.map((r) => r.day)),
);
const cells = computed(() => {
  if (mode.value === "month") return compactMonth(month.value);
  const first = shiftDate(
    selected.value,
    -((new Date(selected.value + "T12:00:00").getDay() + 6) % 7),
  );
  return Array.from({ length: 7 }, (_, i) => ({
    day: shiftDate(first, i),
    number: Number(shiftDate(first, i).slice(8)),
    current: true,
  }));
});
const title = computed(() =>
  mode.value === "week"
    ? `${cells.value[0].day} — ${cells.value[6].day}`
    : month.value.toLocaleDateString(
        locale.value === "zh" ? "zh-CN" : "en-US",
        { year: "numeric", month: "long" },
      ),
);
const periodCount = computed(() =>
  cells.value.reduce((n, c) => n + (grouped.value[c.day]?.length || 0), 0),
);
watch(mode, () => {
  month.value = new Date(selected.value + "T12:00:00");
});
function clearFilters() {
  Object.assign(filters, {
    category: "",
    status: "",
    priority: "",
    hideDone: false,
  });
}
function selectDay(day) {
  selected.value = day;
  detailOpen.value = true;
  emit("select", day);
}
function addDay(day) {
  selected.value = day;
  emit("select", day);
  emit("add", day);
}
function navigate(delta) {
  if (mode.value === "week") {
    selected.value = shiftDate(selected.value, delta * 7);
    emit("select", selected.value);
  } else
    month.value = new Date(
      month.value.getFullYear(),
      month.value.getMonth() + delta,
      1,
      12,
    );
}
function today() {
  month.value = new Date();
  selected.value = dateKey();
  emit("select", selected.value);
}
function tooltip(task) {
  return [
    task.title,
    categoryLabel(task.category, t),
    `${task.taskTime || t("allDay")} · ${t(task.priority)} · ${t(task.status)}`,
    delayReason(task),
    task.details?.deadlineDate &&
      `${t("deadline")}: ${task.details.deadlineDate} ${task.details.deadlineTime || "23:59"}`,
  ]
    .filter(Boolean)
    .join("\n");
}
function delayReason(task) {
  const state = calendarDelay(task, now.value);
  if (!state) return "";
  return state === "deadlineMissed"
    ? t("deadlineMissedReason", {
        day: task.details.deadlineDate,
        time: task.details.deadlineTime || "23:59",
      })
    : t("planDelayedReason", { day: task.planDate });
}
function openReschedule(task) {
  rescheduleTask.value = task;
  rescheduleDate.value = dateKey();
}
async function saveReschedule() {
  if (await moveTask(rescheduleTask.value, rescheduleDate.value))
    rescheduleTask.value = null;
}
function dragStart(event, task) {
  if (busy.value) {
    event.preventDefault();
    return;
  }
  dragId.value = task.id;
  event.dataTransfer.setData("text/plain", task.id);
  event.dataTransfer.effectAllowed = "move";
}
function dragEnd() {
  dragDay.value = "";
  dragId.value = "";
}
function dragOver(event, day) {
  if (dragId.value && !busy.value) {
    event.preventDefault();
    dragDay.value = day;
    event.dataTransfer.dropEffect = "move";
  }
}
async function refresh() {
  try {
    await store.load();
  } catch (error) {
    showError(error);
  }
}
async function drop(event, day) {
  event.preventDefault();
  const id = event.dataTransfer.getData("text/plain");
  dragEnd();
  const task = store.tasks.find((task) => task.id === id);
  await moveTask(task, day);
}
async function moveTask(task, day) {
  if (!task || !day || busy.value) return false;
  busy.value = true;
  try {
    // Fetch current fields before changing only the date, including current deadline details.
    const tasks = await api.get("/tasks"),
      workspace = await api.get("/workspace");
    const current = tasks.find((t) => t.id === task.id);
    if (!current) {
      ElMessage.warning(t("calendarTaskUnavailable"));
      await refresh();
      return false;
    }
    if (current.planDate === day) return true;
    const details = JSON.parse(
      workspace.extras.find((r) => r.kind === "task" && r.recordId === task.id)
        ?.payload || "{}",
    );
    if (
      plannedAfterDeadline({ ...current, details, planDate: day }) &&
      !(await confirmAction(
        t("calendarMoveDeadline", {
          day: details.deadlineDate,
          time: details.deadlineTime || "23:59",
        }),
      ))
    )
      return false;
    const from = current.planDate;
    const result = await api.put("/tasks/" + task.id, {
      ...current,
      planDate: day,
    });
    Object.assign(task, result);
    undo.value = { id: task.id, from, to: day, title: current.title };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => {
      undo.value = null;
    }, 15000);
    await refresh();
    return true;
  } catch (error) {
    showError(error);
    return false;
  } finally {
    busy.value = false;
  }
}
async function undoMove() {
  if (!undo.value || busy.value) return;
  busy.value = true;
  const saved = { ...undo.value };
  try {
    // Read current fields so undo never replaces a later title/status edit with an old copy.
    const tasks = await api.get("/tasks"),
      workspace = await api.get("/workspace");
    const task = tasks.find((task) => task.id === saved.id);
    if (!task || task.planDate !== saved.to) {
      undo.value = null;
      ElMessage.warning(t("undoMoveChanged"));
      return;
    }
    const details = JSON.parse(
      workspace.extras.find((r) => r.kind === "task" && r.recordId === task.id)
        ?.payload || "{}",
    );
    if (
      plannedAfterDeadline({ ...task, details, planDate: saved.from }) &&
      !(await confirmAction(t("afterDeadline")))
    )
      return;
    await api.put("/tasks/" + task.id, { ...task, planDate: saved.from });
    const local = store.tasks.find((t) => t.id === task.id);
    if (local) local.planDate = saved.from;
    undo.value = null;
    clearTimeout(undoTimer);
    ElMessage.success(t("moveUndone"));
    await refresh();
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div
    class="calendar-workspace"
    :class="{ 'with-detail': wide && detailOpen }"
  >
    <section
      class="panel calendar-panel calendar-v2"
      :class="{ 'week-view': mode === 'week' }"
      :aria-busy="busy"
    >
      <div class="calendar-toolbar">
        <div>
          <h2>{{ title }}</h2>
          <p class="hint">
            {{ t("calendarPeriodCount", { count: periodCount }) }}
          </p>
        </div>
        <el-radio-group v-model="mode" size="small"
          ><el-radio-button value="month">{{ t("monthView") }}</el-radio-button
          ><el-radio-button value="week">{{
            t("weekView")
          }}</el-radio-button></el-radio-group
        >
        <div class="calendar-navigation">
          <el-button
            :aria-label="t(mode === 'week' ? 'previousWeek' : 'previousMonth')"
            @click="navigate(-1)"
            >‹</el-button
          ><el-button @click="today">{{ t("backToday") }}</el-button
          ><el-button
            :aria-label="t(mode === 'week' ? 'nextWeek' : 'nextMonth')"
            @click="navigate(1)"
            >›</el-button
          >
        </div>
      </div>
      <div class="calendar-filters">
        <el-select
          v-model="filters.category"
          clearable
          :placeholder="t('category')"
          :aria-label="t('category')"
          data-testid="calendar-category-filter"
          ><el-option
            v-for="c in categories"
            :key="c.id"
            :value="c.id"
            :label="categoryLabel(c.id, t)"
        /></el-select>
        <el-select
          v-model="filters.status"
          clearable
          :placeholder="t('status')"
          :aria-label="t('status')"
          data-testid="calendar-status-filter"
          ><el-option
            v-for="s in ['todo', 'doing', 'done']"
            :key="s"
            :value="s"
            :label="t(s)"
        /></el-select>
        <el-select
          v-model="filters.priority"
          clearable
          :placeholder="t('priority')"
          :aria-label="t('priority')"
          data-testid="calendar-priority-filter"
          ><el-option
            v-for="p in ['high', 'medium', 'low']"
            :key="p"
            :value="p"
            :label="t(p)"
        /></el-select>
        <el-checkbox
          v-model="filters.hideDone"
          data-testid="calendar-hide-done"
          >{{ t("hideCompleted") }}</el-checkbox
        >
      </div>
      <div v-if="filtered" class="filter-feedback" role="status">
        <span>{{ filterSummary }}</span
        ><el-button text @click="clearFilters">{{
          t("resetFilters")
        }}</el-button>
      </div>
      <div class="calendar-week">
        <span v-for="d in weekdays" :key="d">{{ t(d) }}</span>
      </div>
      <div class="calendar-grid">
        <div
          v-for="cell in cells"
          :key="cell.day"
          class="calendar-cell"
          :data-day="cell.day"
          :class="{
            muted: !cell.current,
            selected: cell.day === selected,
            today: cell.day === dateKey(now),
            'drop-target': dragDay === cell.day,
          }"
          @click="selectDay(cell.day)"
          @dragover="dragOver($event, cell.day)"
          @dragleave="
            $event.currentTarget.contains($event.relatedTarget) ||
            (dragDay = '')
          "
          @drop="drop($event, cell.day)"
        >
          <div class="cell-top">
            <button
              class="calendar-date"
              :aria-label="cell.day"
              :aria-current="cell.day === dateKey(now) ? 'date' : undefined"
              :aria-expanded="detailOpen && cell.day === selected"
              @click.stop="selectDay(cell.day)"
            >
              {{ cell.number }}</button
            ><span v-if="reflectionDays.has(cell.day)" :title="t('reflected')"
              >✎</span
            ><button
              class="calendar-quick-add"
              :aria-label="t('addTaskOn', { day: cell.day })"
              @click.stop="addDay(cell.day)"
            >
              ＋
            </button>
          </div>
          <CalendarProgress
            :done="progress[cell.day]?.done || 0"
            :total="progress[cell.day]?.total || 0"
          />
          <button
            v-for="task in (grouped[cell.day] || []).slice(
              0,
              mode === 'week' ? 5 : 3,
            )"
            :key="task.id"
            class="calendar-task"
            :class="{
              complete: task.status === 'done',
              late: calendarDelay(task, now) === 'deadlineMissed',
              delayed: calendarDelay(task, now) === 'planDelayed',
            }"
            :style="categoryStyle(task.category)"
            :data-task-id="task.id"
            :title="tooltip(task)"
            :aria-label="tooltip(task)"
            :draggable="!busy"
            @dragstart.stop="dragStart($event, task)"
            @dragend="dragEnd"
            @click.stop="selectDay(cell.day)"
          >
            <span class="calendar-task-emoji" aria-hidden="true">{{
              taskEmoji(task)
            }}</span
            ><span class="calendar-task-name">{{ task.title }}</span
            ><span
              class="calendar-task-state"
              :title="delayReason(task)"
              aria-hidden="true"
              >{{
                task.status === "done"
                  ? "✓"
                  : calendarDelay(task, now) === "deadlineMissed"
                    ? "!"
                    : calendarDelay(task, now) === "planDelayed"
                      ? "↗"
                      : task.status === "doing"
                        ? "◷"
                        : ""
              }}</span
            >
          </button>
          <button
            v-if="grouped[cell.day]?.length > (mode === 'week' ? 5 : 3)"
            class="more"
            @click.stop="selectDay(cell.day)"
          >
            {{
              t("moreTasks", {
                count: grouped[cell.day].length - (mode === "week" ? 5 : 3),
              })
            }}
          </button>
        </div>
      </div>
      <div class="calendar-legend">
        <span>● {{ t("calendarToday") }}</span
        ><span>□ {{ t("selectedDay") }}</span
        ><span>✓ {{ t("done") }}</span
        ><span class="calendar-delay planDelayed">↗ {{ t("planDelayed") }}</span
        ><span class="calendar-delay deadlineMissed"
          >! {{ t("deadlineMissed") }}</span
        ><span>{{ t("calendarDragHint") }}</span>
      </div>
      <div v-if="undo" class="calendar-undo" role="status">
        <span>{{ t("taskMovedTo", { title: undo.title, day: undo.to }) }}</span
        ><el-button :disabled="busy" @click="undoMove">{{
          t("undoMove")
        }}</el-button>
      </div>
    </section>
    <aside v-if="wide && detailOpen" class="panel calendar-side">
      <el-button
        class="calendar-detail-close"
        text
        :aria-label="t('closeDayDetail')"
        @click="detailOpen = false"
        >×</el-button
      ><CalendarDay
        :day="selected"
        :tasks="dayTasks"
        :total="dayTotal"
        :done="progress[selected]?.done || 0"
        :now="now"
        :busy="busy"
        :filtered="filtered"
        @clear="clearFilters"
        @move-today="moveTask($event, dateKey())"
        @reschedule="openReschedule"
        @add="addDay(selected)"
        @edit="emit('edit', $event)"
        @toggle="emit('toggle', $event)"
        @delete="emit('delete', $event)"
        @reflect="emit('reflect', selected)"
      />
    </aside>
    <el-drawer
      :model-value="!wide && detailOpen"
      :title="t('selectedDay')"
      size="min(480px, 92vw)"
      @update:model-value="detailOpen = $event"
      :destroy-on-close="true"
      ><CalendarDay
        :day="selected"
        :tasks="dayTasks"
        :total="dayTotal"
        :done="progress[selected]?.done || 0"
        :now="now"
        :busy="busy"
        :filtered="filtered"
        @clear="clearFilters"
        @move-today="moveTask($event, dateKey())"
        @reschedule="openReschedule"
        @add="addDay(selected)"
        @edit="emit('edit', $event)"
        @toggle="emit('toggle', $event)"
        @delete="emit('delete', $event)"
        @reflect="emit('reflect', selected)"
    /></el-drawer>
    <el-dialog
      :model-value="!!rescheduleTask"
      :title="t('calendarReschedule')"
      width="min(440px, 92vw)"
      append-to-body
      :close-on-click-modal="false"
      :close-on-press-escape="!busy"
      :show-close="!busy"
      @update:model-value="!busy && (rescheduleTask = null)"
    >
      <template v-if="rescheduleTask">
        <p class="calendar-reschedule-title">
          {{ taskEmoji(rescheduleTask) }} {{ rescheduleTask.title }}
        </p>
        <p
          v-if="calendarDelay(rescheduleTask, now) === 'deadlineMissed'"
          class="hint"
        >
          {{ t("calendarCheckDeadline") }}
        </p>
        <el-form label-position="top"
          ><el-form-item
            :label="t('calendarNewDate')"
            data-testid="calendar-reschedule-date"
          >
            <el-date-picker
              v-model="rescheduleDate"
              type="date"
              value-format="YYYY-MM-DD"
              :aria-label="t('calendarNewDate')"
              :disabled="busy"
              :clearable="false"
            /> </el-form-item
        ></el-form>
      </template>
      <template #footer>
        <el-button :disabled="busy" @click="rescheduleTask = null">{{
          t("cancel")
        }}</el-button>
        <el-button
          type="primary"
          :loading="busy"
          :disabled="!rescheduleDate"
          @click="saveReschedule"
          >{{ t("save") }}</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>
