import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dateKey,
  calendarCells,
  shiftDate,
  orderTasks,
} from "../frontend/src/lib/dates.js";
test("calendar starts Monday, includes leap day, and never uses UTC dates", () => {
  const cells = calendarCells(new Date(2024, 1, 1, 12));
  assert.equal(cells.length, 42);
  assert.equal(new Date(`${cells[0].day}T12:00:00`).getDay(), 1);
  assert.ok(cells.some((c) => c.day === "2024-02-29" && c.current));
  assert.equal(dateKey(new Date(2026, 9, 22, 0, 1)), "2026-10-22");
  assert.equal(shiftDate("2024-03-01", -1), "2024-02-29");
});
test("unfinished high-priority work precedes completed work", () => {
  const task = (title, status, priority, taskTime) => ({
    title,
    status,
    priority,
    taskTime,
  });
  assert.deepEqual(
    orderTasks([
      task("done", "done", "high", "08:00"),
      task("low", "todo", "low", "07:00"),
      task("high", "todo", "high", "09:00"),
    ]).map((t) => t.title),
    ["high", "low", "done"],
  );
});
