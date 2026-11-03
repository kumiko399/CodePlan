<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  dayHours,
  temperatureValue,
  windText,
  weatherDisplay,
} from "../lib/weather-display.js";
import WeatherTrend from "./WeatherTrend.vue";
const props = defineProps({
  modelValue: Boolean,
  forecast: Object,
  date: String,
  metric: { type: Number, default: -1 },
});
defineEmits(["update:modelValue"]);
const { locale } = useI18n();
const label = (zh, en) => (locale.value === "zh" ? zh : en);
const names = [
  ["紫外线", "UV index"],
  ["体感与舒适度", "Feels like"],
  ["穿衣参考", "Clothing"],
  ["降水概率", "Rain chance"],
  ["风速", "Wind"],
  ["日出日落", "Sunrise / sunset"],
  ["能见度", "Visibility"],
  ["湿度", "Humidity"],
  ["海平面气压", "Sea-level pressure"],
];
const keys = [
  "uv_index",
  "apparent_temperature",
  "apparent_temperature",
  "precipitation_probability",
  "wind_speed_10m",
  null,
  "visibility",
  "relative_humidity_2m",
  "pressure_msl",
];
const units = [
  "",
  "°" + weatherDisplay.temperature,
  "°" + weatherDisplay.temperature,
  "%",
  "m/s",
  "",
  "km",
  "%",
  "hPa",
];
const hours = computed(() => dayHours(props.forecast, props.date));
const unit = computed(() =>
  [1, 2].includes(props.metric) || props.metric < 0
    ? "°" + weatherDisplay.temperature
    : props.metric === 4
      ? weatherDisplay.wind === "kmh"
        ? "km/h"
        : "m/s"
      : units[props.metric],
);
const points = computed(() =>
  hours.value.map((h) => {
    let v =
      props.metric < 0
        ? h.temp
        : props.forecast?.data.hourly?.[keys[props.metric]]?.[h.index];
    if (props.metric < 0 || [1, 2].includes(props.metric))
      v = temperatureValue(v);
    if (Number.isFinite(v) && props.metric === 6) v /= 1000;
    if (
      Number.isFinite(v) &&
      props.metric === 4 &&
      weatherDisplay.wind === "kmh"
    )
      v *= 3.6;
    return { ...h, temp: Number.isFinite(v) ? v : null };
  }),
);
const sunDays = computed(() =>
  (props.forecast?.data.daily?.time || []).map((time, i) => ({
    time,
    rise: props.forecast.data.daily.sunrise?.[i],
    set: props.forecast.data.daily.sunset?.[i],
  })),
);
const stamp = (time) =>
  new Intl.DateTimeFormat(locale.value === "zh" ? "zh-CN" : "en-US", {
    timeZone: props.forecast?.data.timezone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time * 1000));
</script>
<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    append-to-body
    width="min(820px,94vw)"
    class="weather-inspector"
    :title="
      date +
      ' · ' +
      (metric < 0
        ? label('每日详情', 'Daily details')
        : label(...names[metric]))
    "
  >
    <p>
      {{ forecast?.data.timezone }} ·
      {{ label("预报数据，非实时观测", "Forecast, not live observation") }}
    </p>
    <p v-if="forecast?.stale" role="status">
      {{
        label(
          "缓存预报可能已过期，请刷新后参考。",
          "Cached forecast may be stale. Refresh before use.",
        )
      }}
    </p>
    <p v-if="metric === 2">
      {{
        label(
          "穿衣参考依据体感温度，不是官方生活指数；请结合活动强度和个人感受。",
          "Clothing suggestions use apparent temperature, not official lifestyle indices. Consider activity and personal comfort.",
        )
      }}
    </p>
    <p v-else-if="metric === 0">
      {{
        label(
          "紫外线指数为无量纲预报值。",
          "UV index is a unitless forecast value.",
        )
      }}
    </p>
    <p v-else-if="metric === 3">
      {{
        label(
          "降水概率不是降水量；百分比表示发生降水的可能性。",
          "Rain probability is not rainfall amount.",
        )
      }}
    </p>
    <p v-else-if="metric === 8">
      {{
        label(
          "气压已折算到海平面，单位为 hPa。",
          "Pressure is reduced to sea level, in hPa.",
        )
      }}
    </p>
    <div v-if="metric === 5">
      <p>
        {{
          label(
            "所选城市当地时间；缺失值显示 —。",
            "City local time; missing values show —.",
          )
        }}
      </p>
      <p v-for="day in sunDays" :key="day.time">
        {{ stamp(day.time) }} · {{ label("日出", "Sunrise") }}
        {{ Number.isFinite(day.rise) ? stamp(day.rise) : "—" }} ·
        {{ label("日落", "Sunset") }}
        {{ Number.isFinite(day.set) ? stamp(day.set) : "—" }}
      </p>
    </div>
    <p v-else-if="!points.some((p) => p.temp !== null)" role="status">
      {{
        label(
          "该指标在所选日期没有逐小时数据。",
          "No hourly data for this metric and date.",
        )
      }}
    </p>
    <WeatherTrend
      v-else
      :hours="points"
      :zone="forecast.data.timezone"
      :unit="unit"
      :converted="true"
    />
    <div v-if="metric !== 5" class="weather-inspector-table">
      <table>
        <thead>
          <tr>
            <th>{{ label("城市当地时间", "City local time") }}</th>
            <th>
              {{
                metric < 0
                  ? label("温度", "Temperature")
                  : label(...names[metric])
              }}
              {{ unit }}
            </th>
            <th>{{ label("降水概率", "Rain chance") }}</th>
            <th>{{ label("风速", "Wind") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(h, i) in hours" :key="h.time">
            <td>{{ stamp(h.time) }}</td>
            <td>
              {{
                points[i].temp === null
                  ? "—"
                  : Math.round(points[i].temp * 10) / 10
              }}
            </td>
            <td>{{ Number.isFinite(h.rain) ? h.rain + "%" : "—" }}</td>
            <td>{{ windText(h.wind) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </el-dialog>
</template>
<style>
.weather-inspector-table {
  max-height: 320px;
  overflow: auto;
}
.weather-inspector table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.weather-inspector th,
.weather-inspector td {
  padding: 9px;
  text-align: left;
  border-bottom: 1px solid var(--line);
}
.weather-inspector .weather-trend {
  overflow: auto;
}
.weather-inspector svg {
  width: 100%;
  min-width: 430px;
}
.weather-inspector .trend-line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
}
.weather-inspector .trend-point {
  fill: var(--accent);
}
.weather-inspector .trend-grid {
  fill: none;
  stroke: var(--line);
}
.weather-inspector text {
  fill: var(--muted);
  font-size: 11px;
}
</style>
