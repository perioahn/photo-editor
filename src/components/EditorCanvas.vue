<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { cssFilter, orientedSize, renderOriented, type Edits } from '../edits'
import type { Photo } from '../files'

const props = defineProps<{ photo: Photo; edits: Edits; straighten: boolean; showOriginal: boolean }>()
const emit = defineEmits<{ angle: [deg: number] }>()

const canvasEl = ref<HTMLCanvasElement | null>(null)

const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
let dragging = false
let lastX = 0, lastY = 0

const line = ref<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
let drawingLine = false

let bmp: ImageBitmap | null = null // 미리보기용 축소 비트맵
let naturalW = 0, naturalH = 0
const PREVIEW_MAX = 1600

async function loadPreview() {
  bmp?.close()
  const full = await createImageBitmap(props.photo.file, { imageOrientation: 'from-image' })
  naturalW = full.width
  naturalH = full.height
  const s = PREVIEW_MAX / Math.max(full.width, full.height)
  if (s < 1) {
    bmp = await createImageBitmap(full, {
      resizeWidth: Math.round(full.width * s),
      resizeHeight: Math.round(full.height * s),
    })
    full.close()
  } else {
    bmp = full
  }
  fitView()
  render()
}

function render() {
  if (!bmp || !canvasEl.value) return
  const e = props.showOriginal
    ? { ...props.edits, rot90: 0, flipH: false, flipV: false, fineDeg: 0, crop: null }
    : props.edits
  let c: HTMLCanvasElement = renderOriented(bmp, e)
  if (e.crop) {
    // crop 좌표 = 풀해상 oriented 기준 → 미리보기 배율 환산
    const scale = c.width / orientedSize(naturalW, naturalH, e).w
    const cc = document.createElement('canvas')
    cc.width = Math.max(1, Math.round(e.crop.w * scale))
    cc.height = Math.max(1, Math.round(e.crop.h * scale))
    cc.getContext('2d')!.drawImage(c, e.crop.x * scale, e.crop.y * scale,
      e.crop.w * scale, e.crop.h * scale, 0, 0, cc.width, cc.height)
    c = cc
  }
  const cv = canvasEl.value
  cv.width = c.width
  cv.height = c.height
  cv.getContext('2d')!.drawImage(c, 0, 0)
}

function fitView() {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
}

function onWheel(ev: WheelEvent) {
  ev.preventDefault()
  const f = ev.deltaY < 0 ? 1.15 : 1 / 1.15
  zoom.value = Math.min(12, Math.max(0.2, zoom.value * f))
}

function canvasPoint(ev: MouseEvent) {
  const r = canvasEl.value!.getBoundingClientRect()
  return { x: ev.clientX - r.left, y: ev.clientY - r.top }
}

function onDown(ev: MouseEvent) {
  if (props.straighten) {
    const p = canvasPoint(ev)
    line.value = { x1: p.x, y1: p.y, x2: p.x, y2: p.y }
    drawingLine = true
  } else {
    dragging = true
    lastX = ev.clientX
    lastY = ev.clientY
  }
}

function onMove(ev: MouseEvent) {
  if (drawingLine && line.value) {
    const p = canvasPoint(ev)
    line.value = { ...line.value, x2: p.x, y2: p.y }
  } else if (dragging) {
    panX.value += ev.clientX - lastX
    panY.value += ev.clientY - lastY
    lastX = ev.clientX
    lastY = ev.clientY
  }
}

function onUp() {
  if (drawingLine && line.value) {
    const { x1, y1, x2, y2 } = line.value
    if (Math.hypot(x2 - x1, y2 - y1) > 15) {
      let deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
      if (deg > 45) deg -= 90        // 수직선 의도
      else if (deg < -45) deg += 90
      if (Math.abs(deg) <= 45) emit('angle', deg) // core_crop 정책: 45° 초과 무시
    }
    line.value = null
  }
  drawingLine = false
  dragging = false
}

defineExpose({ fitView })

watch(() => props.photo, loadPreview)
watch(() => [props.edits.rot90, props.edits.flipH, props.edits.flipV,
             props.edits.fineDeg, props.edits.crop, props.showOriginal],
  render, { deep: true })

onMounted(() => {
  document.addEventListener('mouseup', onUp)
  loadPreview()
})
onUnmounted(() => {
  document.removeEventListener('mouseup', onUp)
  bmp?.close()
})
</script>

<template>
  <div
    class="editor-canvas"
    :class="{ straighten }"
    @wheel="onWheel"
    @mousedown.prevent="onDown"
    @mousemove="onMove"
  >
    <div class="stage" :style="{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }">
      <div class="canvas-holder">
        <canvas ref="canvasEl" :style="{ filter: showOriginal ? 'none' : cssFilter(edits) }" />
        <svg v-if="line" class="line-overlay">
          <line :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2" />
        </svg>
      </div>
    </div>
    <div v-if="straighten" class="straighten-hint">
      수평(또는 수직)이어야 할 선을 드래그로 그으세요 — 자동으로 각도 보정
    </div>
  </div>
</template>
