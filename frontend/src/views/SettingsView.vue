<script setup>
import DesktopSettings from "../components/DesktopSettings.vue";
import WeatherSettings from "../components/WeatherSettings.vue";
import CategoryManager from "../components/CategoryManager.vue";
import FocusSettings from "../components/FocusSettings.vue";
import { reactive, ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import { usePlanner } from "../store.js";
import { api, request } from "../api.js";
import { showError, confirmAction } from "../lib/feedback.js";
import { categories, categoryLabel } from "../lib/categories.js";
const { t } = useI18n(),
  store = usePlanner(),
  form = reactive({ ...store.settings }),
  backups = ref([]),
  busy = ref(false),
  preview = ref(null),
  fileInput = ref(null),
  maintenance = ref({}),
  ruleDialog = ref(false),
  rule = reactive({});
const desktop = !!window.codeplan;
async function loadBackups() {
  try {
    backups.value = await api.get("/backups");
    maintenance.value = await api.get("/maintenance");
  } catch (e) {
    showError(e);
  }
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  try {
    await store.saveSettings(form);
    Object.assign(form, store.settings);
    ElMessage.success(t("saved"));
    await loadBackups();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
async function choose() {
  const directory = await window.codeplan.chooseDirectory();
  if (directory) {
    form.backupDirectory = directory;
    await save();
  }
}
async function openDirectory() {
  try {
    await window.codeplan.openBackupDirectory();
  } catch (e) {
    showError(e);
  }
}
async function notifyTest() {
  const result = await window.codeplan.testNotification();
  ElMessage.info(t(result ? "notificationReady" : "notificationUnsupported"));
}
async function backup() {
  busy.value = true;
  try {
    await api.post("/backups");
    await loadBackups();
    ElMessage.success(t("backupCreated"));
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
async function download(name) {
  try {
    const blob = await request(`/backups/${name}`, { blob: true });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    showError(e);
  }
}
async function selectFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  busy.value = true;
  try {
    const body = new FormData();
    body.append("file", file);
    preview.value = await api.post("/restore/preview", body);
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
async function restore() {
  busy.value = true;
  try {
    await api.post("/restore", { token: preview.value.token });
    preview.value = null;
    await store.load();
    Object.assign(form, store.settings);
    await loadBackups();
    ElMessage.success(t("restored"));
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
function editRule(value) {
  Object.assign(rule, value, {
    weekdays: value.weekdays.split(",").filter(Boolean),
  });
  ruleDialog.value = true;
}
async function saveRule() {
  busy.value = true;
  try {
    await api.put(`/rules/${rule.id}`, {
      ...rule,
      problemId: rule.category === "algorithm" ? rule.problemId : null,
      weekdays: rule.weekdays.join(","),
    });
    ruleDialog.value = false;
    await store.load();
    ElMessage.success(t("saved"));
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
async function stopRule(value) {
  if (!(await confirmAction(t("stopRulePrompt")))) return;
  try {
    await api.put(`/rules/${value.id}`, { ...value, active: false });
    await store.load();
  } catch (e) {
    showError(e);
  }
}
onMounted(loadBackups);
</script>
<template>
  <header class="page-header">
    <div>
      <p class="eyebrow">MAKE IT YOURS</p>
      <h1>{{ t("settings") }}</h1>
      <p>{{ t("settingsSubtitle") }}</p>
    </div>
  </header>
  <div class="settings-layout">
    <DesktopSettings />
    <WeatherSettings />
    <FocusSettings />
    <CategoryManager />
    <section class="panel">
      <h2>{{ t("appearance") }}</h2>
      <div class="setting-row">
        <label>{{ t("language") }}</label
        ><el-select v-model="form.language" :disabled="busy" @change="save"
          ><el-option value="zh" label="简体中文" /><el-option
            value="en"
            label="English"
        /></el-select>
      </div>
      <div class="setting-row">
        <label>{{ t("theme") }}</label
        ><el-radio-group v-model="form.theme" :disabled="busy" @change="save"
          ><el-radio-button
            v-for="theme in ['light', 'dark', 'system']"
            :key="theme"
            :value="theme"
            >{{ t(theme) }}</el-radio-button
          ></el-radio-group
        >
      </div>
      <div class="setting-row">
        <label>{{ t("color") }}</label>
        <div class="swatches">
          <button
            v-for="color in ['blue', 'green', 'purple', 'orange']"
            :key="color"
            class="swatch"
            :class="[color, { selected: form.color === color }]"
            :aria-label="t(color)"
            :disabled="busy"
            @click="
              form.color = color;
              save();
            "
          >
            {{ form.color === color ? "✓" : "" }}
          </button>
        </div>
      </div>
    </section>
    <section class="panel">
      <h2>{{ t("automation") }}</h2>
      <div class="setting-row">
        <div>
          <label>{{ t("repeatEnabled") }}</label>
          <p class="hint">{{ t("repeatHint") }}</p>
        </div>
        <el-switch
          v-model="form.repeatEnabled"
          :disabled="busy"
          :aria-label="t('repeatEnabled')"
          @change="save"
        />
      </div>
      <div class="setting-row">
        <div>
          <label>{{ t("remindersEnabled") }}</label>
          <p class="hint">{{ t("reminderHint") }}</p>
        </div>
        <el-switch
          v-model="form.remindersEnabled"
          :disabled="busy"
          :aria-label="t('remindersEnabled')"
          @change="save"
        />
      </div>
      <el-button v-if="desktop" @click="notifyTest">{{
        t("notificationPermission")
      }}</el-button>
      <p v-else class="hint">{{ t("desktopOnly") }}</p>
      <h3>{{ t("rules") }}</h3>
      <p v-if="!store.rules.length" class="hint">{{ t("noRules") }}</p>
      <div v-for="r in store.rules" :key="r.id" class="rule-row">
        <div>
          <b>{{ r.title }}</b
          ><small
            >{{ t(r.frequency) }} ·
            {{ t(r.active ? "active" : "paused") }}</small
          >
        </div>
        <el-button text @click="editRule(r)">{{ t("edit") }}</el-button
        ><el-button v-if="r.active" text type="danger" @click="stopRule(r)">{{
          t("stopRule")
        }}</el-button>
      </div>
    </section>
    <section class="panel backup-panel">
      <h2>{{ t("backup") }}</h2>
      <el-alert
        v-if="maintenance.error"
        :title="t('maintenanceError')"
        type="warning"
        :closable="false"
      /><label>{{ t("backupDirectory") }}</label>
      <div class="directory-row">
        <el-input
          v-model="form.backupDirectory"
          :placeholder="maintenance.backupDirectory || t('defaultDirectory')"
          :disabled="busy"
        /><el-button v-if="desktop" :disabled="busy" @click="choose">{{
          t("chooseDirectory")
        }}</el-button
        ><el-button :disabled="busy" @click="save">{{ t("save") }}</el-button
        ><el-button v-if="desktop" @click="openDirectory">{{
          t("openDirectory")
        }}</el-button>
      </div>
      <div class="setting-row">
        <div>
          <label>{{ t("autoBackup") }}</label>
          <p class="hint">{{ t("backupHint") }}</p>
        </div>
        <el-switch
          v-model="form.autoBackup"
          :disabled="busy"
          :aria-label="t('autoBackup')"
          @change="save"
        />
      </div>
      <div class="backup-actions">
        <el-button type="primary" :loading="busy" @click="backup">{{
          t("backupNow")
        }}</el-button
        ><el-button :disabled="busy" @click="fileInput.click()">{{
          t("restore")
        }}</el-button
        ><input
          ref="fileInput"
          type="file"
          accept=".zip"
          hidden
          @change="selectFile"
        />
      </div>
      <h3>{{ t("backupList") }}</h3>
      <p v-if="!backups.length" class="hint">{{ t("noBackups") }}</p>
      <div class="backup-files">
        <div v-for="file in backups" :key="file.name" class="backup-file">
          <code>{{ file.name }}</code
          ><small>{{ (file.size / 1024).toFixed(1) }} KB</small
          ><el-button text @click="download(file.name)">{{
            t("download")
          }}</el-button>
        </div>
      </div>
    </section>
    <section class="panel">
      <h2>{{ t("about") }}</h2>
      <p>{{ t("brand") }} · {{ t("version") }}</p>
      <p class="hint">{{ t("aboutText") }}</p>
    </section>
  </div>
  <el-dialog
    :model-value="!!preview"
    :title="t('restorePreview')"
    width="560px"
    :close-on-click-modal="false"
    :show-close="!busy"
    :before-close="
      (done) => {
        if (!busy) {
          preview = null;
          done();
        }
      }
    "
    ><template v-if="preview"
      ><el-alert
        :title="t('restoreWarning')"
        type="warning"
        :closable="false"
      />
      <p>{{ t("backupDate") }}：{{ preview.createdAt.replace("T", " ") }}</p>
      <div class="restore-counts">
        <span
          >{{ t("tasks") }} <b>{{ preview.tasks }}</b></span
        ><span
          >{{ t("problemLibrary") }} <b>{{ preview.problems }}</b></span
        ><span
          >{{ t("attempts") }} <b>{{ preview.attempts }}</b></span
        ><span
          >{{ t("reflection") }} <b>{{ preview.reflections }}</b></span
        >
      </div></template
    ><template #footer
      ><el-button :disabled="busy" @click="preview = null">{{
        t("cancel")
      }}</el-button
      ><el-button type="danger" :loading="busy" @click="restore">{{
        t("restoreConfirm")
      }}</el-button></template
    ></el-dialog
  >
  <el-dialog
    v-model="ruleDialog"
    :title="t('rules')"
    width="580px"
    :close-on-click-modal="false"
    ><el-form label-position="top"
      ><el-form-item :label="t('title')"
        ><el-input v-model="rule.title" maxlength="100"
      /></el-form-item>
      <div class="form-grid">
        <el-form-item :label="t('category')"
          ><el-select v-model="rule.category"
            ><el-option
              v-for="c in categories"
              :key="c.id"
              :value="c.id"
              :label="categoryLabel(c.id, t)"
              :disabled="
                !c.active && c.id !== rule.category
              " /></el-select></el-form-item
        ><el-form-item :label="t('priority')"
          ><el-select v-model="rule.priority"
            ><el-option
              v-for="p in ['high', 'medium', 'low']"
              :key="p"
              :value="p"
              :label="t(p)" /></el-select
        ></el-form-item>
      </div>
      <div class="form-grid">
        <el-form-item :label="t('from')"
          ><el-date-picker
            v-model="rule.startDate"
            value-format="YYYY-MM-DD" /></el-form-item
        ><el-form-item :label="t('endDate')"
          ><el-date-picker v-model="rule.endDate" value-format="YYYY-MM-DD"
        /></el-form-item>
      </div>
      <el-form-item :label="t('repeat')"
        ><el-select v-model="rule.frequency"
          ><el-option
            v-for="f in ['daily', 'weekly']"
            :key="f"
            :value="f"
            :label="t(f)" /></el-select></el-form-item
      ><el-checkbox-group
        v-if="rule.frequency === 'weekly'"
        v-model="rule.weekdays"
        ><el-checkbox-button
          v-for="(d, i) in [
            'monday',
            'tuesday',
            'wednesday',
            'thursday',
            'friday',
            'saturday',
            'sunday',
          ]"
          :key="d"
          :value="String(i + 1)"
          >{{ t(d) }}</el-checkbox-button
        ></el-checkbox-group
      >
      <div class="form-grid">
        <el-form-item :label="t('time')"
          ><el-time-picker
            v-model="rule.taskTime"
            value-format="HH:mm"
            format="HH:mm" /></el-form-item
        ><el-form-item :label="t('reminder')"
          ><el-time-picker
            v-model="rule.reminderTime"
            value-format="HH:mm"
            format="HH:mm"
        /></el-form-item>
      </div>
      <el-form-item :label="t('notes')"
        ><el-input
          v-model="rule.notes"
          type="textarea"
          maxlength="20000" /></el-form-item
      ><el-switch v-model="rule.active" :active-text="t('active')" />
      <p class="hint">{{ t("ruleNote") }}</p></el-form
    ><template #footer
      ><el-button @click="ruleDialog = false">{{ t("cancel") }}</el-button
      ><el-button type="primary" :loading="busy" @click="saveRule">{{
        t("save")
      }}</el-button></template
    ></el-dialog
  >
</template>
