# @videoforge/web

Giao diện người dùng Next.js (App Router) + Tailwind CSS + Framer Motion + Zustand của VideoForge (Mục 9):
- **Dashboard**: Danh sách dự án, trạng thái, chi phí, nút mở nhanh Pipeline Live View.
- **Tạo video**: Nhập nguồn (URL, Text, PDF, RSS), chọn tỉ lệ (`16:9`, `9:16`, `both`), Style Preset, Brand Kit, ngưỡng điểm Scorer, chế độ Voice Cast, bật/tắt các bước cho phép (3, 4, 5, 7, 9, 11, 13, 16) và chọn bước duyệt thủ công.
- **Pipeline Live View**: Timeline dọc 17 bước với Framer Motion spinner phát sáng khi `running`, stream log realtime qua SSE (`Last-Event-ID`), lọc theo mức độ (`info`/`warn`/`error`), tìm kiếm, xem/sửa trực tiếp JSON đầu ra của bước chờ duyệt (`approval.needed`), chạy lại từ bước bất kỳ và xem trước Snapshot / Video `16:9` & `9:16`.
- **Voice Studio**: Kết nối `http://192.168.5.18:3900`, bảng Voice Pool (`_nam` / `_nu`), công tắc hiện alias OpenAI, nghe thử từng giọng hoặc nghe thử cả cặp Lead + Accent có đổi giọng.
- **Settings**: Quản lý đa AI Provider (thêm, test kết nối độ trễ + model), bảng 17 dòng gán model theo agent, Preset Tiết kiệm / Cân bằng / Chất lượng cao, ngân sách USD/video, Brand Kit, cấu hình Blender MCP.
- **Thư viện & Hàng đợi đăng**: Xem/tải video đã xuất và màn hình xem trước + xác nhận đăng bài lên YouTube Video, YouTube Shorts, Facebook Reels, TikTok.
