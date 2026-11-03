import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHashHistory } from "vue-router";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import App from "./App.vue";
import PlannerView from "./views/PlannerView.vue";
import AlgorithmsView from "./views/AlgorithmsView.vue";
import SettingsView from "./views/SettingsView.vue";
import { i18n } from "./i18n.js";
import "./style.css";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/today" },
    ...["today", "tasks", "calendar"].map((mode) => ({
      path: `/${mode}`,
      component: PlannerView,
      props: { mode },
    })),
    { path: "/algorithms", component: AlgorithmsView },
    {
      path: "/statistics",
      component: () => import("./views/StatisticsView.vue"),
    },
    { path: "/settings", component: SettingsView },
    { path: "/weather", component: () => import("./views/WeatherView.vue") },
  ],
});
createApp(App)
  .use(createPinia())
  .use(router)
  .use(i18n)
  .use(ElementPlus)
  .mount("#app");
