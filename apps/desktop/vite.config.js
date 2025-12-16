import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue()],
    // Tauri 需要固定端口
    server: {
        port: 5174,
        strictPort: true,
    },
    // 清空构建目录
    clearScreen: false,
    // 环境变量前缀
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
        // Tauri 使用 Chromium on Windows 和 WebKit on macOS/Linux
        target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
        // 生产环境不生成 sourcemap
        sourcemap: !!process.env.TAURI_DEBUG,
    },
});
