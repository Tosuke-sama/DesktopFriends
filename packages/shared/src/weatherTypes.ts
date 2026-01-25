/**
 * 和风天气 API 类型定义
 * 文档：https://dev.qweather.com/docs/api/
 */

/**
 * 和风天气实时天气响应
 */
export interface QWeatherNowResponse {
  code: string // 状态码，"200" 表示成功
  updateTime: string
  fxLink: string
  now: {
    obsTime: string // 观测时间
    temp: string // 温度（摄氏度）
    feelsLike: string // 体感温度
    icon: string // 天气图标代码
    text: string // 天气状况中文描述
    wind360: string // 风向360度
    windDir: string // 风向中文
    windScale: string // 风力等级
    windSpeed: string // 风速（公里/小时）
    humidity: string // 相对湿度（%）
    precip: string // 降水量
    pressure: string // 大气压强
    vis: string // 能见度
    cloud: string // 云量
    dew: string // 露点温度
  }
  refer: {
    sources: string[]
    license: string[]
  }
}

/**
 * 城市搜索响应
 */
export interface QWeatherCityResponse {
  code: string
  location: Array<{
    name: string // 城市名称
    id: string // 城市 ID（用于查询天气）
    lat: string // 纬度
    lon: string // 经度
    adm2: string // 上级行政区划（地级市）
    adm1: string // 上级行政区划（省/直辖市）
    country: string // 国家
    tz: string // 时区
    utcOffset: string // UTC 偏移
    isDst: string // 是否夏令时
    type: string // 地区类型
    rank: string // 地区评分
    fxLink: string // 详情链接
  }>
}

/**
 * 标准化天气数据（用于组件内部）
 */
export interface StandardWeatherData {
  temp: number // 温度（摄氏度）
  condition: string // 天气状况（中文）
  icon: string // 图标 key（映射到 emoji）
  humidity: number // 湿度（%）
  windSpeed: number // 风速（km/h）
}

/**
 * 天气图标映射（和风天气代码 → 本地图标 key）
 * 参考：https://dev.qweather.com/docs/resource/icons/
 */
export const qweatherIconMap: Record<string, string> = {
  // 晴天
  '100': 'sunny', // 晴（白天）
  '150': 'sunny', // 晴（夜间）

  // 多云
  '101': 'partlyCloudy', // 多云
  '102': 'partlyCloudy', // 少云
  '103': 'partlyCloudy', // 晴间多云
  '151': 'partlyCloudy', // 多云（夜间）
  '152': 'partlyCloudy', // 少云（夜间）
  '153': 'partlyCloudy', // 晴间多云（夜间）

  // 阴天
  '104': 'cloudy', // 阴

  // 雨天
  '300': 'rainy', // 阵雨
  '301': 'stormy', // 强阵雨
  '302': 'stormy', // 雷阵雨
  '303': 'stormy', // 强雷阵雨
  '304': 'stormy', // 雷阵雨伴有冰雹
  '305': 'rainy', // 小雨
  '306': 'rainy', // 中雨
  '307': 'rainy', // 大雨
  '308': 'rainy', // 极端降雨
  '309': 'rainy', // 毛毛雨/细雨
  '310': 'stormy', // 暴雨
  '311': 'stormy', // 大暴雨
  '312': 'stormy', // 特大暴雨
  '313': 'rainy', // 冻雨
  '314': 'rainy', // 小到中雨
  '315': 'rainy', // 中到大雨
  '316': 'stormy', // 大到暴雨
  '317': 'stormy', // 暴雨到大暴雨
  '318': 'stormy', // 大暴雨到特大暴雨
  '350': 'rainy', // 阵雨（夜间）
  '351': 'stormy', // 强阵雨（夜间）

  // 雪天
  '400': 'snowy', // 小雪
  '401': 'snowy', // 中雪
  '402': 'snowy', // 大雪
  '403': 'snowy', // 暴雪
  '404': 'snowy', // 雨夹雪
  '405': 'snowy', // 雨雪天气
  '406': 'snowy', // 阵雨夹雪
  '407': 'snowy', // 阵雪
  '408': 'snowy', // 小到中雪
  '409': 'snowy', // 中到大雪
  '410': 'snowy', // 大到暴雪
  '456': 'snowy', // 阵雨夹雪（夜间）
  '457': 'snowy', // 阵雪（夜间）

  // 雾霾
  '500': 'foggy', // 薄雾
  '501': 'foggy', // 雾
  '502': 'foggy', // 霾
  '503': 'foggy', // 扬沙
  '504': 'foggy', // 浮尘
  '507': 'foggy', // 沙尘暴
  '508': 'foggy', // 强沙尘暴
  '509': 'foggy', // 浓雾
  '510': 'foggy', // 强浓雾
  '511': 'foggy', // 中度霾
  '512': 'foggy', // 重度霾
  '513': 'foggy', // 严重霾
  '514': 'foggy', // 大雾
  '515': 'foggy', // 特强浓雾

  // 其他
  '900': 'default', // 热
  '901': 'default', // 冷
  '999': 'default', // 未知
}
