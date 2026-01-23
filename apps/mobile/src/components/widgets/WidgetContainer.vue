<script setup lang="ts">
import { computed, ref } from "vue";
import { useWidgets } from "@desktopfriends/core";
import type { WeatherWidgetSettings } from "@desktopfriends/shared";
import { defaultWeatherSettings } from "@desktopfriends/shared";
import WidgetWrapper from "./WidgetWrapper.vue";
import ClockWidget from "./ClockWidget.vue";
import TodoWidget from "./TodoWidget.vue";
import PhotoWidget from "./PhotoWidget.vue";
import WeatherWidget from "./WeatherWidget.vue";
import WeatherSettingsDialog from "./WeatherSettingsDialog.vue";

const { enabledWidgets, editMode, gridConfig, removeWidget, updateWidgetSettings } = useWidgets();

// Grid lines for edit mode overlay
const gridLines = computed(() => {
  const config = gridConfig.value;
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const gap = config.gap || 0;

  // Vertical lines (draw at cell boundaries considering gaps)
  for (let i = 0; i <= config.columns; i++) {
    const x = config.padding + i * (config.cellWidth + gap) - (i > 0 ? gap / 2 : 0);
    lines.push({
      x1: x,
      y1: config.padding,
      x2: x,
      y2: config.padding + config.rows * config.cellHeight + (config.rows - 1) * gap,
    });
  }

  // Horizontal lines (draw at cell boundaries considering gaps)
  for (let i = 0; i <= config.rows; i++) {
    const y = config.padding + i * (config.cellHeight + gap) - (i > 0 ? gap / 2 : 0);
    lines.push({
      x1: config.padding,
      y1: y,
      x2: config.padding + config.columns * config.cellWidth + (config.columns - 1) * gap,
      y2: y,
    });
  }

  return lines;
});

// Get widget component by type
function getWidgetComponent(type: string) {
  switch (type) {
    case "clock":
      return ClockWidget;
    case "todo":
      return TodoWidget;
    case "photo":
      return PhotoWidget;
    case "weather":
      return WeatherWidget;
    default:
      return null;
  }
}

function onRemoveWidget(id: string) {
  removeWidget(id);
}

// Weather settings dialog
const showWeatherSettings = ref(false);
const currentSettingsWidgetId = ref<string | null>(null);

const currentWeatherSettings = computed(() => {
  if (!currentSettingsWidgetId.value) {
    return defaultWeatherSettings;
  }
  const widget = enabledWidgets.value.find(w => w.id === currentSettingsWidgetId.value);
  return (widget?.settings as WeatherWidgetSettings) || defaultWeatherSettings;
});

function onWidgetSettings(id: string) {
  const widget = enabledWidgets.value.find(w => w.id === id);
  if (!widget) return;

  if (widget.type === 'weather') {
    currentSettingsWidgetId.value = id;
    showWeatherSettings.value = true;
  } else {
    // TODO: Other widget settings
    console.log("Open settings for widget:", id);
  }
}

function onSaveWeatherSettings(settings: WeatherWidgetSettings) {
  if (currentSettingsWidgetId.value) {
    updateWidgetSettings(currentSettingsWidgetId.value, settings);
  }
}
</script>

<template>
  <div class="widget-container">
    <!-- Grid overlay (edit mode only) -->
    <svg v-if="editMode" class="grid-overlay">
      <line
        v-for="(line, index) in gridLines"
        :key="index"
        :x1="line.x1"
        :y1="line.y1"
        :x2="line.x2"
        :y2="line.y2"
        stroke="rgba(100, 100, 255, 0.3)"
        stroke-width="1"
        stroke-dasharray="4,4"
      />
    </svg>

    <!-- Widgets -->
    <WidgetWrapper
      v-for="widget in enabledWidgets"
      :key="widget.id"
      :widget="widget"
      @remove="onRemoveWidget"
      @settings="onWidgetSettings"
    >
      <component :is="getWidgetComponent(widget.type)" :widget="widget" />
    </WidgetWrapper>

    <!-- Weather Settings Dialog -->
    <WeatherSettingsDialog
      v-model="showWeatherSettings"
      :settings="currentWeatherSettings"
      @save="onSaveWeatherSettings"
    />
  </div>
</template>

<style scoped>
.widget-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 200px; /* Reserve space for chat area */
  pointer-events: none;
  z-index: 20;
}

.widget-container > * {
  pointer-events: auto;
}

.grid-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
