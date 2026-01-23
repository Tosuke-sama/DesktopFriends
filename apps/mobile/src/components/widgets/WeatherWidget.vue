<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import type {
  WidgetConfig,
  WeatherWidgetSettings,
} from "@desktopfriends/shared";

const props = defineProps<{
  widget: WidgetConfig;
}>();

const settings = computed(() => props.widget.settings as WeatherWidgetSettings);

// 计算小组件尺寸
const widgetSize = computed(() => {
  const width = props.widget.position.gridWidth;
  const height = props.widget.position.gridHeight;
  return { width, height };
});

// 根据尺寸决定显示模式
const displayMode = computed(() => {
  const { width, height } = widgetSize.value;
  const area = width * height;

  // 小尺寸（面积 <= 4，如 2×2）：紧凑模式
  if (area <= 4) return 'compact';

  // 中等尺寸（面积 <= 9，如 3×3）：标准模式
  if (area <= 9) return 'standard';

  // 大尺寸：完整模式
  return 'full';
});

// Weather data state
const weatherData = ref<{
  temp: number;
  condition: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  forecast?: { day: string; temp: number; icon: string }[];
} | null>(null);

const loading = ref(false);
const error = ref<string | null>(null);

// Weather icons mapping
const weatherIcons: Record<string, string> = {
  sunny: "☀️",
  cloudy: "☁️",
  partlyCloudy: "⛅",
  rainy: "🌧️",
  stormy: "⛈️",
  snowy: "❄️",
  foggy: "🌫️",
  windy: "💨",
  default: "🌤️",
};

// Format temperature
const formattedTemp = computed(() => {
  if (!weatherData.value) return "--";
  let temp = weatherData.value.temp;

  // Convert to Fahrenheit if needed
  if (settings.value.units === "imperial") {
    temp = Math.round((temp * 9/5) + 32);
    return `${temp}°F`;
  }

  return `${temp}°C`;
});

// Map Open-Meteo weather codes to our icons
function mapWeatherCodeToIcon(code: number): string {
  // WMO Weather interpretation codes (WW)
  // https://open-meteo.com/en/docs
  if (code === 0) return "sunny"; // Clear sky
  if (code <= 3) return "partlyCloudy"; // 1-3: Mainly clear, partly cloudy, overcast
  if (code <= 48) return "foggy"; // 45,48: Fog
  if (code <= 67) return "rainy"; // 51-67: Drizzle and rain
  if (code <= 77) return "snowy"; // 71-77: Snow
  if (code <= 82) return "rainy"; // 80-82: Rain showers
  if (code <= 86) return "snowy"; // 85-86: Snow showers
  if (code <= 99) return "stormy"; // 95-99: Thunderstorm
  return "default";
}

// Map Open-Meteo weather codes to Chinese descriptions
function mapWeatherCodeToCondition(code: number): string {
  if (code === 0) return "晴";
  if (code === 1) return "晴朗";
  if (code === 2) return "多云";
  if (code === 3) return "阴";
  if (code === 45 || code === 48) return "雾";
  if (code >= 51 && code <= 55) return "小雨";
  if (code >= 56 && code <= 57) return "冻雨";
  if (code >= 61 && code <= 65) return "雨";
  if (code >= 66 && code <= 67) return "冻雨";
  if (code >= 71 && code <= 75) return "雪";
  if (code === 77) return "雪粒";
  if (code >= 80 && code <= 82) return "阵雨";
  if (code >= 85 && code <= 86) return "阵雪";
  if (code === 95) return "雷暴";
  if (code === 96 || code === 99) return "雷暴伴冰雹";
  return "未知";
}

// Fetch weather data using Open-Meteo API (free, no API key required)
async function fetchWeather() {
  if (!settings.value.location) {
    error.value = "请设置位置";
    weatherData.value = null;
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    // Step 1: Geocoding - Convert city name to coordinates using OpenStreetMap Nominatim
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      settings.value.location
    )}&format=json&limit=1&accept-language=zh-CN`;

    console.log(`🔍 Searching location: ${settings.value.location}`);
    const geoResponse = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'TableFri-Weather-Widget/1.0'
      }
    });

    if (!geoResponse.ok) {
      throw new Error(`地理编码服务错误 (${geoResponse.status})`);
    }

    const geoData = await geoResponse.json();

    if (!geoData || geoData.length === 0) {
      throw new Error("未找到该城市，请检查城市名称");
    }

    const { lat, lon, display_name } = geoData[0];
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    console.log(`📍 Found location: ${display_name} (${latitude}, ${longitude})`);

    // Step 2: Fetch weather data from Open-Meteo
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=auto`;

    const weatherResponse = await fetch(weatherUrl);

    if (!weatherResponse.ok) {
      throw new Error(`天气服务错误 (${weatherResponse.status})`);
    }

    const weatherInfo = await weatherResponse.json();

    const current = weatherInfo.current;
    const daily = weatherInfo.daily;

    // Build forecast data
    let forecast = undefined;
    if (settings.value.showForecast && daily) {
      const dayNames = ["明天", "后天", "大后天"];
      forecast = daily.weather_code.slice(1, 4).map((code: number, index: number) => ({
        day: dayNames[index] || `+${index + 1}天`,
        temp: Math.round(daily.temperature_2m_max[index + 1]),
        icon: mapWeatherCodeToIcon(code),
      }));
    }

    // Build weather data
    weatherData.value = {
      temp: Math.round(current.temperature_2m),
      condition: mapWeatherCodeToCondition(current.weather_code),
      icon: mapWeatherCodeToIcon(current.weather_code),
      humidity: Math.round(current.relative_humidity_2m),
      windSpeed: Math.round(current.wind_speed_10m),
      forecast,
    };

    console.log(`✅ Real weather fetched for: ${display_name}`, weatherData.value);
  } catch (e: any) {
    console.error("❌ Weather fetch error:", e);

    // Clear weather data on error
    weatherData.value = null;

    // Set specific error message
    if (e.message.includes("未找到该城市")) {
      error.value = e.message;
    } else if (e.message.includes("服务错误")) {
      error.value = e.message;
    } else if (e instanceof TypeError && e.message.includes("fetch")) {
      error.value = "网络连接失败，请检查网络";
    } else {
      error.value = e.message || "获取天气失败";
    }
  } finally {
    loading.value = false;
  }
}

let refreshTimer: number | null = null;

// Watch location changes
watch(() => settings.value.location, (newLocation, oldLocation) => {
  if (newLocation !== oldLocation) {
    console.log(`📍 Location changed: ${oldLocation} → ${newLocation}`);
    fetchWeather();
  }
}, { immediate: false });

// Watch units changes
watch(() => settings.value.units, () => {
  console.log(`🌡️ Temperature units changed to: ${settings.value.units}`);
});

onMounted(() => {
  fetchWeather();
  // Refresh every 30 minutes
  refreshTimer = window.setInterval(fetchWeather, 30 * 60 * 1000);
});

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});
</script>

<template>
  <div class="weather-widget" :class="`mode-${displayMode}`">
    <!-- Loading state -->
    <div v-if="loading && !weatherData" class="weather-loading">
      <span class="loading-icon">🔄</span>
      <span v-if="displayMode !== 'compact'" class="loading-text">加载中...</span>
    </div>

    <!-- Error state -->
    <div v-else-if="error && !weatherData" class="weather-error">
      <span class="error-icon">⚠️</span>
      <span v-if="displayMode !== 'compact'" class="error-text">{{ error }}</span>
    </div>

    <!-- Weather data -->
    <template v-else-if="weatherData">
      <!-- 紧凑模式 (2×2) - 精简布局 -->
      <template v-if="displayMode === 'compact'">
        <div class="compact-layout">
          <div class="compact-row">
            <span class="compact-icon">{{
              weatherIcons[weatherData.icon] || weatherIcons.default
            }}</span>
            <div class="compact-temp-wrap">
              <span class="compact-temp">{{ formattedTemp }}</span>
              <span class="compact-condition">{{ weatherData.condition }}</span>
            </div>
          </div>
          <div class="compact-location">{{ settings.location || "未设置" }}</div>
        </div>
      </template>

      <!-- 标准模式 (3×3) -->
      <template v-else-if="displayMode === 'standard'">
        <div class="standard-layout">
          <div class="standard-location">📍 {{ settings.location || "未设置" }}</div>
          <div class="standard-main">
            <span class="standard-icon">{{
              weatherIcons[weatherData.icon] || weatherIcons.default
            }}</span>
            <div class="standard-info">
              <span class="standard-temp">{{ formattedTemp }}</span>
              <span class="standard-condition">{{ weatherData.condition }}</span>
            </div>
          </div>
          <div class="standard-details">
            <div class="detail-item">
              <span class="detail-icon">💧</span>
              <span class="detail-value">{{ weatherData.humidity }}%</span>
            </div>
            <div class="detail-item">
              <span class="detail-icon">💨</span>
              <span class="detail-value">{{ weatherData.windSpeed }}km/h</span>
            </div>
          </div>
        </div>
      </template>

      <!-- 完整模式 (4×4+) -->
      <template v-else>
        <div class="full-layout">
          <div class="full-header">
            <span class="full-location">📍 {{ settings.location || "未设置" }}</span>
          </div>

          <div class="full-main">
            <span class="full-icon">{{
              weatherIcons[weatherData.icon] || weatherIcons.default
            }}</span>
            <div class="full-info">
              <span class="full-temp">{{ formattedTemp }}</span>
              <span class="full-condition">{{ weatherData.condition }}</span>
            </div>
          </div>

          <div class="full-details">
            <div class="detail-card">
              <span class="detail-label">湿度</span>
              <span class="detail-value">{{ weatherData.humidity }}%</span>
            </div>
            <div class="detail-card">
              <span class="detail-label">风速</span>
              <span class="detail-value">{{ weatherData.windSpeed }}km/h</span>
            </div>
          </div>

          <!-- Forecast -->
          <div
            v-if="settings.showForecast && weatherData.forecast"
            class="full-forecast"
          >
            <div
              v-for="day in weatherData.forecast"
              :key="day.day"
              class="forecast-card"
            >
              <span class="forecast-day">{{ day.day }}</span>
              <span class="forecast-icon">{{
                weatherIcons[day.icon] || weatherIcons.default
              }}</span>
              <span class="forecast-temp">{{ day.temp }}°</span>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- Empty state -->
    <div v-else class="weather-empty">
      <span class="empty-icon">🌤️</span>
      <span v-if="displayMode !== 'compact'" class="empty-text">请设置位置</span>
    </div>
  </div>
</template>

<style scoped>
.weather-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}

/* ========== 通用状态样式 ========== */
.weather-loading,
.weather-error,
.weather-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #888;
  text-align: center;
  gap: 6px;
}

.loading-icon,
.error-icon,
.empty-icon {
  font-size: 28px;
}

.loading-text,
.error-text,
.empty-text {
  font-size: 12px;
  color: #999;
}

/* ========== 紧凑模式 (2×2) ========== */
.weather-widget.mode-compact {
  padding: 8px;
}

.compact-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 6px;
}

.compact-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.compact-icon {
  font-size: 32px;
  line-height: 1;
}

.compact-temp-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.compact-temp {
  font-size: 20px;
  font-weight: 700;
  color: #333;
  line-height: 1.1;
}

.compact-condition {
  font-size: 11px;
  color: #666;
}

.compact-location {
  font-size: 10px;
  color: #999;
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 8px;
  border-radius: 10px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ========== 标准模式 (3×3) ========== */
.weather-widget.mode-standard {
  padding: 10px;
}

.standard-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 8px;
}

.standard-location {
  font-size: 11px;
  color: #666;
  text-align: center;
  padding: 4px 8px;
  background: rgba(102, 126, 234, 0.08);
  border-radius: 12px;
  align-self: center;
}

.standard-main {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex: 1;
}

.standard-icon {
  font-size: 42px;
  line-height: 1;
}

.standard-info {
  display: flex;
  flex-direction: column;
}

.standard-temp {
  font-size: 28px;
  font-weight: 700;
  color: #333;
  line-height: 1;
}

.standard-condition {
  font-size: 13px;
  color: #666;
  margin-top: 2px;
}

.standard-details {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.standard-details .detail-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #666;
}

.standard-details .detail-icon {
  font-size: 14px;
}

.standard-details .detail-value {
  font-weight: 500;
  color: #555;
}

/* ========== 完整模式 (4×4+) ========== */
.weather-widget.mode-full {
  padding: 12px;
}

.full-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 10px;
}

.full-header {
  text-align: center;
}

.full-location {
  font-size: 12px;
  color: #666;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
  padding: 6px 12px;
  border-radius: 16px;
  display: inline-block;
}

.full-main {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 8px 0;
}

.full-icon {
  font-size: 52px;
  line-height: 1;
}

.full-info {
  display: flex;
  flex-direction: column;
}

.full-temp {
  font-size: 36px;
  font-weight: 700;
  color: #333;
  line-height: 1;
}

.full-condition {
  font-size: 14px;
  color: #666;
  margin-top: 4px;
}

.full-details {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.detail-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(0, 0, 0, 0.03);
  padding: 8px 16px;
  border-radius: 12px;
  min-width: 70px;
}

.detail-label {
  font-size: 10px;
  color: #999;
  margin-bottom: 2px;
}

.detail-card .detail-value {
  font-size: 14px;
  font-weight: 600;
  color: #555;
}

.full-forecast {
  display: flex;
  justify-content: space-around;
  padding-top: 10px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  margin-top: auto;
}

.forecast-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(102, 126, 234, 0.05);
  border-radius: 10px;
  min-width: 50px;
}

.forecast-day {
  font-size: 11px;
  color: #888;
}

.forecast-icon {
  font-size: 20px;
  line-height: 1;
}

.forecast-temp {
  font-size: 13px;
  font-weight: 600;
  color: #555;
}
</style>
