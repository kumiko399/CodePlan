<script setup>
import { temperatureText, loadDisplay } from "../lib/weather-display.js";
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  weather,
  defaultWeatherEntry,
  refreshWeather,
  initWeather,
} from "../lib/weather-store.js";
import { weatherNumber, weatherSymbol, forecastRows } from "../lib/weather.js";
const { t, locale } = useI18n();
const label = (zh, en) => (locale.value === "zh" ? zh : en);
const now = ref(Date.now());
const entry = defaultWeatherEntry;
const rows = computed(() => forecastRows(entry.value?.forecast, now.value));
const current = computed(() => rows.value.current);
const stale = computed(
  () =>
    !!entry.value?.forecast &&
    (entry.value.error ||
      entry.value.forecast.stale ||
      now.value / 1000 - entry.value.forecast.fetchedAt > 1800),
);
async function update() {
  now.value = Date.now();
  await initWeather();
  if (
    !weather.busy &&
    !weather.saving &&
    (!entry.value?.forecast ||
      now.value / 1000 - entry.value.forecast.fetchedAt >= 900)
  )
    await refreshWeather();
}
let timer;
onMounted(() => {
  loadDisplay();
  update();
  timer = setInterval(() => {
    if (!document.hidden) update();
  }, 60000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>
<template>
  <router-link
    to="/weather"
    class="weather-home-link weather-summary"
    data-testid="weather-summary"
  >
    <span class="weather-summary-icon" aria-hidden="true">{{
      weatherSymbol(current?.weather_code, current?.is_day !== 0)[0]
    }}</span>
    <div class="weather-summary-main">
      <strong>{{
        entry?.city.name || weather.preferences?.city?.name || t("weather")
      }}</strong>
      <small
        >{{ label("首页天气", "Home weather") }} ·
        {{
          weather.preferences?.mode === "auto"
            ? label("自动定位", "Auto location")
            : label("默认城市", "Default city")
        }}</small
      >
      <span v-if="current"
        >{{ t(weatherSymbol(current.weather_code, current.is_day !== 0)[1]) }} ·
        {{ t("weatherFeels") }}
        {{ temperatureText(current.apparent_temperature, true) }}</span
      >
      <span v-else role="status">{{
        weather.busy
          ? t("weatherLoading")
          : weather.error || entry?.error
            ? t("weatherUnavailable")
            : label(
                "选择默认城市，查看天气",
                "Choose a default city to see the weather",
              )
      }}</span>
      <small v-if="stale" role="status">{{ t("weatherStale") }}</small>
      <small
        v-else-if="weather.error && weather.preferences?.mode === 'auto'"
        role="status"
        >{{
          label(
            "定位暂不可用，显示已保存城市",
            "Location unavailable; showing a saved city",
          )
        }}</small
      >
      <small
        >Open-Meteo · CC BY 4.0 ·
        {{ label("模型预报", "Model forecast") }}</small
      >
    </div>
    <strong v-if="current" class="weather-summary-temperature">{{
      temperatureText(current.temperature_2m)
    }}</strong>
    <span class="weather-summary-more"
      >{{ label("查看天气", "View weather") }} →</span
    >
  </router-link>
</template>
<style scoped>
.weather-summary {
  color: var(--text, #24465f);
  background: linear-gradient(120deg, #edf8ffe0, #e0edf599);
  border: 1px solid #fff;
  border-radius: 20px;
  box-shadow:
    inset 0 1px 1px #fff,
    0 6px 24px #315b7810;
  backdrop-filter: blur(18px);
  gap: 18px;
}
.weather-summary-icon {
  font-size: 38px;
}
.weather-summary-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.weather-summary-main strong {
  font-size: 17px;
  overflow-wrap: anywhere;
}
.weather-summary-main small {
  font-size: 11px;
  color: #49667c;
}
.weather-summary-temperature {
  font-size: 40px;
  font-weight: 400;
}
.weather-summary-more {
  white-space: nowrap;
}
:global(.dark) .weather-summary {
  color: #edf6ff;
  background: linear-gradient(120deg, #284459c9, #263846ad);
  border-color: #ffffff26;
  box-shadow: inset 0 1px #ffffff30;
}
:global(.dark) .weather-summary-main small {
  color: #c0d7e8;
}
@media (max-width: 650px) {
  .weather-summary {
    flex-wrap: wrap;
  }
  .weather-summary-more {
    width: 100%;
    text-align: right;
  }
}
</style>
