<script setup>
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  defaultWeatherEntry,
  refreshWeather,
  weather,
} from "../lib/weather-store.js";
import { dayHours, temperatureText, windText } from "../lib/weather-display.js";
const props = defineProps({ date: String, time: String });
const { locale } = useI18n();
const open = ref(false);
const label = (zh, en) => (locale.value === "zh" ? zh : en);
const hours = computed(() =>
  dayHours(defaultWeatherEntry.value?.forecast, props.date).filter(
    (h) =>
      !props.time ||
      new Intl.DateTimeFormat("en-GB", {
        timeZone: defaultWeatherEntry.value.forecast.data.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .format(new Date(h.time * 1000))
        .slice(0, 2) === props.time.slice(0, 2),
  ),
);
async function show() {
  open.value = !open.value;
  if (open.value && !weather.busy) await refreshWeather();
}
</script>
<template>
  <div class="task-weather-hint">
    <el-button text @click="show"
      >🌤️
      {{ label("查看计划时段天气参考", "Weather for this plan") }}</el-button
    >
    <div v-if="open">
      <p>
        {{
          defaultWeatherEntry?.city.name ||
          label("请先在天气页选择默认城市", "Choose a default city in Weather")
        }}
        · {{ defaultWeatherEntry?.forecast?.data.timezone }} —
        {{
          label(
            "按该城市当地时间查询；不自动修改计划。",
            "City local time; your plan is not changed.",
          )
        }}
      </p>
      <p v-if="weather.busy">{{ label("加载中…", "Loading…") }}</p>
      <p v-else-if="!hours.length">
        {{
          label("该日期或时段暂无预报。", "No forecast for this date or time.")
        }}
      </p>
      <p
        v-if="
          defaultWeatherEntry?.error || defaultWeatherEntry?.forecast?.stale
        "
      >
        {{ label("当前显示缓存，可能已过期。", "Cached data may be stale.") }}
      </p>
      <div style="max-height: 150px; overflow: auto">
        <p v-for="h in hours" :key="h.time">
          {{
            new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
              timeZone: defaultWeatherEntry.forecast.data.timezone,
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(h.time * 1000))
          }}
          · {{ temperatureText(h.temp, true) }} · {{ label("降水", "Rain") }}
          {{ Number.isFinite(h.rain) ? h.rain + "%" : "—" }} ·
          {{ windText(h.wind) }}
        </p>
      </div>
      <small
        >Open-Meteo ·
        {{
          label(
            "模型预报，仅供安排参考",
            "Model forecast for planning reference",
          )
        }}</small
      >
    </div>
  </div>
</template>
