import { setCustomCategories } from "./lib/categories.js";
import { defineStore } from "pinia";
import { api, requestState } from "./api.js";
import { i18n } from "./i18n.js";
let loadSequence = 0;
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
export const usePlanner = defineStore("planner", {
  state: () => ({
    workspace: {},
    tasks: [],
    trash: [],
    problems: [],
    attempts: [],
    reflections: [],
    rules: [],
    settings: null,
    loading: false,
    error: "",
  }),
  actions: {
    async load() {
      this.loading = true;
      const sequence = ++loadSequence,
        revision = requestState.revision;
      try {
        const [
          tasks,
          problems,
          attempts,
          reflections,
          rules,
          settings,
          workspace,
          trash,
        ] = await Promise.all(
          [
            "tasks",
            "problems",
            "attempts",
            "reflections",
            "rules",
            "settings",
            "workspace",
            "trash",
          ].map((p) => api.get(`/${p}`)),
        );
        if (
          sequence !== loadSequence ||
          revision !== requestState.revision ||
          requestState.pending
        )
          return;
        this.error = "";
        setCustomCategories(
          workspace.extras.filter((r) => r.kind === "category"),
        );
        Object.assign(this, {
          workspace,
          trash: trash.map((task) => ({
            ...task,
            details: JSON.parse(
              workspace.extras.find(
                (row) => row.kind === "task" && row.recordId === task.id,
              ).payload,
            ),
          })),
          tasks: tasks.map((task) => ({
            ...task,
            details: JSON.parse(
              workspace.extras?.find(
                (row) => row.kind === "task" && row.recordId === task.id,
              )?.payload ||
                '{"deadlineDate":null,"deadlineTime":null,"subtasks":[],"deletedAt":null}',
            ),
          })),
          problems: problems.map((problem) => ({
            ...problem,
            details: JSON.parse(
              workspace.extras.find(
                (row) => row.kind === "problem" && row.recordId === problem.id,
              )?.payload ||
                '{"idea":"","timeComplexity":"","spaceComplexity":"","pitfalls":"","code":"","language":"text","favorite":false,"challenge":false}',
            ),
          })),
          attempts,
          reflections,
          rules: rules.map((rule) => ({
            ...rule,
            subtasks: JSON.parse(
              workspace.extras?.find(
                (row) => row.kind === "rule" && row.recordId === rule.id,
              )?.payload || '{"subtasks":[]}',
            ).subtasks,
          })),
          settings,
        });
        this.applyAppearance();
      } catch (e) {
        if (sequence === loadSequence) this.error = e.message;
        throw e;
      } finally {
        if (sequence === loadSequence) this.loading = false;
      }
    },
    applyAppearance() {
      if (!this.settings) return;
      i18n.global.locale.value = this.settings.language;
      document.documentElement.lang =
        this.settings.language === "zh" ? "zh-CN" : "en";
      document.documentElement.classList.toggle(
        "dark",
        this.settings.theme === "dark" ||
          (this.settings.theme === "system" && systemTheme.matches),
      );
      document.documentElement.dataset.color = this.settings.color;
    },
    async saveSettings(settings) {
      this.settings = await api.put("/settings", settings);
      this.applyAppearance();
      await this.load();
    },
  },
});
systemTheme.addEventListener("change", () => usePlanner().applyAppearance());
