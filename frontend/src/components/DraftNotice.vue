<script setup>
import { useI18n } from "vue-i18n";
defineProps({ draft: Object });
const { t } = useI18n();
</script>
<template>
  <div v-if="draft.pending.value" class="draft-notice" role="status">
    <p>{{ t("draftFound") }}</p>
    <el-button @click="draft.restore">{{ t("restoreDraft") }}</el-button>
    <el-button @click="draft.discard">{{ t("discardDraft") }}</el-button>
  </div>
  <p v-else-if="draft.state.value" class="hint" role="status">
    {{ t(draft.state.value) }}
  </p>
</template>
