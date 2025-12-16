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
      name: 'DesktopFriendsCore',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['vue', 'socket.io-client', '@desktopfriends/shared'],
      output: {
        globals: {
          vue: 'Vue',
        },
      },
    },
  },
})
