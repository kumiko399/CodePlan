import test from "node:test";
import assert from "node:assert/strict";
import {
  dayHours,
  forecastSummary,
  temperatureValue,
  weatherDisplay,
} from "../frontend/src/lib/weather-display.js";
test("weather drilldown respects city date, missing values and display units", () => {
  const data = {
    timezone: "Asia/Tokyo",
    hourly: {
      time: [
        Date.parse("2026-11-01T14:00Z") / 1000,
        Date.parse("2026-11-01T15:00Z") / 1000,
      ],
      temperature_2m: [0, null],
      precipitation_probability: [0, null],
    },
  };
  assert.equal(dayHours({ data }, "2026-11-01").length, 1);
  assert.equal(dayHours({ data }, "2026-11-02")[0].temp, null);
  assert.ok(forecastSummary([{ rain: 0 }], "zh").includes("0%"));
  assert.ok(forecastSummary([{ rain: null }], "zh").includes("暂缺"));
  weatherDisplay.temperature = "F";
  assert.equal(temperatureValue(0), 32);
  assert.equal(temperatureValue(null), null);
  weatherDisplay.temperature = "C";
});
import {
  forecastRows,
  weatherNumber,
  weatherSymbol,
  weatherDate,
} from "../frontend/src/lib/weather.js";

test("zero values and clear weather are distinct from missing data", () => {
  assert.equal(weatherNumber(0, "%"), "0%");
  for (const v of [undefined, null, NaN, "0"])
    assert.equal(weatherNumber(v, "%"), "—");
  assert.equal(weatherSymbol(0)[0], "☀️");
  assert.equal(weatherSymbol(0, false)[0], "🌙");
  assert.equal(weatherSymbol(null)[1], "weatherUnknown");
  assert.equal(weatherSymbol(95)[1], "weatherThunder");
});
test("hourly window and daily dates use city timezone across UTC midnight", () => {
  const now = Date.parse("2026-10-27T15:30:00Z");
  assert.equal(weatherDate(now / 1000, "Asia/Shanghai"), "2026-10-27");
  assert.equal(weatherDate(now / 1000, "Asia/Tokyo"), "2026-10-28");
  assert.equal(weatherDate(now / 1000, "Australia/Sydney"), "2026-10-28");
  const data = {
    timezone: "Asia/Tokyo",
    current: { temperature_2m: 0 },
    hourly: {
      time: Array.from(
        { length: 72 },
        (_, i) => now / 1000 - 1800 + (i - 24) * 3600,
      ),
    },
    daily: {
      time: Array.from(
        { length: 9 },
        (_, i) => Date.parse("2026-10-26T15:00:00Z") / 1000 + i * 86400,
      ),
    },
  };
  const result = forecastRows({ data }, now);
  assert.equal(result.hours.length, 24);
  assert.equal(result.days.length, 7);
  assert.equal(weatherDate(result.days[0].time, data.timezone), "2026-10-28");
  assert.equal(result.hours[0].temp, null);
  assert.equal(result.hours[0].rain, null);
});
test("weather requests never alter task connection or save state", async () => {
  globalThis.window = {};
  const { request, requestState } = await import("../frontend/src/api.js");
  const original = globalThis.fetch;
  try {
    requestState.offline = true;
    const before = { ...requestState };
    globalThis.fetch = async () => new Response("{}");
    await request("/weather/preferences", {
      method: "PUT",
      body: { mode: "unset" },
      isolated: true,
    });
    assert.deepEqual({ ...requestState }, before);
    globalThis.fetch = async () => {
      throw Error("network");
    };
    await assert.rejects(request("/weather/forecast", { isolated: true }));
    assert.deepEqual({ ...requestState }, before);
  } finally {
    globalThis.fetch = original;
    delete globalThis.window;
  }
});

test("saved cities keep independent errors and adding a city preserves location consent", async () => {
  globalThis.window = {};
  const original = globalThis.fetch;
  const {
    weather,
    refreshWeather,
    saveWeatherPreference,
    defaultWeatherEntry,
    setDefaultWeatherCity,
    selectWeatherCity,
    removeWeatherCity,
    reorderWeatherCity,
    retryWeatherCity,
  } = await import("../frontend/src/lib/weather-store.js");
  const beijing = { name: "北京", latitude: 39.9, longitude: 116.4 },
    tokyo = { name: "东京", latitude: 35.68, longitude: 139.69 };
  weather.loaded = true;
  weather.preferences = { mode: "auto", city: null, cities: [beijing] };
  let saved;
  globalThis.fetch = async (url, opts) => {
    if (url.includes("/preferences")) {
      saved = JSON.parse(opts.body);
      return new Response(JSON.stringify(saved));
    }
    if (url.includes("/location")) return new Response(JSON.stringify(beijing));
    if (url.includes("139.69")) throw Error("city unavailable");
    return new Response(
      JSON.stringify({
        data: { timezone: "Asia/Shanghai", current: { temperature_2m: 0 } },
        fetchedAt: Date.now() / 1000,
      }),
    );
  };
  try {
    assert.equal(
      await saveWeatherPreference({ mode: "manual", city: tokyo }),
      true,
    );
    assert.equal(saved.mode, "auto");
    assert.equal(saved.cities.length, 2);
    assert.equal(weather.entries[0].forecast.data.current.temperature_2m, 0);
    assert.equal(weather.entries[1].error, "city unavailable");
    assert.equal(weather.entries[1].forecast, null);
    selectWeatherCity(weather.entries[1]);
    assert.equal(defaultWeatherEntry.value.city.name, "北京");
    await setDefaultWeatherCity(tokyo);
    assert.equal(saved.mode, "manual");
    assert.equal(saved.city.name, "东京");
    selectWeatherCity(weather.entries.find((e) => e.city.name === "北京"));
    assert.equal(defaultWeatherEntry.value.city.name, "东京");
    await saveWeatherPreference({ mode: "manual", city: beijing });
    assert.equal(saved.city.name, "东京");
    await reorderWeatherCity(tokyo, beijing);
    assert.equal(saved.cities[0].name, "东京");
    assert.equal(saved.city.name, "东京");
    assert.equal(weather.city.name, "北京");
    const cached = weather.entries.find((e) => e.city.name === "北京").forecast;
    globalThis.fetch = async () => {
      throw Error("offline");
    };
    await refreshWeather();
    assert.equal(
      weather.entries.find((e) => e.city.name === "北京").forecast,
      cached,
    );
    assert.equal(weather.city.name, "北京");
    let retries = 0;
    globalThis.fetch = async (url, opts) => {
      if (url.includes("/preferences")) {
        saved = JSON.parse(opts.body);
        return new Response(JSON.stringify(saved));
      }
      retries++;
      return new Response(JSON.stringify(cached));
    };
    await retryWeatherCity(weather.entries.find((e) => e.city.name === "东京"));
    assert.equal(retries, 1);
    assert.equal(weather.entries.find((e) => e.city.name === "东京").error, "");
    await removeWeatherCity(beijing);
    assert.equal(saved.city.name, "东京");
    await saveWeatherPreference({ mode: "unset", city: null });
    assert.equal(weather.entries.length, 0);
    assert.equal(defaultWeatherEntry.value, null);
  } finally {
    globalThis.fetch = original;
    delete globalThis.window;
  }
});
