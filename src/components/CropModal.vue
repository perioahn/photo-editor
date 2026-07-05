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
const ratio = ref<number | undefined>(undefined) // undefined=자유, 4/3, 3/2
let scale = 1 // 미리보기 → 풀해상 배율

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
        <button :class="{ on: ratio === undefined }" @click="ratio = undefined">자유</button>
        <button :class="{ on: ratio === 4 / 3 }" @click="ratio = 4 / 3">4:3</button>
        <button :class="{ on: ratio === 3 / 2 }" @click="ratio = 3 / 2">3:2</button>
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
