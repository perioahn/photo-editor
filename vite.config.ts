import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './', // GitHub Pages 하위경로 + file:// 오프라인 대응
})
