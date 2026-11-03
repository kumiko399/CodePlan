import { reactive } from "vue";
import { request } from "../api.js";
import { weatherDate } from "./weather.js";
const defaults = {
  temperature: "C",
  wind: "ms",
  clarity: false,
  collapsed: false,
};
export const weatherDisplay = reactive({ ...defaults });
export const displayState = reactive({ busy: false, error: "", loaded: false });
let loading;
export function loadDisplay() {
  if (displayState.loaded) return Promise.resolve();
  if (loading) return loading;
  displayState.busy = true;
  return (loading = request("/weather/display", { isolated: true })
    .then((v) => {
      Object.assign(weatherDisplay, v);
      displayState.loaded = true;
      displayState.error = "";
    })
    .catch(() => {
      displayState.error = "load";
    })
    .finally(() => {
      displayState.busy = false;
      loading = null;
    }));
}
export async function saveDisplay() {
  if (displayState.busy) return;
  displayState.busy = true;
  try {
    await request("/weather/display", {
      method: "PUT",
      body: { ...weatherDisplay },
      isolated: true,
    });
    displayState.error = "";
    displayState.loaded = true;
  } catch {
    displayState.error = "save";
  } finally {
    displayState.busy = false;
  }
}
export const temperatureValue = (v) =>
  Number.isFinite(v)
    ? weatherDisplay.temperature === "F"
      ? (v * 9) / 5 + 32
      : v
    : null;
export const temperatureText = (v, unit = false) =>
  Number.isFinite(v)
    ? Math.round(temperatureValue(v)) +
      "°" +
      (unit ? weatherDisplay.temperature : "")
    : "—";
export const windText = (v) =>
  Number.isFinite(v)
    ? (v * (weatherDisplay.wind === "kmh" ? 3.6 : 1)).toFixed(1) +
      (weatherDisplay.wind === "kmh" ? " km/h" : " m/s")
    : "—";
export function dayHours(forecast, date) {
  const data = forecast?.data,
    h = data?.hourly;
  return (h?.time || []).flatMap((time, i) =>
    weatherDate(time, data.timezone) === date
      ? [
          {
            time,
            temp: h.temperature_2m?.[i] ?? null,
            rain: h.precipitation_probability?.[i] ?? null,
            wind: h.wind_speed_10m?.[i] ?? null,
            code: h.weather_code?.[i],
            day: h.is_day?.[i] !== 0,
            index: i,
          },
        ]
      : [],
  );
}
export function forecastSummary(hours, language = "zh") {
  const next = hours.slice(0, 6),
    valid = next.map((h) => h.rain).filter(Number.isFinite);
  if (!valid.length)
    return language === "zh"
      ? "未来几小时降水数据暂缺。"
      : "Rain forecast unavailable for the next hours.";
  const peak = Math.max(...valid);
  return language === "zh"
    ? `未来 ${next.length} 小时内，已提供的降水概率最高为 ${Math.round(peak)}%。`
    : `Peak available rain chance in the next ${next.length} hours: ${Math.round(peak)}%.`;
}
