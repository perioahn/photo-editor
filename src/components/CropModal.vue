<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Cropper } from 'vue-advanced-cropper'
import { orientedSize, renderOriented, type Edits } from '../edits'
import type { Photo } from '../files'

const props = defineProps<{ photo: Photo; edits: Edits }>()
const emit = defineEmits<{
  apply: [crop: { x: number; y: number; w: number; h: number }]
  clear: []
  close: []
}>()

const src = ref('')
const ratio = ref<number | undefined>(undefined) // undefined=자유
const customW = ref<number | null>(null)
const customH = ref<number | null>(null)
let scale = 1 // 미리보기 → 풀해상 배율

const PRESETS: [string, number][] = [
  ['1:1', 1], ['4:3', 4 / 3], ['3:2', 3 / 2], ['16:10', 16 / 10], ['16:9', 16 / 9],
]

function applyCustom() {
  if (customW.value && customH.value && customW.value > 0 && customH.value > 0) {
    ratio.value = customW.value / customH.value
  }
}

onMounted(async () => {
  // fine 회전까지 적용된 미리보기 이미지를 크로퍼에 공급 (crop 좌표계 = oriented)
  const full = await createImageBitmap(props.photo.file, { imageOrientation: 'from-image' })
  const os = orientedSize(full.width, full.height, props.edits)
  const s = Math.min(1, 1600 / Math.max(full.width, full.height))
  const small = s < 1
    ? await createImageBitmap(full, {
        resizeWidth: Math.round(full.width * s),
        resizeHeight: Math.round(full.height * s),
      })
    : full
  if (s < 1) full.close()
  const c = renderOriented(small, { ...props.edits, crop: null })
  small.close()
  scale = os.w / c.width
  src.value = c.toDataURL('image/jpeg', 0.9)
})

function apply({ coordinates }: any) {
  lastCoords = coordinates
}
let lastCoords: any = null

function confirm() {
  if (!lastCoords) return emit('close')
  emit('apply', {
    x: Math.round(lastCoords.left * scale),
    y: Math.round(lastCoords.top * scale),
    w: Math.round(lastCoords.width * scale),
    h: Math.round(lastCoords.height * scale),
  })
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="crop-modal">
      <div class="crop-toolbar">
        <span>크롭</span>
        <button :class="{ on: ratio === undefined }" title="드래그로 자유 조절"
                @click="ratio = undefined">자유</button>
        <button v-for="[label, r] in PRESETS" :key="label"
                :class="{ on: ratio === r }" @click="ratio = r">{{ label }}</button>
        <span class="custom-ratio">
          <input v-model.number="customW" type="number" min="1" placeholder="W"
                 @change="applyCustom" @keydown.enter="applyCustom" />
          :
          <input v-model.number="customH" type="number" min="1" placeholder="H"
                 @change="applyCustom" @keydown.enter="applyCustom" />
          <button :class="{ on: !!(customW && customH) && ratio === customW / customH }"
                  title="입력한 비율로 강제" @click="applyCustom">강제</button>
        </span>
        <span class="spacer" />
        <button class="ghost" @click="emit('clear')">크롭 제거</button>
        <button class="primary" @click="confirm">적용</button>
        <button class="ghost" @click="emit('close')">취소</button>
      </div>
      <Cropper
        v-if="src"
        class="cropper"
        :src="src"
        :stencil-props="{ aspectRatio: ratio, lines: {}, grid: true }"
        @change="apply"
      />
    </div>
  </div>
</template>
