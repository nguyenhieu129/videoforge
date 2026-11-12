# VideoForge — Đặc tả triển khai dự án

> Công cụ tạo video tự động bằng pipeline nhiều AI agent, kết hợp HyperFrames, GSAP, three.js, Remotion, Manim, Blender MCP và FFmpeg. Hỗ trợ video 16:9 và 9:16, lồng giọng qua Voice Studio, đăng lên Facebook Reels, YouTube Shorts, YouTube video và TikTok.

Tài liệu này là nguồn duy nhất để triển khai. Làm theo thứ tự các Phase ở mục 14. Mỗi mục có tiêu chí nghiệm thu (Definition of Done).

---

## 1. Mục tiêu và phạm vi

### 1.1 Mục tiêu
- Từ một bài viết (URL, văn bản, PDF) tạo ra video chất lượng cao, màu sắc bắt mắt, gần như không cần can thiệp thủ công.
- Pipeline gồm nhiều agent chạy tuần tự. Giao diện hiển thị realtime agent nào đang chạy (spinner), log chi tiết từng bước.
- Người dùng cấu hình các model AI trong Settings và gán model theo vai trò từng agent.
- Xuất 16:9, 9:16 hoặc cả hai.
- Sau khi tạo xong có thể đăng lên các nền tảng, có bước xem trước và xác nhận.

### 1.2 Ngoài phạm vi (giai đoạn đầu)
- Không làm trình dựng video thủ công kiểu timeline kéo thả.
- Không làm mạng xã hội hay đa người dùng (multi-tenant). Giai đoạn đầu chỉ cho một người dùng.
- Không tự tạo footage thực bằng AI sinh video.

### 1.3 Nguyên tắc thiết kế
1. **Mỗi bước là một job độc lập**, lưu trạng thái, đầu vào, đầu ra vào DB, có thể chạy lại từ bước bất kỳ.
2. **Agent giao tiếp bằng JSON có schema** (validate bằng Zod). Không truyền văn bản tự do giữa các agent.
3. **Engine render tách khỏi agent**. Agent chỉ sinh mô tả cảnh hoặc code cảnh, worker mới render.
4. **Mọi thứ có log**. Không có bước nào chạy mà không phát event.
5. **Dùng API chính thức để đăng bài trước**, tự động hóa trình duyệt chỉ là dự phòng.

---

## 2. Vai trò từng công cụ

| Công cụ | Vai trò | Dùng cho |
|---|---|---|
| HyperFrames | Engine render chính. Video được định nghĩa bằng HTML với các thuộc tính `data-*`, render tất định qua headless Chrome + FFmpeg | Đa số video: tin tức, tóm tắt, caption động |
| GSAP | Thư viện animation trong composition HyperFrames | Chữ, chuyển cảnh, nhịp điệu |
| three.js | Chạy trong composition HyperFrames (frame adapter) | Nền 3D, hạt, logo xoay |
| Remotion | Template React có tham số | Biểu đồ, đếm số, bảng xếp hạng. **Kiểm tra giấy phép Remotion trước khi dùng thương mại** |
| Manim | Worker Python | Giải thích toán, thuật toán, đồ thị |
| Blender MCP | Agent điều khiển Blender headless | Intro điện ảnh, cảnh 3D phức tạp (tùy chọn, nặng) |
| FFmpeg | Ghép cảnh, trộn audio, đổi tỉ lệ, burn phụ đề, nén chuẩn nền tảng | Bước cuối và mọi xử lý media |

**Quy tắc mặc định**: nếu không có lý do đặc biệt, cảnh dùng HyperFrames + GSAP (+ three.js khi cần 3D). Chỉ dùng Manim, Remotion, Blender khi Director gán rõ `engine` cho cảnh đó.

---

## 3. Kiến trúc

```
┌──────────────── Web UI (Next.js) ────────────────┐
│ Dashboard · Tạo video · Pipeline Live View       │
│ Settings (Models, Voice, Defaults, Publish)      │
│ Voice Studio · Thư viện · Hàng đợi đăng          │
└───────────────┬──────────────────────────────────┘
                │ REST + SSE (log/event realtime)
┌───────────────▼──────────────────────────────────┐
│ API + Orchestrator (Node.js / TypeScript)        │
│ - Pipeline state machine                         │
│ - Agent runner + Model router                    │
│ - Job queue (BullMQ + Redis)                     │
│ - Event bus → SSE                                │
└───┬───────────┬───────────┬──────────┬───────────┘
    │           │           │          │
 Render      Manim       Blender     FFmpeg
 worker      worker      worker      worker
(HyperFrames (Python)   (headless)   (Node/CLI)
 + Remotion)
    │
 Storage: ./data/projects/{projectId}/...  + SQLite/Postgres
```

### 3.1 Công nghệ
- **Node.js ≥ 22** (yêu cầu của HyperFrames), **FFmpeg** cài sẵn trên máy.
- **Monorepo**: pnpm workspaces.
- **Frontend**: Next.js (App Router), Tailwind CSS, Framer Motion (spinner, timeline), Zustand.
- **Backend**: Fastify hoặc NestJS (khuyến nghị Fastify cho đơn giản), Zod, Drizzle ORM.
- **DB**: SQLite khi phát triển, Postgres khi triển khai.
- **Queue**: BullMQ + Redis.
- **Python workers**: Manim (venv riêng), gọi qua subprocess hoặc HTTP nội bộ.
- **AI**: lớp provider tự viết (adapter), hoặc Vercel AI SDK.
- **Đóng gói**: Docker Compose (app, redis, worker), tùy chọn Tauri/Electron sau này.

---

## 4. Cấu trúc thư mục

```
videoforge/
├─ apps/
│  ├─ web/                    # Next.js UI
│  └─ server/                 # API + orchestrator
├─ packages/
│  ├─ core/                   # types, zod schemas, constants
│  ├─ agents/                 # định nghĩa 17 agent + prompt
│  ├─ providers/              # adapter OpenAI/Anthropic/Gemini/OpenRouter/Ollama/custom
│  ├─ engines/
│  │  ├─ hyperframes/         # sinh & render composition HTML
│  │  ├─ remotion/            # template React + render
│  │  ├─ manim/               # worker Python
│  │  ├─ blender/             # Blender MCP client
│  │  └─ ffmpeg/              # wrapper lệnh FFmpeg
│  ├─ voice/                  # Voice Studio adapter + TTS fallback
│  ├─ publishers/             # youtube, tiktok, facebook, playwright-fallback
│  └─ templates/              # style presets, brand kit, composition blocks
├─ data/                      # (gitignore) projects, db, cache
├─ docker/
├─ docs/
└─ README.md
```

---

## 5. Mô hình dữ liệu

```ts
// Project: một video
Project {
  id: string
  title: string
  sourceType: 'url' | 'text' | 'pdf' | 'rss'
  sourceRef: string
  aspect: '16:9' | '9:16' | 'both'
  stylePreset: string
  brandKitId?: string
  status: 'draft'|'running'|'paused'|'failed'|'completed'|'published'
  createdAt, updatedAt
}

// Run: một lần chạy pipeline của project
Run {
  id, projectId
  status: 'queued'|'running'|'paused'|'failed'|'completed'|'canceled'
  currentStep: number
  costUsd: number
  tokensIn: number
  tokensOut: number
  startedAt, finishedAt?
}

// StepRun: một bước trong run
StepRun {
  id, runId
  stepIndex: number
  agent: AgentName
  status: 'pending'|'running'|'done'|'warning'|'failed'|'skipped'
  input: json
  output: json
  modelUsed?: string
  startedAt?, finishedAt?
  error?: string
  attempt: number
  requiresApproval: boolean
  approved?: boolean
}

// LogEntry: log chi tiết, stream ra UI
LogEntry {
  id, stepRunId
  ts: datetime
  level: 'debug'|'info'|'warn'|'error'
  message: string
  meta?: json        // token, tên cảnh, đường dẫn file...
}

// Asset: file sinh ra
Asset {
  id, projectId, stepRunId?
  kind: 'image'|'audio'|'voice'|'music'|'scene_clip'|'final_video'|'thumbnail'|'subtitle'
  path: string
  durationSec?, width?, height?
  meta?: json
}

// ProviderConfig: model AI do người dùng thêm
ProviderConfig {
  id, name
  type: 'openai'|'anthropic'|'gemini'|'openrouter'|'ollama'|'openai_compatible'
  baseUrl?: string
  apiKeyEncrypted?: string
  models: string[]
  enabled: boolean
}

// AgentModelMap: gán model theo vai trò
AgentModelMap {
  agent: AgentName
  providerId: string
  model: string
  temperature?: number
  fallbacks: { providerId: string, model: string }[]
}

// PublishJob
PublishJob {
  id, projectId, assetId
  platform: 'youtube_video'|'youtube_shorts'|'facebook_reels'|'tiktok'
  title, description, hashtags: string[], thumbnailAssetId?
  scheduledAt?: datetime
  method: 'api'|'browser'
  status: 'draft'|'confirmed'|'queued'|'publishing'|'published'|'failed'
  remoteUrl?: string
  error?: string
}

// BrandKit
BrandKit {
  id, name
  palette: { primary, secondary, accent, bg, text }
  fonts: { heading, body }
  logoAssetId?
  motionStyle: 'snappy'|'smooth'|'bouncy'|'cinematic'
}
```

Lưu ý: **API key phải mã hóa** (AES-256-GCM, khóa lấy từ biến môi trường `APP_SECRET`), không bao giờ ghi vào log hoặc trả về client ở dạng rõ.

---

## 6. Pipeline: 17 agent

Mỗi agent có `input`, `output` theo schema Zod trong `packages/core`. Mọi bước đều phát event `step.started`, `step.log`, `step.completed` hoặc `step.failed`.

| # | Agent | Đầu vào | Đầu ra | Model đề xuất | Duyệt thủ công |
|---|---|---|---|---|---|
| 1 | Collector | URL / text / PDF | `RawArticle {title, text, images[], url, publishedAt}` | không cần LLM | không |
| 2 | Cleaner | RawArticle | `CleanArticle {title, body, keyFacts[], images[]}` | LLM nhỏ | không |
| 3 | Analyzer | CleanArticle | `Analysis {topic, audience, tone, hookAngles[], risks[]}` | LLM trung bình | không |
| 4 | Scorer | Analysis | `Score {total, hook, novelty, clarity, controversy, verdict, reasons[]}` | LLM trung bình | tùy chọn nếu dưới ngưỡng |
| 5 | Strategist | Analysis + Score | `Strategy {format, durationSec, style, pacing, aspect}` | LLM trung bình | không |
| 6 | Scriptwriter | Strategy + CleanArticle | `Script {hook, scenes[{id, segments[{speaker: 'lead'|'accent', text, emphasis?}], onScreenText, durationSec}], cta}` | LLM mạnh về viết | **có (mặc định)** |
| 7 | Fact-checker | Script + CleanArticle | `FactCheck {issues[], fixedScript}` | LLM trung bình | không |
| 8 | Director | Script + Strategy + BrandKit | `Storyboard {scenes[{id, engine, layout, palette, transitions, assetsNeeded[]}]}` | LLM mạnh | **có (mặc định)** |
| 9 | Asset Agent | Storyboard | `Assets {images[], music, sfx[]}` | LLM nhỏ + tool | không |
| 10 | Voice Studio | Script | `Voice {audioPath, wordTimings[], durationSec}` | TTS | không |
| 11 | Caption Agent | Voice | `Captions {words[{text, start, end}], style}` | Whisper/transcribe | không |
| 12 | Scene Builder | Storyboard + Voice + Captions | `SceneCode[]` (HTML/TSX/Python) theo từng cảnh | LLM mạnh về code | không |
| 13 | Lint & Preview | SceneCode | `Preview {lintReport, snapshots[]}` | không cần LLM | không |
| 14 | Renderer | SceneCode | `SceneClips[]` (mp4 từng cảnh) | không cần LLM | không |
| 15 | Assembler | SceneClips + Voice + Music | `FinalVideos {16:9?, 9:16?}` | không cần LLM (FFmpeg) | không |
| 16 | QA Agent | FinalVideos (khung hình mẫu) | `QAReport {issues[], pass}` | LLM có vision | không |
| 17 | Publisher | FinalVideos + metadata | `PublishDrafts[]` | LLM nhỏ | **có (luôn)** |

### 6.1 Quy tắc chạy
- Bước 7 và 9 có thể chạy song song với nhau sau bước 6/8 nếu không phụ thuộc.
- Bước 12 và 14 chạy song song theo từng cảnh (giới hạn đồng thời cấu hình được, mặc định 2).
- Bước 16 thất bại thì quay lại bước 12 cho các cảnh lỗi, tối đa 2 lần. Sau đó đánh dấu `warning` và để người dùng quyết định.
- Mỗi bước được retry tối đa 2 lần khi lỗi tạm thời (mạng, rate limit), có backoff.
- Người dùng có thể **tắt bước** trong Settings. Chỉ các bước 3, 4, 5, 7, 9, 11, 13, 16 được phép tắt.

### 6.2 Quy tắc thang điểm Scorer
Tổng 0–10, trọng số: hook 30%, novelty 25%, clarity 25%, controversy 10%, visualizability 10%. Dưới ngưỡng người dùng đặt (mặc định 5.0) thì dừng và hỏi.

### 6.3 Prompt mẫu (Scriptwriter, rút gọn)
```
Bạn là biên kịch video ngắn. Viết kịch bản dựa CHỈ trên dữ kiện trong bài gốc.
Yêu cầu:
- Hook 3 giây đầu gây tò mò, không clickbait sai sự thật.
- Chia cảnh, mỗi cảnh có narration (đọc được trong durationSec), onScreenText ngắn (<= 8 từ).
- Tổng thời lượng: {durationSec}s. Tông giọng: {tone}.
- Không bịa số liệu. Nếu thiếu dữ kiện thì bỏ qua.
Trả về JSON đúng schema Script. Không thêm văn bản ngoài JSON.
```

---

## 7. Engine và cách render

### 7.1 HyperFrames (mặc định)
- Mỗi cảnh là một thư mục project HyperFrames nhỏ, hoặc một sub-composition.
- Composition là HTML với các thuộc tính `data-composition-id`, `data-start`, `data-duration`, `data-width`, `data-height`, `data-track-index`. Kích thước:
  - 16:9 → `1920x1080`
  - 9:16 → `1080x1920`
- Animation dùng GSAP (timeline có thể tua được), three.js qua frame adapter.
- Lệnh tham khảo: `npx hyperframes init`, `lint`, `preview`, `render`. Kiểm tra lại CLI bằng `npx hyperframes --help` khi cài vì có thể thay đổi.
- Scene Builder phải sinh **hai bố cục riêng** cho 16:9 và 9:16 (không chỉ cắt), dùng chung nội dung.

### 7.2 Remotion
- Template React nằm trong `packages/engines/remotion/compositions/`.
- Nhận `props` JSON từ Storyboard. Render bằng `npx remotion render`.
- Chỉ dùng cho các loại cảnh đã có template (BarChartRace, Counter, Leaderboard).

### 7.3 Manim
- Scene Builder sinh file `.py` với một class `Scene`. Worker chạy `manim -qh scene.py ClassName` trong venv.
- Output `.mp4` nền trong suốt hoặc nền màu theo palette. Nếu cần 9:16, đặt `config.pixel_width/pixel_height` tương ứng.
- Chạy trong sandbox (timeout 120s, không mạng, thư mục ghi giới hạn).

### 7.4 Blender MCP
- Kết nối Blender MCP server, agent gửi lệnh dựng cảnh, đặt camera, render ảnh hoặc chuỗi khung.
- Mặc định **tắt**. Bật trong Settings khi người dùng đã cài Blender.
- Timeout dài (mặc định 10 phút/cảnh), có nút hủy.

### 7.5 FFmpeg (Assembler)
Các thao tác cần có (wrapper trong `packages/engines/ffmpeg`):

```bash
# Ghép các clip cảnh (cùng codec/độ phân giải)
ffmpeg -f concat -safe 0 -i list.txt -c copy merged.mp4

# Chuẩn hóa clip về cùng fps và kích thước trước khi ghép
ffmpeg -i in.mp4 -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p out.mp4

# Trộn giọng + nhạc nền, ducking nhạc khi có giọng
ffmpeg -i video.mp4 -i voice.wav -i music.mp3 \
  -filter_complex "[2:a]volume=0.25[m];[m][1:a]sidechaincompress=threshold=0.05:ratio=8[mduck];[1:a][mduck]amix=inputs=2:duration=first[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k final.mp4

# Burn phụ đề (nếu không dùng caption trong HTML)
ffmpeg -i in.mp4 -vf "subtitles=captions.srt" -c:a copy out.mp4

# Thumbnail
ffmpeg -i final.mp4 -ss 00:00:01 -frames:v 1 thumb.jpg
```

Chuẩn xuất: H.264 (`libx264`), AAC, `yuv420p`, 30 fps, `-movflags +faststart`. Kiểm tra giới hạn từng nền tảng ở mục 10.

---

## 8. Voice Studio

### 8.1 Kết nối
- Địa chỉ Voice Studio: `VOICE_STUDIO_URL=http://192.168.5.18:3900` (địa chỉ mạng LAN nội bộ).
- Máy chạy VideoForge phải truy cập được địa chỉ này. Nếu chạy trong Docker, kiểm tra container gọi được IP LAN (dùng `network_mode: host` hoặc cấu hình route phù hợp).
- Cho phép đổi URL trong Settings → Voice và có nút **Test kết nối**.

### 8.2 API của Voice Studio (đã xác nhận danh sách endpoint)
Voice Studio cung cấp **API tương thích OpenAI Audio**, tài liệu tại `http://192.168.5.18:3900/docs`:

| Method | Đường dẫn | Dùng cho |
|---|---|---|
| POST | `/v1/audio/speech` | Tổng hợp giọng đọc (TTS). Bước 10 |
| POST | `/v1/audio/transcriptions` | Chuyển giọng nói thành chữ, lấy mốc thời gian từng từ. Bước 11 (Caption Agent) |
| POST | `/v1/audio/translations` | Dịch audio sang tiếng Anh (chưa dùng ở MVP) |
| GET | `/v1/models` | Liệt kê model (TTS, STT) |
| GET | `/v1/models/{model_id}` | Chi tiết một model |
| GET | `/v1/audio/voices` | **Liệt kê giọng, kể cả giọng clone** |

**Việc cần làm ở đầu Phase 1 (voice discovery):**
1. Gọi `GET /v1/audio/voices` và `GET /v1/models`, lưu nguyên JSON mẫu vào `docs/voice-studio-api.md`. Endpoint `/v1/audio/voices` không nằm trong chuẩn OpenAI nên **cấu trúc phản hồi phải đọc từ kết quả thật** (tên trường id, tên hiển thị, giới tính, ngôn ngữ, cờ clone).
2. Đọc `/docs` để xác nhận: tên trường `model` bắt buộc, giá trị `voice` hợp lệ, `response_format` hỗ trợ (mp3, wav, opus…), có dùng `speed` không, và có cần API key hay không.
3. Với `/v1/audio/transcriptions`, xác nhận có hỗ trợ `response_format=verbose_json` kèm `timestamp_granularities[]=word` để lấy mốc từng từ. Nếu không, dùng Whisper cục bộ của HyperFrames (`transcribe`).
4. Viết adapter theo mục 8.5, và test bằng một câu mẫu cho giọng nam và giọng nữ.

**Gọi TTS (theo chuẩn OpenAI, cần đối chiếu `/docs`):**
```bash
curl http://192.168.5.18:3900/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"<model_id>","input":"Xin chào","voice":"<voice_id>","response_format":"wav","speed":1.0}' \
  --output sample.wav
```

**Gọi transcribe lấy mốc từng từ (theo chuẩn OpenAI, cần đối chiếu `/docs`):**
```bash
curl http://192.168.5.18:3900/v1/audio/transcriptions \
  -F file=@sample.wav -F model=<stt_model_id> \
  -F response_format=verbose_json -F "timestamp_granularities[]=word"
```

### 8.2.1 Kết quả thực tế của `GET /v1/audio/voices` (đã đọc từ Voice Studio của bạn)
Phản hồi có hai khối: `voices` (danh sách giọng) và `engines` (danh sách engine TTS).

**Khối `voices`:**
- **13 giọng `type: "openai_alias"`**: alloy, ash, ballad, cedar, coral, echo, fable, marin, nova, onyx, sage, shimmer, verse. Mô tả của server cho biết các alias này đều ánh xạ về giọng mặc định của engine đang chạy, nên **không phải 13 giọng khác nhau**. Không dùng alias để phân giọng nam/nữ. Adapter ẩn nhóm này theo mặc định (có công tắc "Hiện alias OpenAI").
- **1 giọng `type: "profile"`**: `giong_1_nam` (`voice_id`/`id` = `7cc37272`, `language: "Auto"`, `addressable_by_name: true`). Có thể gọi bằng tên hoặc id. Nhiều khả năng đây là profile giọng clone của bạn (suy ra từ `type: "profile"` và tên, chưa xác nhận).
- **Không có trường giới tính hay cờ clone.** Quy ước đặt tên để adapter tự nhận: hậu tố `_nam` là nam, `_nu` là nữ (ví dụ `giong_1_nam`, `giong_2_nu`). Settings cho phép sửa tay giới tính của từng giọng. Coi `type: "profile"` là giọng riêng/clone.

**Ghi chú (theo xác nhận của bạn): đã dùng được cả giọng nam và giọng nữ.** Phần dưới là hướng dẫn khi cần thêm profile mới hoặc khi thiếu một trong hai giới:
1. Thêm profile clone giọng nữ vào Voice Studio, đặt tên `giong_2_nu`. Engine `omnivoice` dùng mẫu tham chiếu tối đa 20 giây (`max_ref_seconds: 20`, tự chọn đoạn tốt nhất `best_window`), nên dùng mẫu 10–20 giây, một người nói, sạch tiếng, không nhạc nền. Chỉ clone giọng khi có sự đồng ý của chủ giọng.
2. Voice design qua tham số `description` chỉ áp dụng cho engine VoxCPM2, hiện chưa cài (`available: false`), nên **chưa dùng được** ở thời điểm này.
3. Khi chưa có giọng nữ, ứng dụng chạy **chế độ một giọng** và ghi cảnh báo vào log. Không giả lập hai giọng bằng cách đổi tốc độ hay cao độ.

**Khối `engines`:**
| Engine | Trạng thái | Ghi chú |
|---|---|---|
| `omnivoice` | Dùng được | Clone, voice design, hơn 600 ngôn ngữ, chạy GPU CUDA |
| `omnivoice-subprocess` | Dùng được | Cùng model nhưng chạy tiến trình riêng, kill được khi timeout. **Khuyến nghị cho pipeline chạy tự động** (cần bật `OMNIVOICE_TTS_BACKEND=omnivoice-subprocess` phía server) |
| `kittentts` | Dùng được | Chỉ tiếng Anh, 8 giọng preset nam/nữ (`expr-voice-N-m`, `expr-voice-N-f`), không clone. Chỉ dùng cho video tiếng Anh hoặc để test cast |
| các engine còn lại | `available: false` | Cần cài thêm (cosyvoice, voxcpm2, indextts2, v.v.). Adapter bỏ qua |

**Quy tắc cho adapter:**
- Chỉ liệt kê engine có `available: true`.
- Request chọn engine bằng tham số `model` (xem 8.2.2). Id kiểu OpenAI là alias của engine đang hoạt động.
- **Thẻ biểu cảm trong văn bản** (engine `omnivoice`): `[laughter]`, `[sigh]`, `[surprise-ah]`, `[surprise-wa]`, `[question-en]`, `[dissatisfaction-hnn]`, v.v. Engine không có tham số cảm xúc (`supports_emotion: false`). Scriptwriter chỉ được dùng thẻ cho vai `accent`, rất ít, và chỉ sau khi đã test thẻ nào nghe tự nhiên với tiếng Việt. Phải **lọc thẻ ra khỏi caption**.
- **Chỉ có một GPU**: hàng đợi TTS chạy tuần tự (concurrency = 1), timeout theo độ dài đoạn, retry khi lỗi.
- Gọi giọng bằng `voice` = tên (`giong_1_nam`) hoặc id (`7cc37272`). Lưu id vào cấu hình, hiển thị tên.

### 8.2.2 Tham số API đã xác nhận từ `/docs`

**`POST /v1/audio/speech`** (JSON, trả về byte audio):

```json
{
  "model": "omnivoice",
  "input": "Câu cần đọc",
  "voice": "<voice_id hoặc tên>",
  "language": "vi",
  "response_format": "wav",
  "speed": 1.0,
  "seed": 1234,
  "num_step": 16
}
```

| Tham số | Ghi chú cho adapter |
|---|---|
| `input` | Tối đa 4096 ký tự. Segment của kịch bản ngắn hơn nhiều (đề xuất ≤ 500 ký tự). Nếu dài hơn thì tách theo câu |
| `model` | Chọn engine bằng id: `omnivoice`, `voxcpm2`, `cosyvoice`, `mlx-audio`, `kittentts`, `moss-tts-nano`. Id kiểu OpenAI (`tts-1`, `tts-1-hd`, `gpt-4o-mini-tts`…) là alias của engine đang hoạt động. Mặc định dùng `omnivoice` |
| `voice` | Truyền **id** profile (ưu tiên, chắc chắn nhất) hoặc tên (không phân biệt hoa thường). Nếu nhiều profile trùng tên, server trả **409** kèm danh sách id, khi đó adapter báo lỗi rõ và yêu cầu dùng id. Nên lưu id vào cấu hình |
| `language` | Mã ISO 639-1. Với tiếng Việt truyền `"vi"` |
| `response_format` | `mp3`, `opus`, `aac`, `flac`, `wav`, `pcm`. Dùng `wav` làm trung gian để xử lý (FFmpeg), `pcm` là raw 24 kHz 16-bit mono |
| `speed` | 0.25–4.0, mặc định 1.0. Dùng trong khoảng 0.9–1.15 để giọng tự nhiên |
| `seed` | Cố định seed để tái tạo cùng kết quả. Nên lưu seed mỗi segment để chạy lại bước cho kết quả giống nhau. Có thể thử một seed cố định cho mỗi vai để giữ âm sắc ổn định (cần test) |
| `num_step` | 1–128, mặc định 16. `32` là mức chất lượng cao theo tài liệu model. Dùng 16 cho bản xem trước, 32 cho bản cuối |
| `guidance_scale` | Mặc định 2.0, tối đa 20. Chỉ chỉnh khi cần |
| `duration` | Hướng tới số giây mong muốn. Có thể dùng để ép khớp thời lượng cảnh, cần test engine có tôn trọng không |
| `instruct` / `instructions` | Chỉ dẫn phong cách. Với OmniVoice, chỉ phần thẻ voice design được giữ lại |
| `denoise`, `preprocess_prompt` | Mặc định giữ nguyên |
| `description` | Dùng cho voice design nhưng **chỉ engine VoxCPM2 hỗ trợ** (hiện chưa cài) |
| `stream_format` | Không dùng, lấy file hoàn chỉnh |

**`POST /v1/audio/transcriptions`** (multipart/form-data):

```bash
curl http://192.168.5.18:3900/v1/audio/transcriptions \
  -F file=@voice.wav -F model=whisper-1 -F language=vi \
  -F response_format=verbose_json \
  -F "timestamp_granularities[]=word" -F "timestamp_granularities[]=segment"
```

- `model=whisper-1` (và `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`) là alias do **engine ASR đang hoạt động** xử lý. Danh sách `engines` bạn gửi chỉ có engine TTS, nên **chưa chắc Voice Studio đang có ASR**. Phải test một lần.
- `timestamp_granularities[]` nhận `word` và/hoặc `segment`, chỉ có tác dụng với `verbose_json`. Không hỗ trợ `stream` (trả 400).
- `/v1/audio/translations` chỉ dịch sang tiếng Anh và cần engine họ Whisper, chưa dùng.

**Chuỗi dự phòng cho mốc thời gian caption (bước 11):**
1. Transcribe qua Voice Studio với mốc từng từ, nếu phản hồi có `words` đầy đủ.
2. Whisper cục bộ của HyperFrames (`transcribe`).
3. Ước lượng theo từng segment: thời lượng từng segment đo bằng `ffprobe`, chia theo số ký tự giữa các từ. Cách này lệch từng từ một chút nhưng **luôn đúng giọng** (mỗi segment đã gắn `speaker`), vẫn đủ để caption đổi màu theo giọng.

**Smoke test ở đầu Phase 1** (script `pnpm voice:smoke`):
1. Gọi `GET /v1/audio/voices`, in danh sách profile (bỏ alias).
2. Tạo một câu tiếng Việt cho giọng nam và một câu cho giọng nữ, lưu `wav`, in thời lượng.
3. Gửi từng file qua transcriptions với `verbose_json` + `word`, báo có trả mốc từ hay không, hoặc lỗi gì.
4. Ghi kết quả vào `docs/voice-studio-api.md` để chọn phương án dự phòng ở trên.

### 8.3 Voice Cast: hai giọng nam và nữ phối hợp
Không dùng một giọng cho cả video. Mỗi video có một **dàn giọng (cast)** gồm hai vai:

| Vai | Mặc định | Nhiệm vụ |
|---|---|---|
| `lead` | Giọng chính (nam hoặc nữ, chọn trong Settings) | Dẫn mạch chính: giới thiệu, giải thích, chuyển ý |
| `accent` | Giọng còn lại | Tạo điểm nhấn: hook, số liệu gây sốc, trích dẫn, câu chốt, CTA |

**Quy tắc phân vai (Scriptwriter phải tuân theo, Fact-checker kiểm tra):**
- Mỗi đoạn thoại (`segment`) gắn một `speaker`: `lead` hoặc `accent`.
- Hook 3 giây đầu có thể do `accent` mở để gây chú ý, sau đó `lead` dẫn tiếp.
- Đổi giọng có chủ đích, không đổi quá dày: tối thiểu 2 câu liền nhau cho một giọng, trừ khi là đối thoại hỏi–đáp.
- Tỉ lệ thời lượng gợi ý `lead` ~60–70%, `accent` ~30–40%.
- Không cắt giữa câu. Một câu chỉ do một giọng đọc.

**Chế độ cast (chọn khi tạo video):**
1. **Dẫn chuyện + điểm nhấn**: `lead` đọc chính, `accent` chen vào ở điểm nhấn.
2. **Đối thoại**: hai giọng hỏi đáp, phù hợp video giải thích hoặc tin nóng.
3. **Luân phiên theo cảnh**: mỗi cảnh một giọng, đổi giọng khi chuyển cảnh.

**Xử lý audio:**
- Tổng hợp tiếng theo từng segment, rồi ghép theo thứ tự.
- Chèn khoảng nghỉ 120–200 ms khi đổi giọng, crossfade ngắn 30–50 ms để không bị giật.
- Chuẩn hóa độ to từng giọng về cùng mức (khoảng −16 LUFS trước khi trộn nhạc) để hai giọng không lệch âm lượng.
- Chạy transcribe trên audio đã ghép để lấy mốc thời gian từng từ, **giữ nhãn `speaker` cho từng từ**.
- **Caption đổi màu theo giọng** (ví dụ `lead` màu trắng/xanh, `accent` màu hồng/vàng) để tăng điểm nhấn thị giác. Màu lấy từ Brand Kit.

**Giọng clone:**
- Adapter lấy danh sách giọng từ Voice Studio và gắn cờ `cloned` theo thông tin API trả về.
- Hiện có `giong_1_nam` (profile nam). Giọng nữ sẽ thêm sau. Khi bạn thêm profile mới vào Voice Studio, bấm **Làm mới danh sách giọng** trong Settings là dùng được ngay, không cần sửa code. Hai vai `lead` và `accent` gán cho giọng nam và giọng nữ do bạn chọn trong Settings (xem 8.2.1). Nếu một vai chưa có giọng thì chạy chế độ một giọng và ghi cảnh báo.
- Giọng clone được ưu tiên hiển thị đầu danh sách và có nhãn riêng. Mỗi giọng clone phải có ghi nhận đã được người sở hữu giọng đồng ý (trường `consentNote` trong cấu hình, chỉ để lưu thông tin).

**Giọng dự phòng:** nếu Voice Studio không truy cập được, tự chuyển sang TTS cục bộ của HyperFrames (Kokoro), chọn một giọng nam và một giọng nữ tương ứng với hai vai, và ghi cảnh báo vào log.

### 8.3.1 Voice Pool và tự động xoay giọng

Giọng không bị cố định. Hệ thống giữ một **pool giọng** và tự chọn cặp nam + nữ cho mỗi video.

**Nhận diện giới tính theo tên (đã chốt):**
- Giọng nam: `xxx_nam`. Giọng nữ: `xxx_nu`. Ví dụ `giong_1_nam`, `giong_2_nu`, `tran_nam`, `lan_nu`.
- Regex: `^(.+)_(nam|nu)$`, không phân biệt hoa thường.
- Tên không khớp quy ước thì xếp vào "chưa phân loại", **không tham gia tự động** cho đến khi bạn gán giới tính thủ công trong Settings.
- Alias OpenAI (alloy, nova…) không bao giờ vào pool.

**Pool:**
- Gồm mọi profile hợp lệ trong `GET /v1/audio/voices`. Danh sách được làm mới tự động mỗi lần bắt đầu một run (và có nút làm mới thủ công), nên giọng mới bạn thêm vào Voice Studio được nhận ngay, không cần sửa code.
- Mỗi giọng có cấu hình: `enabled` (bật/tắt trong pool), `weight` (trọng số, mặc định 1), `tags` (ví dụ "trầm", "ấm", "năng động", "tin tức"), `genderOverride`.

**Các chế độ chọn giọng (chọn khi tạo video, mặc định là Tự động):**
1. **Tự động xoay** (mặc định): mỗi video chọn một cặp nam + nữ theo thuật toán bên dưới.
2. **Khóa một vai**: cố định `lead` (hoặc `accent`), vai còn lại tự động xoay.
3. **Cố định cả cặp**: bạn chọn tay, dùng cho video theo series cần giọng quen thuộc.
4. **Xoay nâng cao trong video** (tùy chọn, dùng với chế độ "Luân phiên theo cảnh"): tối đa 2 giọng nam và 2 giọng nữ mỗi video, mỗi cảnh một giọng.

**Thuật toán chọn cặp (chế độ Tự động):**
1. Lọc pool: `enabled`, đúng giới tính cần, ưu tiên giọng có `tags` khớp phong cách video.
2. Loại các giọng đã dùng trong **N video gần nhất** (mặc định N = 3, tự giảm nếu pool quá nhỏ).
3. Chọn ngẫu nhiên có trọng số: `weight` cao và giọng **ít dùng gần đây** có xác suất lớn hơn.
4. Quyết định ai là `lead`: luân phiên giới tính của `lead` giữa các video (video trước nam dẫn thì video này nữ dẫn), trừ khi cast preset quy định khác.
5. Lưu `voiceCastSeed` vào Run. Chạy lại bước 10 với cùng seed cho đúng cặp cũ. Nút **Đổi cặp khác** sinh seed mới.

```ts
function pickCast(pool: PoolVoice[], history: VoiceUsage[], opts: CastOpts, seed: number): Cast {
  const rng = seededRng(seed);
  const recent = recentVoiceIds(history, opts.avoidLastN);        // N video gần nhất
  const pick = (gender: 'nam' | 'nu') => {
    let cands = pool.filter(v => v.enabled && v.gender === gender);
    const fresh = cands.filter(v => !recent.has(v.id));
    if (fresh.length) cands = fresh;                               // nếu hết giọng "mới" thì cho dùng lại
    return weightedPick(cands, v => v.weight * rarityBoost(v, history), rng);
  };
  const male = opts.locks.male ?? pick('nam');
  const female = opts.locks.female ?? pick('nu');
  const leadGender = opts.leadGender ?? oppositeOf(lastLeadGender(history));
  return leadGender === 'nam'
    ? { lead: male, accent: female }
    : { lead: female, accent: male };
}
```

**Quy tắc nhất quán:** trong một video, mỗi vai giữ **cùng một giọng** từ đầu đến cuối (trừ chế độ xoay nâng cao), để người xem không nghe lệch tiếng. Việc xoay chỉ diễn ra giữa các video.

**Khi pool thiếu giọng:**
| Tình huống | Hành vi |
|---|---|
| Chỉ có giọng nam hoặc chỉ có giọng nữ | Chế độ một giọng, ghi cảnh báo vào log |
| Đúng 1 nam + 1 nữ | Cặp cố định, chỉ luân phiên ai là `lead` giữa các video |
| Từ 2 giọng mỗi giới trở lên | Xoay đầy đủ theo thuật toán |

**Hiển thị trong UI:** bước 10 ghi rõ cặp giọng đã chọn và lý do (ví dụ "Tự động: `lan_nu` dẫn, `tran_nam` nhấn, đã tránh 3 video gần nhất"). Có nút nghe thử và nút **Đổi cặp khác** trước khi tạo giọng.

**Dữ liệu bổ sung:**
```ts
VoiceSetting { voiceId, enabled, weight, tags: string[], genderOverride?: 'nam'|'nu' }
VoiceUsage   { id, voiceId, projectId, runId, role: 'lead'|'accent', usedAt }
// Run thêm trường: voiceCastSeed: number, voiceCast: { leadVoiceId, accentVoiceId }
```

### 8.4 Settings → Voice
- URL Voice Studio, nút Test kết nối, nút Làm mới danh sách giọng.
- **Bảng Voice Pool**: danh sách giọng nhận từ Voice Studio, bật/tắt từng giọng, trọng số, thẻ, sửa giới tính cho giọng không theo quy ước `_nam`/`_nu`. Hiển thị số lần dùng gần đây của từng giọng.
- **Bảng Voice Cast**: chọn chế độ (Tự động xoay mặc định / Khóa một vai / Cố định cả cặp), số video gần nhất cần tránh lặp (N), nút nghe thử từng giọng, nút **nghe thử cả cặp** với một đoạn mẫu có đổi giọng.
- Chọn chế độ cast mặc định, tốc độ đọc từng giọng, màu caption từng giọng.
- Lưu nhiều **cast preset** (ví dụ "Tin tức", "Kể chuyện") để dùng lại.

### 8.5 Adapter chung

- Tạo module `packages/voice` với interface:

```ts
interface VoiceProvider {
  listVoices(): Promise<Voice[]>
  synthesize(opts: {
    text: string
    voiceId: string
    speed?: number
    emotion?: string
    language?: string
  }): Promise<{ audioPath: string; durationSec: number }>
}
```

- Cấu hình trong Settings: endpoint, API key, giọng mặc định cho từng ngôn ngữ.
- **Phải có giọng dự phòng chạy cục bộ**. HyperFrames có sẵn công cụ `tts` (Kokoro) và `transcribe` (Whisper), dùng làm fallback.
- Synthesize theo từng cảnh để có độ dài chính xác, rồi ghép. Sau đó chạy transcribe để lấy mốc thời gian từng từ cho Caption Agent.
- Trang Voice Studio trong UI: chọn giọng, nghe thử, chỉnh tốc độ, tải mẫu.

> **Ánh xạ sang API thật**: `listVoices()` gọi `GET /v1/audio/voices`; `synthesize()` gọi `POST /v1/audio/speech` (nhận về byte audio, ghi ra file rồi đo thời lượng bằng `ffprobe`); `transcribe()` gọi `POST /v1/audio/transcriptions`. Vì Voice Studio tương thích OpenAI, adapter nên viết theo giao thức OpenAI và có thể dùng lại cho dịch vụ TTS khác chỉ bằng cách đổi `baseUrl`. `Voice` cần có thêm các trường `gender`, `cloned` và `language`. Nếu `/v1/audio/voices` không trả về giới tính hoặc cờ clone, cho phép người dùng gán thủ công trong Settings.

---

## 9. Giao diện (UI)

### 9.1 Màn hình
1. **Dashboard**: danh sách project, trạng thái, chi phí.
2. **Tạo video**: nhập nguồn, chọn tỉ lệ (16:9 / 9:16 / cả hai), phong cách, brand kit, ngưỡng điểm, bật/tắt bước, duyệt thủ công.
3. **Pipeline Live View** (màn hình quan trọng nhất).
4. **Settings**: Models, Voice, Mặc định video, Publish, Lưu trữ.
5. **Voice Studio**.
6. **Thư viện**: xem, tải, đăng lại video.
7. **Hàng đợi đăng**: danh sách PublishJob, hẹn giờ.

### 9.2 Pipeline Live View
- **Cột trái**: timeline dọc 17 bước. Mỗi bước hiển thị: số thứ tự, tên agent, trạng thái, thời gian chạy, model đang dùng.
  - `pending`: biểu tượng xám.
  - `running`: **spinner xoay + viền gradient phát sáng, nhịp thở nhẹ** (Framer Motion).
  - `done`: dấu tick xanh, hiệu ứng pop.
  - `warning`: tam giác vàng.
  - `failed`: dấu X đỏ, nút Thử lại.
  - `skipped`: gạch ngang mờ.
- **Cột phải**: log của bước đang chọn (mặc định bước đang chạy), tự cuộn, lọc theo mức (info/warn/error), tìm kiếm. Hiển thị token và chi phí của bước.
- **Thanh trên**: tiến độ tổng (%), thời gian đã chạy, ước lượng còn lại, tổng chi phí, nút Dừng, Tạm dừng, Tiếp tục.
- **Hành động từng bước**: xem đầu vào/đầu ra JSON, sửa đầu ra rồi chạy tiếp, chạy lại từ bước này.
- **Khung xem trước**: khi có snapshot (bước 13) hoặc clip (bước 14, 15) thì hiển thị ngay, có chuyển đổi 16:9/9:16.
- **Hộp duyệt**: ở bước có `requiresApproval`, hiện kịch bản/storyboard để sửa và bấm "Duyệt & tiếp tục".

### 9.3 Phong cách thị giác của app
Nền tối, gradient tím–xanh–hồng, glassmorphism nhẹ, font hiện đại (Inter hoặc Plus Jakarta Sans), bo góc lớn, animation mượt. Hỗ trợ chế độ sáng.

### 9.4 Settings → Models
- Danh sách provider đã thêm, nút **Thêm provider**: loại, tên, base URL (nếu cần), API key, nút **Test kết nối** (gọi thử, hiển thị độ trễ và danh sách model).
- Bảng **gán model theo agent** (17 dòng): chọn provider, model, nhiệt độ, danh sách fallback.
- **Ngân sách**: giới hạn USD mỗi video, hành động khi vượt (dừng hoặc cảnh báo).
- **Preset**: Tiết kiệm / Cân bằng / Chất lượng cao, tự điền bảng gán model.

---

## 10. Đăng video

### 10.1 Chiến lược
1. **API chính thức** (ưu tiên):
   - YouTube Data API v3: tải lên video và Shorts (Shorts = video dọc ≤ 3 phút, thêm `#Shorts` vào tiêu đề/mô tả).
   - TikTok Content Posting API.
   - Meta Graph API cho Facebook Reels.
   - Mỗi nền tảng cần đăng ký app, OAuth và có thể phải qua kiểm duyệt. Kiểm tra tài liệu và giới hạn hiện hành của từng nền tảng trước khi code.
2. **Tự động hóa trình duyệt (dự phòng)**: Playwright với profile đã đăng nhập sẵn, tự điền tiêu đề, mô tả, hashtag, chọn file.
   - Dễ hỏng khi giao diện nền tảng đổi, có rủi ro bị gắn cờ nếu đăng quá dày.
   - Giới hạn tần suất, thêm độ trễ ngẫu nhiên, luôn có bước xác nhận của người dùng.

### 10.2 Luồng
1. Publisher agent sinh `title`, `description`, `hashtags`, thumbnail riêng cho từng nền tảng.
2. UI hiển thị **màn hình xem trước và xác nhận** từng nền tảng. Người dùng sửa được.
3. Chọn đăng ngay hoặc hẹn giờ. Job vào hàng đợi.
4. Kết quả (URL video hoặc lỗi) lưu vào `PublishJob`, hiển thị trong UI.

### 10.3 Ràng buộc đầu ra theo nền tảng
| Nền tảng | Tỉ lệ | Ghi chú |
|---|---|---|
| YouTube Shorts | 9:16 | Tối đa 3 phút |
| YouTube video | 16:9 | Không giới hạn thực tế cho nhu cầu này |
| Facebook Reels | 9:16 | Kiểm tra giới hạn thời lượng hiện hành |
| TikTok | 9:16 | Kiểm tra giới hạn thời lượng và kích thước hiện hành |

Các giới hạn cụ thể thay đổi theo thời gian. **Đọc tài liệu chính thức khi triển khai** và lưu thành hằng số trong `packages/publishers/limits.ts`.

---

## 11. API (server)

### 11.1 REST
```
POST   /api/projects                 tạo project
GET    /api/projects                 danh sách
GET    /api/projects/:id             chi tiết
POST   /api/projects/:id/runs        bắt đầu pipeline
POST   /api/runs/:id/pause|resume|cancel
POST   /api/runs/:id/steps/:i/retry
POST   /api/runs/:id/steps/:i/approve   body: { output?: json }
GET    /api/runs/:id                 trạng thái + danh sách StepRun
GET    /api/runs/:id/steps/:i        input/output/logs
GET    /api/assets/:id               tải file

GET/POST/PUT/DELETE /api/providers
POST   /api/providers/:id/test
GET/PUT /api/agent-models
GET/PUT /api/settings

GET    /api/voices
POST   /api/voices/preview

POST   /api/publish                  tạo PublishJob
POST   /api/publish/:id/confirm
GET    /api/publish
```

### 11.2 Stream sự kiện (SSE)
`GET /api/runs/:id/events` trả về luồng sự kiện:

```json
{ "type": "run.started",     "runId": "..." }
{ "type": "step.started",    "step": 6, "agent": "Scriptwriter", "model": "..." }
{ "type": "step.log",        "step": 6, "level": "info", "message": "Đang viết cảnh 3/7", "ts": "..." }
{ "type": "step.progress",   "step": 14, "percent": 42 }
{ "type": "step.completed",  "step": 6, "durationMs": 8123, "tokensIn": 1200, "tokensOut": 800, "costUsd": 0.004 }
{ "type": "step.warning",    "step": 4, "message": "Điểm 4.8 dưới ngưỡng 5.0" }
{ "type": "step.failed",     "step": 12, "error": "..." }
{ "type": "approval.needed", "step": 6 }
{ "type": "asset.created",   "assetId": "...", "kind": "scene_clip" }
{ "type": "run.completed",   "runId": "..." }
```
Client phải tự kết nối lại và nhận bù sự kiện bỏ lỡ qua `Last-Event-ID`.

---

## 12. Bảo mật và tuân thủ

- API key mã hóa lúc lưu, không log, không gửi về client.
- Code do agent sinh (HTML, TSX, Python Manim) **chạy trong sandbox**: thư mục ghi giới hạn, timeout, Manim không có mạng. HTML render trong Chrome headless không cho truy cập tệp ngoài thư mục project.
- Không cho agent chạy lệnh shell tùy ý ngoài danh sách cho phép (`hyperframes`, `ffmpeg`, `manim`, `remotion`).
- Nội dung nguồn là dữ liệu không đáng tin: **chống prompt injection** bằng cách đặt bài viết trong khối dữ liệu riêng và nhắc agent không làm theo chỉ dẫn nằm trong bài.
- Ghi nguồn bài gốc trong mô tả video. Bài có bản quyền cần người dùng chịu trách nhiệm xác nhận quyền sử dụng.
- Nhạc và ảnh dùng nguồn có giấy phép rõ ràng, lưu thông tin giấy phép trong `Asset.meta`.
- Gắn nhãn nội dung do AI tạo theo yêu cầu từng nền tảng khi đăng.
- Token OAuth của nền tảng xã hội lưu mã hóa, cho phép thu hồi trong UI.

---

## 13. Ý tưởng mở rộng (làm sau MVP)

1. **Brand Kit**: lưu bảng màu, font, logo, phong cách chuyển động, áp dụng cho mọi video.
2. **Thư viện preset phong cách**: Neon Cyber, Pastel, Tin tức, Tối giản, Retro.
3. **Hook A/B**: sinh 3 hook 3 giây đầu để chọn.
4. **Beat-sync**: dựng cảnh theo nhịp nhạc.
5. **Chế độ tự động hàng loạt**: theo dõi RSS, bài đạt ngưỡng điểm thì tự tạo video vào hàng chờ duyệt.
6. **Gợi ý giờ đăng** theo nền tảng.
7. **Đa ngôn ngữ**: lồng tiếng và phụ đề sang nhiều ngôn ngữ từ một kịch bản.
8. **Analytics sau đăng**: lấy lượt xem, thời gian xem, đưa lại cho Scorer để học.
9. **Chống trùng chủ đề** (so sánh embedding với video đã làm).
10. **Thông báo** qua Telegram/Email khi xong hoặc lỗi.
11. **Phiên bản và so sánh bản dựng** của cùng một video.
12. **Đóng gói app desktop** (Tauri/Electron).

---

## 14. Lộ trình triển khai theo Phase

### Phase 0: Khởi tạo (0.5 ngày)
- Tạo monorepo pnpm, cấu hình TypeScript, ESLint, Prettier.
- Kiểm tra môi trường: Node ≥ 22, FFmpeg, Redis. Script `pnpm doctor` kiểm tra và báo thiếu.
- **DoD**: `pnpm doctor` chạy xanh, `pnpm dev` khởi động được web và server rỗng.

### Phase 1: MVP lõi (1–2 tuần)
- DB schema (mục 5), orchestrator, queue, SSE.
- Lớp provider + 1 provider (ví dụ OpenAI-compatible), Test kết nối.
- Agent 1–8, 10, 11, 12, 14, 15 (chưa cần 9, 13, 16, 17).
- Engine HyperFrames + GSAP, render 16:9 và 9:16, FFmpeg ghép.
- UI: Tạo video, Pipeline Live View (spinner, log realtime), Settings → Models.
- Voice: fallback TTS cục bộ trước, adapter Voice Studio sau.
- **DoD**: nhập một URL bài viết, bấm chạy, thấy từng bước chạy với spinner và log, nhận file `final_16x9.mp4` và `final_9x16.mp4` mở được, đúng kích thước, có tiếng và caption khớp giọng.

### Phase 2: Chất lượng (1–2 tuần)
- three.js trong cảnh, preset phong cách, Brand Kit.
- Agent 9 (Asset), 13 (Lint & Preview), 16 (QA vision), vòng sửa lỗi.
- Duyệt thủ công kịch bản/storyboard, sửa đầu ra rồi chạy tiếp, chạy lại từ bước bất kỳ.
- Đa provider, bảng gán model theo agent, fallback, ngân sách, preset Tiết kiệm/Cân bằng/Chất lượng.
- Voice Studio UI và adapter thật.
- **DoD**: QA phát hiện được chữ tràn khung trong video thử có lỗi cố ý và tự sửa; đổi model của một agent trong Settings có hiệu lực ở lần chạy sau.

### Phase 3: Engine mở rộng và đăng bài (2 tuần)
- Manim worker, Remotion template, Blender MCP (tùy chọn).
- Agent 17 (Publisher), màn hình xem trước và xác nhận.
- Đăng YouTube qua API (video và Shorts), hàng đợi đăng, hẹn giờ.
- **DoD**: một video được đăng thành công lên YouTube kênh thử, URL lưu lại trong PublishJob.

### Phase 4: Mở rộng nền tảng và tự động hóa (2 tuần)
- TikTok, Facebook Reels (API, dự phòng Playwright).
- Chế độ tự động hàng loạt theo RSS, thông báo, analytics.
- **DoD**: bài mới từ RSS tự động vào hàng chờ duyệt kèm video.

---

## 15. Tiêu chí chất lượng video (kiểm tra ở bước QA)

- Độ phân giải đúng: 1920×1080 hoặc 1080×1920. 30 fps.
- Hook xuất hiện trong 3 giây đầu.
- Chữ trên màn hình: không tràn khung, không che mặt/chủ thể, tương phản đủ (tỉ lệ ≥ 4.5:1), cỡ chữ đọc được trên điện thoại (9:16: tối thiểu 48px).
- Vùng an toàn cho 9:16: chừa mép dưới ~20% và mép trên ~10% cho giao diện nền tảng.
- Caption khớp tiếng, sai lệch dưới 150 ms.
- Âm lượng: giọng đọc rõ, nhạc nền thấp hơn giọng, chuẩn hóa khoảng −14 LUFS.
- Không có khung hình đen hoặc đứng hình bất thường.
- Màu sắc bám bảng màu của preset hoặc Brand Kit.

---

## 16. Kiểm thử

- **Unit**: schema Zod của từng agent, wrapper FFmpeg, adapter provider (mock).
- **Integration**: chạy pipeline với provider giả (trả JSON mẫu) để kiểm tra luồng, retry, resume, event SSE.
- **Golden test**: render một composition HyperFrames cố định, so sánh khung hình mẫu (do render tất định).
- **E2E**: Playwright kiểm tra UI Pipeline Live View thay đổi trạng thái đúng theo sự kiện.
- **Thủ công**: chạy với 5 bài viết đa dạng (tin tức, kỹ thuật, giải trí, có số liệu, rất ngắn) trước khi phát hành mỗi Phase.

---

## 17. Cấu hình môi trường (`.env.example`)

```
APP_SECRET=change-me-32-bytes
DATABASE_URL=file:./data/app.db
REDIS_URL=redis://localhost:6379
DATA_DIR=./data
MAX_PARALLEL_SCENES=2
RENDER_TIMEOUT_SEC=600
MANIM_PYTHON=./.venv/bin/python
BLENDER_MCP_URL=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
META_APP_ID=
META_APP_SECRET=
```

---

## 18. Việc cần xác nhận trước khi code

1. Voice Studio: dịch vụ có API sẵn hay tự xây? Cần tài liệu endpoint.
2. Triển khai trên máy cá nhân hay server? (ảnh hưởng đến Docker, GPU cho Blender).
3. Ngôn ngữ chính của video (tiếng Việt, tiếng Anh, cả hai)?
4. Dùng Remotion cho mục đích thương mại hay không (kiểm tra giấy phép).
5. Có sẵn tài khoản developer YouTube, TikTok, Meta chưa?
6. Provider AI ưu tiên ban đầu là gì?

---

## 19. Hướng dẫn cho AI coding agent (nếu dùng Claude Code để triển khai)

- Đọc toàn bộ file này trước, làm **đúng một Phase mỗi lần**, dừng ở DoD của Phase đó và báo cáo.
- Mỗi package có `README.md` ngắn nêu mục đích và cách chạy.
- Viết schema Zod trước, code sau. Mọi đầu ra của agent phải qua validate.
- Không hard-code API key. Không thêm thư viện lớn khi chưa cần.
- Thay đổi ngoài đặc tả (đổi kiến trúc, thêm dịch vụ) phải hỏi lại trước.
