<script setup>
import { useI18n } from "vue-i18n";
import WeatherCard from "../components/WeatherCard.vue";
import { computed } from "vue";
import { weather } from "../lib/weather-store.js";
const { t } = useI18n();
const sky = computed(() =>
  weather.forecast?.data.current?.is_day === 0
    ? "night"
    : weather.forecast?.data.current?.weather_code >= 51
      ? "rain"
      : "day",
);
</script>
<template>
  <div class="weather-page" :data-sky="sky">
    <div class="weather-atmosphere" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>
    <header class="weather-page-toolbar">
      <h1>{{ t("weather") }}</h1>
    </header>
    <WeatherCard />
  </div>
</template>
