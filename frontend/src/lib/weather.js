// Weather timestamps are UTC seconds; format in the selected city's IANA zone.
export function weatherSymbol(code, isDay = true) {
  if (code === 0) return [isDay ? "☀️" : "🌙", "weatherClear"];
  if ([1, 2].includes(code))
    return [isDay ? "🌤️" : "☁️", "weatherPartlyCloudy"];
  if (code === 3) return ["☁️", "weatherCloudy"];
  if ([45, 48].includes(code)) return ["🌫️", "weatherFog"];
  if ([51, 53, 55, 56, 57].includes(code)) return ["🌦️", "weatherDrizzle"];
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return ["🌧️", "weatherRain"];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ["🌨️", "weatherSnow"];
  if ([95, 96, 99].includes(code)) return ["⛈️", "weatherThunder"];
  return ["🌡️", "weatherUnknown"];
}
export function weatherDate(seconds, zone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(seconds * 1000));
}
const number = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
export function weatherNumber(value, suffix = "") {
  return number(value) === null ? "—" : Math.round(value) + suffix;
}
export function forecastRows(response, now = Date.now()) {
  if (!response?.data) return { hours: [], days: [], current: null };
  const d = response.data,
    zone = d.timezone;
  const today = weatherDate(now / 1000, zone);
  const hours = (d.hourly?.time || [])
    .map((time, i) => ({
      time,
      temp: number(d.hourly.temperature_2m?.[i]),
      code: number(d.hourly.weather_code?.[i]),
      rain: number(d.hourly.precipitation_probability?.[i]),
      day: d.hourly.is_day?.[i] !== 0,
    }))
    .filter(
      (r) =>
        Number.isFinite(r.time) &&
        r.time * 1000 >= now &&
        r.time * 1000 < now + 24 * 3600000,
    );
  const days = (d.daily?.time || [])
    .map((time, i) => ({
      time,
      temp: number(d.daily.temperature_2m_max?.[i]),
      min: number(d.daily.temperature_2m_min?.[i]),
      code: number(d.daily.weather_code?.[i]),
      rain: number(d.daily.precipitation_probability_max?.[i]),
    }))
    .filter(
      (r) => Number.isFinite(r.time) && weatherDate(r.time, zone) >= today,
    )
    .slice(0, 7);
  return { hours, days, current: d.current || null, zone };
}
export const popularCities = [
  ["北京", "Beijing", 39.9, 116.4],
  ["上海", "Shanghai", 31.23, 121.47],
  ["广州", "Guangzhou", 23.13, 113.26],
  ["深圳", "Shenzhen", 22.54, 114.06],
  ["杭州", "Hangzhou", 30.27, 120.15],
  ["南京", "Nanjing", 32.06, 118.8],
  ["武汉", "Wuhan", 30.59, 114.3],
  ["成都", "Chengdu", 30.57, 104.07],
  ["重庆", "Chongqing", 29.56, 106.55],
  ["西安", "Xi'an", 34.34, 108.94],
  ["长沙", "Changsha", 28.23, 112.94],
  ["郑州", "Zhengzhou", 34.75, 113.63],
  ["天津", "Tianjin", 39.13, 117.2],
  ["青岛", "Qingdao", 36.07, 120.38],
  ["香港", "Hong Kong", 22.32, 114.17],
  ["台北", "Taipei", 25.03, 121.57],
  ["东京", "Tokyo", 35.68, 139.69],
  ["首尔", "Seoul", 37.57, 126.98],
  ["新加坡", "Singapore", 1.35, 103.82],
  ["曼谷", "Bangkok", 13.76, 100.5],
  ["吉隆坡", "Kuala Lumpur", 3.14, 101.69],
  ["雅加达", "Jakarta", -6.21, 106.85],
  ["马尼拉", "Manila", 14.6, 120.98],
  ["悉尼", "Sydney", -33.87, 151.21],
  ["墨尔本", "Melbourne", -37.81, 144.96],
  ["奥克兰", "Auckland", -36.85, 174.76],
].map(([zh, en, latitude, longitude]) => ({ zh, en, latitude, longitude }));
