<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import HomeView from "./views/HomeView.vue";
import SettingsView from "./views/SettingsView.vue";

type ViewName = "home" | "settings";

const currentView = ref<ViewName>("home");
const previousView = ref<ViewName>("home");

const transitionName = computed(() => {
  // 设置页面从右侧滑入
  if (currentView.value === "settings") {
    return "slide-left";
  }
  // 返回主页时从左侧滑入
  return "slide-right";
});

const navigateTo = (view: ViewName) => {
  previousView.value = currentView.value;
  currentView.value = view;
};
</script>

<template>
  <div class="app">
    <Transition :name="transitionName" mode="out-in">
      <!-- <KeepAlive include="HomeView"> -->
      <HomeView
        v-if="currentView === 'home'"
        key="home"
        @open-settings="navigateTo('settings')"
      />
      <SettingsView
        v-else-if="currentView === 'settings'"
        key="settings"
        @back="navigateTo('home')"
      />
      <!-- </KeepAlive> -->
    </Transition>
  </div>
</template>

<style>
/* Global styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#app {
  width: 100%;
  height: 100%;
}
</style>

<style scoped>
.app {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

/* Page transitions - Slide Left (entering settings) */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-left-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-30%);
}

/* Page transitions - Slide Right (returning home) */
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-30%);
}

.slide-right-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
