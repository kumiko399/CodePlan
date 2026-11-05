<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { dateKey, shiftDate } from "../lib/dates.js";
import {
  getAlmanac,
  validAlmanacDay,
  calendarSelection,
  MIN_DAY,
  MAX_DAY,
} from "../lib/almanac.js";
import { openLink } from "../api.js";
const { locale } = useI18n();
const label = (zh, en) => (locale.value === "zh" ? zh : en);
const today = ref(dateKey()),
  selected = ref(today.value),
  following = ref(true);
const expanded = ref(false),
  sourceOpen = ref(false);
const data = computed(() => getAlmanac(selected.value));
const weekday = computed(() =>
  new Intl.DateTimeFormat(locale.value === "zh" ? "zh-CN" : "en-US", {
    weekday: "long",
  }).format(new Date(`${selected.value}T12:00:00`)),
);
function sync() {
  today.value = dateKey();
  selected.value = calendarSelection(selected.value, following.value);
}
function choose(day) {
  if (!validAlmanacDay(day)) return;
  today.value = dateKey();
  selected.value = day;
  following.value = day === today.value;
  expanded.value = false;
}
function goToday() {
  following.value = true;
  expanded.value = false;
  sync();
}
const disabledDate = (date) => !validAlmanacDay(dateKey(date));
let timer;
onMounted(() => {
  sync();
  timer = setInterval(sync, 1000);
  window.addEventListener("focus", sync);
  document.addEventListener("visibilitychange", sync);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  window.removeEventListener("focus", sync);
  document.removeEventListener("visibilitychange", sync);
});
</script>
<template>
  <aside
    class="home-almanac"
    data-testid="home-almanac"
    :data-date="selected"
    :aria-label="label('每日黄历', 'Daily almanac')"
  >
    <div class="almanac-rings" aria-hidden="true"><i></i><i></i></div>
    <header class="almanac-heading">
      <span>📅 {{ label("每日黄历", "Daily almanac") }}</span
      ><span class="almanac-today" v-if="selected === today">{{
        label("今天", "Today")
      }}</span>
    </header>
    <div class="almanac-nav">
      <button
        data-testid="almanac-prev"
        type="button"
        :disabled="selected <= MIN_DAY"
        :aria-label="label('前一天', 'Previous day')"
        @click="choose(shiftDate(selected, -1))"
      >
        ‹
      </button>
      <el-date-picker
        :model-value="selected"
        @update:model-value="choose"
        value-format="YYYY-MM-DD"
        format="YYYY-MM-DD"
        :clearable="false"
        :editable="false"
        :disabled-date="disabledDate"
        :aria-label="label('选择黄历日期', 'Choose almanac date')"
      />
      <button
        data-testid="almanac-next"
        type="button"
        :disabled="selected >= MAX_DAY"
        :aria-label="label('后一天', 'Next day')"
        @click="choose(shiftDate(selected, 1))"
      >
        ›
      </button>
    </div>
    <div class="almanac-date" aria-live="polite" aria-atomic="true">
      <strong>{{ selected.slice(-2) }}</strong
      ><span>{{ weekday }}</span>
      <p v-if="data.lunar">{{ label("农历", "Lunar") }} · {{ data.lunar }}</p>
      <small v-if="locale !== 'zh'"
        >Lunar names and traditional entries are shown in Chinese.</small
      >
    </div>
    <p v-if="data.error" class="almanac-error" role="status">
      {{
        data.error === "range"
          ? label("仅支持 1901—2099 年", "Supported years: 1901–2099")
          : label("黄历暂不可用", "Almanac unavailable")
      }}
    </p>
    <div v-else class="almanac-activities">
      <section
        v-for="kind in ['yi', 'ji']"
        :key="kind"
        :class="'almanac-' + kind"
      >
        <h3>
          {{
            kind === "yi"
              ? label("宜", "宜 · Favorable")
              : label("忌", "忌 · Avoid")
          }}
        </h3>
        <ul>
          <li
            v-for="item in expanded ? data[kind] : data[kind].slice(0, 3)"
            :key="item"
          >
            {{ item }}
          </li>
        </ul>
      </section>
    </div>
    <div class="almanac-actions">
      <button
        v-if="!data.error && (data.yi.length > 3 || data.ji.length > 3)"
        type="button"
        data-testid="almanac-expand"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{
          expanded ? label("收起", "Show less") : label("展开全部", "Show all")
        }}
      </button>
      <button
        type="button"
        data-testid="almanac-today"
        :disabled="following"
        @click="goToday"
      >
        {{ label("回到今天", "Back to today") }}
      </button>
    </div>
    <footer>
      <span>{{ label("民俗参考", "Cultural reference") }}</span
      ><button type="button" @click="sourceOpen = true">
        {{ label("数据来源", "Data source") }}
      </button>
    </footer>
  </aside>
  <el-dialog
    v-model="sourceOpen"
    :title="label('黄历数据来源', 'Almanac data source')"
    append-to-body
    width="min(480px,92vw)"
  >
    <p>
      {{
        label(
          "农历与宜忌由 lunar-javascript 1.7.7 离线计算，每日宜忌采用流派 1。",
          "Lunar dates and almanac entries use lunar-javascript 1.7.7 offline, with daily sect 1.",
        )
      }}
    </p>
    <p>
      {{
        label(
          "作者说明宜忌表由网站资料研究整理，可能与其他黄历存在差异。仅作民俗参考，不影响任务安排。",
          "The author describes a table derived from research on website materials. Results can differ from other almanacs. For cultural reference; your tasks are not changed.",
        )
      }}
    </p>
    <p>
      <a
        href="https://6tail.cn/calendar/lunar.yiji.html"
        @click.prevent="openLink('https://6tail.cn/calendar/lunar.yiji.html')"
        >{{ label("查看作者来源说明", "Author’s source notes") }}</a
      >
      ·
      <a
        href="https://github.com/6tail/lunar-javascript"
        @click.prevent="openLink('https://github.com/6tail/lunar-javascript')"
        >lunar-javascript · MIT · © 6tail</a
      >
    </p>
  </el-dialog>
</template>
<style scoped>
.home-almanac {
  position: relative;
  min-width: 0;
  padding: 22px 20px 14px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: 0 8px 22px #18271d08;
  align-self: start;
  color: inherit;
}
.almanac-rings {
  position: absolute;
  top: -7px;
  left: 22%;
  right: 22%;
  display: flex;
  justify-content: space-between;
}
.almanac-rings i {
  width: 7px;
  height: 17px;
  border-radius: 4px;
  background: var(--accent);
}
.almanac-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
}
.almanac-today {
  font-size: 11px;
  color: var(--accent);
}
.almanac-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 15px;
}
.almanac-nav :deep(.el-date-editor) {
  width: 100%;
  min-width: 0;
  flex: 1;
}
.almanac-nav button {
  font-size: 24px;
  padding: 0 8px;
}
button {
  font: inherit;
  border: 0;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  border-radius: 6px;
  padding: 4px;
}
button:hover:not(:disabled) {
  background: var(--surface-soft);
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.almanac-date {
  text-align: center;
  padding: 10px 0 14px;
  border-bottom: 1px dashed var(--line);
}
.almanac-date strong {
  display: block;
  font-size: 64px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -3px;
  font-variant-numeric: tabular-nums;
}
.almanac-date span {
  font-size: 12px;
  color: var(--muted);
}
.almanac-date p {
  font-size: 13px;
  margin: 8px 0 0;
}
.almanac-date small {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: var(--muted);
}
.almanac-activities {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 12px;
}
.almanac-activities section {
  min-width: 0;
}
.almanac-activities h3 {
  font-size: 14px;
  margin: 0 0 6px;
}
.almanac-yi h3 {
  color: #287447;
}
.almanac-ji h3 {
  color: #b5503e;
}
.almanac-activities ul {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 13px;
  line-height: 1.9;
  overflow-wrap: anywhere;
}
.almanac-actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  font-size: 12px;
}
.almanac-actions button:only-child {
  margin-left: auto;
}
footer {
  border-top: 1px solid var(--line);
  margin-top: 10px;
  padding-top: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--muted);
}
.almanac-error {
  font-size: 13px;
  color: var(--muted);
}
:global(.dark .home-almanac .almanac-yi h3) {
  color: #88cc9e;
}
:global(.dark .home-almanac .almanac-ji h3) {
  color: #eda594;
}
</style>
