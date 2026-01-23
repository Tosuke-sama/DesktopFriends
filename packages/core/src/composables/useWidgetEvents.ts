/**
 * @Description 
 */
import { ref, onMounted, onUnmounted } from 'vue'
import type { WidgetEvent, WidgetEventType } from '@desktopfriends/shared'
import { useWidgets } from './useWidgets'

type EventHandler = (event: WidgetEvent) => void

// Singleton event handlers
const eventHandlers = ref<Map<WidgetEventType, Set<EventHandler>>>(new Map())
const lastHourlyChime = ref<number>(0)
const lastHalfHourlyChime = ref<number>(0)

let clockCheckInterval: number | null = null
let initialized = false

export function useWidgetEvents() {
  const { enabledWidgets } = useWidgets()

  // Subscribe to an event type
  function subscribe(eventType: WidgetEventType, handler: EventHandler) {
    if (!eventHandlers.value.has(eventType)) {
      eventHandlers.value.set(eventType, new Set())
    }
    eventHandlers.value.get(eventType)!.add(handler)

    // Return unsubscribe function
    return () => {
      eventHandlers.value.get(eventType)?.delete(handler)
    }
  }

  // Emit an event
  function emit(event: WidgetEvent) {
    const handlers = eventHandlers.value.get(event.type)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event)
        } catch (e) {
          console.error('Widget event handler error:', e)
        }
      })
    }
  }

  // Check clock for hourly/half-hourly chimes
  function checkClockEvents() {
    const now = new Date()
    const currentMinute = now.getMinutes()
    const currentHour = now.getHours()
    const currentTimeKey = currentHour * 100 + currentMinute

    // Find clock widgets with chime enabled
    const clockWidgets = enabledWidgets.value.filter(w => w.type === 'clock')

    for (const widget of clockWidgets) {
      const settings = widget.settings as { hourlyChime?: boolean; halfHourlyChime?: boolean }

      // Hourly chime (at minute 0)
      if (settings.hourlyChime && currentMinute === 0) {
        const hourKey = currentHour
        if (lastHourlyChime.value !== hourKey) {
          lastHourlyChime.value = hourKey
          emit({
            type: 'hourlyChime',
            widgetId: widget.id,
            timestamp: now.getTime(),
            data: {
              hour: currentHour,
              message: getHourlyMessage(currentHour),
            },
          })
        }
      }

      // Half-hourly chime (at minute 30)
      if (settings.halfHourlyChime && currentMinute === 30) {
        const halfHourKey = currentTimeKey
        if (lastHalfHourlyChime.value !== halfHourKey) {
          lastHalfHourlyChime.value = halfHourKey
          emit({
            type: 'halfHourlyChime',
            widgetId: widget.id,
            timestamp: now.getTime(),
            data: {
              hour: currentHour,
              minute: 30,
              message: `现在是 ${currentHour}:30`,
            },
          })
        }
      }
    }
  }

  // Generate hourly message based on time
  function getHourlyMessage(hour: number): string {
    if (hour >= 6 && hour < 9) {
      return `早上好！现在是 ${hour} 点，新的一天开始啦~`
    } else if (hour >= 9 && hour < 12) {
      return `现在是 ${hour} 点，上午加油哦！`
    } else if (hour === 12) {
      return '中午 12 点了，该吃午饭啦！'
    } else if (hour >= 13 && hour < 14) {
      return `下午 ${hour - 12} 点，午休一下？`
    } else if (hour >= 14 && hour < 18) {
      return `下午 ${hour - 12} 点，继续加油！`
    } else if (hour >= 18 && hour < 19) {
      return '傍晚 6 点了，该吃晚饭啦！'
    } else if (hour >= 19 && hour < 22) {
      return `晚上 ${hour - 12} 点，放松一下吧~`
    } else if (hour >= 22 || hour < 1) {
      return `已经 ${hour > 12 ? hour - 12 : hour} 点了，该休息了哦~`
    } else {
      return `现在是凌晨 ${hour} 点，熬夜对身体不好哦...`
    }
  }

  // Initialize clock check (only once)
  function initClockCheck() {
    if (initialized) return

    initialized = true
    // Check every minute
    clockCheckInterval = window.setInterval(checkClockEvents, 60000)

    // Also check immediately
    checkClockEvents()
  }

  // Cleanup
  function cleanup() {
    if (clockCheckInterval) {
      clearInterval(clockCheckInterval)
      clockCheckInterval = null
    }
    initialized = false
  }

  // Start on mount
  onMounted(() => {
    initClockCheck()
  })

  // Cleanup on unmount (but keep singleton state)
  onUnmounted(() => {
    // Don't cleanup singleton - other components may still use it
  })

  return {
    subscribe,
    emit,
    initClockCheck,
    cleanup,
  }
}
