import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deadlineState,
  plannedAfterDeadline,
  upcomingTasks,
} from "../frontend/src/lib/deadlines.js";
const task = {
  status: "todo",
  planDate: "2026-12-31",
  taskTime: null,
  details: { deadlineDate: "2026-12-31", deadlineTime: null },
};
test("date-only deadline lasts through local midnight and timed deadline uses exact minutes", () => {
  assert.equal(
    deadlineState(task, new Date("2026-12-31T23:59:59.999")),
    "deadlineToday",
  );
  assert.equal(
    deadlineState(task, new Date("2027-01-01T00:00:00")),
    "deadlineOverdue",
  );
  const timed = {
    ...task,
    details: { ...task.details, deadlineTime: "10:00" },
  };
  assert.equal(
    deadlineState(timed, new Date("2026-12-31T10:00:01")),
    "deadlineOverdue",
  );
  assert.equal(plannedAfterDeadline({ ...timed, taskTime: "11:00" }), true);
  assert.equal(plannedAfterDeadline(task), false);
  assert.equal(deadlineState({ ...task, status: "done" }), null);
});
test("upcoming spans year boundary, includes overdue and excludes completed or distant tasks", () => {
  const later = {
    ...task,
    id: "later",
    details: { deadlineDate: "2027-01-20" },
  };
  assert.deepEqual(
    upcomingTasks(
      [task, later, { ...task, status: "done" }],
      new Date("2027-01-01T12:00:00"),
    ),
    [task],
  );
  assert.equal(
    upcomingTasks([task, later], new Date("2027-01-01T12:00:00"), true).length,
    2,
  );
});
