export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function localDateTime(date = new Date()) {
  return `${dateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:00`;
}
export function shiftDate(key, amount) {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}
export function calendarCells(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setDate(date.getDate() + index);
    return {
      day: dateKey(date),
      number: date.getDate(),
      current: date.getMonth() === month.getMonth(),
    };
  });
}
export function orderTasks(tasks) {
  const priority = { high: 0, medium: 1, low: 2 };
  return [...tasks].sort(
    (a, b) =>
      Number(a.status === "done") - Number(b.status === "done") ||
      priority[a.priority] - priority[b.priority] ||
      (a.taskTime || "99").localeCompare(b.taskTime || "99") ||
      a.title.localeCompare(b.title),
  );
}
