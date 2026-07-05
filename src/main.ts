import { createApp } from 'vue'
import exifr from 'exifr'
import App from './App.vue'
import { renderFinal } from './edits'
import './style.css'
import 'vue-advanced-cropper/dist/style.css'

createApp(App).mount('#app')

// E2E 테스트 훅 (로컬 앱 — 노출 무해)
;(window as any).__pe = { renderFinal, exifr }
