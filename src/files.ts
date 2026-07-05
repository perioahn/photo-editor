// 파일 접근: File System Access API(크로미움) 우선, 폴백 = webkitdirectory 입력(읽기전용→다운로드 저장)

export interface Photo {
  name: string
  file: File
  handle: FileSystemFileHandle | null // null = 폴백 모드
  url: string // 미리보기용 objectURL
  dirty: boolean
  saved: boolean
}

export const hasFS = 'showDirectoryPicker' in window
  && !new URLSearchParams(location.search).has('fallback') // ?fallback=1 = 강제 폴백(테스트용)

let dirHandle: FileSystemDirectoryHandle | null = null

const JPEG_RE = /\.jpe?g$/i

export async function openFolderFS(): Promise<Photo[]> {
  dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
  const out: Photo[] = []
  for await (const entry of (dirHandle as any).values()) {
    if (entry.kind === 'file' && JPEG_RE.test(entry.name) && !entry.name.startsWith('.')) {
      const file = await entry.getFile()
      out.push({ name: entry.name, file, handle: entry, url: URL.createObjectURL(file), dirty: false, saved: false })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export function openFolderFallback(files: FileList): Photo[] {
  return [...files]
    .filter((f) => JPEG_RE.test(f.name))
    .map((f) => ({ name: f.name, file: f, handle: null, url: URL.createObjectURL(f), dirty: false, saved: false }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function editedName(name: string): string {
  return name.replace(JPEG_RE, '') + '_e.jpg'
}

/** 저장: FS 모드 = 같은 폴더에 {이름}_e.jpg, 폴백 = 브라우저 다운로드 */
export async function savePhoto(photo: Photo, blob: Blob): Promise<string> {
  const outName = editedName(photo.name)
  if (dirHandle && photo.handle) {
    const fh = await dirHandle.getFileHandle(outName, { create: true })
    const w = await fh.createWritable()
    await w.write(blob)
    await w.close()
    return outName
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = outName
  a.click()
  URL.revokeObjectURL(a.href)
  return outName + ' (다운로드)'
}
