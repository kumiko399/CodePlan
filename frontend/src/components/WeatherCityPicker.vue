<script setup>
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { popularCities } from "../lib/weather.js";
import {
  searchWeatherCities,
  weather,
  saveWeatherPreference,
} from "../lib/weather-store.js";
const props = defineProps({ modelValue: Boolean });
const emit = defineEmits(["update:modelValue"]);
const { t, locale } = useI18n();
const query = ref(""),
  results = ref(null),
  error = ref(""),
  searching = ref(false),
  region = ref("china");
let abort,
  sequence = 0;
const suggestions = computed(() =>
  popularCities.slice(
    region.value === "china" ? 0 : 16,
    region.value === "china" ? 16 : undefined,
  ),
);
function cancelSearch() {
  sequence++;
  abort?.abort();
  searching.value = false;
}
watch(query, () => {
  cancelSearch();
  results.value = null;
  error.value = "";
});
watch(
  () => props.modelValue,
  () => {
    cancelSearch();
    query.value = "";
    results.value = null;
    error.value = "";
  },
);
onBeforeUnmount(cancelSearch);
async function search() {
  cancelSearch();
  if (query.value.trim().length < 2) {
    error.value = "weatherSearchShort";
    return;
  }
  const run = sequence;
  abort = new AbortController();
  searching.value = true;
  error.value = "";
  try {
    const data = await searchWeatherCities(
      query.value.trim(),
      locale.value,
      abort.signal,
    );
    if (run === sequence) results.value = data;
  } catch {
    if (run === sequence) error.value = "weatherSearchFailed";
  } finally {
    if (run === sequence) searching.value = false;
  }
}
async function choose(city) {
  const value = {
    name: city.name || city[locale.value],
    latitude: city.latitude,
    longitude: city.longitude,
  };
  if (await saveWeatherPreference({ mode: "manual", city: value }))
    emit("update:modelValue", false);
}
</script>
<template>
  <el-dialog
    append-to-body
    :model-value="modelValue"
    :title="t('weatherChooseCity')"
    width="min(600px, 92vw)"
    :close-on-click-modal="false"
    :close-on-press-escape="!weather.saving"
    :show-close="!weather.saving"
    @update:model-value="!weather.saving && emit('update:modelValue', $event)"
  >
    <p v-if="weather.error === 'WEATHER_CITY_LIMIT'" role="alert">
      {{
        locale === "zh"
          ? "最多保存 8 个城市，请先移除一个。"
          : "Save up to 8 cities. Remove one before adding another."
      }}
    </p>
    <form class="weather-city-search" @submit.prevent="search">
      <el-input
        v-model="query"
        :placeholder="t('weatherSearchCity')"
        :aria-label="t('weatherSearchCity')"
        maxlength="80"
        clearable
        data-testid="weather-city-query"
      /><el-button
        native-type="submit"
        :loading="searching"
        :disabled="weather.saving"
        >{{ t("weatherSearch") }}</el-button
      >
    </form>
    <p class="hint">{{ t("weatherSearchHint") }}</p>
    <p v-if="error" role="status">{{ t(error) }}</p>
    <p v-if="results?.length === 0" role="status">{{ t("weatherNoCities") }}</p>
    <div v-if="results?.length" class="weather-city-results">
      <button
        v-for="(city, i) in results"
        :key="i"
        type="button"
        :disabled="weather.saving"
        @click="choose(city)"
      >
        📍 {{ city.name }}
      </button>
    </div>
    <el-radio-group v-model="region" size="small"
      ><el-radio-button value="china">{{ t("weatherChina") }}</el-radio-button
      ><el-radio-button value="apac">{{
        t("weatherAsiaPacific")
      }}</el-radio-button></el-radio-group
    >
    <div class="weather-city-suggestions">
      <button
        v-for="city in suggestions"
        :key="city.en"
        type="button"
        :data-city="city.en"
        :disabled="weather.saving"
        @click="choose(city)"
      >
        {{ city[locale] }}
      </button>
    </div>
    <p v-if="weather.saving" role="status">{{ t("weatherLoading") }}</p>
    <p
      v-else-if="weather.error?.startsWith('WEATHER_PREFERENCES')"
      role="alert"
    >
      {{ t("weatherPreferenceFailed") }}
    </p>
  </el-dialog>
</template>
