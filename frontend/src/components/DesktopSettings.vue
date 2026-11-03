<script setup>
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import { showError } from "../lib/feedback.js";
const { t } = useI18n();
const desktop = !!window.codeplan?.desktopPreferences;
const action = ref("minimize"),
  busy = ref(true),
  loaded = ref(false);
onMounted(async () => {
  if (!desktop) return;
  try {
    action.value = (await window.codeplan.desktopPreferences()).closeAction;
    loaded.value = true;
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
});
async function save(value) {
  if (busy.value) return;
  busy.value = true;
  try {
    action.value = (await window.codeplan.setCloseAction(value)).closeAction;
    ElMessage.success(t("saved"));
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section v-if="desktop" class="panel" data-testid="desktop-settings">
    <h2>{{ t("windowBehavior") }}</h2>
    <div class="setting-row">
      <label id="close-action-label">{{ t("closeWindowAction") }}</label>
      <el-radio-group
        :model-value="action"
        :disabled="busy || !loaded"
        aria-labelledby="close-action-label"
        @change="save"
      >
        <el-radio-button value="minimize" data-testid="close-minimize">{{
          t("closeMinimize")
        }}</el-radio-button>
        <el-radio-button value="exit" data-testid="close-exit">{{
          t("closeExit")
        }}</el-radio-button>
      </el-radio-group>
    </div>
    <p class="hint">{{ t("closeActionHint") }}</p>
  </section>
</template>
