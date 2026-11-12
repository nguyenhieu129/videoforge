# @videoforge/engine-hyperframes

Engine render chính của VideoForge (Mục 7.1):
- Sinh hai bố cục HTML composition riêng biệt cho `16:9` (`1920x1080`) và `9:16` (`1080x1920`) với đầy đủ thuộc tính `data-composition-id`, `data-start`, `data-duration`, `data-width`, `data-height`, `data-track-index`.
- Tích hợp GSAP timeline tua được và three.js frame adapter cho hạt 3D.
- Gọi trực tiếp `npx hyperframes lint`, `npx hyperframes preview` và `npx hyperframes render` trong thư mục sandbox của từng cảnh.
