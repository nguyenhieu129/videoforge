# @videoforge/agents

Định nghĩa và thực thi toàn bộ 17 AI Agents của VideoForge (Mục 6):
1. `Collector`
2. `Cleaner`
3. `Analyzer`
4. `Scorer` (Trọng số: Hook 30%, Novelty 25%, Clarity 25%, Controversy 10%, Visualizability 10%)
5. `Strategist`
6. `Scriptwriter` (Phân vai `lead` & `accent`, `onScreenText` <= 8 từ)
7. `FactChecker`
8. `Director`
9. `AssetAgent`
10. `VoiceStudio` (Kết nối `192.168.5.18:3900`, `pickCast`, chuẩn hóa LUFS)
11. `CaptionAgent` (Transcribe word timings, lọc thẻ biểu cảm, đổi màu theo giọng)
12. `SceneBuilder` (Sinh code 16:9 & 9:16 riêng biệt)
13. `LintPreview`
14. `Renderer` (Chạy song song theo cấu hình `MAX_PARALLEL_SCENES`)
15. `Assembler` (FFmpeg concat, mix voice + music sidechain ducking, burn subtitle, thumbnail)
16. `QAAgent` (Kiểm tra chất lượng, tự quay lại bước 12 tối đa 2 lần nếu lỗi)
17. `Publisher`
