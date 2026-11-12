# @videoforge/engine-manim

Worker Python chạy Manim (Mục 7.3):
- Sinh file `.py` với class `VideoForgeScene(Scene)` đặt `config.pixel_width` / `config.pixel_height` theo tỉ lệ `16:9` hoặc `9:16`.
- Chạy `manim -qh scene.py VideoForgeScene` trong sandbox (timeout 120s, thư mục ghi giới hạn).
