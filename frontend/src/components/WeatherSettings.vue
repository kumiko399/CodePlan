<script setup>
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  weather,
  initWeather,
  saveWeatherPreference,
} from "../lib/weather-store.js";
import { confirmAction } from "../lib/feedback.js";
import WeatherCityPicker from "./WeatherCityPicker.vue";
import WeatherSource from "./WeatherSource.vue";
const { t, locale } = useI18n(),
  picker = ref(false);
onMounted(initWeather);
async function auto() {
  if (await confirmAction(t("weatherLocationConsent")))
    await saveWeatherPreference({ mode: "auto", city: null });
}
async function disable() {
  if (await confirmAction(t("weatherDisableConfirm")))
    await saveWeatherPreference({ mode: "unset", city: null });
}
</script>
<template>
  <section class="panel" data-testid="weather-settings">
    <h2>🌤️ {{ t("weatherSettings") }}</h2>
    <div class="setting-row">
      <label>{{ t("weatherMode") }}</label
      ><span>{{
        weather.preferences?.mode === "manual"
          ? weather.preferences.city.name
          : t(
              weather.preferences?.mode === "auto"
                ? "weatherAuto"
                : "weatherUnset",
            )
      }}</span>
    </div>
    <div class="weather-actions">
      <el-button
        v-if="weather.preferences?.mode === 'auto'"
        :disabled="weather.saving"
        @click="
          saveWeatherPreference({
            mode: weather.preferences.cities?.length ? 'manual' : 'unset',
            city: weather.preferences.cities?.[0] || null,
            cities: weather.preferences.cities || [],
          })
        "
        >{{
          locale === "zh" ? "关闭定位，保留城市" : "Stop location, keep cities"
        }}</el-button
      >
      <el-button :disabled="weather.saving" @click="picker = true">{{
        t("weatherChooseCity")
      }}</el-button
      ><el-button :disabled="weather.saving" @click="auto">{{
        t("weatherLocate")
      }}</el-button
      ><el-button text :disabled="weather.saving" @click="disable">{{
        t("weatherDisable")
      }}</el-button>
    </div>
    <p v-if="weather.error?.includes('PREFERENCES')" role="status">
      {{ t("weatherPreferenceFailed") }}
    </p>
    <WeatherSource detailed /><WeatherCityPicker v-model="picker" />
  </section>
</template>
