/**
 * 和风天气 API 封装
 * 文档：https://dev.qweather.com/docs/api/
 */

import type {
  QWeatherNowResponse,
  QWeatherCityResponse,
  StandardWeatherData,
} from '@desktopfriends/shared'
import { qweatherIconMap } from '@desktopfriends/shared'

// 和风天气 API 配置
const QWEATHER_API_BASE = 'https://kp5rk6h9c5.re.qweatherapi.com/v7/weather/now?location=' // 免费版 API
const QWEATHER_GEO_BASE = 'https://kp5rk6h9c5.re.qweatherapi.com/geo/v2/city/lookup?location=' // 地理编码 API 基础地址

/**
 * 带超时的 fetch 请求
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 10000
): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(id)
    return response
  } catch (error: any) {
    clearTimeout(id)
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请检查网络连接')
    }
    throw error
  }
}

/**
 * 查询城市 ID（通过城市名）
 */
export async function searchCity(
  cityName: string,
  apiKey?: string
): Promise<string | null> {
  if (!apiKey) {
    throw new Error('未配置和风天气 API Key，请在设置中配置或联系开发者')
  }

  try {
    const url = `${QWEATHER_GEO_BASE}${encodeURIComponent(
      cityName
    )}`

    const response = await fetchWithTimeout(url, {
      headers: {
        'X-QW-Api-Key': apiKey
      },
    })

    if (!response.ok) {
      throw new Error(`城市查询失败 (HTTP ${response.status})`)
    }

    const data: QWeatherCityResponse = await response.json()

    if (data.code !== '200') {
      if (data.code === '400') throw new Error('请求错误，请检查城市名称')
      if (data.code === '401') throw new Error('API Key 无效')
      if (data.code === '402') throw new Error('API Key 超过请求次数限制')
      if (data.code === '404') throw new Error('未找到该城市')
      throw new Error(`查询失败 (${data.code})`)
    }

    if (!data.location || data.location.length === 0) {
      throw new Error('未找到该城市，请检查城市名称')
    }

    // 返回第一个匹配的城市 ID（rank 最高）
    return data.location[0].id
  } catch (error: any) {
    console.error('❌ 城市查询失败:', error)
    throw error
  }
}

/**
 * 获取实时天气（通过城市 ID）
 */
export async function getWeatherByLocationId(
  locationId: string,
  apiKey?: string
): Promise<StandardWeatherData> {
  if (!apiKey) {
    throw new Error('未配置和风天气 API Key')
  }

  try {

    const url = `${QWEATHER_API_BASE}${locationId}`

    const response = await fetchWithTimeout(url, {
      headers: {
        'X-QW-Api-Key': apiKey
      },
    })

    if (!response.ok) {
      throw new Error(`天气查询失败 (HTTP ${response.status})`)
    }

    const data: QWeatherNowResponse = await response.json()

    if (data.code !== '200') {
      if (data.code === '401') throw new Error('API Key 无效')
      if (data.code === '402') throw new Error('超过请求次数限制')
      throw new Error(`天气查询失败 (${data.code})`)
    }

    // 转换为标准化数据格式
    return {
      temp: parseInt(data.now.temp),
      condition: data.now.text,
      icon: qweatherIconMap[data.now.icon] || 'default',
      humidity: parseInt(data.now.humidity),
      windSpeed: parseInt(data.now.windSpeed),
    }
  } catch (error: any) {
    console.error('❌ 天气查询失败:', error)
    throw error
  }
}

/**
 * 通过城市名直接获取天气（组合查询）
 */
export async function getWeatherByCityName(
  cityName: string,
  apiKey?: string
): Promise<StandardWeatherData> {
  // Step 1: 查询城市 ID
  const locationId = await searchCity(cityName, apiKey)

  if (!locationId) {
    throw new Error('未找到该城市')
  }

  // Step 2: 获取天气数据
  return await getWeatherByLocationId(locationId, apiKey)
}

/**
 * 逆地理编码：经纬度 → 城市名（用于 GPS 定位）
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
  apiKey?: string
): Promise<string> {
  if (!apiKey) {
    throw new Error('未配置和风天气 API Key')
  }

  try {
    const url = `${QWEATHER_GEO_BASE}/city/lookup?location=${lon},${lat}&key=${apiKey}`

    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'TableFri-Weather-Widget/2.0',
      },
    })

    if (!response.ok) {
      throw new Error('逆地理编码失败')
    }

    const data: QWeatherCityResponse = await response.json()

    if (data.code === '200' && data.location && data.location.length > 0) {
      const city = data.location[0]

      // 检查是否在中国
      if (city.country !== '中国') {
        throw new Error('当前位置不在中国境内，暂不支持')
      }

      // 返回格式：城市名（省份）
      return `${city.name}${city.adm1 !== city.name ? '（' + city.adm1 + '）' : ''}`
    }

    // 降级：使用坐标
    return `位置(${lat.toFixed(2)}, ${lon.toFixed(2)})`
  } catch (error: any) {
    console.error('❌ 逆地理编码失败:', error)
    // 降级：使用坐标
    return `位置(${lat.toFixed(2)}, ${lon.toFixed(2)})`
  }
}
