/**
 * @Description 
 */
/**
 * Widget System Type Definitions
 */

// Widget position in grid units
export interface WidgetPosition {
  gridX: number      // Grid column (0-based)
  gridY: number      // Grid row (0-based)
  gridWidth: number  // Width in grid units
  gridHeight: number // Height in grid units
}

// Widget size constraints
export interface WidgetSizeConstraints {
  minWidth: number   // Minimum width (in grid units)
  minHeight: number  // Minimum height (in grid units)
  maxWidth: number   // Maximum width (in grid units)
  maxHeight: number  // Maximum height (in grid units)
}

// Widget types
export type WidgetType = 'clock' | 'photo' | 'weather' | 'todo'

// Base widget configuration
export interface WidgetConfig {
  id: string
  type: WidgetType
  position: WidgetPosition
  enabled: boolean
  settings: WidgetSettings
}

// Widget-specific settings
export type WidgetSettings =
  | ClockWidgetSettings
  | PhotoWidgetSettings
  | WeatherWidgetSettings
  | TodoWidgetSettings

// Clock widget settings
export interface ClockWidgetSettings {
  type: 'clock'
  format: '12h' | '24h'
  showSeconds: boolean
  showDate: boolean
  hourlyChime: boolean
  halfHourlyChime: boolean
}

// Photo widget settings
export interface PhotoWidgetSettings {
  type: 'photo'
  photos: PhotoItem[]
  interval: number
  shuffle: boolean
  showCaption: boolean
}

export interface PhotoItem {
  id: string
  url: string
  caption?: string
}

// Weather widget settings
export interface WeatherWidgetSettings {
  type: 'weather'
  location: string
  units: 'metric' | 'imperial'
  showForecast: boolean
  alertOnChange: boolean
}

// Todo widget settings
export interface TodoWidgetSettings {
  type: 'todo'
  showCompleted: boolean
  sortBy: 'createdAt' | 'dueDate' | 'priority'
  reminderEnabled: boolean
}

// Todo item
export interface TodoItem {
  id: string
  text: string
  completed: boolean
  createdAt: number
  dueDate?: number
  priority?: 'low' | 'medium' | 'high'
}

// Widget context for LLM integration
export interface WidgetContext {
  type: WidgetType
  summary: string
  data: Record<string, unknown>
}

// Widget event types
export type WidgetEventType =
  | 'hourlyChime'
  | 'halfHourlyChime'
  | 'photoChanged'
  | 'todoReminder'
  | 'weatherAlert'
  | 'weatherChanged'

export interface WidgetEvent {
  type: WidgetEventType
  widgetId: string
  timestamp: number
  data: Record<string, unknown>
}

// Grid configuration
export interface GridConfig {
  columns: number
  rows: number
  cellWidth: number
  cellHeight: number
  padding: number
  gap: number  // Gap between grid cells (in pixels)
}

// Default settings
export const defaultClockSettings: ClockWidgetSettings = {
  type: 'clock',
  format: '24h',
  showSeconds: false,
  showDate: true,
  hourlyChime: true,
  halfHourlyChime: false,
}

export const defaultPhotoSettings: PhotoWidgetSettings = {
  type: 'photo',
  photos: [],
  interval: 30,
  shuffle: true,
  showCaption: true,
}

export const defaultWeatherSettings: WeatherWidgetSettings = {
  type: 'weather',
  location: '',
  units: 'metric',
  showForecast: true,
  alertOnChange: true,
}

export const defaultTodoSettings: TodoWidgetSettings = {
  type: 'todo',
  showCompleted: false,
  sortBy: 'createdAt',
  reminderEnabled: true,
}

// Default widget sizes (grid units)
export const defaultWidgetSizes: Record<WidgetType, { width: number; height: number }> = {
  clock: { width: 2, height: 2 },
  photo: { width: 3, height: 3 },
  weather: { width: 2, height: 2 },
  todo: { width: 3, height: 4 },
}

// Widget display info
export const widgetInfo: Record<
  WidgetType,
  {
    name: string
    icon: string
    description: string
    disabled?: boolean
    disabledReason?: string
    sizeConstraints: WidgetSizeConstraints
  }
> = {
  clock: {
    name: '时钟',
    icon: '🕐',
    description: '显示当前时间，支持整点报时',
    sizeConstraints: {
      minWidth: 2,
      minHeight: 2,
      maxWidth: 4,
      maxHeight: 3,
    },
  },
  photo: {
    name: '照片',
    icon: '🖼️',
    description: '展示照片轮播',
    disabled: true,
    disabledReason: '照片小组件正在开发中，敬请期待',
    sizeConstraints: {
      minWidth: 2,
      minHeight: 2,
      maxWidth: 4,
      maxHeight: 4,
    },
  },
  weather: {
    name: '天气',
    icon: '🌤️',
    description: '显示当前天气信息',
    sizeConstraints: {
      minWidth: 2,
      minHeight: 2,
      maxWidth: 4,
      maxHeight: 4,
    },
  },
  todo: {
    name: '待办',
    icon: '📝',
    description: '管理待办事项',
    sizeConstraints: {
      minWidth: 2,
      minHeight: 3,
      maxWidth: 4,
      maxHeight: 6,
    },
  },
}
