# 天气 API 集成指南

## 当前状态

天气小组件现已集成真实天气 API：

- **地理编码**：OpenStreetMap Nominatim（城市名 ↔ 经纬度）
- **天气数据**：Open-Meteo（免费、无需 API Key）

**错误处理机制**：
- ❌ 网络连接失败 → 显示"网络连接失败，请检查网络"
- ❌ 城市未找到 → 显示"未找到该城市，请检查城市名称"
- ❌ API 服务错误 → 显示具体的错误状态码

## 🌟 当前使用的 API

### 1. OpenStreetMap Nominatim（地理编码）

**用途**：将城市名转换为经纬度坐标

**优点**：
- ✅ 完全免费，无需注册
- ✅ 无需 API Key
- ✅ 全球覆盖
- ✅ 支持中文搜索
- ✅ 支持逆地理编码（坐标 → 城市名）
- ✅ 数据来自 OpenStreetMap

**API 示例**：
```
# 正向地理编码（城市名 → 坐标）
https://nominatim.openstreetmap.org/search?q=北京&format=json&limit=1&accept-language=zh-CN

# 逆地理编码（坐标 → 城市名）
https://nominatim.openstreetmap.org/reverse?lat=39.9&lon=116.4&format=json&accept-language=zh-CN
```

**使用规则**：
- 必须设置合理的 User-Agent（已设置为 `TableFri-Weather-Widget/1.0`）
- 建议限制请求频率（每秒不超过 1 次）
- 遵守使用政策：https://operations.osmfoundation.org/policies/nominatim/

### 2. Open-Meteo（天气数据）

**用途**：根据经纬度获取实时天气和预报

**优点**：
- ✅ 完全免费，无需注册
- ✅ 无需 API Key
- ✅ 无请求次数限制
- ✅ 全球天气数据覆盖
- ✅ 包含 3 天天气预报
- ✅ 详细的错误提示

**API 文档**：https://open-meteo.com/

**API 示例**：
```
https://api.open-meteo.com/v1/forecast?latitude=39.9&longitude=116.4&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=auto
```

**实现细节**：
- WMO 天气代码映射到图标和中文描述
- HTTP 状态码检查和详细错误信息
- 自动解析温度、湿度、风速等数据

---

## 备选方案：其他天气 API

### 方案 1：和风天气 API（推荐中国用户）

**优点**：
- 中国城市数据准确
- 免费额度充足（每天 1000 次请求）
- 中文文档友好

**步骤**：

1. **注册账号**：https://dev.qweather.com/
2. **获取 API Key**
3. **修改 `WeatherWidget.vue` 的 `fetchWeather` 函数**：

```typescript
async function fetchWeather() {
  if (!settings.value.location) {
    error.value = "请设置位置";
    weatherData.value = null;
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    const API_KEY = 'YOUR_QWEATHER_API_KEY'; // 替换为你的 API Key

    // 1. 先查询城市 ID
    const geoResponse = await fetch(
      `https://geoapi.qweather.com/v2/city/lookup?location=${encodeURIComponent(settings.value.location)}&key=${API_KEY}`
    );
    const geoData = await geoResponse.json();

    if (!geoData.location || geoData.location.length === 0) {
      throw new Error('未找到该城市');
    }

    const locationId = geoData.location[0].id;

    // 2. 获取实时天气
    const weatherResponse = await fetch(
      `https://devapi.qweather.com/v7/weather/now?location=${locationId}&key=${API_KEY}`
    );
    const weatherInfo = await weatherResponse.json();

    // 3. 获取天气预报（如果需要）
    let forecast = undefined;
    if (settings.value.showForecast) {
      const forecastResponse = await fetch(
        `https://devapi.qweather.com/v7/weather/3d?location=${locationId}&key=${API_KEY}`
      );
      const forecastInfo = await forecastResponse.json();

      forecast = forecastInfo.daily.slice(0, 3).map((day: any, index: number) => ({
        day: index === 0 ? '明天' : index === 1 ? '后天' : '周五',
        temp: parseInt(day.tempMax),
        icon: mapQWeatherIcon(day.iconDay),
      }));
    }

    // 4. 映射天气图标
    weatherData.value = {
      temp: parseInt(weatherInfo.now.temp),
      condition: weatherInfo.now.text,
      icon: mapQWeatherIcon(weatherInfo.now.icon),
      humidity: parseInt(weatherInfo.now.humidity),
      windSpeed: parseInt(weatherInfo.now.windSpeed),
      forecast,
    };

    console.log(`✅ Real weather fetched for: ${settings.value.location}`, weatherData.value);
  } catch (e: any) {
    error.value = e.message || "获取天气失败";
    console.error("Weather fetch error:", e);
  } finally {
    loading.value = false;
  }
}

// 映射和风天气图标到本地图标
function mapQWeatherIcon(qweatherIcon: string): string {
  const iconMap: Record<string, string> = {
    '100': 'sunny',      // 晴
    '101': 'cloudy',     // 多云
    '102': 'cloudy',     // 少云
    '103': 'partlyCloudy', // 晴间多云
    '104': 'cloudy',     // 阴
    '300': 'rainy',      // 阵雨
    '301': 'stormy',     // 强阵雨
    '302': 'stormy',     // 雷阵雨
    '305': 'rainy',      // 小雨
    '306': 'rainy',      // 中雨
    '307': 'rainy',      // 大雨
    '400': 'snowy',      // 小雪
    '401': 'snowy',      // 中雪
    '500': 'foggy',      // 薄雾
    '501': 'foggy',      // 雾
  };

  return iconMap[qweatherIcon] || 'default';
}
```

---

### 方案 2：OpenWeatherMap API（国际用户）

**优点**：
- 全球覆盖
- 免费额度：每天 1000 次请求
- 英文文档完善

**步骤**：

1. **注册账号**：https://openweathermap.org/api
2. **获取 API Key**
3. **修改代码**：

```typescript
async function fetchWeather() {
  if (!settings.value.location) {
    error.value = "请设置位置";
    weatherData.value = null;
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    const API_KEY = 'YOUR_OPENWEATHER_API_KEY';
    const units = settings.value.units === 'metric' ? 'metric' : 'imperial';

    // 获取当前天气
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(settings.value.location)}&units=${units}&appid=${API_KEY}&lang=zh_cn`
    );

    if (!response.ok) {
      throw new Error('城市未找到');
    }

    const data = await response.json();

    // 获取天气预报
    let forecast = undefined;
    if (settings.value.showForecast) {
      const forecastResponse = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(settings.value.location)}&units=${units}&appid=${API_KEY}&lang=zh_cn`
      );
      const forecastData = await forecastResponse.json();

      // 取未来3天的数据（每8小时一个点，取中午12点的数据）
      const dailyForecasts = forecastData.list.filter((item: any, index: number) => index % 8 === 4).slice(0, 3);

      forecast = dailyForecasts.map((day: any, index: number) => ({
        day: index === 0 ? '明天' : index === 1 ? '后天' : '周五',
        temp: Math.round(day.main.temp),
        icon: mapOpenWeatherIcon(day.weather[0].icon),
      }));
    }

    weatherData.value = {
      temp: Math.round(data.main.temp),
      condition: data.weather[0].description,
      icon: mapOpenWeatherIcon(data.weather[0].icon),
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed * 3.6), // m/s to km/h
      forecast,
    };

    console.log(`✅ Real weather fetched for: ${settings.value.location}`, weatherData.value);
  } catch (e: any) {
    error.value = e.message || "获取天气失败";
    console.error("Weather fetch error:", e);
  } finally {
    loading.value = false;
  }
}

// 映射 OpenWeatherMap 图标
function mapOpenWeatherIcon(owmIcon: string): string {
  const iconMap: Record<string, string> = {
    '01d': 'sunny',      // 晴天
    '01n': 'sunny',
    '02d': 'partlyCloudy', // 少云
    '02n': 'partlyCloudy',
    '03d': 'cloudy',     // 多云
    '03n': 'cloudy',
    '04d': 'cloudy',     // 阴
    '04n': 'cloudy',
    '09d': 'rainy',      // 阵雨
    '09n': 'rainy',
    '10d': 'rainy',      // 雨
    '10n': 'rainy',
    '11d': 'stormy',     // 雷暴
    '11n': 'stormy',
    '13d': 'snowy',      // 雪
    '13n': 'snowy',
    '50d': 'foggy',      // 雾
    '50n': 'foggy',
  };

  return iconMap[owmIcon] || 'default';
}
```

---

### 方案 3：代理服务器（推荐生产环境）

为了避免在客户端暴露 API Key，建议创建一个后端代理：

**后端 API（apps/server 中添加）**：

```typescript
// apps/server/src/routes/weather.ts
import { FastifyInstance } from 'fastify';

export async function weatherRoutes(fastify: FastifyInstance) {
  // 获取天气
  fastify.get('/weather', async (request, reply) => {
    const { location } = request.query as { location: string };

    if (!location) {
      return reply.code(400).send({ error: '缺少 location 参数' });
    }

    try {
      const API_KEY = process.env.QWEATHER_API_KEY; // 从环境变量读取

      // 调用和风天气 API
      const response = await fetch(
        `https://devapi.qweather.com/v7/weather/now?location=${location}&key=${API_KEY}`
      );

      const data = await response.json();
      return data;
    } catch (error) {
      return reply.code(500).send({ error: '获取天气失败' });
    }
  });
}
```

**前端调用**：

```typescript
async function fetchWeather() {
  try {
    const response = await fetch(
      `http://your-server.com/weather?location=${encodeURIComponent(settings.value.location)}`
    );
    const data = await response.json();
    // 处理数据...
  } catch (e) {
    error.value = "获取天气失败";
  }
}
```

---

## GPS 坐标逆地理编码

如果使用 GPS 定位，需要将经纬度转换为城市名。在 `WeatherSettingsDialog.vue` 中：

### 和风天气逆地理编码

```typescript
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const API_KEY = 'YOUR_QWEATHER_API_KEY';

  try {
    const response = await fetch(
      `https://geoapi.qweather.com/v2/city/lookup?location=${lng},${lat}&key=${API_KEY}`
    );
    const data = await response.json();

    if (data.location && data.location.length > 0) {
      return data.location[0].name; // 返回城市名
    }
  } catch (error) {
    console.error('逆地理编码失败:', error);
  }

  return `位置(${lat.toFixed(2)}, ${lng.toFixed(2)})`;
}
```

### 高德地图逆地理编码（推荐中国用户）

```typescript
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const API_KEY = 'YOUR_AMAP_API_KEY';

  try {
    const response = await fetch(
      `https://restapi.amap.com/v3/geocode/regeo?location=${lng},${lat}&key=${API_KEY}`
    );
    const data = await response.json();

    if (data.status === '1' && data.regeocode) {
      return data.regeocode.addressComponent.city || data.regeocode.addressComponent.province;
    }
  } catch (error) {
    console.error('逆地理编码失败:', error);
  }

  return `位置(${lat.toFixed(2)}, ${lng.toFixed(2)})`;
}
```

---

## 环境变量配置

为了安全管理 API Key，在项目根目录创建 `.env` 文件：

```bash
# .env
VITE_QWEATHER_API_KEY=your_api_key_here
VITE_OPENWEATHER_API_KEY=your_api_key_here
VITE_AMAP_API_KEY=your_api_key_here
```

在代码中使用：

```typescript
const API_KEY = import.meta.env.VITE_QWEATHER_API_KEY;
```

**⚠️ 注意**：`.env` 文件应添加到 `.gitignore`，避免泄露 API Key。

---

## 测试

1. **本地测试**：使用 `pnpm dev:mobile` 启动开发服务器
2. **查看控制台**：
   - 成功：`✅ Real weather fetched for: 城市名`
   - 失败：`❌ Weather fetch error: 错误详情`
3. **真机测试**：GPS 定位功能需要在真机上测试

**常见错误排查**：
- "网络连接失败" → 检查设备网络连接
- "未找到该城市" → 尝试使用中文城市名或英文名
- "地理编码服务错误" → Open-Meteo API 可能暂时不可用
- "天气服务错误" → Open-Meteo API 可能暂时不可用

