<script setup>
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { api } from "../api.js";
import { loadFocus, focusState } from "../lib/focus.js";
import { showError } from "../lib/feedback.js";
const { t } = useI18n(),
  minutes = ref(25),
  rest = ref(5),
  busy = ref(false),
  saved = ref(false);
onMounted(async () => {
  try {
    await loadFocus();
    [minutes.value, rest.value] = focusState.preferences;
  } catch (e) {
    showError(e);
  }
});
async function save() {
  if (busy.value) return;
  busy.value = true;
  saved.value = false;
  try {
    await api.put("/focus/settings", {
      minutes: minutes.value,
      rest: rest.value,
    });
    await loadFocus();
    saved.value = true;
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="panel">
    <h2>🍅 {{ t("focusTimer") }}</h2>
    <div class="filters">
      <label
        >{{ t("focusMinutes") }}
        <el-input-number
          v-model="minutes"
          :min="1"
          :max="180"
          :disabled="busy" /></label
      ><label
        >{{ t("restMinutes") }}
        <el-input-number
          v-model="rest"
          :min="1"
          :max="60"
          :disabled="busy" /></label
      ><el-button :loading="busy" @click="save">{{ t("save") }}</el-button>
    </div>
    <p class="hint">{{ t("focusSettingsHint") }}</p>
    <p v-if="saved" role="status">{{ t("saved") }}</p>
  </section>
</template>
