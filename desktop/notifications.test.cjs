const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { notificationPayload } = require("./notifications.cjs");
test("disabled reminders never produce a notification", () => {
  assert.equal(
    notificationPayload([{ title: "x" }], { remindersEnabled: false }),
    null,
  );
});
test("old reminders are summarized instead of flooding the desktop", () => {
  const result = notificationPayload(
    [{ title: "old", planDate: "2020-01-01", reminderTime: "08:00" }],
    { remindersEnabled: true, language: "en" },
  );
  assert.match(result.body, /1 planned tasks/);
});
test("a timely single reminder shows its task title", () => {
  const now = new Date(2026, 9, 22, 8, 0, 30);
  assert.equal(
    notificationPayload(
      [{ title: "Study Java", planDate: "2026-10-22", reminderTime: "08:00" }],
      { remindersEnabled: true, language: "en" },
      now,
    ).body,
    "Study Java",
  );
});
