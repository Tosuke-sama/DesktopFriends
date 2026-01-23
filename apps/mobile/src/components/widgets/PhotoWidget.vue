<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import type {
  WidgetConfig,
  PhotoWidgetSettings,
  PhotoItem,
} from "@desktopfriends/shared";

const props = defineProps<{
  widget: WidgetConfig;
}>();

const settings = computed(() => props.widget.settings as PhotoWidgetSettings);

const currentIndex = ref(0);
let timer: number | null = null;

// Get ordered photos (shuffled or not)
const orderedPhotos = computed(() => {
  const photos = [...settings.value.photos];
  if (settings.value.shuffle && photos.length > 0) {
    // Simple shuffle for display
    for (let i = photos.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [photos[i], photos[j]] = [photos[j], photos[i]];
    }
  }
  return photos;
});

const currentPhoto = computed<PhotoItem | null>(() => {
  if (orderedPhotos.value.length === 0) return null;
  return orderedPhotos.value[currentIndex.value % orderedPhotos.value.length];
});

function nextPhoto() {
  if (orderedPhotos.value.length > 1) {
    currentIndex.value = (currentIndex.value + 1) % orderedPhotos.value.length;
  }
}

function prevPhoto() {
  if (orderedPhotos.value.length > 1) {
    currentIndex.value =
      (currentIndex.value - 1 + orderedPhotos.value.length) %
      orderedPhotos.value.length;
  }
}

function startAutoPlay() {
  if (settings.value.interval > 0 && orderedPhotos.value.length > 1) {
    timer = window.setInterval(nextPhoto, settings.value.interval * 1000);
  }
}

function stopAutoPlay() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

watch(
  () => settings.value.interval,
  () => {
    stopAutoPlay();
    startAutoPlay();
  }
);

onMounted(() => {
  startAutoPlay();
});

onUnmounted(() => {
  stopAutoPlay();
});
</script>

<template>
  <div class="photo-widget">
    <template v-if="currentPhoto">
      <div class="photo-container">
        <img
          :src="currentPhoto.url"
          :alt="currentPhoto.caption || '照片'"
          class="photo-image"
        />
      </div>

      <div
        v-if="settings.showCaption && currentPhoto.caption"
        class="photo-caption"
      >
        {{ currentPhoto.caption }}
      </div>

      <!-- Navigation dots -->
      <div v-if="orderedPhotos.length > 1" class="photo-dots">
        <span
          v-for="(_, index) in orderedPhotos"
          :key="index"
          class="dot"
          :class="{ active: index === currentIndex % orderedPhotos.length }"
          @click="currentIndex = index"
        />
      </div>

      <!-- Navigation arrows -->
      <button
        v-if="orderedPhotos.length > 1"
        class="nav-btn prev"
        @click="prevPhoto"
      >
        ‹
      </button>
      <button
        v-if="orderedPhotos.length > 1"
        class="nav-btn next"
        @click="nextPhoto"
      >
        ›
      </button>
    </template>

    <div v-else class="photo-empty">
      <span class="empty-icon">🖼️</span>
      <span class="empty-text">暂无照片</span>
      <span class="empty-hint">在设置中添加照片</span>
    </div>
  </div>
</template>

<style scoped>
.photo-widget {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
}

.photo-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
}

.photo-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-caption {
  position: absolute;
  bottom: 24px;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 8px;
  font-size: 12px;
  text-align: center;
}

.photo-dots {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
}

.dot.active {
  background: white;
}

.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.3);
  color: white;
  font-size: 16px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.photo-widget:hover .nav-btn {
  opacity: 1;
}

.nav-btn.prev {
  left: 4px;
}

.nav-btn.next {
  right: 4px;
}

.photo-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
}

.empty-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.empty-text {
  font-size: 14px;
}

.empty-hint {
  font-size: 11px;
  color: #ccc;
  margin-top: 4px;
}
</style>
