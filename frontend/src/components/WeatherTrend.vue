<script setup>
import { computed, ref } from "vue";
import { temperatureValue, weatherDisplay } from "../lib/weather-display.js";
import { useI18n } from "vue-i18n";
const props = defineProps({
  hours: Array,
  zone: String,
  unit: String,
  converted: Boolean,
});
const active = ref(0);
const unitLabel = computed(
  () => props.unit || "°" + weatherDisplay.temperature,
);
const { locale } = useI18n();
const points = computed(() => {
  const source = (props.hours || []).map((h) => ({
    ...h,
    temp: props.converted ? h.temp : temperatureValue(h.temp),
  }));
  const valid = source.map((h) => h.temp).filter(Number.isFinite);
  const min = Math.min(...valid),
    span = Math.max(4, Math.max(...valid) - min);
  return source.map((h, i) => ({
    ...h,
    x: 24 + i * (648 / Math.max(1, source.length - 1)),
    y: Number.isFinite(h.temp) ? 104 - ((h.temp - min) / span) * 68 : null,
  }));
});
const segments = computed(() => {
  const parts = [];
  let part = [];
  for (const p of points.value) {
    if (p.y === null) {
      if (part.length) parts.push(part.join(" "));
      part = [];
    } else part.push(`${p.x},${p.y}`);
  }
  if (part.length) parts.push(part.join(" "));
  return parts;
});
const hour = (t) =>
  new Intl.DateTimeFormat(locale.value === "zh" ? "zh-CN" : "en-US", {
    timeZone: props.zone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(t * 1000));
</script>
<template>
  <div
    class="weather-trend"
    tabindex="0"
    @keydown.right.prevent="active = Math.min(points.length - 1, active + 1)"
    @keydown.left.prevent="active = Math.max(0, active - 1)"
    :aria-label="
      locale === 'zh'
        ? '预报趋势，使用左右方向键查看各时段；具体数值见下方预报'
        : 'Forecast trend; use left and right arrows to explore. Values are listed below.'
    "
  >
    <p v-if="points[active]" role="status">
      {{ hour(points[active].time) }} ·
      {{
        points[active].temp === null
          ? "—"
          : Math.round(points[active].temp * 10) / 10
      }}
      {{ unitLabel }} · {{ locale === "zh" ? "降水概率" : "Rain chance" }}
      {{
        Number.isFinite(points[active].rain) ? points[active].rain + "%" : "—"
      }}
    </p>
    <svg
      viewBox="0 0 700 138"
      role="img"
      :aria-label="
        (locale === 'zh' ? '预报趋势 ' : 'Forecast trend ') + unitLabel
      "
    >
      <path d="M24 36H676 M24 72H676 M24 108H676" class="trend-grid" />
      <polyline
        v-for="(segment, i) in segments"
        :key="i"
        :points="segment"
        class="trend-line"
      />
      <g v-for="(p, i) in points" :key="p.time">
        <circle
          v-if="p.y !== null"
          :cx="p.x"
          :cy="p.y"
          r="3"
          class="trend-point"
          @mouseenter="active = i"
          @focus="active = i"
          tabindex="0"
        >
          <title>{{ hour(p.time) }} · {{ p.temp }} {{ unitLabel }}</title>
        </circle>
        <text
          v-if="i % 4 === 0 && p.y !== null"
          :x="p.x"
          :y="p.y - 12"
          text-anchor="middle"
        >
          {{ Math.round(p.temp) }}
        </text>
        <text v-if="i % 4 === 0" :x="p.x" y="132" text-anchor="middle">
          {{ hour(p.time) }}
        </text>
      </g>
    </svg>
  </div>
</template>
