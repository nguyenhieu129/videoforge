# @videoforge/engine-ffmpeg

Wrapper FFmpeg cho bước Assembler (Mục 7.5):
- Chuẩn hóa clip về cùng FPS (30fps), kích thước (`1920x1080` hoặc `1080x1920`), `libx264`, `yuv420p`
- Ghép các clip cảnh (`concat`)
- Trộn giọng đọc + nhạc nền kèm sidechain compression ducking (`sidechaincompress`)
- Tạo file phụ đề `.srt` / `.ass` đổi màu theo vai `lead` / `accent` và burn phụ đề
- Trích xuất ảnh thumbnail và kiểm tra thông số video/LUFS cho bước QA
