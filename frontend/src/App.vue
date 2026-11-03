<script setup>
import FocusBar from "./components/FocusBar.vue";
import { computed, onMounted, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import zh from "element-plus/es/locale/lang/zh-cn";
import en from "element-plus/es/locale/lang/en";
import { requestState } from "./api.js";
import "./lib/drafts.js";
import { usePlanner } from "./store.js";
const { t, locale } = useI18n();
const store = usePlanner();
const language = computed(() => (locale.value === "zh" ? zh : en));
const links = [
  ["today", "◷"],
  ["tasks", "☷"],
  ["calendar", "▦"],
  ["algorithms", "⌘"],
  ["statistics", "▥"],
  ["weather", "☀"],
  ["settings", "⚙"],
];
async function load() {
  try {
    await store.load();
  } catch {}
}
let refreshTimer;
onMounted(() => {
  load();
  refreshTimer = setInterval(load, 60000);
});
onBeforeUnmount(() => clearInterval(refreshTimer));
</script>
<template>
  <el-config-provider :locale="language">
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">&gt;_</div>
          <div>{{ t("brand") }}<small>CODEPLAN</small></div>
        </div>
        <nav>
          <router-link
            v-for="[name, icon] in links"
            :key="name"
            :to="`/${name}`"
            :title="t(name)"
            :aria-label="t(name)"
            ><span class="nav-icon" aria-hidden="true">{{ icon }}</span
            >{{ t(name) }}</router-link
          >
        </nav>
        <div class="sidebar-note">
          <span
            class="status-dot"
            :class="{ offline: store.error || requestState.offline }"
          ></span
          >{{
            t(
              store.error || requestState.offline
                ? "disconnected"
                : requestState.pending
                  ? "writing"
                  : requestState.failed
                    ? "writeFailed"
                    : "connected",
            )
          }}
        </div>
      </aside>
      <main class="main-content">
        <div
          v-if="store.error"
          class="connection-card"
          :class="{ compact: store.settings }"
        >
          <span class="empty-symbol">⌁</span>
          <h2>{{ t("connectionError") }}</h2>
          <p>{{ t("connectionHint") }}</p>
          <el-button type="primary" @click="load">{{ t("retry") }}</el-button>
        </div>
        <div
          v-if="!store.settings && !store.error"
          class="loading-card"
          v-loading="true"
          :aria-label="t('operationRunning')"
        ></div>
        <router-view v-if="store.settings" />
        <FocusBar v-if="store.settings" />
      </main>
    </div>
  </el-config-provider>
</template>
