/**
 * @Description 
 */
import { ref, computed, watch } from 'vue'
import type {
  WidgetConfig,
  WidgetType,
  WidgetPosition,
  WidgetContext,
  GridConfig,
  WidgetSettings,
  TodoItem,
  WidgetSizeConstraints,
} from '@desktopfriends/shared'
import {
  defaultClockSettings,
  defaultPhotoSettings,
  defaultWeatherSettings,
  defaultTodoSettings,
  defaultWidgetSizes,
  widgetInfo,
} from '@desktopfriends/shared'

const STORAGE_KEY = 'desktop-pet-widgets'
const TODO_STORAGE_KEY = 'desktop-pet-todos'

// Grid configuration
const GRID_COLUMNS = 6
const GRID_ROWS = 10
const GRID_PADDING = 8
const GRID_GAP = 8  // Gap between grid cells

// Singleton state
const widgets = ref<WidgetConfig[]>([])
const todos = ref<TodoItem[]>([])
const editMode = ref(false)
const initialized = ref(false)

// Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// Get default settings for widget type
function getDefaultSettings(type: WidgetType): WidgetSettings {
  switch (type) {
    case 'clock':
      return { ...defaultClockSettings }
    case 'photo':
      return { ...defaultPhotoSettings }
    case 'weather':
      return { ...defaultWeatherSettings }
    case 'todo':
      return { ...defaultTodoSettings }
  }
}

// Load from localStorage
function loadWidgets(): WidgetConfig[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to load widgets:', e)
  }
  return []
}

function loadTodos(): TodoItem[] {
  try {
    const stored = localStorage.getItem(TODO_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.error('Failed to load todos:', e)
  }
  return []
}

// Save to localStorage
function saveWidgets() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets.value))
  } catch (e) {
    console.error('Failed to save widgets:', e)
  }
}

function saveTodos() {
  try {
    localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos.value))
  } catch (e) {
    console.error('Failed to save todos:', e)
  }
}

export function useWidgets() {
  // Initialize once
  if (!initialized.value) {
    widgets.value = loadWidgets()
    todos.value = loadTodos()
    initialized.value = true
  }

  // Watch for changes and persist
  watch(widgets, saveWidgets, { deep: true })
  watch(todos, saveTodos, { deep: true })

  // Grid configuration computed from screen size
  const gridConfig = computed<GridConfig>(() => {
    const screenWidth = window.innerWidth
    const screenHeight = window.innerHeight - 200 // Reserve space for chat area

    // Calculate available space considering gaps
    const availableWidth = screenWidth - GRID_PADDING * 2 - (GRID_COLUMNS - 1) * GRID_GAP
    const availableHeight = screenHeight - GRID_PADDING * 2 - (GRID_ROWS - 1) * GRID_GAP

    return {
      columns: GRID_COLUMNS,
      rows: GRID_ROWS,
      cellWidth: Math.floor(availableWidth / GRID_COLUMNS),
      cellHeight: Math.floor(availableHeight / GRID_ROWS),
      padding: GRID_PADDING,
      gap: GRID_GAP,
    }
  })

  // Convert grid position to pixel position
  function gridToPixel(position: WidgetPosition) {
    const config = gridConfig.value
    return {
      x: config.padding + position.gridX * (config.cellWidth + config.gap),
      y: config.padding + position.gridY * (config.cellHeight + config.gap),
      width: position.gridWidth * config.cellWidth + (position.gridWidth - 1) * config.gap,
      height: position.gridHeight * config.cellHeight + (position.gridHeight - 1) * config.gap,
    }
  }

  // Convert pixel position to grid position (with snapping)
  function pixelToGrid(x: number, y: number): { gridX: number; gridY: number } {
    const config = gridConfig.value
    const relX = x - config.padding
    const relY = y - config.padding

    return {
      gridX: Math.round(relX / (config.cellWidth + config.gap)),
      gridY: Math.round(relY / (config.cellHeight + config.gap)),
    }
  }

  // Check if position is valid (within bounds and no collision)
  function isValidPosition(position: WidgetPosition, excludeId?: string): boolean {
    const config = gridConfig.value

    // Check bounds
    if (position.gridX < 0 || position.gridY < 0) return false
    if (position.gridX + position.gridWidth > config.columns) return false
    if (position.gridY + position.gridHeight > config.rows) return false

    // Check collision with other widgets
    for (const widget of widgets.value) {
      if (widget.id === excludeId) continue
      if (!widget.enabled) continue

      const hasOverlap =
        position.gridX < widget.position.gridX + widget.position.gridWidth &&
        position.gridX + position.gridWidth > widget.position.gridX &&
        position.gridY < widget.position.gridY + widget.position.gridHeight &&
        position.gridY + position.gridHeight > widget.position.gridY

      if (hasOverlap) return false
    }

    return true
  }

  // Check if widget size is within constraints
  function isValidSize(type: WidgetType, width: number, height: number): boolean {
    const constraints = widgetInfo[type].sizeConstraints
    return (
      width >= constraints.minWidth &&
      width <= constraints.maxWidth &&
      height >= constraints.minHeight &&
      height <= constraints.maxHeight
    )
  }

  // Get widget size constraints
  function getWidgetConstraints(type: WidgetType): WidgetSizeConstraints {
    return widgetInfo[type].sizeConstraints
  }

  // Find first available position for a new widget
  function findAvailablePosition(width: number, height: number): WidgetPosition | null {
    const config = gridConfig.value

    for (let y = 0; y <= config.rows - height; y++) {
      for (let x = 0; x <= config.columns - width; x++) {
        const position: WidgetPosition = {
          gridX: x,
          gridY: y,
          gridWidth: width,
          gridHeight: height,
        }
        if (isValidPosition(position)) {
          return position
        }
      }
    }

    return null
  }

  // Add a new widget
  function addWidget(type: WidgetType): WidgetConfig | null {
    const size = defaultWidgetSizes[type]
    const position = findAvailablePosition(size.width, size.height)

    if (!position) {
      console.warn('No available space for widget')
      return null
    }

    const widget: WidgetConfig = {
      id: generateId(),
      type,
      position,
      enabled: true,
      settings: getDefaultSettings(type),
    }

    widgets.value.push(widget)
    return widget
  }

  // Remove a widget
  function removeWidget(id: string) {
    const index = widgets.value.findIndex((w) => w.id === id)
    if (index !== -1) {
      widgets.value.splice(index, 1)
    }
  }

  // Update widget position
  function updateWidgetPosition(id: string, position: WidgetPosition): boolean {
    const widget = widgets.value.find((w) => w.id === id)
    if (!widget) return false

    // Validate size constraints
    if (!isValidSize(widget.type, position.gridWidth, position.gridHeight)) {
      console.warn('Invalid size for widget type:', widget.type, position)
      return false
    }

    if (!isValidPosition(position, id)) return false

    widget.position = position
    return true
  }

  // Update widget settings
  function updateWidgetSettings(id: string, settings: Partial<WidgetSettings>) {
    const widget = widgets.value.find((w) => w.id === id)
    if (widget) {
      widget.settings = { ...widget.settings, ...settings } as WidgetSettings
    }
  }

  // Toggle widget enabled state
  function toggleWidget(id: string) {
    const widget = widgets.value.find((w) => w.id === id)
    if (widget) {
      widget.enabled = !widget.enabled
    }
  }

  // Get enabled widgets
  const enabledWidgets = computed(() => widgets.value.filter((w) => w.enabled))

  // === Todo Management ===

  function addTodo(text: string, dueDate?: number, priority?: 'low' | 'medium' | 'high') {
    const todo: TodoItem = {
      id: generateId(),
      text,
      completed: false,
      createdAt: Date.now(),
      dueDate,
      priority,
    }
    todos.value.push(todo)
    return todo
  }

  function removeTodo(id: string) {
    const index = todos.value.findIndex((t) => t.id === id)
    if (index !== -1) {
      todos.value.splice(index, 1)
    }
  }

  function toggleTodo(id: string) {
    const todo = todos.value.find((t) => t.id === id)
    if (todo) {
      todo.completed = !todo.completed
    }
  }

  function updateTodo(id: string, updates: Partial<TodoItem>) {
    const todo = todos.value.find((t) => t.id === id)
    if (todo) {
      Object.assign(todo, updates)
    }
  }

  const pendingTodos = computed(() => todos.value.filter((t) => !t.completed))
  const completedTodos = computed(() => todos.value.filter((t) => t.completed))

  // === LLM Context ===

  // Get aggregated widget context for LLM
  function getWidgetContexts(): WidgetContext[] {
    const contexts: WidgetContext[] = []

    for (const widget of enabledWidgets.value) {
      switch (widget.type) {
        case 'clock': {
          const now = new Date()
          contexts.push({
            type: 'clock',
            summary: `当前时间: ${now.toLocaleTimeString('zh-CN')}`,
            data: {
              time: now.toISOString(),
              hour: now.getHours(),
              minute: now.getMinutes(),
            },
          })
          break
        }
        case 'todo': {
          const pending = pendingTodos.value
          contexts.push({
            type: 'todo',
            summary: `待办事项: ${pending.length}项未完成`,
            data: {
              pendingCount: pending.length,
              items: pending.slice(0, 5).map((t) => t.text),
            },
          })
          break
        }
        case 'weather': {
          // Weather context will be populated by weather widget
          contexts.push({
            type: 'weather',
            summary: '天气信息暂未获取',
            data: {},
          })
          break
        }
        case 'photo': {
          // Photo context will be populated by photo widget
          contexts.push({
            type: 'photo',
            summary: '照片展示中',
            data: {},
          })
          break
        }
      }
    }

    return contexts
  }

  // Get formatted context string for system prompt
  function getContextString(): string {
    const contexts = getWidgetContexts()
    if (contexts.length === 0) return ''

    const parts = contexts.map((c) => c.summary)
    return `[当前小组件状态] ${parts.join(', ')}`
  }

  return {
    // State
    widgets,
    todos,
    editMode,
    enabledWidgets,
    pendingTodos,
    completedTodos,

    // Grid
    gridConfig,
    gridToPixel,
    pixelToGrid,
    isValidPosition,
    getWidgetConstraints,

    // Widget CRUD
    addWidget,
    removeWidget,
    updateWidgetPosition,
    updateWidgetSettings,
    toggleWidget,

    // Todo CRUD
    addTodo,
    removeTodo,
    toggleTodo,
    updateTodo,

    // LLM Context
    getWidgetContexts,
    getContextString,
  }
}
