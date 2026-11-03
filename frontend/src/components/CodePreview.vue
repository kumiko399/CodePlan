<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import { codeTokens } from "../lib/code-tokens.js";
const props = defineProps({ code: String, language: String }),
  { t } = useI18n();
const tokens = computed(() => codeTokens(props.code || "", props.language));
async function copy() {
  try {
    await navigator.clipboard.writeText(props.code || "");
    ElMessage.success(t("copied"));
  } catch {
    ElMessage.error(t("copyFailed"));
  }
}
</script>
<template>
  <div v-if="code" class="code-preview">
    <el-button text @click="copy">{{ t("copyCode") }}</el-button>
    <pre><code><span v-for="(token,index) in tokens" :key="index" :class="'syntax-'+token.type">{{ token.text }}</span></code></pre>
  </div>
</template>
