<script setup>
import { useI18n } from "vue-i18n";
defineProps({ done: Number, total: Number });
const { t } = useI18n();
</script>
<template>
  <div
    v-if="total"
    class="calendar-progress"
    :title="t('calendarProgressHint')"
  >
    <span>{{ t("calendarCompleted", { done, total }) }}</span>
    <progress
      :value="done"
      :max="total"
      :aria-label="t('calendarCompleted', { done, total })"
    />
  </div>
</template>
