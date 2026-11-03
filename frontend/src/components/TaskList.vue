<script setup>
import { focusAction, focusState, currentFocus } from "../lib/focus.js";
import DeadlineLabel from "./DeadlineLabel.vue";
import { useI18n } from "vue-i18n";
import { dateKey } from "../lib/dates.js";
import { categoryLabel, categoryStyle, taskEmoji } from "../lib/categories.js";
defineProps({ tasks: Array, showDate: Boolean });
defineEmits(["edit", "delete", "toggle"]);
const { t } = useI18n();
</script>
<template>
  <div v-if="!tasks.length" class="empty-state">
    <div class="empty-symbol">✓</div>
    <h3>{{ t("noTasks") }}</h3>
    <p>{{ t("noTasksHint") }}</p>
    <slot />
  </div>
  <div v-else class="task-list">
    <article
      v-for="task in tasks"
      :key="task.id"
      class="task-row"
      :class="{ finished: task.status === 'done' }"
    >
      <el-checkbox
        :model-value="task.status === 'done'"
        :aria-label="`${t('done')}: ${task.title}`"
        @change="$emit('toggle', task)"
      />
      <div class="task-body">
        <button class="task-title" @click="$emit('edit', task)">
          <span aria-hidden="true">{{ taskEmoji(task) }}</span> {{ task.title }}
        </button>
        <DeadlineLabel :task="task" />
        <span v-if="task.details?.subtasks?.length" class="hint"
          >☑ {{ task.details.subtasks.filter((s) => s.done).length }}/{{
            task.details.subtasks.length
          }}
          {{ t("subtasks") }}</span
        >
        <div class="task-meta">
          <span class="category-pill" :style="categoryStyle(task.category)">{{
            categoryLabel(task.category, t)
          }}</span
          ><span v-if="showDate">{{ task.planDate }}</span
          ><span>{{ task.taskTime || t("allDay") }}</span
          ><span v-if="task.ruleId" :title="t('repeat')">↻</span
          ><span v-if="task.status === 'doing'">{{ t("doing") }}</span
          ><span
            v-if="task.planDate < dateKey() && task.status !== 'done'"
            class="overdue"
            >{{ t("overdue") }}</span
          >
        </div>
      </div>
      <el-button
        text
        :disabled="focusState.busy || !!currentFocus"
        @click="focusAction('start', task.id).catch(() => {})"
        >🍅 {{ t("startFocus") }}</el-button
      >
      <span class="priority" :class="task.priority">{{ t(task.priority) }}</span
      ><el-button text size="small" @click="$emit('edit', task)">{{
        t("edit")
      }}</el-button
      ><el-button
        text
        size="small"
        type="danger"
        @click="$emit('delete', task)"
        >{{ t("delete") }}</el-button
      >
    </article>
  </div>
</template>
