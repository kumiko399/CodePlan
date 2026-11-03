<script setup>
import WeeklyReport from "../components/WeeklyReport.vue";
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from "vue";
import { useI18n } from "vue-i18n";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { api } from "../api.js";
import { dateKey, shiftDate } from "../lib/dates.js";
import { showError } from "../lib/feedback.js";
import { categoryLabel, categoryStyle } from "../lib/categories.js";
echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);
const { t, locale } = useI18n(),
  range = ref("7"),
  from = ref(shiftDate(dateKey(), -6)),
  to = ref(dateKey()),
  data = ref(null),
  busy = ref(false),
  chartElement = ref(null);
let chart,
  resizeObserver,
  requestId = 0;
async function load() {
  if (!from.value || !to.value) return;
  const current = ++requestId;
  busy.value = true;
  try {
    const response = await api.get(
      `/statistics?from=${from.value}&to=${to.value}`,
    );
    if (current !== requestId) return;
    data.value = response;
    await nextTick();
    render();
  } catch (e) {
    showError(e);
  } finally {
    if (current === requestId) busy.value = false;
  }
}
function render() {
  if (!chartElement.value || !data.value) return;
  if (!chart) chart = echarts.init(chartElement.value);
  chart.setOption({
    color: ["#62836c", "#8da2db"],
    tooltip: { trigger: "axis" },
    legend: {
      data: [t("passedProblems"), t("attempts")],
      bottom: 0,
      textStyle: { color: "#89948d" },
    },
    grid: { left: 35, right: 20, top: 25, bottom: 65 },
    xAxis: {
      type: "category",
      data: data.value.trend.map((d) => d.day.slice(5)),
      axisLabel: { color: "#89948d" },
      axisLine: { lineStyle: { color: "#dbe1dc" } },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      axisLabel: { color: "#89948d" },
      splitLine: { lineStyle: { color: "#dbe1dc", opacity: 0.35 } },
    },
    series: [
      {
        name: t("passedProblems"),
        type: "line",
        smooth: true,
        data: data.value.trend.map((d) => d.passed),
        areaStyle: { opacity: 0.12 },
        symbolSize: 6,
      },
      {
        name: t("attempts"),
        type: "line",
        smooth: true,
        data: data.value.trend.map((d) => d.attempts),
        lineStyle: { type: "dashed" },
        symbolSize: 5,
      },
    ],
  });
}
watch(range, (value) => {
  if (value !== "custom") {
    to.value = dateKey();
    from.value = shiftDate(to.value, -Number(value) + 1);
    load();
  }
});
watch(locale, () => render());
onMounted(async () => {
  await load();
  resizeObserver = new ResizeObserver(() => chart?.resize());
  if (chartElement.value) resizeObserver.observe(chartElement.value);
});
onBeforeUnmount(() => {
  requestId++;
  resizeObserver?.disconnect();
  chart?.dispose();
});
</script>
<template>
  <WeeklyReport />
  <header class="page-header">
    <div>
      <p class="eyebrow">YOUR PROGRESS</p>
      <h1>{{ t("statistics") }}</h1>
      <p>{{ t("statisticsSubtitle") }}</p>
    </div>
  </header>
  <div class="stats-filter">
    <el-radio-group v-model="range"
      ><el-radio-button value="7">{{ t("last7") }}</el-radio-button
      ><el-radio-button value="30">{{ t("last30") }}</el-radio-button
      ><el-radio-button value="custom">{{
        t("custom")
      }}</el-radio-button></el-radio-group
    ><template v-if="range === 'custom'"
      ><el-date-picker
        v-model="from"
        value-format="YYYY-MM-DD"
        :placeholder="t('from')"
      /><span>—</span
      ><el-date-picker
        v-model="to"
        value-format="YYYY-MM-DD"
        :placeholder="t('to')"
      /><el-button :loading="busy" @click="load">{{
        t("apply")
      }}</el-button></template
    >
  </div>
  <div v-loading="busy">
    <template v-if="data"
      ><div class="summary-grid">
        <div class="summary-card">
          <span>{{ t("completion") }}</span
          ><strong>{{
            data.total
              ? Math.round((data.completed / data.total) * 100) + "%"
              : "—"
          }}</strong
          ><small>{{ data.completed }} / {{ data.total }}</small>
        </div>
        <div class="summary-card">
          <span>{{ t("attempts") }}</span
          ><strong>{{ data.attempts }}</strong>
        </div>
        <div class="summary-card">
          <span>{{ t("passedProblems") }}</span
          ><strong>{{ data.passed }}</strong>
        </div>
      </div></template
    >
    <section class="panel">
      <div class="section-header">
        <h2>{{ t("trend") }}</h2>
      </div>
      <div
        ref="chartElement"
        class="chart"
        role="img"
        :aria-label="t('trend')"
      ></div>
      <p v-if="data && !data.attempts" class="hint">{{ t("noData") }}</p>
    </section>
    <template v-if="data"
      ><div class="two-columns">
        <section class="panel">
          <h2>{{ t("categoryStats") }}</h2>
          <div v-for="c in data.categories" :key="c.category" class="bar-row">
            <span class="category-pill" :style="categoryStyle(c.category)">{{
              categoryLabel(c.category, t)
            }}</span>
            <div class="progress-track">
              <i
                :style="{
                  width: c.total ? `${(c.completed / c.total) * 100}%` : '0',
                }"
              ></i>
            </div>
            <b>{{ c.completed }} / {{ c.total }}</b>
          </div>
        </section>
        <section class="panel">
          <h2>{{ t("difficultyStats") }}</h2>
          <div
            v-for="d in ['easy', 'medium', 'hard', 'unset']"
            :key="d"
            class="bar-row"
          >
            <span>{{ t(d) }}</span>
            <div class="progress-track">
              <i
                :style="{
                  width: data.passed
                    ? `${((data.difficulty[d] || 0) / data.passed) * 100}%`
                    : '0',
                }"
              ></i>
            </div>
            <b>{{ data.difficulty[d] || 0 }}</b>
          </div>
        </section>
      </div>
      <section class="panel">
        <h2>{{ t("tagStats") }}</h2>
        <div class="tag-cloud">
          <span v-for="(count, tag) in data.tags" :key="tag" class="tag"
            >{{ tag }} <b>{{ count }}</b></span
          ><span v-if="!Object.keys(data.tags).length" class="hint">{{
            t("noData")
          }}</span>
        </div>
        <p class="hint">{{ t("tagNote") }}</p>
      </section>
      <p class="hint">{{ t("statisticsNote") }}</p></template
    >
  </div>
</template>
