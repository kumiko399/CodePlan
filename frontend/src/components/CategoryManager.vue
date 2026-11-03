<script setup>
import { reactive, ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { usePlanner } from "../store.js";
import { categories, categoryLabel } from "../lib/categories.js";
import { api } from "../api.js";
import { showError } from "../lib/feedback.js";
const store = usePlanner(),
  { t } = useI18n(),
  open = ref(false),
  busy = ref(false),
  form = reactive({});
const custom = computed(() => categories.filter((c) => c.id.startsWith("c_")));
function edit(c) {
  Object.assign(
    form,
    { id: null, name: "", emoji: "📌", color: "blue", active: true },
    c || {},
  );
  open.value = true;
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  try {
    if (form.id) await api.put(`/categories/${form.id}`, form);
    else await api.post("/categories", form);
    open.value = false;
    await store.load();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="panel">
    <div class="section-header">
      <h2>{{ t("customCategories") }}</h2>
      <el-button @click="edit()">＋ {{ t("category") }}</el-button>
    </div>
    <p class="hint">{{ t("customCategoryHint") }}</p>
    <div class="category-items">
      <el-button v-for="c in custom" :key="c.id" @click="edit(c)"
        >{{ categoryLabel(c.id, t) }}
        {{ c.active ? "" : t("disabledCategory") }}</el-button
      >
    </div>
  </section>
  <el-dialog
    v-model="open"
    :title="t('customCategories')"
    width="440px"
    :close-on-click-modal="false"
    ><el-form label-position="top" :disabled="busy"
      ><el-form-item :label="t('title')"
        ><el-input v-model="form.name" maxlength="30" /></el-form-item
      ><el-form-item label="Emoji"
        ><el-input v-model="form.emoji" maxlength="16" /></el-form-item
      ><el-form-item :label="t('color')"
        ><el-select v-model="form.color"
          ><el-option
            v-for="color in [
              'blue',
              'green',
              'orange',
              'purple',
              'rose',
              'teal',
            ]"
            :key="color"
            :value="color"
            :label="t('palette_' + color)" /></el-select></el-form-item
      ><el-switch
        v-model="form.active"
        :active-text="t('categoryEnabled')" /></el-form
    ><template #footer
      ><el-button :loading="busy" @click="save">{{
        t("save")
      }}</el-button></template
    ></el-dialog
  >
</template>
