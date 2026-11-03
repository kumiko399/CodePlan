import { calendarCells, dateKey, orderTasks } from "./dates.js";
import { deadlineState } from "./deadlines.js";
export const taskEmojis = [
  "📚",
  "🏫",
  "🧠",
  "📝",
  "📄",
  "🎯",
  "✍️",
  "💻",
  "🛠️",
  "🧩",
  "🐛",
  "🏃",
  "🏀",
  "🏠",
  "🧺",
  "🎭",
  "🎤",
  "🤝",
  "🎂",
  "🍽️",
  "🥗",
  "🌙",
  "😴",
  "📖",
  "📑",
  "💼",
  "👔",
];
export function compactMonth(month) {
  const cells = calendarCells(month);
  while (cells.length > 28 && cells.slice(-7).every((c) => !c.current))
    cells.splice(-7);
  return cells;
}
export function calendarMatches(task, filters) {
  return (
    (!filters.category || task.category === filters.category) &&
    (!filters.status || task.status === filters.status) &&
    (!filters.priority || task.priority === filters.priority) &&
    (!filters.hideDone || task.status !== "done")
  );
}
export function groupCalendar(tasks, filters) {
  const grouped = {};
  for (const task of orderTasks(
    tasks.filter((t) => calendarMatches(t, filters)),
  ))
    (grouped[task.planDate] ??= []).push(task);
  return grouped;
}
export function calendarOverdue(task, now = new Date()) {
  return calendarDelay(task, now) !== null;
}
// A missed explicit deadline takes precedence over an overdue plan date.
export function calendarDelay(task, now = new Date()) {
  if (task.status === "done") return null;
  if (deadlineState(task, now) === "deadlineOverdue") return "deadlineMissed";
  return task.planDate < dateKey(now) ? "planDelayed" : null;
}
export function calendarProgress(tasks) {
  const days = {};
  for (const task of tasks) {
    const day = (days[task.planDate] ??= { done: 0, total: 0 });
    day.total++;
    if (task.status === "done") day.done++;
  }
  return days;
}
