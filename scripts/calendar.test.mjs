import test from "node:test";
import assert from "node:assert/strict";
import {
  compactMonth,
  groupCalendar,
  calendarOverdue,
  taskEmojis,
  calendarDelay,
  calendarProgress,
} from "../frontend/src/lib/calendar.js";
import fs from "node:fs";
test("plan delay and missed deadlines remain distinct at local date boundaries", () => {
  const now = new Date("2026-10-26T12:00:00");
  const delayed = { status: "todo", planDate: "2026-10-25" };
  assert.equal(calendarDelay(delayed, now), "planDelayed");
  assert.equal(
    calendarDelay({ ...delayed, details: { deadlineDate: "2026-10-27" } }, now),
    "planDelayed",
  );
  const missed = {
    ...delayed,
    details: { deadlineDate: "2026-10-26", deadlineTime: "11:59" },
  };
  assert.equal(calendarDelay(missed, now), "deadlineMissed");
  assert.equal(
    calendarDelay({ ...missed, planDate: "2026-10-28" }, now),
    "deadlineMissed",
  );
  assert.equal(calendarDelay({ ...missed, status: "done" }, now), null);
  assert.equal(
    calendarDelay({ ...delayed, planDate: "2026-10-26" }, now),
    null,
  );
  assert.equal(
    calendarDelay(
      {
        ...missed,
        planDate: "2026-10-26",
        details: { deadlineDate: "2026-10-26" },
      },
      now,
    ),
    null,
  );
  assert.equal(calendarDelay(delayed, new Date("2026-10-25T23:59:59")), null);
  assert.equal(
    calendarDelay(delayed, new Date("2026-10-26T00:00:00")),
    "planDelayed",
  );
});
test("daily completion aggregates all categories and statuses independently of display filters", () => {
  const tasks = [
    { planDate: "2026-10-26", status: "done", category: "study" },
    { planDate: "2026-10-26", status: "doing", category: "sport" },
    { planDate: "2026-10-26", status: "todo", category: "study" },
    { planDate: "2026-10-27", status: "done", category: "study" },
  ];
  assert.deepEqual(calendarProgress(tasks), {
    "2026-10-26": { done: 1, total: 3 },
    "2026-10-27": { done: 1, total: 1 },
  });
  assert.deepEqual(calendarProgress([]), {});
});
test("month has complete weeks and no unnecessary trailing week", () => {
  for (let m = 0; m < 12; m++) {
    const cells = compactMonth(new Date(2026, m, 1));
    assert.equal(cells.length % 7, 0);
    assert.equal(new Date(cells[0].day + "T12:00:00").getDay(), 1);
    assert.ok(cells.slice(-7).some((c) => c.current));
    assert.equal(
      cells.filter((c) => c.current).length,
      new Date(2026, m + 1, 0).getDate(),
    );
  }
  assert.equal(compactMonth(new Date(2026, 1, 1)).length, 35);
});
test("calendar and detail filters keep identical tasks and unfinished tasks come first", () => {
  const tasks = [
    {
      id: "done",
      planDate: "2026-10-26",
      category: "study",
      priority: "high",
      status: "done",
      title: "done",
    },
    {
      id: "todo",
      planDate: "2026-10-26",
      category: "study",
      priority: "low",
      status: "todo",
      title: "todo",
    },
    {
      id: "sport",
      planDate: "2026-10-27",
      category: "sport",
      priority: "high",
      status: "todo",
      title: "sport",
    },
  ];
  assert.deepEqual(
    groupCalendar(tasks, {})["2026-10-26"].map((t) => t.id),
    ["todo", "done"],
  );
  assert.deepEqual(
    Object.values(groupCalendar(tasks, { category: "study", hideDone: true }))
      .flat()
      .map((t) => t.id),
    ["todo"],
  );
  assert.deepEqual(
    groupCalendar(tasks, { status: "done", hideDone: true }),
    {},
  );
});
test("deadline and planned-date overdue indicators never mark completed tasks", () => {
  const now = new Date("2026-10-26T12:00:00");
  assert.equal(
    calendarOverdue(
      {
        status: "todo",
        planDate: "2026-10-26",
        details: { deadlineDate: "2026-10-26", deadlineTime: "11:00" },
      },
      now,
    ),
    true,
  );
  assert.equal(
    calendarOverdue({ status: "done", planDate: "2026-10-25" }, now),
    false,
  );
  assert.equal(
    calendarOverdue({ status: "todo", planDate: "2026-10-27" }, now),
    false,
  );
});
test("task emoji choices are accepted by the backend contract", () => {
  const source = fs.readFileSync(
    new URL(
      "../backend/src/main/java/dev/codeplan/service/PlannerService.java",
      import.meta.url,
    ),
    "utf8",
  );
  for (const emoji of taskEmojis) assert.ok(source.includes('"' + emoji + '"'));
});
