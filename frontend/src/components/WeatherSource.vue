<script setup>
import { useI18n } from "vue-i18n";
import { openLink } from "../api.js";
defineProps({ detailed: Boolean });
const { t } = useI18n();
</script>
<template>
  <div class="weather-source">
    <p>
      <a
        href="https://open-meteo.com/"
        @click.prevent="openLink('https://open-meteo.com/')"
        >{{ t("weatherSourceShort") }}</a
      >
    </p>
    <template v-if="detailed"
      ><p>{{ t("weatherSourceDetail") }}</p>
      <p>{{ t("weatherCredits") }}</p>
      <p>{{ t("weatherCacheHint") }}</p></template
    >
    <p>{{ t("weatherForecastNote") }}</p>
    <div class="weather-source-links">
      <a
        href="https://creativecommons.org/licenses/by/4.0/"
        @click.prevent="
          openLink('https://creativecommons.org/licenses/by/4.0/')
        "
        >{{ t("weatherLicense") }}</a
      >
      <a
        v-if="detailed"
        href="https://open-meteo.com/en/docs"
        @click.prevent="openLink('https://open-meteo.com/en/docs')"
        >{{ t("weatherApiDocs") }}</a
      >
      <a
        v-if="detailed"
        href="https://open-meteo.com/en/terms"
        @click.prevent="openLink('https://open-meteo.com/en/terms')"
        >{{ t("weatherTerms") }}</a
      >
    </div>
  </div>
</template>
