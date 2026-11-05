import lunar from "lunar-javascript";
import { dateKey } from "./dates.js";

export const MIN_DAY = "1901-01-01";
export const MAX_DAY = "2099-12-31";
export function validAlmanacDay(day) {
  if (
    typeof day !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    day < MIN_DAY ||
    day > MAX_DAY
  )
    return false;
  const date = new Date(`${day}T12:00:00`);
  return Number.isFinite(date.getTime()) && dateKey(date) === day;
}
export function calendarSelection(selected, followingToday, now = new Date()) {
  return followingToday ? dateKey(now) : selected;
}
// Interpret civil dates at noon, independent of UTC parsing or the 23:00 hour boundary.
export function getAlmanac(day, solarFactory = lunar.Solar.fromYmd) {
  if (!validAlmanacDay(day))
    return { date: day, error: "range", yi: [], ji: [] };
  const [year, month, date] = day.split("-").map(Number);
  const base = {
    date: day,
    year,
    month,
    day: date,
    weekday: new Date(year, month - 1, date, 12).getDay(),
  };
  try {
    const l = solarFactory(year, month, date).getLunar();
    const list = (v) => {
      if (
        !Array.isArray(v) ||
        !v.length ||
        v.some((x) => typeof x !== "string" || !x.trim())
      )
        throw Error("Missing almanac data");
      return [...new Set(v)];
    };
    return {
      ...base,
      lunar: `${l.getYearInChinese()}年 ${l.getMonthInChinese()}月${l.getDayInChinese()}`,
      yi: list(l.getDayYi(1)),
      ji: list(l.getDayJi(1)),
      error: null,
    };
  } catch {
    return { ...base, error: "unavailable", yi: [], ji: [] };
  }
}
