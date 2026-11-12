# @videoforge/server

Backend API + Pipeline Orchestrator chạy trên Fastify (Mục 3 & Mục 11):
- Cơ sở dữ liệu SQLite (`node:sqlite` tích hợp sẵn trong Node.js >= 22) lưu trữ đầy đủ các bảng `Project`, `Run`, `StepRun`, `LogEntry`, `Asset`, `ProviderConfig`, `AgentModelMap`, `PublishJob`, `BrandKit`, `VoiceSetting`, `VoiceUsage`, `SystemSettings`.
- Hàng đợi công việc bất đồng bộ (Async Job Queue) với hỗ trợ Pause / Resume / Cancel / Retry / Rerunning từ bước bất kỳ.
- Luồng sự kiện thời gian thực qua Server-Sent Events (`GET /api/runs/:id/events`) hỗ trợ `Last-Event-ID` để nhận bù sự kiện.
