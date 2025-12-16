import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    dts({
      include: ['src/**/*'],
      outDir: 'dist',
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'DesktopFriendsUI',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        'vue',
        'pixi.js',
        'pixi-live2d-display',
        '@desktopfriends/core',
        '@desktopfriends/shared',
        '@desktopfriends/platform',
      ],
      output: {
        globals: {
          vue: 'Vue',
        },
      },
    },
  },
})
