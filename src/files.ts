// 파일 접근: File System Access API(크로미움) 우선, 폴백 = webkitdirectory 입력(읽기전용→다운로드 저장)

export interface Photo {
  name: string // 원본 파일명 (출력명 기준)
  file: File // 디코드 가능한 이미지 (NEF는 내장 JPEG 추출본)
  handle: FileSystemFileHandle | null // null = 폴백 모드
  url: string // 미리보기용 objectURL
  exifSource?: File // NEF 등 — 촬영일은 원본에서 읽음
  dirty: boolean
  saved: boolean
}

export const hasFS = 'showDirectoryPicker' in window
  && !new URLSearchParams(location.search).has('fallback') // ?fallback=1 = 강제 폴백(테스트용)

let saveDirHandle: FileSystemDirectoryHandle | null = null // null = 다운로드로 저장

export function saveDirName(): string | null {
  return saveDirHandle?.name ?? null
}

/** 저장 폴더 지정 (미지정 시 다운로드) */
export async function pickSaveFolder(): Promise<string> {
  saveDirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
  return saveDirHandle!.name
}

const IMG_RE = /\.(jpe?g|png|nef)$/i
const NEF_RE = /\.nef$/i

/** NEF에서 내장 풀사이즈 JPEG 추출 (가장 큰 FFD8~FFD9 세그먼트).
    카메라가 넣어둔 풀해상 미리보기라 기초 보정 원본으로 충분. */
async function extractNefJpeg(f: File): Promise<File> {
  const buf = new Uint8Array(await f.arrayBuffer())
  let best: { s: number; e: number } | null = null
  let start = -1
  for (let i = 0; i < buf.length - 3; i++) {
    if (start < 0 && buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff) {
      start = i
      i += 2
    } else if (start >= 0 && buf[i] === 0xff && buf[i + 1] === 0xd9) {
      const seg = { s: start, e: i + 2 }
      if (!best || seg.e - seg.s > best.e - best.s) best = seg
      start = -1
      i += 1
    }
  }
  if (!best || best.e - best.s < 100_000) {
    throw new Error(`${f.name}: 내장 JPEG 미리보기를 찾지 못함`)
  }
  return new File([buf.slice(best.s, best.e)], f.name, { type: 'image/jpeg' })
}

async function toPhoto(f: File, handle: FileSystemFileHandle | null): Promise<Photo> {
  const isNef = NEF_RE.test(f.name)
  const file = isNef ? await extractNefJpeg(f) : f
  return { name: f.name, file, handle, url: URL.createObjectURL(file),
           exifSource: isNef ? f : undefined, dirty: false, saved: false }
}

/** 폴더 열기 — 읽기전용 webkitdirectory 방식.
    FS API 폴더 선택과 달리 바탕화면·드라이브 루트도 브라우저가 차단하지 않고,
    비크로미움에서도 동작. 쓰기 권한이 없어 저장은 지정한 저장 폴더 또는 다운로드로. */
export async function openFolderFallback(files: FileList): Promise<Photo[]> {
  saveDirHandle = null // 새 폴더 = 새 세션, 저장 폴더 리셋
  const topLevel = (f: File) =>
    ((f as any).webkitRelativePath || '').split('/').length <= 2 // 하위 폴더 제외
  const out: Photo[] = []
  for (const f of [...files].filter((f) => IMG_RE.test(f.name) && topLevel(f))) {
    try {
      out.push(await toPhoto(f, null))
    } catch (e) {
      console.warn(e)
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function editedName(name: string): string {
  return name.replace(IMG_RE, '') + '_e.jpg'
}

/** 저장: 저장 폴더 지정 시 {이름}_e.jpg로 그 폴더에, 미지정 시 브라우저 다운로드 */
export async function savePhoto(photo: Photo, blob: Blob): Promise<string> {
  const outName = editedName(photo.name)
  if (saveDirHandle) {
    const fh = await saveDirHandle.getFileHandle(outName, { create: true })
    const w = await fh.createWritable()
    await w.write(blob)
    await w.close()
    return `${saveDirHandle.name}/${outName}`
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = outName
  a.click()
  URL.revokeObjectURL(a.href)
  return outName + ' (다운로드)'
}
