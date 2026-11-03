<script setup>
import { reactive, ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import { usePlanner } from "../store.js";
import { api, openLink } from "../api.js";
import { localDateTime } from "../lib/dates.js";
import { showError, confirmAction } from "../lib/feedback.js";
import CodePreview from "../components/CodePreview.vue";
import { tagsOf, filterProblems } from "../lib/problem-filters.js";
import TaskEditor from "../components/TaskEditor.vue";
import { useDraft } from "../lib/drafts.js";
import DraftNotice from "../components/DraftNotice.vue";
const store = usePlanner(),
  { t } = useI18n();
const tab = ref("library"),
  search = ref(""),
  difficulty = ref(""),
  problemDialog = ref(false),
  attemptDialog = ref(false),
  busy = ref(false),
  taskDialog = ref(false),
  planning = ref(null);
const problem = reactive({}),
  attempt = reactive({}),
  original = ref("");
const problemValue = computed({
  get: () => problem,
  set: (value) => Object.assign(problem, value),
});
const problemDraft = useDraft(problemValue, () => store.workspace);
const passedIds = computed(
  () =>
    new Set(
      store.attempts
        .filter((a) => a.result === "passed")
        .map((a) => a.problemId),
    ),
);
const selectedTags = ref([]),
  favorite = ref(false),
  challenge = ref(false),
  passed = ref("");
const availableTags = computed(() =>
  [...new Set(store.problems.flatMap(tagsOf))].sort(),
);
const visible = computed(() =>
  filterProblems(
    store.problems,
    {
      search: search.value,
      difficulty: difficulty.value,
      tags: selectedTags.value,
      favorite: favorite.value,
      challenge: challenge.value,
      passed: passed.value,
    },
    passedIds.value,
  ),
);
const filtering = computed(
  () =>
    search.value ||
    difficulty.value ||
    selectedTags.value.length ||
    favorite.value ||
    challenge.value ||
    passed.value,
);
function clearFilters() {
  search.value = difficulty.value = passed.value = "";
  selectedTags.value = [];
  favorite.value = challenge.value = false;
}
async function mark(p, field) {
  if (busy.value) return;
  busy.value = true;
  try {
    await api.put("/problems/" + p.id, {
      ...p,
      details: { ...p.details, [field]: !p.details[field] },
    });
    await store.load();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
const relatedTasks = computed(() =>
  store.tasks.filter((task) => task.problemId === attempt.problemId),
);
async function editProblem(p) {
  Object.keys(problem).forEach((k) => delete problem[k]);
  Object.assign(
    problem,
    {
      details: {
        idea: "",
        timeComplexity: "",
        spaceComplexity: "",
        pitfalls: "",
        code: "",
        language: "text",
        favorite: false,
        challenge: false,
      },
      platform: "力扣中国",
      number: "",
      title: "",
      url: "",
      difficulty: "unset",
      tags: "",
      notes: "",
    },
    JSON.parse(JSON.stringify(p || {})),
  );
  original.value = JSON.stringify(problem);
  problemDialog.value = true;
  await problemDraft.begin(`problem:${p?.id || "new"}`);
}
function editAttempt(p, a) {
  Object.keys(attempt).forEach((k) => delete attempt[k]);
  Object.assign(
    attempt,
    {
      problemId: p.id,
      taskId: null,
      attemptedAt: localDateTime(),
      result: "passed",
      minutes: null,
      notes: "",
    },
    a || {},
  );
  original.value = JSON.stringify(attempt);
  attemptDialog.value = true;
}
async function closeDialog(type, done) {
  if (busy.value) return;
  const current = type === "problem" ? problem : attempt;
  if (
    JSON.stringify(current) !== original.value &&
    !(await confirmAction(
      t(type === "problem" ? "keepEditingDraft" : "unsaved"),
    ))
  )
    return;
  if (type === "problem") {
    try {
      await problemDraft.leave();
    } catch (e) {
      return showError(e);
    }
    problemDialog.value = false;
  } else attemptDialog.value = false;
  if (typeof done === "function") done();
}
async function saveProblem() {
  if (busy.value || problemDraft.pending.value) return;
  if (!problem.title?.trim() || !problem.platform?.trim())
    return ElMessage.warning(t("required"));
  busy.value = true;
  try {
    if (problem.id) await api.put(`/problems/${problem.id}`, problem);
    else await api.post("/problems", problem);
    await problemDraft.committed();
    problemDialog.value = false;
    ElMessage.success(t("saved"));
    await store.load();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
async function saveAttempt() {
  if (busy.value) return;
  if (!attempt.attemptedAt) return ElMessage.warning(t("required"));
  busy.value = true;
  try {
    if (attempt.id)
      await api.put(`/attempts/${attempt.id}`, {
        ...attempt,
        taskId: attempt.taskId || null,
      });
    else
      await api.post("/attempts", {
        ...attempt,
        taskId: attempt.taskId || null,
      });
    attemptDialog.value = false;
    ElMessage.success(t("saved"));
    await store.load();
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
async function remove(path) {
  if (!(await confirmAction(t("deletePrompt")))) return;
  try {
    await api.delete(path);
    await store.load();
  } catch (e) {
    showError(e);
  }
}
function plan(p) {
  planning.value = p;
  taskDialog.value = true;
}
function problemFor(id) {
  return store.problems.find((p) => p.id === id);
}
</script>
<template>
  <header class="page-header">
    <div>
      <p class="eyebrow">ALGORITHM PRACTICE</p>
      <h1>{{ t("algorithms") }}</h1>
      <p>{{ t("algorithmsSubtitle") }}</p>
    </div>
    <el-button type="primary" size="large" @click="editProblem()"
      >＋ {{ t("addProblem") }}</el-button
    >
  </header>
  <div class="summary-grid">
    <div class="summary-card">
      <span>{{ t("problemLibrary") }}</span
      ><strong>{{ store.problems.length }}</strong>
    </div>
    <div class="summary-card">
      <span>{{ t("attempts") }}</span
      ><strong>{{ store.attempts.length }}</strong>
    </div>
    <div class="summary-card">
      <span>{{ t("passedProblems") }}</span
      ><strong>{{ passedIds.size }}<small class="accent">✓</small></strong>
    </div>
  </div>
  <section class="panel">
    <div class="section-header">
      <el-radio-group v-model="tab"
        ><el-radio-button value="library">{{
          t("problemLibrary")
        }}</el-radio-button
        ><el-radio-button value="attempts">{{
          t("attemptHistory")
        }}</el-radio-button></el-radio-group
      ><span class="hint">{{ t("manualOnly") }}</span>
    </div>
    <template v-if="tab === 'library'"
      ><div class="filters">
        <el-input
          v-model="search"
          clearable
          :placeholder="t('search')"
        /><el-select
          v-model="difficulty"
          clearable
          :placeholder="t('difficulty')"
          ><el-option
            v-for="d in ['easy', 'medium', 'hard', 'unset']"
            :key="d"
            :value="d"
            :label="t(d)"
        /></el-select>
      </div>
      <div class="filters">
        <el-select
          v-model="selectedTags"
          multiple
          collapse-tags
          :placeholder="t('tags')"
          ><el-option value="none:" :label="t('untagged')" /><el-option
            v-for="tag in availableTags"
            :key="tag"
            :value="'tag:' + tag"
            :label="tag"
        /></el-select>
        <el-checkbox v-model="favorite">⭐ {{ t("favorite") }}</el-checkbox
        ><el-checkbox v-model="challenge">🎯 {{ t("challenge") }}</el-checkbox>
        <el-select v-model="passed" clearable :placeholder="t('passedFilter')"
          ><el-option value="yes" :label="t('passed')" /><el-option
            value="no"
            :label="t('notPassed')"
        /></el-select>
      </div>
      <p class="hint">{{ t("anyTag") }}</p>
      <div v-if="filtering" class="filter-feedback">
        <span
          >{{ t("matching", { count: visible.length }) }} · {{ search }}
          {{ difficulty ? t(difficulty) : "" }}
          {{
            selectedTags
              .map((tag) => (tag === "none:" ? t("untagged") : tag.slice(4)))
              .join(" / ")
          }}
          {{ favorite ? t("favorite") : "" }}
          {{ challenge ? t("challenge") : "" }}
          {{ passed ? t(passed === "yes" ? "passed" : "notPassed") : "" }}</span
        ><el-button text @click="clearFilters">{{
          t("resetFilters")
        }}</el-button>
      </div>
      <div v-if="!visible.length" class="empty-state">
        <div class="empty-symbol">&lt;/&gt;</div>
        <h3>{{ t(filtering ? "noProblemMatches" : "noProblems") }}</h3>
        <p>{{ t("noProblemsHint") }}</p>
      </div>
      <article v-for="p in visible" :key="p.id" class="problem-row">
        <div class="problem-check" :class="{ solved: passedIds.has(p.id) }">
          {{ passedIds.has(p.id) ? "✓" : "⌘" }}
        </div>
        <div class="problem-body">
          <h3>{{ p.number ? `${p.number}. ` : "" }}{{ p.title }}</h3>
          <div class="task-meta">
            <span>{{ p.platform }}</span
            ><span class="difficulty" :class="p.difficulty">{{
              t(p.difficulty)
            }}</span
            ><span
              v-for="tag in (p.tags || '').split(/[,，]/).filter(Boolean)"
              :key="tag"
              class="tag"
              >{{ tag }}</span
            >
          </div>
          <p v-if="p.notes" class="notes-preview">
            {{ p.notes.slice(0, 130) }}
          </p>
        </div>
        <div class="row-actions">
          <el-button
            :disabled="busy"
            text
            :type="p.details.favorite ? 'warning' : 'default'"
            @click="mark(p, 'favorite')"
            >{{ p.details.favorite ? "★" : "☆" }} {{ t("favorite") }}</el-button
          >
          <el-button
            :disabled="busy"
            text
            :type="p.details.challenge ? 'danger' : 'default'"
            @click="mark(p, 'challenge')"
            >🎯 {{ t("challenge") }}</el-button
          >
          <el-button v-if="p.url" text @click="openLink(p.url)"
            >{{ t("openProblem") }} ↗</el-button
          ><el-button text @click="editProblem(p)">{{ t("edit") }}</el-button
          ><el-button text type="danger" @click="remove(`/problems/${p.id}`)">{{
            t("delete")
          }}</el-button
          ><el-button plain @click="plan(p)">{{ t("planProblem") }}</el-button
          ><el-button type="primary" plain @click="editAttempt(p)">{{
            t("recordAttempt")
          }}</el-button>
        </div>
      </article>
    </template>
    <template v-else
      ><div v-if="!store.attempts.length" class="empty-state">
        <div class="empty-symbol">⌘</div>
        <h3>{{ t("noAttempts") }}</h3>
      </div>
      <article v-for="a in store.attempts" :key="a.id" class="problem-row">
        <span class="result-mark" :class="a.result">{{
          a.result === "passed" ? "✓" : "○"
        }}</span>
        <div class="problem-body">
          <h3>{{ problemFor(a.problemId)?.title }}</h3>
          <div class="task-meta">
            <span>{{ a.attemptedAt.replace("T", " ") }}</span
            ><span :class="a.result">{{ t(a.result) }}</span
            ><span v-if="a.minutes != null">{{ a.minutes }} min</span>
          </div>
          <pre v-if="a.notes" class="notes-preview">{{ a.notes }}</pre>
        </div>
        <el-button text @click="editAttempt(problemFor(a.problemId), a)">{{
          t("edit")
        }}</el-button
        ><el-button text type="danger" @click="remove(`/attempts/${a.id}`)">{{
          t("delete")
        }}</el-button>
      </article></template
    >
  </section>
  <el-dialog
    v-model="problemDialog"
    :title="t(problem.id ? 'editProblem' : 'addProblem')"
    width="640px"
    :before-close="(done) => closeDialog('problem', done)"
    :close-on-click-modal="false"
    ><DraftNotice :draft="problemDraft" /><el-form
      :disabled="busy || !!problemDraft.pending.value"
      label-position="top"
      ><div class="form-grid">
        <el-form-item :label="t('platform')" required
          ><el-input v-model="problem.platform" maxlength="80" /></el-form-item
        ><el-form-item :label="t('number')"
          ><el-input v-model="problem.number" maxlength="50"
        /></el-form-item>
      </div>
      <el-form-item :label="t('problemTitle')" required
        ><el-input v-model="problem.title" maxlength="200" /></el-form-item
      ><el-form-item :label="t('url')"
        ><el-input
          v-model="problem.url"
          maxlength="1000"
          placeholder="https://leetcode.cn/problems/..."
      /></el-form-item>
      <div class="form-grid">
        <el-form-item :label="t('difficulty')"
          ><el-select v-model="problem.difficulty"
            ><el-option
              v-for="d in ['easy', 'medium', 'hard', 'unset']"
              :key="d"
              :value="d"
              :label="t(d)" /></el-select></el-form-item
        ><el-form-item :label="t('tags')"
          ><el-input
            v-model="problem.tags"
            maxlength="1000"
            :placeholder="t('tagsHint')"
        /></el-form-item>
      </div>
      <el-form-item :label="t('problemNotes')"
        ><el-input
          v-model="problem.notes"
          type="textarea"
          :rows="7"
          maxlength="20000"
      /></el-form-item>
      <template v-if="problem.details">
        <el-form-item
          v-for="field in [
            'idea',
            'timeComplexity',
            'spaceComplexity',
            'pitfalls',
          ]"
          :key="field"
          :label="t(field)"
          ><el-input
            v-model="problem.details[field]"
            type="textarea"
            :rows="field.includes('Complexity') ? 1 : 3"
            :maxlength="field.includes('Complexity') ? 200 : 20000"
        /></el-form-item>
        <el-form-item :label="t('codeLanguage')"
          ><el-select v-model="problem.details.language"
            ><el-option
              v-for="language in [
                'text',
                'java',
                'javascript',
                'python',
                'cpp',
              ]"
              :key="language"
              :value="language"
              :label="language" /></el-select
        ></el-form-item>
        <el-form-item :label="t('code')"
          ><el-input
            v-model="problem.details.code"
            type="textarea"
            :rows="8"
            maxlength="20000" /></el-form-item
        ><CodePreview
          :code="problem.details.code"
          :language="problem.details.language"
        />
        <el-checkbox v-model="problem.details.favorite"
          >⭐ {{ t("favorite") }}</el-checkbox
        ><el-checkbox v-model="problem.details.challenge"
          >🎯 {{ t("challenge") }}</el-checkbox
        >
      </template></el-form
    ><template #footer
      ><el-button @click="closeDialog('problem')">{{ t("cancel") }}</el-button
      ><el-button
        type="primary"
        :loading="busy"
        :disabled="!!problemDraft.pending.value"
        @click="saveProblem"
        >{{ t("save") }}</el-button
      ></template
    ></el-dialog
  >
  <el-dialog
    v-model="attemptDialog"
    :title="t(attempt.id ? 'editAttempt' : 'recordAttempt')"
    width="640px"
    :before-close="(done) => closeDialog('attempt', done)"
    :close-on-click-modal="false"
    ><el-form label-position="top"
      ><h3>{{ problemFor(attempt.problemId)?.title }}</h3>
      <div class="form-grid">
        <el-form-item :label="t('result')"
          ><el-radio-group v-model="attempt.result"
            ><el-radio-button value="passed">{{ t("passed") }}</el-radio-button
            ><el-radio-button value="failed">{{
              t("failed")
            }}</el-radio-button></el-radio-group
          ></el-form-item
        ><el-form-item :label="t('minutes')"
          ><el-input-number v-model="attempt.minutes" :min="0" :max="10080"
        /></el-form-item>
      </div>
      <el-form-item :label="t('attemptedAt')" required
        ><el-date-picker
          v-model="attempt.attemptedAt"
          type="datetime"
          value-format="YYYY-MM-DDTHH:mm:ss" /></el-form-item
      ><el-form-item :label="t('relatedTask')"
        ><el-select
          v-model="attempt.taskId"
          clearable
          :placeholder="t('noRelatedTask')"
          ><el-option
            v-for="task in relatedTasks"
            :key="task.id"
            :value="task.id"
            :label="`${task.planDate} · ${task.title}`" /></el-select></el-form-item
      ><el-form-item :label="t('attemptNotes')"
        ><el-input
          v-model="attempt.notes"
          type="textarea"
          :rows="6"
          maxlength="20000"
      /></el-form-item>
      <p class="hint">{{ t("attemptHint") }}</p></el-form
    ><template #footer
      ><el-button @click="closeDialog('attempt')">{{ t("cancel") }}</el-button
      ><el-button type="primary" :loading="busy" @click="saveAttempt">{{
        t("save")
      }}</el-button></template
    ></el-dialog
  >
  <TaskEditor v-model="taskDialog" :problem="planning" />
</template>
