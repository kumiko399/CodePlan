<script setup>
import { computed, ref, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { dateKey } from "../lib/dates.js";
import { deadlineState } from "../lib/deadlines.js";
const props = defineProps({ task: Object });
const { t } = useI18n(),
  now = ref(new Date());
const timer = setInterval(() => (now.value = new Date()), 30000);
onBeforeUnmount(() => clearInterval(timer));
const days = computed(() =>
  Math.round(
    (new Date(props.task.details?.deadlineDate + "T12:00:00") -
      new Date(dateKey(now.value) + "T12:00:00")) /
      86400000,
  ),
);
const status = computed(() => deadlineState(props.task, now.value));
</script>
<template>
  <span
    v-if="task.details?.deadlineDate"
    class="deadline-label"
    :class="{ overdue: status === 'deadlineOverdue' }"
    >⏳
    {{
      status === "deadlineFuture"
        ? t("deadlineInDays", { count: days })
        : t(status || "deadline")
    }}
    · {{ task.details.deadlineDate }}
    {{ task.details.deadlineTime || "" }}</span
  >
</template>
