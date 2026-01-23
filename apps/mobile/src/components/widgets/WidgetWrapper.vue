<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import type { WidgetConfig, WidgetPosition } from "@desktopfriends/shared";
import { useWidgets } from "@desktopfriends/core";

const props = defineProps<{
  widget: WidgetConfig;
}>();

const emit = defineEmits<{
  remove: [id: string];
  settings: [id: string];
}>();

const {
  gridConfig,
  gridToPixel,
  pixelToGrid,
  isValidPosition,
  updateWidgetPosition,
  editMode,
  getWidgetConstraints,
} = useWidgets();

const wrapperRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const dragOffset = ref({ x: 0, y: 0 });
const tempPosition = ref<{ x: number; y: number } | null>(null);

// Long press detection
const longPressTimer = ref<number | null>(null);
const touchStartPos = ref<{ x: number; y: number } | null>(null);
const longPressTriggered = ref(false);

const LONG_PRESS_DURATION = 600; // 600ms
const MOVE_THRESHOLD = 10; // 10px

// Resize state
const isResizing = ref(false);
const resizeHandle = ref<'tl' | 'tr' | 'bl' | 'br' | null>(null);
const resizeStartPos = ref<{ x: number; y: number } | null>(null);
const resizeStartSize = ref<{ width: number; height: number } | null>(null);
const tempSize = ref<{ gridWidth: number; gridHeight: number } | null>(null);

// Get size constraints for this widget
const sizeConstraints = computed(() => getWidgetConstraints(props.widget.type));

// Compute pixel position from grid position
const pixelPosition = computed(() => {
  if (tempPosition.value) {
    return {
      x: tempPosition.value.x,
      y: tempPosition.value.y,
      width: props.widget.position.gridWidth * gridConfig.value.cellWidth,
      height: props.widget.position.gridHeight * gridConfig.value.cellHeight,
    };
  }
  return gridToPixel(props.widget.position);
});

// Style for the wrapper
const wrapperStyle = computed(() => ({
  position: "absolute" as const,
  left: `${pixelPosition.value.x}px`,
  top: `${pixelPosition.value.y}px`,
  width: `${pixelPosition.value.width}px`,
  height: `${pixelPosition.value.height}px`,
  transition: isDragging.value ? "none" : "all 0.2s ease",
  zIndex: isDragging.value ? 100 : 10,
}));

// Clear long press timer
function clearLongPress() {
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value);
    longPressTimer.value = null;
  }
  touchStartPos.value = null;
  longPressTriggered.value = false;
}

// Handle touch start (unified entry point)
function handleTouchStart(e: TouchEvent | MouseEvent) {
  // If already in edit mode, directly execute drag
  if (editMode.value) {
    onDragStart(e);
    return;
  }

  // Not in edit mode, start long press detection
  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  touchStartPos.value = { x: clientX, y: clientY };
  longPressTriggered.value = false;

  // Start long press timer
  longPressTimer.value = window.setTimeout(() => {
    longPressTriggered.value = true;

    // Vibration feedback (if supported)
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    // Enter edit mode
    editMode.value = true;

    // Clear state
    clearLongPress();
  }, LONG_PRESS_DURATION);
}

// Handle touch move (check if long press should be canceled)
function handleTouchMove(e: TouchEvent | MouseEvent) {
  if (!touchStartPos.value || editMode.value) return;

  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  const dx = clientX - touchStartPos.value.x;
  const dy = clientY - touchStartPos.value.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Cancel long press if moved more than threshold
  if (distance > MOVE_THRESHOLD) {
    clearLongPress();
  }
}

// Handle touch end
function handleTouchEnd() {
  clearLongPress();
}

// Handle drag start
function onDragStart(e: TouchEvent | MouseEvent) {
  if (!editMode.value) return;

  e.preventDefault();
  e.stopPropagation();

  isDragging.value = true;

  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  const rect = wrapperRef.value?.getBoundingClientRect();
  if (rect) {
    dragOffset.value = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  document.addEventListener("mousemove", onDragMove);
  document.addEventListener("mouseup", onDragEnd);
  document.addEventListener("touchmove", onDragMove, { passive: false });
  document.addEventListener("touchend", onDragEnd);
}

// Handle drag move
function onDragMove(e: TouchEvent | MouseEvent) {
  if (!isDragging.value) return;

  e.preventDefault();

  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  tempPosition.value = {
    x: clientX - dragOffset.value.x,
    y: clientY - dragOffset.value.y,
  };
}

// Handle drag end
function onDragEnd() {
  if (!isDragging.value) return;

  isDragging.value = false;

  document.removeEventListener("mousemove", onDragMove);
  document.removeEventListener("mouseup", onDragEnd);
  document.removeEventListener("touchmove", onDragMove);
  document.removeEventListener("touchend", onDragEnd);

  if (tempPosition.value) {
    // Snap to grid
    const gridPos = pixelToGrid(tempPosition.value.x, tempPosition.value.y);
    const newPosition: WidgetPosition = {
      gridX: Math.max(
        0,
        Math.min(
          gridPos.gridX,
          gridConfig.value.columns - props.widget.position.gridWidth
        )
      ),
      gridY: Math.max(
        0,
        Math.min(
          gridPos.gridY,
          gridConfig.value.rows - props.widget.position.gridHeight
        )
      ),
      gridWidth: props.widget.position.gridWidth,
      gridHeight: props.widget.position.gridHeight,
    };

    // Check if valid and update
    if (isValidPosition(newPosition, props.widget.id)) {
      updateWidgetPosition(props.widget.id, newPosition);
    }

    tempPosition.value = null;
  }
}

// Resize handlers
function onResizeStart(e: TouchEvent | MouseEvent, handle: 'tl' | 'tr' | 'bl' | 'br') {
  if (!editMode.value) return;

  e.preventDefault();
  e.stopPropagation();

  isResizing.value = true;
  resizeHandle.value = handle;

  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  resizeStartPos.value = { x: clientX, y: clientY };
  resizeStartSize.value = {
    width: props.widget.position.gridWidth,
    height: props.widget.position.gridHeight,
  };

  document.addEventListener("mousemove", onResizeMove);
  document.addEventListener("mouseup", onResizeEnd);
  document.addEventListener("touchmove", onResizeMove, { passive: false });
  document.addEventListener("touchend", onResizeEnd);
}

function onResizeMove(e: TouchEvent | MouseEvent) {
  if (!isResizing.value || !resizeStartPos.value || !resizeStartSize.value) return;

  e.preventDefault();

  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

  const deltaX = clientX - resizeStartPos.value.x;
  const deltaY = clientY - resizeStartPos.value.y;

  const config = gridConfig.value;
  const cellSizeX = config.cellWidth + config.gap;
  const cellSizeY = config.cellHeight + config.gap;

  const deltaGridX = Math.round(deltaX / cellSizeX);
  const deltaGridY = Math.round(deltaY / cellSizeY);

  let newGridX = props.widget.position.gridX;
  let newGridY = props.widget.position.gridY;
  let newWidth = resizeStartSize.value.width;
  let newHeight = resizeStartSize.value.height;

  switch (resizeHandle.value) {
    case 'tl':
      newGridX += deltaGridX;
      newGridY += deltaGridY;
      newWidth -= deltaGridX;
      newHeight -= deltaGridY;
      break;
    case 'tr':
      newGridY += deltaGridY;
      newWidth += deltaGridX;
      newHeight -= deltaGridY;
      break;
    case 'bl':
      newGridX += deltaGridX;
      newWidth -= deltaGridX;
      newHeight += deltaGridY;
      break;
    case 'br':
      newWidth += deltaGridX;
      newHeight += deltaGridY;
      break;
  }

  const constraints = sizeConstraints.value;
  newWidth = Math.max(constraints.minWidth, Math.min(constraints.maxWidth, newWidth));
  newHeight = Math.max(constraints.minHeight, Math.min(constraints.maxHeight, newHeight));

  if (resizeHandle.value === 'tl' || resizeHandle.value === 'bl') {
    newGridX = props.widget.position.gridX + (resizeStartSize.value.width - newWidth);
  }
  if (resizeHandle.value === 'tl' || resizeHandle.value === 'tr') {
    newGridY = props.widget.position.gridY + (resizeStartSize.value.height - newHeight);
  }

  newGridX = Math.max(0, Math.min(newGridX, config.columns - newWidth));
  newGridY = Math.max(0, Math.min(newGridY, config.rows - newHeight));

  tempSize.value = { gridWidth: newWidth, gridHeight: newHeight };
}

function onResizeEnd() {
  if (!isResizing.value || !tempSize.value) {
    isResizing.value = false;
    return;
  }

  document.removeEventListener("mousemove", onResizeMove);
  document.removeEventListener("mouseup", onResizeEnd);
  document.removeEventListener("touchmove", onResizeMove);
  document.removeEventListener("touchend", onResizeEnd);

  const newPosition: WidgetPosition = {
    gridX: props.widget.position.gridX,
    gridY: props.widget.position.gridY,
    gridWidth: tempSize.value.gridWidth,
    gridHeight: tempSize.value.gridHeight,
  };

  if (isValidPosition(newPosition, props.widget.id)) {
    updateWidgetPosition(props.widget.id, newPosition);
  }

  tempSize.value = null;
  resizeHandle.value = null;
  resizeStartPos.value = null;
  resizeStartSize.value = null;
  isResizing.value = false;
}

// Handle remove
function onRemove() {
  emit("remove", props.widget.id);
}

// Handle settings
function onSettings() {
  emit("settings", props.widget.id);
}

// Cleanup on unmount
onUnmounted(() => {
  clearLongPress();
  document.removeEventListener("mousemove", onDragMove);
  document.removeEventListener("mouseup", onDragEnd);
  document.removeEventListener("touchmove", onDragMove);
  document.removeEventListener("touchend", onDragEnd);
  // Resize cleanup
  document.removeEventListener("mousemove", onResizeMove);
  document.removeEventListener("mouseup", onResizeEnd);
  document.removeEventListener("touchmove", onResizeMove);
  document.removeEventListener("touchend", onResizeEnd);
});
</script>

<template>
  <div
    ref="wrapperRef"
    class="widget-wrapper"
    :class="{
      'is-dragging': isDragging,
      'is-resizing': isResizing,
      'edit-mode': editMode
    }"
    :style="wrapperStyle"
    @mousedown="handleTouchStart"
    @mouseup="handleTouchEnd"
    @mousemove="handleTouchMove"
    @mouseleave="handleTouchEnd"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- Resize handles (four corners) -->
    <div v-if="editMode" class="resize-handles">
      <div
        class="resize-handle resize-tl"
        @mousedown.stop="onResizeStart($event, 'tl')"
        @touchstart.stop="onResizeStart($event, 'tl')"
      />
      <div
        class="resize-handle resize-tr"
        @mousedown.stop="onResizeStart($event, 'tr')"
        @touchstart.stop="onResizeStart($event, 'tr')"
      />
      <div
        class="resize-handle resize-bl"
        @mousedown.stop="onResizeStart($event, 'bl')"
        @touchstart.stop="onResizeStart($event, 'bl')"
      />
      <div
        class="resize-handle resize-br"
        @mousedown.stop="onResizeStart($event, 'br')"
        @touchstart.stop="onResizeStart($event, 'br')"
      />
    </div>

    <!-- Size indicator (shown when resizing) -->
    <div v-if="isResizing" class="size-indicator">
      {{ tempSize?.gridWidth || props.widget.position.gridWidth }}×{{
        tempSize?.gridHeight || props.widget.position.gridHeight
      }}
    </div>

    <!-- Edit mode controls -->
    <div v-if="editMode" class="widget-controls">
      <button
        class="control-btn settings-btn"
        @click.stop="onSettings"
        @touchstart.stop
        @mousedown.stop
      >
        <span>⚙️</span>
      </button>
      <button
        class="control-btn remove-btn"
        @click.stop="onRemove"
        @touchstart.stop
        @mousedown.stop
      >
        <span>✕</span>
      </button>
    </div>

    <!-- Widget content slot -->
    <div class="widget-content">
      <slot />
    </div>

    <!-- Drag handle indicator (edit mode only) -->
    <div v-if="editMode" class="drag-indicator">
      <span>⋮⋮</span>
    </div>
  </div>
</template>

<style scoped>
.widget-wrapper {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  user-select: none;
}

.widget-wrapper.edit-mode {
  cursor: grab;
  border: 2px dashed rgba(100, 100, 255, 0.5);
}

.widget-wrapper.is-dragging {
  cursor: grabbing;
  opacity: 0.8;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.widget-controls {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 6px;
  z-index: 20;
}

.control-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
  /* 确保按钮可以接收触摸事件 */
  touch-action: none;
  /* 增加点击区域 */
  padding: 4px;
}

.settings-btn {
  background: rgba(100, 100, 255, 0.8);
  color: white;
}

.remove-btn {
  background: rgba(255, 100, 100, 0.8);
  color: white;
}

.control-btn:active {
  transform: scale(0.9);
}

.widget-content {
  width: 100%;
  height: 100%;
  padding: 8px;
  box-sizing: border-box;
}

.drag-indicator {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(100, 100, 255, 0.5);
  font-size: 12px;
  pointer-events: none;
}

/* Resize handles container */
.resize-handles {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

/* Resize handle */
.resize-handle {
  position: absolute;
  width: 20px;
  height: 20px;
  background: rgba(99, 102, 241, 0.8);
  border: 2px solid white;
  border-radius: 50%;
  pointer-events: auto;
  cursor: pointer;
  z-index: 15;
  transition: all 0.2s ease;
}

.resize-handle:hover {
  transform: scale(1.2);
  background: rgba(99, 102, 241, 1);
}

.resize-handle:active {
  transform: scale(0.9);
}

/* Four corners */
.resize-tl {
  top: -10px;
  left: -10px;
  cursor: nwse-resize;
}

.resize-tr {
  top: -10px;
  right: -10px;
  cursor: nesw-resize;
}

.resize-bl {
  bottom: -10px;
  left: -10px;
  cursor: nesw-resize;
}

.resize-br {
  bottom: -10px;
  right: -10px;
  cursor: nwse-resize;
}

/* Size indicator */
.size-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(99, 102, 241, 0.9);
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  pointer-events: none;
  z-index: 20;
}

/* Resizing state */
.widget-wrapper.is-resizing {
  opacity: 0.8;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
}
</style>
