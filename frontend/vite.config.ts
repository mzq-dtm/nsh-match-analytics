import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    port: 5173,    // 如果你想改前端端口也放这儿
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:10290',  // 指向后端新端口
        changeOrigin: true,
        secure: false,
      },
    }
  }
})
