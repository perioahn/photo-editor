<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import CropModal from './components/CropModal.vue'
import EditorCanvas from './components/EditorCanvas.vue'
import { freshEdits, isDirty, renderFinal, type Edits } from './edits'
import { hasFS, openFolderFallback, openFolderFS, savePhoto, type Photo } from './files'

const photos = ref<Photo[]>([])
const idx = ref(0)
const editsMap = reactive(new Map<string, Edits>())
const straighten = ref(false)
const showOriginal = ref(false)
const showCrop = ref(false)
const saving = ref(false)
const msg = ref('')
const canvasRef = ref<InstanceType<typeof EditorCanvas> | null>(null)
const fallbackInput = ref<HTMLInputElement | null>(null)
let lastSavedEdits: Edits | null = null

const cur = computed(() => photos.value[idx.value] ?? null)
const edits = computed(() => {
  if (!cur.value) return freshEdits()
  if (!editsMap.has(cur.value.name)) editsMap.set(cur.value.name, freshEdits())
  return editsMap.get(cur.value.name)!
})
const dirty = computed(() => cur.value ? isDirty(edits.value) && !cur.value.saved : false)

// undo 스택 (사진별, 조정값 스냅샷)
const undoStacks = new Map<string, Edits[]>()
function pushUndo() {
  if (!cur.value) return
  const st = undoStacks.get(cur.value.name) ?? []
  st.push(JSON.parse(JSON.stringify(edits.value)))
  if (st.length > 50) st.shift()
  undoStacks.set(cur.value.name, st)
  cur.value.saved = false
}
function undo() {
  if (!cur.value) return
  const st = undoStacks.get(cur.value.name)
  const prev = st?.pop()
  if (prev) editsMap.set(cur.value.name, reactiveEdits(prev))
}
const reactiveEdits = (e: Edits): Edits => reactive(JSON.parse(JSON.stringify(e)))

async function openFolder() {
  try {
    photos.value = await openFolderFS()
    idx.value = 0
    msg.value = photos.value.length ? `${photos.value.length}장 로드됨` : 'JPEG 없음'
  } catch (e: any) {
    if (e?.name !== 'AbortError') msg.value = `폴더 열기 실패: ${e.message ?? e}`
  }
}

async function onFallbackFiles(ev: Event) {
  const input = ev.target as HTMLInputElement
  if (input.files?.length) {
    photos.value = await openFolderFallback(input.files)
    idx.value = 0
    msg.value = `${photos.value.length}장 로드됨 (저장은 다운로드 폴더로)`
  }
}

function goto(i: number) {
  if (i < 0 || i >= photos.value.length) return
  if (dirty.value && !window.confirm('저장하지 않은 보정이 있습니다. 이동할까요?')) return
  idx.value = i
  straighten.value = false
}

function set<K extends keyof Edits>(key: K, val: Edits[K]) {
  pushUndo()
  ;(edits.value as any)[key] = val
}

function onAngle(deg: number) {
  // 그은 선이 수평이 되도록 반대 방향 회전
  set('fineDeg', clampFine(edits.value.fineDeg - deg))
  straighten.value = false
}
const clampFine = (v: number) => Math.max(-15, Math.min(15, Math.round(v * 10) / 10))

async function save(next = false) {
  if (!cur.value || saving.value) return
  saving.value = true
  msg.value = '저장 중…'
  try {
    const blob = await renderFinal(cur.value.file, edits.value, 0.95, cur.value.exifSource)
    const name = await savePhoto(cur.value, blob)
    cur.value.saved = true
    lastSavedEdits = JSON.parse(JSON.stringify(edits.value))
    msg.value = `저장됨: ${name}`
    if (next && idx.value < photos.value.length - 1) {
      idx.value += 1
      straighten.value = false
    }
  } catch (e: any) {
    msg.value = `저장 실패: ${e.message ?? e}`
  } finally {
    saving.value = false
  }
}

function pastePrev() {
  if (!lastSavedEdits || !cur.value) return
  pushUndo()
  const p = JSON.parse(JSON.stringify(lastSavedEdits)) as Edits
  p.crop = null // 크롭은 사진마다 다름 — 붙여넣기 제외 (Codex 정책)
  editsMap.set(cur.value.name, reactiveEdits(p))
  msg.value = '이전 보정값 적용됨 (크롭 제외)'
}

function resetAll() {
  if (!cur.value) return
  pushUndo()
  editsMap.set(cur.value.name, reactiveEdits(freshEdits()))
}

function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement).tagName === 'INPUT') return
  if (e.key === 'ArrowRight') goto(idx.value + 1)
  else if (e.key === 'ArrowLeft') goto(idx.value - 1)
  else if (e.key === '\\') showOriginal.value = !showOriginal.value
  else if (e.key === '0') canvasRef.value?.fitView()
  else if (e.key === 'r' || e.key === 'R') showCrop.value = true
  else if (e.ctrlKey && e.key === ']') set('rot90', (edits.value.rot90 + 1) % 4)
  else if (e.ctrlKey && e.key === '[') set('rot90', (edits.value.rot90 + 3) % 4)
  else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(true) }
  else if (e.ctrlKey && e.key === 's') { e.preventDefault(); save(false) }
  else if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo() }
  else if (e.ctrlKey && e.key === 'v') pastePrev()
}

function beforeUnload(e: BeforeUnloadEvent) {
  if (photos.value.some((p) => !p.saved && isDirty(editsMap.get(p.name) ?? freshEdits()))) {
    e.preventDefault()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('beforeunload', beforeUnload)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <b>임상사진 에디터</b>
      <button v-if="hasFS" class="primary" @click="openFolder">📁 폴더 열기</button>
      <label v-else class="primary file-label">
        📁 폴더 선택 (저장=다운로드)
        <input ref="fallbackInput" type="file" webkitdirectory multiple hidden @change="onFallbackFiles" />
      </label>
      <template v-if="cur">
        <span class="sep" />
        <button title="90° 반시계 (Ctrl+[)" @click="set('rot90', (edits.rot90 + 3) % 4)">⟲ 90°</button>
        <button title="90° 시계 (Ctrl+])" @click="set('rot90', (edits.rot90 + 1) % 4)">⟳ 90°</button>
        <button title="좌우 반전" @click="set('flipH', !edits.flipH)">↔ 플립</button>
        <button title="상하 반전" @click="set('flipV', !edits.flipV)">↕ 플립</button>
        <button :class="{ on: straighten }" title="수평선 긋기 — 그은 선이 수평이 되게 회전"
                @click="straighten = !straighten">📐 수평 맞추기</button>
        <button title="크롭 (R)" @click="showCrop = true">✂ 크롭</button>
        <span class="spacer" />
        <span class="msg">{{ msg }}</span>
        <button :disabled="saving" title="Ctrl+S" @click="save(false)">💾 저장</button>
        <button class="primary" :disabled="saving" title="Ctrl+Shift+S" @click="save(true)">
          💾 저장 후 다음 →
        </button>
      </template>
      <span v-else class="spacer" />
    </header>

    <div class="body">
      <main class="stage-wrap">
        <EditorCanvas
          v-if="cur"
          ref="canvasRef"
          :key="cur.name"
          :photo="cur"
          :edits="edits"
          :straighten="straighten"
          :show-original="showOriginal"
          @angle="onAngle"
        />
        <div v-else class="empty">
          <p>📁 폴더를 열어 시작하세요</p>
          <p class="sub">JPEG · PNG · NEF(내장 JPEG 기준) · 원본은 절대 수정하지 않고 <b>이름_e.jpg</b>로 저장됩니다<br />
            단축키: ←/→ 이동 · R 크롭 · \ 원본 비교 · Ctrl+S 저장 · Ctrl+Shift+S 저장 후 다음</p>
          <p v-if="!hasFS" class="sub warn">이 브라우저는 폴더 저장 미지원 — Edge/Chrome/Whale 권장</p>
        </div>
      </main>

      <aside v-if="cur" class="panel">
        <section>
          <h3>기본 보정 <button class="mini" title="원본으로" @click="resetAll">리셋</button></h3>
          <label>밝기 <span class="val" @dblclick="set('brightness', 0)">{{ edits.brightness }}</span>
            <input type="range" min="-100" max="100" :value="edits.brightness"
                   @input="set('brightness', +($event.target as HTMLInputElement).value)" />
          </label>
          <label>대비 <span class="val" @dblclick="set('contrast', 0)">{{ edits.contrast }}</span>
            <input type="range" min="-100" max="100" :value="edits.contrast"
                   @input="set('contrast', +($event.target as HTMLInputElement).value)" />
          </label>
          <label>미세 회전 <span class="val" @dblclick="set('fineDeg', 0)">{{ edits.fineDeg.toFixed(1) }}°</span>
            <input type="range" min="-15" max="15" step="0.1" :value="edits.fineDeg"
                   @input="set('fineDeg', +($event.target as HTMLInputElement).value)" />
          </label>
        </section>
        <section>
          <h3>도구</h3>
          <button class="wide" @click="pastePrev" :disabled="!lastSavedEdits">
            📋 이전 보정값 붙여넣기 (Ctrl+V)
          </button>
          <button class="wide" @mousedown="showOriginal = true" @mouseup="showOriginal = false"
                  @mouseleave="showOriginal = false">
            👁 원본 보기 (누르고 있기 · \)
          </button>
          <button class="wide" @click="undo">↶ 실행취소 (Ctrl+Z)</button>
        </section>
        <section class="meta">
          <div>{{ cur.name }}</div>
          <div>{{ idx + 1 }} / {{ photos.length }}</div>
          <div v-if="cur.saved" class="saved-tag">✓ 저장됨</div>
          <div v-else-if="dirty" class="dirty-tag">● 미저장 보정</div>
        </section>
      </aside>
    </div>

    <footer v-if="photos.length" class="filmstrip">
      <div
        v-for="(p, i) in photos"
        :key="p.name"
        class="thumb"
        :class="{ active: i === idx }"
        @click="goto(i)"
      >
        <img :src="p.url" loading="lazy" />
        <span v-if="p.saved" class="dot ok">✓</span>
        <span v-else-if="editsMap.has(p.name) && isDirty(editsMap.get(p.name)!)" class="dot">●</span>
      </div>
    </footer>

    <CropModal
      v-if="showCrop && cur"
      :photo="cur"
      :edits="edits"
      @apply="(c) => { set('crop', c); showCrop = false }"
      @clear="set('crop', null); showCrop = false"
      @close="showCrop = false"
    />
  </div>
</template>
