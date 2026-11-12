# @videoforge/publishers

Module đăng video lên các nền tảng xã hội (Mục 10):
- Hằng số giới hạn từng nền tảng trong `limits.ts`.
- Ưu tiên API chính thức: YouTube Data API v3 (Video & Shorts), TikTok Content Posting API, Meta Graph API (Facebook Reels).
- Dự phòng tự động hóa trình duyệt bằng Playwright (`playwright-fallback`) kèm độ trễ ngẫu nhiên và bước xác nhận của người dùng.
