import test from "node:test";
import assert from "node:assert/strict";
import {
  getAlmanac,
  validAlmanacDay,
  calendarSelection,
} from "../frontend/src/lib/almanac.js";
import { shiftDate } from "../frontend/src/lib/dates.js";

test("lunar dates match HKO 2023/2024 calendar tables", () => {
  // Independent tables: https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2023.pdf and 2024.pdf
  assert.equal(getAlmanac("2024-02-09").lunar, "二〇二三年 腊月三十");
  assert.equal(getAlmanac("2024-02-10").lunar, "二〇二四年 正月初一");
  assert.equal(getAlmanac("2023-03-22").lunar, "二〇二三年 闰二月初一");
  assert.equal(getAlmanac("2024-02-29").lunar, "二〇二四年 正月二十");
});
test("civil date validation and year/month limits", () => {
  for (const d of ["1901-01-01", "2099-12-31", "2024-02-29"]) {
    assert.ok(validAlmanacDay(d));
    assert.equal(getAlmanac(d).error, null);
  }
  for (const d of [
    "1900-12-31",
    "2100-01-01",
    "2023-02-29",
    "2024-13-01",
    "",
    null,
  ]) {
    assert.equal(validAlmanacDay(d), false);
    assert.equal(getAlmanac(d).error, "range");
  }
  assert.equal(shiftDate("2024-02-29", 1), "2024-03-01");
  assert.equal(shiftDate("2024-12-31", 1), "2025-01-01");
});
test("daily sect is fixed, no-data is preserved and failure does not invent results", () => {
  const calls = [];
  const factory = () => ({
    getLunar: () => ({
      getYearInChinese: () => "年",
      getMonthInChinese: () => "月",
      getDayInChinese: () => "日",
      getDayYi: (s) => (calls.push(s), ["无"]),
      getDayJi: (s) => (calls.push(s), ["无"]),
    }),
  });
  assert.deepEqual(getAlmanac("2024-02-10", factory).yi, ["无"]);
  assert.deepEqual(calls, [1, 1]);
  for (const missing of [[], null, [""]]) {
    const incomplete = () => {
      const value = factory().getLunar();
      value.getDayYi = () => missing;
      return { getLunar: () => value };
    };
    const result = getAlmanac("2024-02-10", incomplete);
    assert.equal(result.error, "unavailable");
    assert.deepEqual(result.yi, []);
    assert.deepEqual(result.ji, []);
  }
  assert.deepEqual(getAlmanac("2024-02-10"), getAlmanac("2024-02-10"));
  assert.notDeepEqual(getAlmanac("2024-02-10").yi, getAlmanac("2024-02-11").yi);
  assert.equal(
    getAlmanac("2024-02-10", () => {
      throw Error("unavailable");
    }).error,
    "unavailable",
  );
  assert.deepEqual(
    getAlmanac("2024-02-10", () => ({ getLunar: () => null })).ji,
    [],
  );
});
test("midnight and wake follow today only when opted into today", () => {
  const after = new Date(2024, 1, 11, 0, 0, 1);
  assert.equal(calendarSelection("2024-02-10", true, after), "2024-02-11");
  assert.equal(calendarSelection("2024-02-10", false, after), "2024-02-10");
  assert.equal(
    calendarSelection("2024-02-10", true, new Date(2024, 2, 1, 12)),
    "2024-03-01",
  );
});
