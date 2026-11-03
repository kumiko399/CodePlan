import { reactive, computed } from "vue";
import { request } from "../api.js";
export const weather = reactive({
  preferences: null,
  city: null,
  forecast: null,
  busy: false,
  saving: false,
  error: "",
  loaded: false,
  entries: [],
});
export const weatherBrowse = reactive({ city: "", date: "", scroll: 0 });
const call = (path, options = {}) =>
  request("/weather" + path, { ...options, isolated: true });
let sequence = 0,
  initPromise;
export async function initWeather() {
  if (weather.loaded) return;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      weather.preferences = await call("/preferences");
      weather.loaded = true;
    } catch (e) {
      weather.error = e.message;
    }
  })().finally(() => {
    initPromise = null;
  });
  return initPromise;
}
export async function refreshWeather() {
  await initWeather();
  if (!weather.preferences || weather.preferences.mode === "unset") return;
  const run = ++sequence;
  const selected = weather.city;
  weather.busy = true;
  weather.error = "";
  try {
    let city = weather.preferences.city;
    if (weather.preferences.mode === "auto") {
      try {
        city = await call("/location");
      } catch (e) {
        weather.error = e.message;
        city = weather.preferences.cities?.[0];
        if (!city) throw e;
      }
    }
    if (run !== sequence) return;
    if (
      weather.city?.latitude !== city.latitude ||
      weather.city?.longitude !== city.longitude
    )
      weather.forecast = null;
    weather.city = city;
    const candidates = [
      city,
      ...(weather.preferences.cities || []).filter(
        (c) => cityKey(c) !== cityKey(city),
      ),
    ];
    const cities =
      weather.preferences.mode === "manual"
        ? [...(weather.preferences.cities || candidates)]
        : candidates;
    weather.city = cities.find((c) => cityKey(c) === cityKey(selected)) || city;
    weather.forecast =
      weather.entries.find((e) => cityKey(e.city) === cityKey(weather.city))
        ?.forecast || null;
    weather.entries = cities.map((c) => ({
      city: c,
      forecast:
        weather.entries.find((e) => cityKey(e.city) === cityKey(c))?.forecast ||
        null,
      error: "",
      busy: true,
    }));
    for (const item of weather.entries) {
      if (run !== sequence) return;
      try {
        const forecast = await call(
          `/forecast?latitude=${item.city.latitude}&longitude=${item.city.longitude}`,
        );
        if (run !== sequence) return;
        item.forecast = forecast;
        if (cityKey(item.city) === cityKey(weather.city))
          weather.forecast = forecast;
      } catch (e) {
        if (run !== sequence) return;
        item.error = e.message;
        if (cityKey(item.city) === cityKey(weather.city))
          weather.error = e.message;
      } finally {
        item.busy = false;
      }
    }
  } catch (e) {
    if (run === sequence) weather.error = e.message;
  } finally {
    if (run === sequence) weather.busy = false;
  }
}
export async function saveWeatherPreference(preferences) {
  if (weather.saving) return false;
  weather.saving = true;
  try {
    let cities = preferences.cities || weather.preferences?.cities || [];
    if (
      preferences.mode === "manual" &&
      !cities.some((c) => cityKey(c) === cityKey(preferences.city))
    )
      cities = [...cities, preferences.city];
    if (cities.length > 8) {
      weather.error = "WEATHER_CITY_LIMIT";
      return false;
    }
    const saved = await call("/preferences", {
      method: "PUT",
      body: {
        ...preferences,
        ...(preferences.mode === "manual" &&
        !preferences.cities &&
        weather.preferences?.mode === "manual" &&
        weather.preferences.city
          ? { city: weather.preferences.city }
          : {}),
        ...(weather.preferences?.mode === "auto" &&
        preferences.mode === "manual" &&
        !preferences.cities
          ? { mode: "auto", city: null }
          : {}),
        cities: preferences.mode === "unset" ? [] : cities,
      },
    });
    sequence++;
    weather.busy = false;
    weather.preferences = saved;
    weather.loaded = true;
    weather.error = "";
    if (saved.mode === "unset") {
      weather.entries = [];
      weather.city = null;
      weather.forecast = null;
    }
    if (saved.mode !== "unset") await refreshWeather();
    return true;
  } catch (e) {
    weather.error = e.message;
    return false;
  } finally {
    weather.saving = false;
  }
}
export const searchWeatherCities = (q, language, signal) =>
  call(`/cities?q=${encodeURIComponent(q)}&language=${language}`, { signal });
export const cityKey = (c) => (c ? `${c.latitude},${c.longitude}` : "");
// Browsing another city must not change the home page's saved default.
export const defaultWeatherEntry = computed(() =>
  weather.preferences?.mode === "auto"
    ? weather.entries[0] || null
    : weather.entries.find(
        (e) => cityKey(e.city) === cityKey(weather.preferences?.city),
      ) || null,
);
export function setDefaultWeatherCity(city) {
  return saveWeatherPreference({
    mode: "manual",
    city,
    cities: weather.preferences?.cities || [],
  });
}
export function selectWeatherCity(item) {
  weather.city = item.city;
  weather.forecast = item.forecast;
  weather.error = item.error;
  weatherBrowse.city = cityKey(item.city);
}
export async function retryWeatherCity(item) {
  if (item.busy || weather.busy || weather.saving) return;
  item.busy = true;
  try {
    const response = await call(
      `/forecast?latitude=${item.city.latitude}&longitude=${item.city.longitude}`,
    );
    if (!weather.entries.includes(item)) return;
    item.forecast = response;
    item.error = "";
  } catch (e) {
    item.error = e.message;
  } finally {
    item.busy = false;
    if (
      cityKey(item.city) === cityKey(weather.city) &&
      weather.entries.includes(item)
    )
      selectWeatherCity(item);
  }
}
export async function reorderWeatherCity(source, target) {
  const cities = [...(weather.preferences?.cities || [])];
  const i = cities.findIndex((c) => cityKey(c) === cityKey(source));
  if (
    i < 0 ||
    cityKey(source) === cityKey(target) ||
    weather.saving ||
    weather.busy
  )
    return false;
  const [city] = cities.splice(i, 1),
    j = target ? cities.findIndex((c) => cityKey(c) === cityKey(target)) : 0;
  if (j < 0) return false;
  cities.splice(j, 0, city);
  return saveWeatherPreference({ ...weather.preferences, cities });
}
export async function removeWeatherCity(city) {
  const cities = (weather.preferences?.cities || []).filter(
    (c) => cityKey(c) !== cityKey(city),
  );
  const auto = weather.preferences?.mode === "auto";
  return saveWeatherPreference({
    mode: auto ? "auto" : cities.length ? "manual" : "unset",
    city: auto
      ? null
      : cities.find((c) => cityKey(c) === cityKey(weather.preferences?.city)) ||
        cities[0] ||
        null,
    cities,
  });
}
