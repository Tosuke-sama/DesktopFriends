import { ref, watch, computed } from "vue";
import type { LLMConfig } from "@desktopfriends/shared";

// Live2D 位置大小配置
export interface Live2DTransform {
  scale: number; // 缩放比例 0.1 - 3
  offsetX: number; // X 偏移 (相对于中心, -50 到 50 百分比)
  offsetY: number; // Y 偏移 (相对于中心, -50 到 50 百分比)
}

// 单个宠物配置
export interface PetConfig {
  id: string; // 唯一标识
  name: string; // 宠物名称
  modelPath: string; // Live2D 模型路径
  prompt: string; // 人设提示词
  transform: Live2DTransform; // 旧版兼容 / 竖屏默认
  transformPortrait?: Live2DTransform; // 竖屏位置
  transformLandscape?: Live2DTransform; // 横屏位置
  createdAt: number; // 创建时间
}

export interface AppSettings {
  // 多宠物配置
  pets: PetConfig[];
  currentPetId: string;

  // 大模型设置
  llmProvider: LLMConfig["provider"];
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;

  // 服务器设置
  serverUrl: string;
  autoConnect: boolean;

  // 显示设置
  showBubble: boolean;
  bubbleDuration: number;

  // 背景设置
  backgroundType: "gradient" | "image" | "preset";
  backgroundGradient: string; // 渐变色
  backgroundImage: string; // 自定义图片 (base64 或 URL)
  backgroundPreset: string; // 预设背景名称
}

// 默认人设提示词
export const DEFAULT_PET_PROMPT = `你是一个可爱的桌面宠物，名叫{petName}。你性格活泼、善良、有点傲娇。
回复要简洁可爱，通常不超过50字。
可以适当使用颜文字来表达情绪，如 (◕ᴗ◕✿) (｡•́︿•̀｡) ♪(´▽｀) 等。`;

// 生成唯一 ID
const generateId = () =>
  `pet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// 默认 transform
const DEFAULT_TRANSFORM: Live2DTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

// 默认宠物配置
const createDefaultPet = (): PetConfig => ({
  id: generateId(),
  name: "小桌",
  modelPath: "",
  prompt: DEFAULT_PET_PROMPT,
  transform: { ...DEFAULT_TRANSFORM },
  transformPortrait: { ...DEFAULT_TRANSFORM },
  transformLandscape: { ...DEFAULT_TRANSFORM },
  createdAt: Date.now(),
});

// 屏幕方向检测
const isLandscape = ref(window.innerWidth > window.innerHeight);

const updateOrientation = () => {
  isLandscape.value = window.innerWidth > window.innerHeight;
};

// 全局监听屏幕方向（只注册一次）
let orientationListenerRegistered = false;
const registerOrientationListener = () => {
  if (orientationListenerRegistered) return;
  orientationListenerRegistered = true;

  window.addEventListener("resize", updateOrientation);
  window.addEventListener("orientationchange", () => {
    // 延迟更新，等待布局完成
    setTimeout(updateOrientation, 100);
  });
};

const STORAGE_KEY = "desktopfriends-settings";

// 迁移旧版设置到新版
const migrateOldSettings = (stored: any): AppSettings | null => {
  // 如果已经有 pets 数组，说明是新版格式
  if (stored.pets && Array.isArray(stored.pets)) {
    return null;
  }

  // 旧版格式：petName, petModel, petPrompt, live2dTransform
  if (stored.petName !== undefined) {
    const defaultPet = createDefaultPet();
    const migratedPet: PetConfig = {
      id: defaultPet.id,
      name: stored.petName || defaultPet.name,
      modelPath: stored.petModel || defaultPet.modelPath,
      prompt: stored.petPrompt || defaultPet.prompt,
      transform: stored.live2dTransform || defaultPet.transform,
      createdAt: Date.now(),
    };

    return {
      pets: [migratedPet],
      currentPetId: migratedPet.id,
      llmProvider: stored.llmProvider || "openai",
      llmApiKey: stored.llmApiKey || "",
      llmBaseUrl: stored.llmBaseUrl || "",
      llmModel: stored.llmModel || "",
      serverUrl: stored.serverUrl || "",
      autoConnect: stored.autoConnect ?? true,
      showBubble: stored.showBubble ?? true,
      bubbleDuration: stored.bubbleDuration ?? 5000,
      // 背景设置（旧版没有，使用默认值）
      backgroundType: "gradient",
      backgroundGradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      backgroundImage: "",
      backgroundPreset: "",
    };
  }

  return null;
};

const defaultPet = createDefaultPet();

const defaultSettings: AppSettings = {
  pets: [defaultPet],
  currentPetId: defaultPet.id,

  llmProvider: "openai",
  llmApiKey: "",
  llmBaseUrl: "",
  llmModel: "",

  serverUrl: "",
  autoConnect: true,

  showBubble: true,
  bubbleDuration: 5000,

  // 背景默认设置
  backgroundType: "gradient",
  backgroundGradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  backgroundImage: "",
  backgroundPreset: "",
};

// 预设背景列表
export const PRESET_BACKGROUNDS = [
  { id: "transparent", name: "透明", value: "transparent" },
  {
    id: "gradient-purple",
    name: "紫色渐变",
    value: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  },
  {
    id: "gradient-sunset",
    name: "日落",
    value: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  },
  {
    id: "gradient-ocean",
    name: "海洋",
    value: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  },
  {
    id: "gradient-forest",
    name: "森林",
    value: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
  },
  {
    id: "gradient-night",
    name: "夜空",
    value: "linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%)",
  },
  {
    id: "gradient-sakura",
    name: "樱花",
    value: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
  },
  {
    id: "gradient-aurora",
    name: "极光",
    value: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
  },
  {
    id: "gradient-midnight",
    name: "午夜",
    value: "linear-gradient(135deg, #232526 0%, #414345 100%)",
  },
];

// 从 localStorage 加载设置
const loadSettings = (): AppSettings => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);

      // 尝试迁移旧版设置
      const migrated = migrateOldSettings(parsed);
      if (migrated) {
        console.log("[Settings] Migrated from old format");
        return migrated;
      }

      return { ...defaultSettings, ...parsed };
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
  return { ...defaultSettings };
};

// 保存设置到 localStorage
const saveSettings = (settings: AppSettings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
};

// 创建响应式设置
const settings = ref<AppSettings>(loadSettings());

// 监听变化自动保存
watch(
  settings,
  (newSettings) => {
    saveSettings(newSettings);
  },
  { deep: true }
);

export function useSettings() {
  // 注册屏幕方向监听器
  registerOrientationListener();

  // 当前宠物配置（计算属性）
  const currentPet = computed(() => {
    const pet = settings.value.pets.find(
      (p) => p.id === settings.value.currentPetId
    );
    return pet || settings.value.pets[0] || createDefaultPet();
  });

  // 所有宠物列表
  const pets = computed(() => settings.value.pets);

  // 更新单个设置
  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    settings.value[key] = value;
  };

  // 重置所有设置
  const resetSettings = () => {
    const newDefaultPet = createDefaultPet();
    settings.value = {
      ...defaultSettings,
      pets: [newDefaultPet],
      currentPetId: newDefaultPet.id,
    };
  };

  // 获取 LLM 配置
  const getLLMConfig = (): LLMConfig => ({
    provider: settings.value.llmProvider,
    apiKey: settings.value.llmApiKey,
    baseUrl: settings.value.llmBaseUrl || undefined,
    model: settings.value.llmModel || undefined,
  });

  // ===== 宠物管理方法 =====

  // 添加新宠物
  const addPet = (
    config?: Partial<Omit<PetConfig, "id" | "createdAt">>
  ): PetConfig => {
    const newPet: PetConfig = {
      id: generateId(),
      name: config?.name || `宠物 ${settings.value.pets.length + 1}`,
      modelPath: config?.modelPath || "",
      prompt: config?.prompt || DEFAULT_PET_PROMPT,
      transform: config?.transform || { ...DEFAULT_TRANSFORM },
      transformPortrait: config?.transformPortrait || { ...DEFAULT_TRANSFORM },
      transformLandscape: config?.transformLandscape || {
        ...DEFAULT_TRANSFORM,
      },
      createdAt: Date.now(),
    };

    settings.value.pets.push(newPet);
    return newPet;
  };

  // 删除宠物
  const removePet = (petId: string): boolean => {
    // 至少保留一个宠物
    if (settings.value.pets.length <= 1) {
      return false;
    }

    const index = settings.value.pets.findIndex((p) => p.id === petId);
    if (index === -1) {
      return false;
    }

    settings.value.pets.splice(index, 1);

    // 如果删除的是当前宠物，切换到第一个
    if (settings.value.currentPetId === petId) {
      settings.value.currentPetId = settings.value.pets[0].id;
    }

    return true;
  };

  // 切换当前宠物
  const switchPet = (petId: string): boolean => {
    const pet = settings.value.pets.find((p) => p.id === petId);
    if (!pet) {
      return false;
    }

    settings.value.currentPetId = petId;
    return true;
  };

  // 更新宠物配置
  const updatePet = (
    petId: string,
    updates: Partial<Omit<PetConfig, "id" | "createdAt">>
  ): boolean => {
    const pet = settings.value.pets.find((p) => p.id === petId);
    if (!pet) {
      return false;
    }

    if (updates.name !== undefined) pet.name = updates.name;
    if (updates.modelPath !== undefined) pet.modelPath = updates.modelPath;
    if (updates.prompt !== undefined) pet.prompt = updates.prompt;
    if (updates.transform !== undefined)
      pet.transform = { ...pet.transform, ...updates.transform };
    if (updates.transformPortrait !== undefined) {
      pet.transformPortrait = {
        ...(pet.transformPortrait || DEFAULT_TRANSFORM),
        ...updates.transformPortrait,
      };
    }
    if (updates.transformLandscape !== undefined) {
      pet.transformLandscape = {
        ...(pet.transformLandscape || DEFAULT_TRANSFORM),
        ...updates.transformLandscape,
      };
    }

    return true;
  };

  // 复制宠物
  const duplicatePet = (petId: string): PetConfig | null => {
    const pet = settings.value.pets.find((p) => p.id === petId);
    if (!pet) {
      return null;
    }

    return addPet({
      name: `${pet.name} (副本)`,
      modelPath: pet.modelPath,
      prompt: pet.prompt,
      transform: { ...pet.transform },
      transformPortrait: pet.transformPortrait
        ? { ...pet.transformPortrait }
        : undefined,
      transformLandscape: pet.transformLandscape
        ? { ...pet.transformLandscape }
        : undefined,
    });
  };

  // 兼容旧 API：获取当前宠物的属性
  // 这些是计算属性，用于兼容旧代码
  const petName = computed({
    get: () => currentPet.value.name,
    set: (value: string) => updatePet(currentPet.value.id, { name: value }),
  });

  const petModel = computed({
    get: () => currentPet.value.modelPath,
    set: (value: string) =>
      updatePet(currentPet.value.id, { modelPath: value }),
  });

  const petPrompt = computed({
    get: () => currentPet.value.prompt,
    set: (value: string) => updatePet(currentPet.value.id, { prompt: value }),
  });

  // 根据屏幕方向自动选择对应的 transform
  const live2dTransform = computed({
    get: () => {
      const pet = currentPet.value;
      if (isLandscape.value) {
        // 横屏：优先使用 transformLandscape，没有则用旧的 transform
        return pet.transformLandscape || pet.transform;
      } else {
        // 竖屏：优先使用 transformPortrait，没有则用旧的 transform
        return pet.transformPortrait || pet.transform;
      }
    },
    set: (value: Live2DTransform) => {
      // 根据当前方向保存到对应的字段
      if (isLandscape.value) {
        updatePet(currentPet.value.id, { transformLandscape: value });
      } else {
        updatePet(currentPet.value.id, { transformPortrait: value });
      }
    },
  });

  // 当前屏幕方向（暴露给外部使用）
  const currentOrientation = computed(() =>
    isLandscape.value ? "landscape" : "portrait"
  );

  // 获取当前背景样式
  const backgroundStyle = computed(() => {
    const {
      backgroundType,
      backgroundGradient,
      backgroundImage,
      backgroundPreset,
    } = settings.value;

    if (backgroundType === "image" && backgroundImage) {
      return {
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      };
    }

    if (backgroundType === "preset" && backgroundPreset) {
      const preset = PRESET_BACKGROUNDS.find((p) => p.id === backgroundPreset);
      if (preset) {
        return { background: preset.value };
      }
    }

    // 默认渐变
    return {
      background: backgroundGradient || defaultSettings.backgroundGradient,
    };
  });

  // 设置背景图片
  const setBackgroundImage = (imageData: string) => {
    settings.value.backgroundType = "image";
    settings.value.backgroundImage = imageData;
  };

  // 设置预设背景
  const setPresetBackground = (presetId: string) => {
    settings.value.backgroundType = "preset";
    settings.value.backgroundPreset = presetId;
  };

  // 设置渐变背景
  const setGradientBackground = (gradient: string) => {
    settings.value.backgroundType = "gradient";
    settings.value.backgroundGradient = gradient;
  };

  // 清除自定义背景
  const clearCustomBackground = () => {
    settings.value.backgroundType = "gradient";
    settings.value.backgroundImage = "";
    settings.value.backgroundPreset = "";
    settings.value.backgroundGradient = defaultSettings.backgroundGradient;
  };

  return {
    // 原始设置对象
    settings,

    // 宠物相关
    currentPet,
    pets,
    addPet,
    removePet,
    switchPet,
    updatePet,
    duplicatePet,

    // 兼容旧 API 的计算属性
    petName,
    petModel,
    petPrompt,
    live2dTransform,

    // 屏幕方向
    isLandscape,
    currentOrientation,

    // 背景相关
    backgroundStyle,
    setBackgroundImage,
    setPresetBackground,
    setGradientBackground,
    clearCustomBackground,

    // 其他方法
    updateSetting,
    resetSettings,
    getLLMConfig,
  };
}
