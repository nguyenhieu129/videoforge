# VideoForge — AI Multi-Agent Video Production Pipeline

Công cụ tạo video tự động bằng pipeline **17 AI Agent**, kết hợp **HyperFrames**, **GSAP**, **three.js**, **Remotion**, **Manim**, **Blender MCP**, **Voice Studio (`http://192.168.5.18:3900`)** và **FFmpeg**. Hỗ trợ xuất đồng thời video `16:9` (`1920x1080`) và `9:16` (`1080x1920`), phối hợp 2 giọng đọc Nam/Nữ (`lead` & `accent`), đồng bộ phụ đề đổi màu theo giọng và đăng lên YouTube Video, YouTube Shorts, Facebook Reels, TikTok.

## Cấu trúc thư mục

```text
videoforge/
├─ apps/
│  ├─ web/                    # Next.js App Router UI (7 màn hình, Pipeline Live View SSE)
│  └─ server/                 # Fastify API + Pipeline State Machine Orchestrator + SQLite
├─ packages/
│  ├─ core/                   # TypeScript types, Zod schemas cho 17 Agent, AES-256-GCM crypto
│  ├─ agents/                 # Định nghĩa và thực thi 17 AI Agents
│  ├─ providers/              # Multi-provider adapter (OpenAI/Anthropic/Gemini/OpenRouter/Ollama/Custom)
│  ├─ engines/
│  │  ├─ hyperframes/         # Sinh & render composition HTML (16:9 & 9:16 riêng biệt)
│  │  ├─ remotion/            # Template React (BarChartRace, Counter, Leaderboard)
│  │  ├─ manim/               # Worker Python Manim chạy trong sandbox
│  │  ├─ blender/             # Blender MCP client
│  │  └─ ffmpeg/              # Wrapper FFmpeg (concat, sidechain ducking, subtitle, thumbnail)
│  ├─ voice/                  # Voice Studio adapter (192.168.5.18:3900) + pickCast + LUFS norm
│  ├─ publishers/             # YouTube, Shorts, TikTok, Facebook Reels + Playwright fallback
│  └─ templates/              # Style presets, Brand Kits, Cast presets, Model presets
├─ scripts/
│  ├─ doctor.ts               # Kiểm tra môi trường (Node >= 22, FFmpeg, ffprobe, Python3)
│  └─ voice-smoke.ts          # Smoke test kết nối Voice Studio
├─ data/                      # SQLite DB & thư mục lưu trữ dự án
├─ docker/                    # Docker Compose cấu hình sẵn network_mode: host cho LAN
└─ docs/                      # Tài liệu API Voice Studio
```

## Cách chạy nhanh

```bash
# 1. Kiểm tra môi trường
pnpm doctor

# 2. Chạy kiểm thử tự động (Unit + Integration + Golden Composition Test)
pnpm test

# 3. Khởi chạy đồng thời Backend Server (port 4000) và Web UI (port 3000)
pnpm dev
```
