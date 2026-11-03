<script setup>
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import {
  weather,
  refreshWeather,
  saveWeatherPreference,
  selectWeatherCity,
  removeWeatherCity,
  cityKey,
  setDefaultWeatherCity,
  reorderWeatherCity,
  weatherBrowse,
  retryWeatherCity,
} from "../lib/weather-store.js";
import {
  forecastRows,
  weatherSymbol,
  weatherNumber,
  weatherDate,
} from "../lib/weather.js";
import { confirmAction } from "../lib/feedback.js";
import WeatherCityPicker from "./WeatherCityPicker.vue";
import WeatherSource from "./WeatherSource.vue";
import WeatherMetrics from "./WeatherMetrics.vue";
import WeatherTrend from "./WeatherTrend.vue";
import WeatherInspector from "./WeatherInspector.vue";
import {
  weatherDisplay,
  loadDisplay,
  saveDisplay,
  displayState,
  temperatureText,
  forecastSummary,
} from "../lib/weather-display.js";
const inspector = ref(false),
  metric = ref(-1),
  selectedDay = ref(""),
  detailElement = ref(null),
  dragCity = ref(null);
function inspectDay(day) {
  selectedDay.value = weatherDate(day.time, rows.value.zone);
  metric.value = -1;
  inspector.value = true;
  weatherBrowse.date = selectedDay.value;
}
function inspectMetric(index) {
  selectedDay.value =
    weatherBrowse.date || weatherDate(now.value / 1000, rows.value.zone);
  metric.value = index;
  inspector.value = true;
}
async function dropCity(city) {
  if (dragCity.value) await reorderWeatherCity(dragCity.value, city);
  dragCity.value = null;
}
const { t, locale } = useI18n();
const picker = ref(false),
  now = ref(Date.now());
const rows = computed(() => forecastRows(weather.forecast, now.value));
const today = computed(() =>
  rows.value.days.find(
    (day) =>
      weatherDate(day.time, rows.value.zone) ===
      weatherDate(now.value / 1000, rows.value.zone),
  ),
);
const atmosphere = computed(() =>
  rows.value.current?.is_day === 0
    ? "sky-night"
    : rows.value.current?.weather_code >= 51
      ? "sky-rain"
      : "sky-day",
);
const range = computed(() => {
  const values = rows.value.days
    .flatMap((day) => [day.min, day.temp])
    .filter(Number.isFinite);
  return values.length
    ? { min: Math.min(...values), max: Math.max(...values) }
    : null;
});
function temperatureBar(day) {
  if (
    !range.value ||
    !Number.isFinite(day.min) ||
    !Number.isFinite(day.temp) ||
    day.min > day.temp
  )
    return null;
  const span = range.value.max - range.value.min;
  const width = span ? Math.max(2, ((day.temp - day.min) / span) * 100) : 2;
  return {
    left:
      (span
        ? Math.min(100 - width, ((day.min - range.value.min) / span) * 100)
        : 49) + "%",
    width: width + "%",
  };
}
const label = (zh, en) => (locale.value === "zh" ? zh : en);
function openCity(item) {
  selectWeatherCity(item);
}
async function remove(city) {
  if (await confirmAction(label(`移除 ${city.name}？`, `Remove ${city.name}?`)))
    await removeWeatherCity(city);
}
const stale = computed(
  () =>
    !!weather.forecast &&
    (weather.forecast.stale ||
      weather.error ||
      now.value / 1000 - weather.forecast.fetchedAt > 1800 ||
      now.value / 1000 - (rows.value.current?.time || 0) > 7200),
);
const errorKey = computed(() =>
  weather.error.includes("PREFERENCES")
    ? "weatherPreferenceFailed"
    : weather.error === "WEATHER_RATE_LIMITED"
      ? "weatherRateLimited"
      : weather.preferences?.mode === "auto" && !weather.city
        ? "weatherLocationFailed"
        : "weatherUnavailable",
);
function format(time, options) {
  return new Intl.DateTimeFormat(locale.value === "zh" ? "zh-CN" : "en-US", {
    timeZone: rows.value.zone,
    ...options,
  }).format(new Date(time * 1000));
}
function dayLabel(time) {
  return weatherDate(time, rows.value.zone) ===
    weatherDate(now.value / 1000, rows.value.zone)
    ? t("weatherToday")
    : format(time, { weekday: "short", month: "numeric", day: "numeric" });
}
async function locate() {
  if (await confirmAction(t("weatherLocationConsent")))
    await saveWeatherPreference({ mode: "auto", city: null });
}
let clock,
  disposed = false;
onMounted(async () => {
  loadDisplay();
  await refreshWeather();
  if (disposed) return;
  if (weatherBrowse.city) {
    const entry = weather.entries.find(
      (e) => cityKey(e.city) === weatherBrowse.city,
    );
    if (entry) selectWeatherCity(entry);
  }
  await nextTick();
  if (detailElement.value) detailElement.value.scrollTop = weatherBrowse.scroll;
  clock = setInterval(() => {
    now.value = Date.now();
    if (
      !document.hidden &&
      !weather.busy &&
      !weather.saving &&
      weather.forecast &&
      now.value / 1000 - weather.forecast.fetchedAt >= 900
    )
      refreshWeather();
  }, 60000);
});
onBeforeUnmount(() => {
  disposed = true;
  clearInterval(clock);
  weatherBrowse.city = cityKey(weather.city);
  weatherBrowse.scroll = detailElement.value?.scrollTop || 0;
});
</script>
<template>
  <section
    class="weather-panel weather-dashboard"
    :class="[
      atmosphere,
      {
        'weather-sidebar-collapsed': weatherDisplay.collapsed,
        'weather-clear': weatherDisplay.clarity,
      },
    ]"
    data-testid="weather-card"
    :aria-busy="weather.busy"
  >
    <fieldset
      class="weather-display-controls"
      :disabled="displayState.busy"
      @change="saveDisplay"
    >
      <el-button
        @click="
          weatherDisplay.collapsed = !weatherDisplay.collapsed;
          saveDisplay();
        "
        >{{ label("城市列表", "Cities") }}</el-button
      >
      <label
        >{{ label("温度", "Temperature") }}
        <select v-model="weatherDisplay.temperature">
          <option>C</option>
          <option>F</option>
        </select></label
      >
      <label
        >{{ label("风速", "Wind") }}
        <select v-model="weatherDisplay.wind">
          <option value="ms">m/s</option>
          <option value="kmh">km/h</option>
        </select></label
      >
      <label
        ><input type="checkbox" v-model="weatherDisplay.clarity" />{{
          label("清晰模式", "Clarity mode")
        }}</label
      >
      <small v-if="displayState.error" role="status"
        >{{
          label(
            "显示偏好读取或保存失败，请重试。",
            "Display preferences failed. Retry.",
          )
        }}
        <button @click="saveDisplay">
          {{ label("重试保存", "Retry save") }}
        </button></small
      >
    </fieldset>
    <aside
      class="weather-city-sidebar"
      :aria-label="label('我的城市', 'My cities')"
    >
      <div class="weather-heading">
        <h2>{{ label("我的城市", "My cities") }}</h2>
        <div class="weather-actions">
          <el-button :disabled="weather.saving" @click="picker = true"
            >＋ {{ label("添加城市", "Add city") }}</el-button
          >
          <el-button
            :loading="weather.busy"
            :disabled="weather.saving"
            :aria-label="t('weatherRefresh')"
            @click="refreshWeather"
            >↻</el-button
          >
        </div>
      </div>
      <div class="weather-city-grid">
        <article
          v-for="item in weather.entries"
          :key="cityKey(item.city)"
          class="weather-city-card"
          :draggable="!weather.saving && !weather.busy"
          @dragstart="dragCity = item.city"
          @dragend="dragCity = null"
          @dragover.prevent
          @drop.prevent="dropCity(item.city)"
          :class="{ selected: cityKey(item.city) === cityKey(weather.city) }"
        >
          <button
            type="button"
            class="weather-city-open"
            :aria-pressed="cityKey(item.city) === cityKey(weather.city)"
            @click="openCity(item)"
          >
            <span>{{ item.city.name }}</span>
            <small>{{ item.forecast?.data.timezone || "—" }}</small>
            <strong>{{
              temperatureText(item.forecast?.data.current?.temperature_2m)
            }}</strong>
            <small
              >{{
                weatherSymbol(
                  item.forecast?.data.current?.weather_code,
                  item.forecast?.data.current?.is_day !== 0,
                )[0]
              }}
              {{
                item.busy
                  ? t("weatherLoading")
                  : item.error
                    ? t("weatherUnavailable")
                    : item.forecast?.stale
                      ? t("weatherStale")
                      : t(
                          weatherSymbol(
                            item.forecast?.data.current?.weather_code,
                          )[1],
                        )
              }}</small
            >
          </button>
          <small class="weather-city-clock"
            >{{
              item.forecast
                ? new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
                    timeZone: item.forecast.data.timezone,
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(now))
                : "—"
            }}
            <span
              v-if="cityKey(item.city) === cityKey(weather.preferences?.city)"
              >★</span
            ></small
          >
          <details class="weather-city-menu">
            <summary :aria-label="label('管理城市', 'Manage city')">⋯</summary>
            <el-button
              @click="reorderWeatherCity(item.city, null)"
              :disabled="weather.saving || weather.busy"
              >{{ label("移到首位", "Move first") }}</el-button
            >
            <el-button
              v-if="item.error"
              :disabled="item.busy"
              @click="retryWeatherCity(item)"
              >{{ label("重试", "Retry") }}</el-button
            >
            <el-button
              v-if="
                weather.preferences?.cities?.some(
                  (c) => cityKey(c) === cityKey(item.city),
                )
              "
              text
              :disabled="weather.saving || weather.busy"
              :aria-label="
                label('移除 ' + item.city.name, 'Remove ' + item.city.name)
              "
              @click="remove(item.city)"
              >{{ label("移除", "Remove") }}</el-button
            >
            <el-button
              text
              class="weather-set-default"
              :disabled="
                weather.saving ||
                weather.busy ||
                (weather.preferences?.mode === 'manual' &&
                  cityKey(weather.preferences.city) === cityKey(item.city))
              "
              @click="setDefaultWeatherCity(item.city)"
            >
              {{
                weather.preferences?.mode === "manual" &&
                cityKey(weather.preferences.city) === cityKey(item.city)
                  ? label("★ 默认城市", "★ Default city")
                  : weather.preferences?.mode === "auto"
                    ? label("设为默认（固定城市）", "Use as fixed default")
                    : label("设为默认", "Set default")
              }}
            </el-button>
          </details>
        </article>
      </div>
      <p class="hint weather-sidebar-note">
        {{ label("每座城市，独立的天气。", "A forecast for every city.") }}
      </p>
    </aside>
    <section
      class="weather-overview"
      ref="detailElement"
      :aria-label="weather.city?.name || t('weather')"
    >
      <div
        v-if="!weather.preferences || weather.preferences.mode === 'unset'"
        class="weather-welcome"
      >
        <span class="weather-hero-icon" aria-hidden="true">🌤️</span>
        <h2>{{ t("weatherSetupHint") }}</h2>
        <el-button :disabled="weather.saving" @click="locate"
          >⌖ {{ t("weatherLocate") }}</el-button
        >
      </div>
      <p v-if="weather.error" class="weather-notice" role="status">
        {{ t(errorKey) }}
      </p>
      <p v-if="stale" class="weather-notice" role="status">
        {{ t("weatherStale") }}
      </p>
      <p v-if="weather.busy && !rows.current" role="status">
        {{ t("weatherLoading") }}
      </p>
      <div class="weather-content" v-if="weather.city">
        <header class="weather-current">
          <p class="weather-location-mode">
            {{
              t(
                weather.preferences?.mode === "auto"
                  ? "weatherLocated"
                  : "weatherManual",
              )
            }}
          </p>
          <h2 class="weather-selected-title">{{ weather.city.name }}</h2>
          <template v-if="rows.current">
            <p class="weather-summary-sentence">
              {{ forecastSummary(rows.hours, locale) }}
            </p>
            <strong
              class="weather-temperature"
              :aria-label="temperatureText(rows.current.temperature_2m, true)"
              >{{ temperatureText(rows.current.temperature_2m) }}</strong
            >
            <p class="weather-hero-condition">
              <span aria-hidden="true">{{
                weatherSymbol(
                  rows.current.weather_code,
                  rows.current.is_day !== 0,
                )[0]
              }}</span>
              {{
                t(
                  weatherSymbol(
                    rows.current.weather_code,
                    rows.current.is_day !== 0,
                  )[1],
                )
              }}
            </p>
            <p class="weather-high-low">
              {{ label("最高", "High") }} {{ temperatureText(today?.temp) }}
              <span>·</span> {{ label("最低", "Low") }}
              {{ temperatureText(today?.min) }}
            </p>
            <p class="hint weather-stamp">
              {{ label("更新于", "Updated") }}
              {{
                Math.max(
                  0,
                  Math.floor((now / 1000 - weather.forecast.fetchedAt) / 60),
                )
              }}
              {{ label("分钟前", "minutes ago") }} ·
              {{
                t("weatherValid", {
                  time: format(rows.current.time, {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })
              }}
              ·
              {{
                t("weatherFetched", {
                  time: format(weather.forecast.fetchedAt, {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })
              }}
            </p>
          </template>
        </header>
        <template v-if="rows.current">
          <section class="weather-outlook weather-glass">
            <h3>◷ {{ t("weatherHours") }}</h3>
            <p class="hint weather-zone">
              {{ t("weatherLocalTime", { zone: rows.zone }) }}
            </p>
            <div
              class="weather-hour-strip"
              tabindex="0"
              :aria-label="t('weatherHours')"
            >
              <div
                v-for="hour in rows.hours"
                :key="hour.time"
                class="weather-hour"
                :title="
                  format(hour.time, {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                "
              >
                <time
                  ><small
                    v-if="
                      weatherDate(hour.time, rows.zone) !==
                      weatherDate(now / 1000, rows.zone)
                    "
                    >{{ label("明天", "Tomorrow") }} </small
                  >{{
                    format(hour.time, {
                      hour: "2-digit",
                      minute: "2-digit",
                      hourCycle: "h23",
                    })
                  }}</time
                >
                <span class="weather-small-icon" aria-hidden="true">{{
                  weatherSymbol(hour.code, hour.day)[0]
                }}</span>
                <span class="weather-condition">{{
                  t(weatherSymbol(hour.code, hour.day)[1])
                }}</span>
                <b>{{ temperatureText(hour.temp) }}</b>
                <small :title="t('weatherRainChance')"
                  >💧 {{ weatherNumber(hour.rain, "%") }}</small
                >
              </div>
            </div>
            <p v-if="rows.hours.length < 24" class="hint">
              {{ t("weatherPartial") }}
            </p>
            <details class="weather-trend-disclosure">
              <summary>
                {{ label("查看温度曲线", "View temperature trend") }}
              </summary>
              <WeatherTrend :hours="rows.hours" :zone="rows.zone" />
            </details>
          </section>
          <div class="weather-detail-layout">
            <section class="weather-daily-panel weather-glass">
              <h3>▦ {{ t("weatherDays") }}</h3>
              <p class="hint">{{ t("weatherHighLow") }}</p>
              <div class="weather-day-grid">
                <div
                  v-for="day in rows.days"
                  :key="day.time"
                  class="weather-day"
                  role="button"
                  tabindex="0"
                  :aria-pressed="
                    weatherBrowse.date === weatherDate(day.time, rows.zone)
                  "
                  @click="inspectDay(day)"
                  @keydown.enter.prevent="inspectDay(day)"
                  @keydown.space.prevent="inspectDay(day)"
                >
                  <time>{{ dayLabel(day.time) }}</time>
                  <span class="weather-day-condition"
                    ><span class="weather-small-icon" aria-hidden="true">{{
                      weatherSymbol(day.code)[0]
                    }}</span
                    ><span class="weather-condition">{{
                      t(weatherSymbol(day.code)[1])
                    }}</span
                    ><small :title="t('weatherRainChance')">{{
                      weatherNumber(day.rain, "%")
                    }}</small></span
                  >
                  <span
                    class="weather-low"
                    :title="label('最低温度', 'Low temperature')"
                    >{{ temperatureText(day.min) }}</span
                  >
                  <span class="weather-range-track" aria-hidden="true"
                    ><span
                      v-if="temperatureBar(day)"
                      class="weather-range-fill"
                      :style="temperatureBar(day)"
                    ></span
                  ></span>
                  <b :title="label('最高温度', 'High temperature')">{{
                    temperatureText(day.temp)
                  }}</b>
                </div>
              </div>
              <p v-if="rows.days.length < 7" class="hint">
                {{ t("weatherPartial") }}
              </p>
            </section>
            <div class="weather-detail-metrics">
              <WeatherMetrics
                :forecast="weather.forecast"
                @inspect="inspectMetric"
              />
            </div>
          </div>
        </template>
      </div>
      <p v-if="weather.preferences?.mode === 'auto'" class="hint">
        {{ t("weatherLocateHint") }}
      </p>
      <WeatherSource />
    </section>
  </section>
  <WeatherCityPicker v-model="picker" />
  <WeatherInspector
    v-model="inspector"
    :forecast="weather.forecast"
    :date="selectedDay"
    :metric="metric"
  />
</template>
<style src="./weather-dashboard.css"></style>
