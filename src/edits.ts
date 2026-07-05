// 비파괴 조정값 + 저장 시 1회 렌더 파이프라인.
// 순서: EXIF 방향 정규화(로드 시) → rot90/flip/미세회전(흰 패딩) → 크롭 → 밝기/대비 → JPEG q0.95 + EXIF 복사

import piexif from 'piexifjs'

export interface Edits {
  rot90: number // 0~3 (CW 횟수)
  flipH: boolean
  flipV: boolean
  fineDeg: number // -15 ~ +15
  brightness: number // -100 ~ +100
  contrast: number // -100 ~ +100
  crop: { x: number; y: number; w: number; h: number } | null // fine 회전 후 좌표계, 원본 픽셀 단위
}

export const freshEdits = (): Edits => ({
  rot90: 0, flipH: false, flipV: false, fineDeg: 0,
  brightness: 0, contrast: 0, crop: null,
})

export const isDirty = (e: Edits): boolean =>
  e.rot90 !== 0 || e.flipH || e.flipV || e.fineDeg !== 0 ||
  e.brightness !== 0 || e.contrast !== 0 || e.crop !== null

/** CSS filter 문자열 (실시간 미리보기용) */
export const cssFilter = (e: Edits): string =>
  `brightness(${1 + e.brightness / 100}) contrast(${1 + e.contrast / 100})`

/** rot90/flip/fine 를 합친 CSS transform (미리보기용) */
export const cssTransform = (e: Edits): string =>
  `rotate(${e.rot90 * 90 + e.fineDeg}deg) scaleX(${e.flipH ? -1 : 1}) scaleY(${e.flipV ? -1 : 1})`

/** rot90+fine 적용 후의 캔버스 크기 (crop 좌표계 기준) */
export function orientedSize(w: number, h: number, e: Edits): { w: number; h: number } {
  const swap = e.rot90 % 2 === 1
  let ow = swap ? h : w
  let oh = swap ? w : h
  if (e.fineDeg !== 0) {
    const rad = (e.fineDeg * Math.PI) / 180
    const cos = Math.abs(Math.cos(rad))
    const sin = Math.abs(Math.sin(rad))
    const nw = Math.round(ow * cos + oh * sin)
    const nh = Math.round(ow * sin + oh * cos)
    ow = nw
    oh = nh
  }
  return { w: ow, h: oh }
}

/** EXIF 방향 반영해 디코드 (브라우저가 처리) */
export async function loadBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' })
}

/** rot90+flip+fine회전 적용 캔버스 (흰 패딩, core_crop rotate_image_with_padding 이식) */
export function renderOriented(src: ImageBitmap | HTMLCanvasElement, e: Edits): HTMLCanvasElement {
  // 1) rot90 + flip
  let w = src.width, h = src.height
  const swap = e.rot90 % 2 === 1
  const c1 = document.createElement('canvas')
  c1.width = swap ? h : w
  c1.height = swap ? w : h
  const g1 = c1.getContext('2d')!
  g1.translate(c1.width / 2, c1.height / 2)
  g1.rotate((e.rot90 * Math.PI) / 2)
  g1.scale(e.flipH ? -1 : 1, e.flipV ? -1 : 1)
  g1.drawImage(src, -w / 2, -h / 2)
  if (e.fineDeg === 0) return c1

  // 2) 미세회전: 새 크기 = 회전 외접 사각형, 흰색 패딩
  const rad = (e.fineDeg * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad))
  const c2 = document.createElement('canvas')
  c2.width = Math.round(c1.width * cos + c1.height * sin)
  c2.height = Math.round(c1.width * sin + c1.height * cos)
  const g2 = c2.getContext('2d')!
  g2.fillStyle = '#fff'
  g2.fillRect(0, 0, c2.width, c2.height)
  g2.translate(c2.width / 2, c2.height / 2)
  g2.rotate(rad)
  g2.drawImage(c1, -c1.width / 2, -c1.height / 2)
  return c2
}

/** 풀해상도 최종 렌더 → JPEG Blob (EXIF 복사 포함) */
export async function renderFinal(file: File, e: Edits, quality = 0.95): Promise<Blob> {
  const bmp = await loadBitmap(file)
  let canvas = renderOriented(bmp, e)
  bmp.close()

  if (e.crop) {
    const c = document.createElement('canvas')
    c.width = Math.round(e.crop.w)
    c.height = Math.round(e.crop.h)
    c.getContext('2d')!.drawImage(canvas, e.crop.x, e.crop.y, e.crop.w, e.crop.h, 0, 0, c.width, c.height)
    canvas = c
  }

  if (e.brightness !== 0 || e.contrast !== 0) {
    const c = document.createElement('canvas')
    c.width = canvas.width
    c.height = canvas.height
    const g = c.getContext('2d')!
    g.filter = cssFilter(e)
    g.drawImage(canvas, 0, 0)
    canvas = c
  }

  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob 실패'))), 'image/jpeg', quality))

  return injectExif(file, blob, canvas.width, canvas.height)
}

/** 원본 EXIF 복사 + Orientation=1 리셋 + 크기 갱신 + 구식 썸네일 제거 */
async function injectExif(orig: File, jpeg: Blob, w: number, h: number): Promise<Blob> {
  try {
    const [origData, newData] = await Promise.all([blobToDataURL(orig), blobToDataURL(jpeg)])
    const exif = piexif.load(origData)
    exif['0th'][piexif.ImageIFD.Orientation] = 1
    exif['Exif'][piexif.ExifIFD.PixelXDimension] = w
    exif['Exif'][piexif.ExifIFD.PixelYDimension] = h
    exif['thumbnail'] = null // 낡은 방향/크롭 썸네일 제거
    const out = piexif.insert(piexif.dump(exif), newData)
    return dataURLToBlob(out)
  } catch {
    return jpeg // EXIF 없는 원본 등 — 이미지 자체는 보존
  }
}

const blobToDataURL = (b: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(b)
  })

function dataURLToBlob(d: string): Blob {
  const [head, body] = d.split(',')
  const mime = head.match(/:(.*?);/)![1]
  const bin = atob(body)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
