import { createApp } from "vue";
import App from "./App.vue";

// 导入 UI 组件库样式
import "@desktopfriends/ui/style.css";

console.log("=== import.meta ===\n", import.meta);
export const DEV_ENV = {
  IS_NO_HIDDEN: (import.meta as any).env?.VITE_NO_HIDDEN === "true",
  IS_RESET_DATA: (import.meta as any).env?.VITE_RESET_DATA === "true",
};

const app = createApp(App);
app.mount("#app");
