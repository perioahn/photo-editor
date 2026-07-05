# 임상사진 포토 에디터 — 상세 계획 (2026-07-05, Codex 자문 확정)

## 1. 목표
치과 전공의용 초경량 사진 기초 보정 도구. 라이트룸 구독 없이, 설치 없이,
"폴더 열고 → 수십 장 연속 보정 → 저장"이 끝나는 단일 목적 앱.
옛 core_crop exe에서 사랑받던 기능(플립·90°·드래그 미세회전)을 현대적으로 재현 + 확장.

## 2. 아키텍처 (확정: 순수 정적 웹앱)
- **서버 없음.** File System Access API(Chromium: Edge/Chrome/Whale)로 로컬 폴더를
  직접 열고 그 자리에 저장. 의국 표준 브라우저가 모두 Chromium이라 제약 수용.
- 스택: **Vite + Vue3 + TypeScript, 캔버스 직접 구현** (cropper.js 등 기성 에디터
  미사용 — 필름스트립·배치 순회·수평선 긋기 UX가 기성품에 없음)
- 배포: **GitHub Pages** (perioahn.github.io/...) — 전공의는 URL만.
  오프라인용으로 vite-plugin-singlefile 단일 HTML 산출물 병행 제공.
- 미지원 브라우저(Safari/FF): "Edge/Chrome/Whale로 열어주세요" 안내가 기본.
  폴백은 단일 파일 비상 다운로드 저장만.

## 3. 기능 스펙 v1
| 기능 | 조작 | 비고 |
|---|---|---|
| 폴더 열기 | 버튼 → showDirectoryPicker | JPEG 전용 v1 |
| 필름스트립 | 하단 썸네일 + ←/→ 키 | dirty(미저장) 표시, 이동 시 미저장 경고 |
| 줌/팬 | 휠(커서 중심) / 드래그, `0`=화면맞춤 | CSS transform 미리보기 |
| 90° 회전 | R = CW, Shift+R = CCW | 픽셀 재배열(무손실 연산) |
| 플립 | 좌우/상하 버튼 | np.fliplr 상당 |
| 미세 회전 | **수평선 긋기 모드**(주 UX: 수평이어야 할 선을 드래그 → 각도 자동 보정, 옛 core_crop 선긋기 재현) + 각도 슬라이더(±15°, 0.1°, 확인·미세조정용) | 둘은 단일 상태 공유 |
| 밝기/대비 | 슬라이더 -100~+100 | 미리보기 CSS filter, 저장 시 캔버스 적용 |
| 크롭 | 자유 + 4:3 + 3:2 | 회전 후 화면 기준 좌표 |
| 원본 보기 | 길게 누르기(before/after) | |
| 이전 보정값 붙여넣기 | 직전 사진의 회전·밝기·대비 복사 (crop 제외) | 연속 보정 가속 |
| Undo / 리셋 | Ctrl+Z (조정값 스택) / 전체 리셋 | |
| 저장 | Ctrl+S, **Save & Next**(핵심 버튼) | |

**v1 제외**: 채도·화이트밸런스·샤픈·주석·일괄저장·RAW. (요청 시 v2)

## 4. 기술 설계
- **비파괴 상태 모델**: 이미지당 `{rot90, flipH, flipV, fineDeg, crop, brightness, contrast}`
  조정값만 보유. 미리보기는 transform/filter, 저장 시 1회만 재인코딩.
- **렌더 파이프라인(저장 시)**: EXIF Orientation 정규화 → 90°/플립/미세회전(흰색 패딩,
  옛 rotate_image_with_padding 알고리즘 이식) → 크롭 → 밝기/대비 → toBlob(jpeg, **q0.95**)
- **EXIF**: piexifjs로 원본 EXIF 복사 삽입. 저장 후 Orientation=1 리셋,
  PixelX/YDimension 갱신, 구식 썸네일 삭제. **DateTimeOriginal 보존 필수**
  (photo_organizer가 촬영일로 사용). 로드는 createImageBitmap(imageOrientation:'from-image').
- **메모리 가드**: 미리보기 = 축소 비트맵, 저장 시에만 full-res OffscreenCanvas.
  40MP 지원 목표, 60MP↑/캔버스 한계 초과는 명시적 차단. 색공간 sRGB 고정
  (shade matching 용도 아님을 문서화).
- **저장 정책**: 기본 = 원본 불변 + `{이름}_e.jpg` 사본. 덮어쓰기는 고급 옵션
  (켜면 `_originals/YYMMDD_HHMM/`에 원본 백업 후 덮어씀). `.bak` 방식 금지.

## 5. 화면 — 상용 편집기(Lightroom Develop 모듈) 관례 준수
- **레이아웃**: 중앙 대형 캔버스 · **우측 보정 패널**(접이식 섹션: 기본보정/크롭·회전) ·
  **하단 필름스트립**(가로 스크롤 썸네일 + dirty 점 + 저장됨 체크) · 상단 얇은 툴바
- **슬라이더 관례**: 라벨 더블클릭=0 리셋, 드래그 중 실시간 미리보기, 값 직접 입력 가능
- **크롭 모드**(라이트룸식): 크롭 진입 시 3분할 격자 오버레이 + 모서리/변 핸들 +
  **크롭 모드 안에 각도 슬라이더·수평선 긋기(눈금자 아이콘)가 함께** — 상용 관례대로
  회전과 크롭을 한 모드에서. 회전 시 자동으로 최대 내접 크롭 제안(라이트룸 Constrain)
- **수평선 긋기(간판 기능, 사용자 확정)**: 눈금자 아이콘 클릭 → 수평(또는 수직)이어야 할
  선을 드래그로 긋면 각도 자동 보정 — 라이트룸 Straighten 도구와 동일 제스처,
  옛 core_crop 선긋기 UX 계승. 45° 초과 시 무시(옛 코드 정책 유지)
- **before/after**: `\` 키 토글(라이트룸 관례) + 원본 길게 누르기
- 다크 테마(우리 앱 공통 팔레트), 아이콘+짧은 라벨, 툴팁에 단축키 표기

## 6. 단축키 (라이트룸 관례 차용)
←/→ 이전·다음 | R 크롭·회전 모드(라이트룸과 동일) | Ctrl+] / Ctrl+[ 90° 회전 |
\\ before/after | Ctrl+S 저장 | Ctrl+Shift+S Save&Next | Ctrl+Z undo | 0 화면맞춤 |
Ctrl+V 이전 보정값 붙여넣기

## 7. 테스트 계획
- EXIF Orientation 1/3/6/8 각각: 로드 방향·저장 후 방향·태그 리셋 확인
- 40MP JPEG 저장 메모리, 회전+크롭+밝기 조합 픽셀 검증
- **저장본을 photo_organizer 새 사진 가져오기에 넣어 촬영일 인식 회귀 테스트**
- Whale/Edge/Chrome 3종 폴더 열기·저장

## 8. 구현 순서 (예상 규모: photo_organizer 프론트의 ~2/3)
1. 폴더 열기 + 필름스트립 + 뷰어(줌/팬) 
2. 조정값 상태 + 90°/플립/슬라이더 미세회전 + 밝기/대비 미리보기
3. 저장 파이프라인(풀해상 렌더 + EXIF 복사 + _e.jpg) — 여기서 EXIF 회귀 테스트
4. 수평선 긋기 모드 + 크롭
5. Save&Next·단축키·이전 보정값 붙여넣기·미저장 경고
6. GitHub Pages 배포 + 단일 HTML 산출물 + README

## 오픈소스 차용 검토 (2026-07-05 GitHub 실사)
| 프로젝트 | ★ / 라이선스 / 활성 | 판정 |
|---|---|---|
| [exifr](https://github.com/MikeKovarik/exifr) | 1.2k / MIT | **채택** — EXIF 읽기 (최고 속도·견고) |
| [piexifjs](https://github.com/hMatoba/piexifjs) | 615 / MIT | **채택** — EXIF를 저장 JPEG에 기록 (순수 JS, 안정) |
| [jSquash](https://github.com/jamsinclair/jSquash) | 684 / Apache-2.0 / 2026 활발 | **채택(옵션)** — mozjpeg WASM 인코더, canvas.toBlob보다 화질/용량 우수 |
| [vue-advanced-cropper](https://github.com/advanced-cropper/vue-advanced-cropper) | 1.2k / MIT(확인함) | **채택** — 크롭 핸들·격자·비율 UX 통째로 절약. 회전과의 결합은 커스텀 |
| [RapidRAW](https://github.com/CyberTimon/RapidRAW) | 8.7k / **AGPL** / 2026 활발 | **UX 레퍼런스만** — 최신 라이트룸류 오픈소스, AGPL이라 코드 차용 금지 |
| [glfx.js](https://github.com/evanw/glfx.js) | 3.4k / MIT | 보류 — WebGL 보정. v1은 CSS/canvas filter로 충분 |
| [tui.image-editor](https://github.com/nhn/tui.image-editor) / [filerobot](https://github.com/scaleflex/filerobot-image-editor) / [miniPaint](https://github.com/viliusle/miniPaint) | 7.7k·1.9k·3.4k | 미채택 — 범용 에디터라 배치 순회·선긋기 UX와 불일치, 무겁다 |

## 근거 자료
- [Chrome File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- [MDN showDirectoryPicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker) · [canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) · [createImageBitmap orientation](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap) · [canvas 크기 한계](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas#maximum_canvas_size)
- [piexifjs](https://github.com/hMatoba/piexifjs) (EXIF 복사/수정)
- 옛 잔재 재사용: core_crop_250902.py — 선긋기 각도차(1693-1713), 패딩 회전(1715-1740)
