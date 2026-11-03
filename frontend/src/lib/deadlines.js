import { dateKey } from "./dates.js";
export function deadlineAt(task) {
  const d = task.details;
  return d?.deadlineDate
    ? new Date(
        `${d.deadlineDate}T${d.deadlineTime || "23:59"}:${d.deadlineTime ? "00" : "59.999"}`,
      )
    : null;
}
export function deadlineState(task, now = new Date()) {
  const end = deadlineAt(task);
  if (!end || task.status === "done") return null;
  if (now > end) return "deadlineOverdue";
  return task.details.deadlineDate === dateKey(now)
    ? "deadlineToday"
    : "deadlineFuture";
}
export function plannedAfterDeadline(task) {
  const end = deadlineAt(task);
  return (
    end && new Date(`${task.planDate}T${task.taskTime || "00:00"}:00`) > end
  );
}
export function upcomingTasks(tasks, now = new Date(), all = false) {
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  end.setHours(23, 59, 59, 999);
  return tasks
    .filter(
      (task) =>
        task.status !== "done" &&
        deadlineAt(task) &&
        (all || deadlineAt(task) <= end),
    )
    .sort((a, b) => deadlineAt(a) - deadlineAt(b));
}
