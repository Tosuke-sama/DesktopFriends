<script setup lang="ts">
import {
  ref,
  onMounted,
  onUnmounted,
  // onActivated,
  // onDeactivated,
  watch,
} from "vue";
import * as PIXI from "pixi.js";
import { Live2DModel } from "pixi-live2d-display";
// import { Capacitor } from "@capacitor/core";
import { useSettings, type Live2DTransform } from "@desktopfriends/core";

// 注册 Live2D 到 PIXI（必须在加载模型前执行）
// @ts-ignore
window.PIXI = PIXI;

const { currentPet, live2dTransform } = useSettings();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);
const renderWarning = ref(false); // 渲染警告状态（移动端纹理兼容性问题）

// 动作组信息
export interface MotionInfo {
  group: string; // 动作组名
  name: string; // 动作名称
  index: number; // 在组内的索引
}

// 当前模型可用的动作和表情
const availableMotions = ref<string[]>([]); // 动作组名列表
const availableExpressions = ref<string[]>([]); // 表情列表
const motionDetails = ref<MotionInfo[]>([]); // 详细动作列表

let app: PIXI.Application | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let model: any = null;
let placeholder: PIXI.Text | null = null;
let baseScale = 1; // 基础缩放比例（适应屏幕的）
let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
let lastOrientation: "portrait" | "landscape" | null = null; // 记录上次屏幕方向

// 应用变换设置
const applyTransform = (transform: Live2DTransform) => {
  if (!model || !app) return;

  // 计算最终缩放
  const finalScale = baseScale * transform.scale;

  // 计算位置偏移
  const centerX = app.screen.width / 2;
  const centerY = app.screen.height / 2;
  const offsetX = (transform.offsetX / 100) * app.screen.width;
  const offsetY = (transform.offsetY / 100) * app.screen.height;

  model.scale.set(finalScale);
  model.position.set(centerX + offsetX, centerY + offsetY);
};

// 刷新画布大小和模型位置
const refreshCanvas = () => {
  if (!app || !canvasRef.value) return;

  // 重新计算画布大小
  const parent = canvasRef.value.parentElement;
  if (parent) {
    app.renderer.resize(parent.clientWidth, parent.clientHeight);
  }

  // 重新计算模型的基础缩放和位置
  if (model) {
    baseScale =
      Math.min(
        app.screen.width / model.width,
        app.screen.height / model.height
      ) * 0.8;

    // 重新应用变换
    applyTransform(live2dTransform.value);
  }

  // 更新占位符位置
  if (placeholder) {
    placeholder.position.set(app.screen.width / 2, app.screen.height / 2);
    placeholder.style.wordWrapWidth = app.screen.width * 0.8;
  }
};

// 处理屏幕方向变化（只在真正方向改变时刷新）
const handleOrientationChange = () => {
  // 检测当前方向
  const currentOrientation =
    window.innerWidth > window.innerHeight ? "landscape" : "portrait";

  // 只有方向真正改变时才刷新（忽略键盘等导致的 resize）
  if (lastOrientation !== null && lastOrientation === currentOrientation) {
    console.log("Ignoring resize, orientation unchanged:", currentOrientation);
    return;
  }

  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }
  // 延迟刷新，等待布局稳定
  resizeTimeout = setTimeout(() => {
    console.log(
      "Screen orientation changed:",
      lastOrientation,
      "->",
      currentOrientation
    );
    lastOrientation = currentOrientation;
    refreshCanvas();
  }, 100);
};

// 加载模型
const loadModel = async (modelPath: string) => {
  if (!app || !modelPath) return;

  isLoading.value = true;
  error.value = null;
  renderWarning.value = false; // 重置渲染警告

  // 清空可用动作和表情
  availableMotions.value = [];
  availableExpressions.value = [];
  motionDetails.value = [];

  // 清除旧模型
  if (model) {
    app.stage.removeChild(model);
    model.destroy();
    model = null;
  }

  // 清除占位符
  if (placeholder) {
    app.stage.removeChild(placeholder);
    placeholder = null;
  }

  try {
    console.log("Loading Live2D model:", modelPath);
    model = await Live2DModel.from(modelPath, {
      autoInteract: true, // 自动处理鼠标/触摸交互
      autoUpdate: true, // 自动更新
    });

    // 计算基础缩放比例（适应屏幕）
    baseScale =
      Math.min(
        app.screen.width / model.width,
        app.screen.height / model.height
      ) * 0.8;

    model.anchor.set(0.5, 0.5);

    // 应用保存的变换设置
    applyTransform(live2dTransform.value);

    app.stage.addChild(model);

    // 提取可用的动作（详细信息）
    try {
      const motionManager = model.internalModel?.motionManager;
      if (motionManager?.definitions) {
        const groups: string[] = [];
        const details: MotionInfo[] = [];
        const definitions = motionManager.definitions;

        for (const group in definitions) {
          const groupMotions = definitions[group];
          if (groupMotions && groupMotions.length > 0) {
            groups.push(group);

            // 提取组内每个动作的详细信息
            groupMotions.forEach(
              (
                motion: { Name?: string; name?: string; File?: string },
                index: number
              ) => {
                // 尝试获取动作名称，如果没有则使用文件名或索引
                let motionName = motion.Name || motion.name;
                if (!motionName && motion.File) {
                  // 从文件名提取动作名（去掉路径和扩展名）
                  motionName =
                    motion.File.split("/")
                      .pop()
                      ?.replace(/\.motion3?\.json$/i, "") ||
                    `${group}_${index}`;
                }
                if (!motionName) {
                  motionName = `${group}_${index}`;
                }

                details.push({
                  group,
                  name: motionName,
                  index,
                });
              }
            );
          }
        }

        availableMotions.value = groups;
        motionDetails.value = details;
        console.log("Available motion groups:", groups);
        console.log("Motion details:", details);
      }
    } catch (e) {
      console.warn("Could not extract motions:", e);
    }

    // 提取可用的表情
    try {
      const expressionManager =
        model.internalModel?.motionManager?.expressionManager;
      if (expressionManager?.definitions) {
        const expressions = expressionManager.definitions
          .map(
            (def: { name?: string; Name?: string }) =>
              def.name || def.Name || "unknown"
          )
          .filter((name: string) => name !== "unknown");
        availableExpressions.value = expressions;
        console.log("Available expressions:", expressions);
      }
    } catch (e) {
      console.warn("Could not extract expressions:", e);
    }

    // 尝试播放空闲动作
    try {
      model.motion("idle");
    } catch {
      // 有些模型可能没有 idle 动作
    }

    // 点击交互
    model.on("hit", (hitAreas: string[]) => {
      console.log("Hit areas:", hitAreas);
      if (hitAreas.includes("body") || hitAreas.includes("Body")) {
        model?.motion("tap_body");
      }
      if (hitAreas.includes("head") || hitAreas.includes("Head")) {
        model?.expression("happy");
      }
    });

    console.log("Model loaded successfully");

    // 检测 WebGL 渲染错误（移动端 NPOT 纹理兼容性问题）
    // 通过监听 WebGL 错误日志来检测
    const checkWebGLError = () => {
      if (app?.renderer.type === PIXI.RENDERER_TYPE.WEBGL) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gl = (app.renderer as any).gl as WebGLRenderingContext;
        if (gl) {
          // 检查 WebGL 错误
          const glError = gl.getError();
          if (glError !== gl.NO_ERROR) {
            console.warn("WebGL error detected:", glError);
            renderWarning.value = true;
            return;
          }
        }
      }
    };

    // 临时拦截 console.warn 来检测 NPOT 纹理错误
    const originalWarn = console.warn;
    let warningDetected = false;
    console.warn = function (...args: unknown[]) {
      const message = args.join(" ");
      if (
        message.includes("non-power-of-2") ||
        message.includes("RENDER WARNING") ||
        message.includes("not renderable")
      ) {
        warningDetected = true;
      }
      return originalWarn.apply(console, args);
    };

    // 延迟检测，等待首帧渲染
    setTimeout(() => {
      // 恢复原始 console.warn
      console.warn = originalWarn;

      if (warningDetected) {
        console.log("NPOT texture warning detected, showing render warning");
        renderWarning.value = true;
      } else {
        // 也检查 WebGL 错误
        checkWebGLError();
      }
    }, 1000);
  } catch (e) {
    console.error("Failed to load Live2D model:", e);
    error.value = "模型加载失败";
    showPlaceholder();
  } finally {
    isLoading.value = false;
  }
};

// 显示占位符
const showPlaceholder = () => {
  if (!app) return;

  placeholder = new PIXI.Text(
    error.value
      ? `${error.value}\n\n请检查模型路径是否正确`
      : "Live2D 宠物将在这里显示\n\n请在设置中配置模型路径\n或将模型放入 public/models 目录",
    {
      fontFamily: "Arial, sans-serif",
      fontSize: 16,
      fill: 0xffffff,
      align: "center",
      wordWrap: true,
      wordWrapWidth: app.screen.width * 0.8,
    }
  );
  placeholder.anchor.set(0.5);
  placeholder.position.set(app.screen.width / 2, app.screen.height / 2);
  app.stage.addChild(placeholder);
};

// 尝试自动发现模型
const tryAutoLoadModel = async () => {
  // 常见的模型路径
  const commonPaths = [
    "/modules/hiyori_free_zh/runtime/hiyori_free_t08.model3.json",
    "/models/hiyori/hiyori.model3.json",
    "/models/Hiyori/Hiyori.model3.json",
    "/models/haru/haru.model3.json",
    "/models/Haru/Haru.model3.json",
    "/models/mao/mao.model3.json",
    "/models/shizuku/shizuku.model.json",
  ];

  for (const path of commonPaths) {
    try {
      const response = await fetch(path, { method: "HEAD" });
      if (response.ok) {
        console.log("Found model at:", path);
        await loadModel(path);
        return true;
      }
    } catch {
      // 继续尝试下一个
    }
  }
  return false;
};

onMounted(async () => {
  if (!canvasRef.value) return;

  const parent = canvasRef.value.parentElement;
  if (!parent) return;

  // 等待一帧，确保父元素尺寸稳定
  await new Promise((resolve) => requestAnimationFrame(resolve));

  // 初始化屏幕方向
  lastOrientation =
    window.innerWidth > window.innerHeight ? "landscape" : "portrait";

  // 获取稳定的尺寸
  const width = parent.clientWidth;
  const height = parent.clientHeight;

  // 创建 PIXI 应用，使用固定尺寸而非 resizeTo
  app = new PIXI.Application({
    view: canvasRef.value,
    backgroundAlpha: 0,
    width,
    height,
    antialias: true,
  });

  // 监听屏幕方向变化（只响应真正的方向改变）
  window.addEventListener("resize", handleOrientationChange);
  window.addEventListener("orientationchange", handleOrientationChange);
  if (screen.orientation) {
    screen.orientation.addEventListener("change", handleOrientationChange);
  }

  // 优先使用设置中的模型路径
  if (currentPet.value.modelPath) {
    await loadModel(currentPet.value.modelPath);
  } else {
    // 尝试自动发现模型
    const found = await tryAutoLoadModel();
    if (!found) {
      showPlaceholder();
    }
  }
});

// 监听设置变化，重新加载模型
watch(
  () => currentPet.value.modelPath,
  async (newPath) => {
    if (newPath && app) {
      await loadModel(newPath);
    }
  }
);

// 监听变换设置变化
watch(
  () => live2dTransform.value,
  (newTransform) => {
    applyTransform(newTransform);
  },
  { deep: true }
);

// KeepAlive 激活时重新加载模型,目前似乎不需要
// onActivated(async () => {
//   // 移动端不需要重新加载
//   if (Capacitor.isNativePlatform()) {
//     return;
//   }

//   console.log("Live2DCanvas activated (PC), reloading model");
//   if (app && currentPet.value.modelPath) {
//     await loadModel(currentPet.value.modelPath);
//   }
// });

// KeepAlive 停用时卸载模型
// onDeactivated(() => {
//   console.log('Live2DCanvas deactivated, unloading model')
//   if (model && app) {
//     app.stage.removeChild(model)
//     model.destroy()
//     model = null
//   }
// })

onUnmounted(() => {
  // 移除事件监听器
  window.removeEventListener("resize", handleOrientationChange);
  window.removeEventListener("orientationchange", handleOrientationChange);
  if (screen.orientation) {
    screen.orientation.removeEventListener("change", handleOrientationChange);
  }

  // 清除 timeout
  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }

  model?.destroy();
  app?.destroy(true);
});

// 暴露方法供外部调用
defineExpose({
  loadModel,
  refreshCanvas, // 刷新画布（屏幕方向变化时调用）
  // 播放动作组（随机选择组内一个动作）
  playMotion: (group: string) => {
    if (model) {
      console.log("Playing motion group:", group);
      model.motion(group);
    } else {
      console.warn("Model not loaded, cannot play motion");
    }
  },
  // 播放指定动作（通过组名和索引）
  playMotionByIndex: (group: string, index: number) => {
    if (model) {
      console.log("Playing motion:", group, "index:", index);
      model.motion(group, index);
    } else {
      console.warn("Model not loaded, cannot play motion");
    }
  },
  setExpression: (name: string) => {
    if (model) {
      console.log("Setting expression:", name);
      model.expression(name);
    }
  },
  // 外部更新变换
  updateTransform: (transform: Live2DTransform) => {
    applyTransform(transform);
  },
  // 可用的动作和表情
  availableMotions,
  availableExpressions,
  motionDetails,
  isLoading,
  error,
});
</script>

<template>
  <div class="live2d-container">
    <canvas ref="canvasRef"></canvas>
    <!-- 加载指示器 -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="spinner"></div>
      <span>加载模型中...</span>
    </div>
    <!-- 渲染警告提示 -->
    <div
      v-if="renderWarning"
      class="render-warning"
      @click="renderWarning = false"
    >
      <div class="warning-content">
        <div class="warning-icon">⚠️</div>
        <div class="warning-title">模型渲染异常</div>
        <div class="warning-text">
          该模型可能在移动端无法正常显示。
          <br /><br />
          <strong>原因：</strong>模型纹理尺寸不是 2 的幂次方（如
          256、512、1024） <br /><br />
          <strong>解决方案：</strong>
          <br />1. 使用图像编辑软件将纹理调整为 2 的幂次方尺寸 <br />2. 使用
          Cubism Editor 重新导出模型 <br />3. 更换其他兼容的模型
        </div>
        <div class="warning-dismiss">点击关闭</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.live2d-container {
  width: 100%;
  height: 100%;
  position: relative;
}

canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.3);
  color: white;
  font-size: 14px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 渲染警告提示 */
.render-warning {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  z-index: 10;
  padding: 20px;
}

.warning-content {
  background: #2a2a2a;
  border-radius: 12px;
  padding: 20px;
  max-width: 320px;
  text-align: center;
  color: white;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.warning-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.warning-title {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 12px;
  color: #ffcc00;
}

.warning-text {
  font-size: 13px;
  line-height: 1.6;
  color: #ccc;
  text-align: left;
  margin-bottom: 16px;
}

.warning-text strong {
  color: #fff;
}

.warning-dismiss {
  font-size: 12px;
  color: #888;
  padding-top: 12px;
  border-top: 1px solid #444;
}
</style>
