function notificationPayload(tasks, settings, now = new Date()) {
  if (!settings.remindersEnabled || !tasks.length) return null;
  const zh = settings.language === "zh";
  const overdue = tasks.some(
    (t) =>
      new Date(`${t.planDate}T${t.reminderTime}:00`).getTime() <
      now.getTime() - 120000,
  );
  if (tasks.length > 1 || overdue)
    return {
      title: zh ? "计划提醒" : "Plan reminder",
      body: zh
        ? `有 ${tasks.length} 项计划待处理，打开应用查看。`
        : `${tasks.length} planned tasks are waiting. Open the app to view them.`,
    };
  return { title: zh ? "计划提醒" : "Plan reminder", body: tasks[0].title };
}
module.exports = { notificationPayload };
