<script setup>
import { useI18n } from "vue-i18n";
import { categoryLabel, categoryStyle, taskEmoji } from "../lib/categories.js";
import DeadlineLabel from "./DeadlineLabel.vue";
import CalendarProgress from "./CalendarProgress.vue";
import { calendarDelay } from "../lib/calendar.js";
import { dateKey } from "../lib/dates.js";
defineProps({
  day: String,
  tasks: Array,
  total: Number,
  done: Number,
  filtered: Boolean,
  now: Date,
  busy: Boolean,
});
defineEmits([
  "add",
  "edit",
  "toggle",
  "delete",
  "reflect",
  "clear",
  "moveToday",
  "reschedule",
]);
const { t } = useI18n();
</script>
<template>
  <div class="calendar-day-detail" data-testid="calendar-detail">
    <div class="section-header">
      <div>
        <h2>{{ day }}</h2>
        <p class="hint">
          {{ t("dayTaskCount", { count: tasks.length, total }) }}
        </p>
      </div>
      <el-button @click="$emit('reflect')">✎ {{ t("reflection") }}</el-button>
    </div>
    <CalendarProgress :done="done" :total="total" />
    <el-button
      type="primary"
      plain
      class="calendar-day-add"
      @click="$emit('add')"
      >＋ {{ t("addTask") }}</el-button
    >
    <div v-if="!tasks.length" class="empty-state">
      <span class="empty-symbol">🗓️</span>
      <p>{{ t(filtered ? "noMatches" : "noTasks") }}</p>
      <el-button v-if="filtered" text @click="$emit('clear')">{{
        t("resetFilters")
      }}</el-button>
    </div>
    <article
      v-for="task in tasks"
      :key="task.id"
      class="day-task"
      :class="{ finished: task.status === 'done' }"
      :data-task-id="task.id"
    >
      <div class="day-task-heading">
        <el-checkbox
          :model-value="task.status === 'done'"
          :aria-label="t('done') + ': ' + task.title"
          :disabled="busy"
          @change="$emit('toggle', task)"
        /><button class="day-task-title" @click="$emit('edit', task)">
          <span aria-hidden="true">{{ taskEmoji(task) }}</span> {{ task.title }}
        </button>
      </div>
      <div class="task-meta">
        <span class="category-pill" :style="categoryStyle(task.category)">{{
          categoryLabel(task.category, t)
        }}</span
        ><span>{{ task.taskTime || t("allDay") }}</span
        ><span>{{ t(task.status) }}</span
        ><span class="priority" :class="task.priority">{{
          t(task.priority)
        }}</span>
      </div>
      <DeadlineLabel
        v-if="calendarDelay(task, now) !== 'deadlineMissed'"
        :task="task"
      />
      <p
        v-if="calendarDelay(task, now)"
        class="calendar-delay"
        :class="calendarDelay(task, now)"
      >
        {{ calendarDelay(task, now) === "deadlineMissed" ? "!" : "↗" }}
        {{ t(calendarDelay(task, now)) }} ·
        {{
          calendarDelay(task, now) === "deadlineMissed"
            ? t("deadlineMissedReason", {
                day: task.details.deadlineDate,
                time: task.details.deadlineTime || "23:59",
              })
            : t("planDelayedReason", { day: task.planDate })
        }}
      </p>
      <p
        v-if="calendarDelay(task, now) === 'deadlineMissed'"
        class="hint calendar-deadline-hint"
      >
        {{ t("calendarCheckDeadline") }}
      </p>
      <details
        v-if="task.notes || task.details?.subtasks?.length"
        class="day-task-notes"
      >
        <summary>{{ t("taskDetails") }}</summary>
        <p v-if="task.notes">{{ task.notes }}</p>
        <ul v-if="task.details?.subtasks?.length">
          <li v-for="step in task.details.subtasks" :key="step.id">
            {{ step.done ? "☑" : "☐" }} {{ step.title }}
          </li>
        </ul>
      </details>
      <div class="day-task-actions">
        <template v-if="calendarDelay(task, now)">
          <el-button
            size="small"
            :disabled="busy || task.planDate === dateKey(now)"
            @click="$emit('moveToday', task)"
            >{{ t("moveToday") }}</el-button
          >
          <el-button
            size="small"
            :disabled="busy"
            @click="$emit('reschedule', task)"
            >{{ t("calendarReschedule") }}</el-button
          >
          <el-button
            size="small"
            type="primary"
            plain
            :disabled="busy"
            @click="$emit('toggle', task)"
            >{{ t("calendarMarkDone") }}</el-button
          >
        </template>
        <el-button text :disabled="busy" @click="$emit('edit', task)">{{
          t(
            calendarDelay(task, now) === "deadlineMissed"
              ? "calendarEditDeadline"
              : "edit",
          )
        }}</el-button
        ><el-button
          text
          type="danger"
          :disabled="busy"
          @click="$emit('delete', task)"
          >{{ t("delete") }}</el-button
        >
      </div>
    </article>
  </div>
</template>
