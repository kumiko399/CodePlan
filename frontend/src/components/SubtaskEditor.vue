<script setup>
import { useI18n } from "vue-i18n";
const props = defineProps({ modelValue: Array });
const emit = defineEmits(["update:modelValue"]);
const { t } = useI18n();
function change(index, field, value) {
  emit(
    "update:modelValue",
    props.modelValue.map((s, i) =>
      i === index ? { ...s, [field]: value } : s,
    ),
  );
}
function move(index, delta) {
  const items = [...props.modelValue];
  [items[index], items[index + delta]] = [items[index + delta], items[index]];
  emit("update:modelValue", items);
}
function add() {
  emit("update:modelValue", [
    ...(props.modelValue || []),
    { id: crypto.randomUUID(), title: "", done: false },
  ]);
}
</script>
<template>
  <div class="subtasks">
    <div v-for="(item, index) in modelValue" :key="item.id" class="subtask-row">
      <el-checkbox
        :model-value="item.done"
        :aria-label="t('done')"
        @change="change(index, 'done', $event)"
      />
      <el-input
        :model-value="item.title"
        :placeholder="t('subtaskTitle')"
        maxlength="200"
        @update:model-value="change(index, 'title', $event)"
      />
      <el-button
        :disabled="index === 0"
        :aria-label="t('moveUp')"
        @click="move(index, -1)"
        >↑</el-button
      >
      <el-button
        :disabled="index === modelValue.length - 1"
        :aria-label="t('moveDown')"
        @click="move(index, 1)"
        >↓</el-button
      >
      <el-button
        type="danger"
        :aria-label="t('delete')"
        @click="
          emit(
            'update:modelValue',
            modelValue.filter((_, i) => i !== index),
          )
        "
        >×</el-button
      >
    </div>
    <el-button :disabled="modelValue?.length >= 100" @click="add"
      >＋ {{ t("addSubtask") }}</el-button
    >
    <p
      v-if="modelValue?.length && modelValue.every((s) => s.done)"
      class="hint"
    >
      {{ t("subtasksAllDone") }}
    </p>
  </div>
</template>
