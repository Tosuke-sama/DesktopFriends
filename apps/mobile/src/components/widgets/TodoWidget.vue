<script setup lang="ts">
import { ref, computed } from "vue";
import type { WidgetConfig, TodoWidgetSettings } from "@desktopfriends/shared";
import { useWidgets } from "@desktopfriends/core";

const props = defineProps<{
  widget: WidgetConfig;
}>();

const settings = computed(() => props.widget.settings as TodoWidgetSettings);

const { todos, pendingTodos, addTodo, toggleTodo, removeTodo } = useWidgets();

const newTodoText = ref("");
const isAdding = ref(false);

// Priority order for sorting
const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

// Display todos based on settings
const displayTodos = computed(() => {
  let list = settings.value.showCompleted ? todos.value : pendingTodos.value;

  // Sort
  list = [...list].sort((a, b) => {
    switch (settings.value.sortBy) {
      case "dueDate":
        return (a.dueDate || Infinity) - (b.dueDate || Infinity);
      case "priority": {
        return (
          (priorityOrder[a.priority || "low"] ?? 2) -
          (priorityOrder[b.priority || "low"] ?? 2)
        );
      }
      case "createdAt":
      default:
        return b.createdAt - a.createdAt;
    }
  });

  return list;
});

function handleAddTodo() {
  if (newTodoText.value.trim()) {
    addTodo(newTodoText.value.trim());
    newTodoText.value = "";
    isAdding.value = false;
  }
}

function handleToggle(id: string) {
  toggleTodo(id);
}

function handleRemove(id: string) {
  removeTodo(id);
}
</script>

<template>
  <div class="todo-widget">
    <div class="todo-header">
      <span class="todo-title">待办</span>
      <span class="todo-count">{{ pendingTodos.length }}</span>
    </div>

    <div class="todo-list">
      <div
        v-for="todo in displayTodos"
        :key="todo.id"
        class="todo-item"
        :class="{ completed: todo.completed }"
      >
        <button class="todo-checkbox" @click="handleToggle(todo.id)">
          {{ todo.completed ? "✓" : "" }}
        </button>
        <span class="todo-text">{{ todo.text }}</span>
        <button class="todo-remove" @click="handleRemove(todo.id)">×</button>
      </div>

      <div v-if="displayTodos.length === 0" class="todo-empty">
        暂无待办事项
      </div>
    </div>

    <!-- Add todo -->
    <div v-if="isAdding" class="todo-add-form">
      <input
        v-model="newTodoText"
        class="todo-input"
        placeholder="输入待办..."
        @keyup.enter="handleAddTodo"
      />
      <button class="todo-add-confirm" @click="handleAddTodo">✓</button>
      <button class="todo-add-cancel" @click="isAdding = false">×</button>
    </div>
    <button v-else class="todo-add-btn" @click="isAdding = true">
      + 添加待办
    </button>
  </div>
</template>

<style scoped>
.todo-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.todo-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
}

.todo-title {
  font-weight: 600;
  color: #333;
}

.todo-count {
  background: #6366f1;
  color: white;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}

.todo-list {
  flex: 1;
  overflow-y: auto;
  margin: 8px 0;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #f5f5f5;
}

.todo-item.completed .todo-text {
  text-decoration: line-through;
  color: #999;
}

.todo-checkbox {
  width: 20px;
  height: 20px;
  border: 2px solid #ddd;
  border-radius: 4px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #6366f1;
  cursor: pointer;
  flex-shrink: 0;
}

.todo-item.completed .todo-checkbox {
  background: #6366f1;
  border-color: #6366f1;
  color: white;
}

.todo-text {
  flex: 1;
  font-size: 13px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-remove {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: #ccc;
  font-size: 16px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.todo-item:hover .todo-remove {
  opacity: 1;
}

.todo-remove:hover {
  color: #f87171;
}

.todo-empty {
  text-align: center;
  color: #999;
  font-size: 13px;
  padding: 16px 0;
}

.todo-add-btn {
  border: none;
  background: transparent;
  color: #6366f1;
  font-size: 13px;
  cursor: pointer;
  padding: 8px 0;
  text-align: left;
}

.todo-add-form {
  display: flex;
  gap: 4px;
}

.todo-input {
  flex: 1;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 13px;
  outline: none;
}

.todo-input:focus {
  border-color: #6366f1;
}

.todo-add-confirm,
.todo-add-cancel {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.todo-add-confirm {
  background: #6366f1;
  color: white;
}

.todo-add-cancel {
  background: #f5f5f5;
  color: #666;
}
</style>
