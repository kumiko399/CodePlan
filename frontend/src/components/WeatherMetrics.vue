<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { weatherDate, weatherNumber } from "../lib/weather.js";
import { temperatureText, windText } from "../lib/weather-display.js";
const emit = defineEmits(["inspect"]);
const props = defineProps({ forecast: Object });
const { locale } = useI18n();
const label = (zh, en) => (locale.value === "zh" ? zh : en);
const d = computed(() => props.forecast?.data || {});
const current = computed(() => d.value.current || {});
const hour = computed(
  () =>
    d.value.hourly?.time?.findIndex(
      (t) => t <= current.value.time && t + 3600 > current.value.time,
    ) ?? -1,
);
const day = computed(
  () =>
    d.value.daily?.time?.findIndex(
      (t) =>
        weatherDate(t, d.value.timezone) ===
        weatherDate(current.value.time, d.value.timezone),
    ) ?? -1,
);
const hourly = (k) => d.value.hourly?.[k]?.[hour.value];
const daily = (k) => d.value.daily?.[k]?.[day.value];
const value = (v, unit = "") =>
  typeof v === "number" && Number.isFinite(v)
    ? `${Math.round(v * 10) / 10}${unit}`
    : "—";
const sun = (k) =>
  typeof daily(k) === "number"
    ? new Intl.DateTimeFormat(locale.value === "zh" ? "zh-CN" : "en-US", {
        timeZone: d.value.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(daily(k) * 1000))
    : "—";
const advice = computed(() => {
  const temp = current.value.apparent_temperature,
    humidity = current.value.relative_humidity_2m;
  if (typeof temp !== "number") return { feel: "—", clothes: "—" };
  const feel =
    temp < 10
      ? label("偏冷", "Cold")
      : temp < 18
        ? label("偏凉", "Cool")
        : temp <= 26
          ? label("温和", "Mild")
          : temp <= 32
            ? label("偏热", "Warm")
            : label("炎热", "Hot");
  const moisture =
    typeof humidity !== "number"
      ? ""
      : humidity < 30
        ? label(" · 干燥", " · Dry")
        : humidity > 70
          ? label(" · 潮湿", " · Humid")
          : label(" · 湿度适中", " · Moderate humidity");
  const clothes =
    temp < 5
      ? label("厚外套，注意保暖。", "A warm coat and insulating layers.")
      : temp < 15
        ? label("外套搭配长袖，方便增减。", "A jacket over long sleeves.")
        : temp < 23
          ? label(
              "长袖或薄外套，按活动量增减。",
              "Long sleeves or a light layer.",
            )
          : label(
              "轻薄透气衣物，按个人感受调整。",
              "Light breathable clothing; adjust to your comfort.",
            );
  return { feel: feel + moisture, clothes };
});
</script>
<template>
  <div class="weather-metric-grid" data-testid="weather-metrics">
    <article
      role="button"
      tabindex="0"
      @click="emit('inspect', 0)"
      @keydown.enter.prevent="emit('inspect', 0)"
      @keydown.space.prevent="emit('inspect', 0)"
    >
      <h3>☀️ {{ label("紫外线", "UV index") }}</h3>
      <strong>{{ value(hourly("uv_index")) }}</strong>
      <p>
        {{ label("本小时预报 · 今日峰值", "Hourly forecast · daily peak") }}
        {{ value(daily("uv_index_max")) }}
      </p>
    </article>
    <article
      role="button"
      tabindex="0"
      @click="emit('inspect', 1)"
      @keydown.enter.prevent="emit('inspect', 1)"
      @keydown.space.prevent="emit('inspect', 1)"
    >
      <h3>🌡️ {{ label("体感与舒适度", "Feels like & comfort") }}</h3>
      <strong>{{ temperatureText(current.apparent_temperature, true) }}</strong>
      <p>{{ advice.feel }}</p>
    </article>
    <article
      role="button"
      tabindex="0"
      @click="emit('inspect', 2)"
      @keydown.enter.prevent="emit('inspect', 2)"
      @keydown.space.prevent="emit('inspect', 2)"
    >
      <h3>👕 {{ label("穿衣参考", "Clothing suggestion") }}</h3>
      <p>{{ advice.clothes }}</p>
      <small>{{
        label("根据当前体感温度判断", "Based on current apparent temperature")
      }}</small>
    </article>
    <article
      role="button"
      tabindex="0"
      @click="emit('inspect', 3)"
      @keydown.enter.prevent="emit('inspect', 3)"
      @keydown.space.prevent="emit('inspect', 3)"
    >
      <h3>💧 {{ label("降水", "Precipitation") }}</h3>
      <strong>{{ value(daily("precipitation_sum"), " mm") }}</strong>
      <p>
        {{
          label("今日累计预报 · 降水概率", "Daily forecast total · rain chance")
        }}
        {{ weatherNumber(daily("precipitation_probability_max"), "%") }}
      </p>
    </article>
    <article
      role="button"
      tabindex="0"
      @click="emit('inspect', 4)"
      @keydown.enter.prevent="emit('inspect', 4)"
      @keydown.space.prevent="emit('inspect', 4)"
    >
      <h3>🌬️ {{ label("风与阵风", "Wind & gusts") }}</h3>
      <strong>{{ windText(current.wind_speed_10m) }}</strong>
      <p>
        {{ label("阵风", "Gusts") }}
        {{ windText(current.wind_gusts_10m) }} ·
        {{ label("风向", "Direction") }}
        {{ value(current.wind_direction_10m, "°") }}
      </p>
    </article>
    <article
      role="button"
      tabindex="0"
      @click="emit('inspect', 5)"
      @keydown.enter.prevent="emit('inspect', 5)"
      @keydown.space.prevent="emit('inspect', 5)"
    >
      <h3>🌅 {{ label("日出与日落", "Sunrise & sunset") }}</h3>
      <strong>{{ sun("sunrise") }} / {{ sun("sunset") }}</strong>
      <p>{{ label("所选城市当地时间", "City local time") }}</p>
    </article>
    <article
      role="button"
      tabindex="0"
      @click="emit('inspect', 6)"
      @keydown.enter.prevent="emit('inspect', 6)"
      @keydown.space.prevent="emit('inspect', 6)"
    >
      <h3>👁️ {{ label("能见度", "Visibility") }}</h3>
      <strong>{{
        value(
          typeof hourly("visibility") === "number"
            ? hourly("visibility") / 1000
            : null,
          " km",
        )
      }}</strong>
      <p>{{ label("本小时预报", "Hourly forecast") }}</p>
    </article>
    <article
      role="button"
      tabindex="0"
      @click="emit('inspect', 7)"
      @keydown.enter.prevent="emit('inspect', 7)"
      @keydown.space.prevent="emit('inspect', 7)"
    >
      <h3>🫧 {{ label("湿度与露点", "Humidity & dew point") }}</h3>
      <strong>{{ weatherNumber(current.relative_humidity_2m, "%") }}</strong>
      <p>
        {{ label("露点", "Dew point") }}
        {{ temperatureText(hourly("dew_point_2m"), true) }}
      </p>
    </article>
    <article
      role="button"
      tabindex="0"
      @click="emit('inspect', 8)"
      @keydown.enter.prevent="emit('inspect', 8)"
      @keydown.space.prevent="emit('inspect', 8)"
    >
      <h3>🧭 {{ label("海平面气压", "Sea-level pressure") }}</h3>
      <strong>{{ value(current.pressure_msl, " hPa") }}</strong>
      <p>
        {{ label("云量", "Cloud cover") }}
        {{ weatherNumber(current.cloud_cover, "%") }}
      </p>
    </article>
  </div>
  <p class="hint">
    {{
      label(
        "舒适度及穿衣为应用按体感温度、湿度生成的参考，不是官方生活指数；个人耐受、活动量和室内外环境会影响感受。缺失数据不生成结论。",
        "Comfort and clothing are app suggestions based on apparent temperature and humidity, not official lifestyle indices. Personal tolerance, activity and surroundings vary. Missing data produces no conclusion.",
      )
    }}
  </p>
</template>
