<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import type { WidgetConfig, ClockWidgetSettings } from "@desktopfriends/shared";

const props = defineProps<{
  widget: WidgetConfig;
}>();

const settings = computed(() => props.widget.settings as ClockWidgetSettings);

const currentTime = ref(new Date());
let timer: number | null = null;

// Format time
const timeString = computed(() => {
  const hours = currentTime.value.getHours();
  const minutes = currentTime.value.getMinutes();
  const seconds = currentTime.value.getSeconds();

  if (settings.value.format === "12h") {
    const period = hours >= 12 ? "下午" : "上午";
    const displayHours = hours % 12 || 12;
    const base = `${displayHours}:${minutes.toString().padStart(2, "0")}`;
    const withSeconds = settings.value.showSeconds
      ? `:${seconds.toString().padStart(2, "0")}`
      : "";
    return `${period} ${base}${withSeconds}`;
  } else {
    const base = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}`;
    const withSeconds = settings.value.showSeconds
      ? `:${seconds.toString().padStart(2, "0")}`
      : "";
    return `${base}${withSeconds}`;
  }
});

// Format date
const dateString = computed(() => {
  if (!settings.value.showDate) return "";

  const year = currentTime.value.getFullYear();
  const month = currentTime.value.getMonth() + 1;
  const day = currentTime.value.getDate();
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const weekday = weekdays[currentTime.value.getDay()];

  return `${year}年${month}月${day}日 周${weekday}`;
});

onMounted(() => {
  // Update every second if showing seconds, otherwise every minute
  const interval = settings.value.showSeconds ? 1000 : 60000;
  timer = window.setInterval(() => {
    currentTime.value = new Date();
  }, interval);
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
  }
});
</script>

<template>
  <div class="clock-widget">
    <div class="time">{{ timeString }}</div>
    <div v-if="dateString" class="date">{{ dateString }}</div>
  </div>
</template>

<style scoped>
.clock-widget {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
}

.time {
  font-size: 24px;
  font-weight: 600;
  color: #333;
  line-height: 1.2;
}

.date {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}
</style>
