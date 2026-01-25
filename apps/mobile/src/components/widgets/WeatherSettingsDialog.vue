<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { WeatherWidgetSettings } from '@desktopfriends/shared'
import { Geolocation } from '@capacitor/geolocation'
import { reverseGeocode } from '@desktopfriends/core'

const props = defineProps<{
  modelValue: boolean
  settings: WeatherWidgetSettings
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [settings: WeatherWidgetSettings]
}>()

// 获取 API Key（优先使用用户自定义的，否则使用环境变量）
const apiKey = computed(() => {
  return props.settings.apiKey || import.meta.env.VITE_QWEATHER_API_KEY || '';
});

// 状态
const inputMethod = ref<'manual' | 'gps' | 'list'>('manual')
const locationInput = ref('')
const units = ref<'metric' | 'imperial'>('metric')
const alertOnChange = ref(true)
const isLocating = ref(false)
const gpsError = ref('')
const gpsResult = ref('')

// 热门城市列表
const popularCities = [
  '北京', '上海', '广州', '深圳', '杭州', '成都',
  '西安', '南京', '武汉', '重庆', '天津', '苏州',
  '郑州', '长沙', '沈阳', '青岛', '大连', '厦门'
]

// 初始化设置
watch(() => props.modelValue, (visible) => {
  if (visible) {
    locationInput.value = props.settings.location
    units.value = props.settings.units
    alertOnChange.value = props.settings.alertOnChange
    gpsError.value = ''
    gpsResult.value = ''
  }
}, { immediate: true })

// GPS定位
async function requestGPSLocation() {
  isLocating.value = true
  gpsError.value = ''
  gpsResult.value = ''

  try {
    // 检查权限
    const permissionStatus = await Geolocation.checkPermissions()
    if (permissionStatus.location !== 'granted') {
      const requestResult = await Geolocation.requestPermissions()
      if (requestResult.location !== 'granted') {
        throw new Error('定位权限被拒绝')
      }
    }

    // 获取位置
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    })

    const { latitude, longitude } = position.coords
    console.log(`📍 GPS坐标: ${latitude}, ${longitude}`)

    // 使用和风逆地理编码
    try {
      const cityName = await reverseGeocode(
        latitude,
        longitude,
        apiKey.value  // 使用 computed 的 API Key
      )

      locationInput.value = cityName
      gpsResult.value = `${cityName} (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`
      console.log(`✅ 逆地理编码成功: ${cityName}`)
    } catch (reverseError) {
      // 降级方案：使用坐标
      const coordName = `位置(${latitude.toFixed(2)}, ${longitude.toFixed(2)})`
      locationInput.value = coordName
      gpsResult.value = coordName
      console.log('⚠️ 逆地理编码失败，使用坐标:', reverseError)
    }
  } catch (error: any) {
    console.error('❌ GPS定位失败:', error)
    gpsError.value = error.message || '定位失败，请检查权限设置'
  } finally {
    isLocating.value = false
  }
}

// 保存设置
function save() {
  if (!locationInput.value.trim()) {
    alert('请输入或选择位置')
    return
  }

  emit('save', {
    type: 'weather',
    location: locationInput.value.trim(),
    units: units.value,
    alertOnChange: alertOnChange.value,
  })

  close()
}

// 关闭对话框
function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="modelValue" class="dialog-overlay" @click="close">
        <div class="dialog-container" @click.stop>
          <div class="dialog-header">
            <h3>天气设置</h3>
            <button class="close-btn" @click="close">✕</button>
          </div>

          <div class="dialog-content">
            <!-- 输入方式选择 -->
            <div class="input-method-tabs">
              <button
                :class="{ active: inputMethod === 'manual' }"
                @click="inputMethod = 'manual'"
              >
                手动输入
              </button>
              <button
                :class="{ active: inputMethod === 'gps' }"
                @click="inputMethod = 'gps'"
              >
                GPS定位
              </button>
              <button
                :class="{ active: inputMethod === 'list' }"
                @click="inputMethod = 'list'"
              >
                城市列表
              </button>
            </div>

            <!-- 手动输入 -->
            <div v-if="inputMethod === 'manual'" class="input-section">
              <label>城市名称</label>
              <input
                v-model="locationInput"
                type="text"
                placeholder="例如：北京、上海"
                class="location-input"
              />
            </div>

            <!-- GPS定位 -->
            <div v-else-if="inputMethod === 'gps'" class="gps-section">
              <button
                class="gps-btn"
                :disabled="isLocating"
                @click="requestGPSLocation"
              >
                {{ isLocating ? '定位中...' : '📍 获取当前位置' }}
              </button>
              <p v-if="gpsError" class="error-text">{{ gpsError }}</p>
              <p v-if="gpsResult" class="success-text">已定位：{{ gpsResult }}</p>
            </div>

            <!-- 城市列表 -->
            <div v-else-if="inputMethod === 'list'" class="city-list-section">
              <div class="city-list">
                <button
                  v-for="city in popularCities"
                  :key="city"
                  class="city-option"
                  :class="{ selected: locationInput === city }"
                  @click="locationInput = city"
                >
                  {{ city }}
                </button>
              </div>
            </div>

            <!-- 其他设置 -->
            <div class="setting-group">
              <label>温度单位</label>
              <div class="radio-group">
                <label>
                  <input type="radio" v-model="units" value="metric" />
                  摄氏度 (°C)
                </label>
                <label>
                  <input type="radio" v-model="units" value="imperial" />
                  华氏度 (°F)
                </label>
              </div>
            </div>

            <div class="setting-group">
              <label class="checkbox-label">
                <input type="checkbox" v-model="alertOnChange" />
                天气变化时提醒
              </label>
            </div>
          </div>

          <div class="dialog-footer">
            <button class="cancel-btn" @click="close">取消</button>
            <button class="confirm-btn" @click="save">保存</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.dialog-container {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 20px;
  cursor: pointer;
  border-radius: 50%;
  transition: background 0.2s;
}

.close-btn:hover {
  background: #f5f5f5;
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.input-method-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.input-method-tabs button {
  flex: 1;
  padding: 10px;
  border: 1px solid #e0e0e0;
  background: white;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.input-method-tabs button.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: transparent;
}

.input-section label {
  display: block;
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.location-input {
  width: 100%;
  padding: 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}

.location-input:focus {
  outline: none;
  border-color: #667eea;
}

.gps-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 14px;
  cursor: pointer;
}

.gps-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-text {
  color: #f44336;
  font-size: 13px;
  margin-top: 8px;
}

.success-text {
  color: #4caf50;
  font-size: 13px;
  margin-top: 8px;
}

.city-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.city-option {
  padding: 10px;
  border: 1px solid #e0e0e0;
  background: white;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.city-option.selected {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: transparent;
}

.setting-group {
  margin-bottom: 16px;
}

.setting-group > label {
  display: block;
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.radio-group label,
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}

.dialog-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #eee;
}

.cancel-btn,
.confirm-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.cancel-btn {
  background: #f5f5f5;
  color: #666;
}

.confirm-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.3s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
</style>
