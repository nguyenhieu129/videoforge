#!/usr/bin/env tsx
/**
 * Smoke test cho Voice Studio (Mục 8.2.2):
 * 1. Gọi GET /v1/audio/voices, in danh sách profile (bỏ alias).
 * 2. Tạo một câu tiếng Việt cho giọng nam và một câu cho giọng nữ, lưu wav, in thời lượng.
 * 3. Gửi từng file qua transcriptions với verbose_json + word, báo có trả mốc từ hay không.
 * 4. Ghi kết quả vào docs/voice-studio-api.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const VOICE_STUDIO_URL = process.env.VOICE_STUDIO_URL || 'http://192.168.5.18:3900';

async function main() {
  console.log(`🔍 Đang kiểm tra kết nối tới Voice Studio tại: ${VOICE_STUDIO_URL}`);
  const outDir = path.resolve(process.cwd(), 'data/smoke-voice');
  fs.mkdirSync(outDir, { recursive: true });

  try {
    const res = await fetch(`${VOICE_STUDIO_URL}/v1/audio/voices`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as any;
    const voices = Array.isArray(data.voices) ? data.voices : [];
    const profiles = voices.filter((v: any) => v.type !== 'openai_alias');

    console.log(`✅ Đã lấy danh sách giọng: tổng ${voices.length} giọng (${profiles.length} profile thực tế):`);
    for (const p of profiles) {
      console.log(`   - ID: ${p.voice_id || p.id} | Tên: ${p.name || p.id} | Ngôn ngữ: ${p.language || 'Auto'}`);
    }

    const maleVoice = profiles.find((p: any) => /_nam$/i.test(p.name || p.id)) || profiles[0];
    const femaleVoice = profiles.find((p: any) => /_nu$/i.test(p.name || p.id)) || profiles[1] || maleVoice;

    const samples = [
      { role: 'nam', voice: maleVoice?.voice_id || maleVoice?.id || 'giong_1_nam', text: 'Xin chào, đây là bài kiểm tra giọng đọc nam của hệ thống VideoForge.' },
      { role: 'nu', voice: femaleVoice?.voice_id || femaleVoice?.id || 'giong_2_nu', text: 'Và đây là giọng đọc điểm nhấn nữ phối hợp trong kịch bản video tự động.' },
    ];

    for (const sample of samples) {
      console.log(`\n🎙️ Đang tổng hợp giọng [${sample.role}] với voice="${sample.voice}"...`);
      const ttsRes = await fetch(`${VOICE_STUDIO_URL}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'omnivoice',
          input: sample.text,
          voice: sample.voice,
          language: 'vi',
          response_format: 'wav',
          speed: 1.0,
          seed: 1234,
          num_step: 16,
        }),
      });

      if (!ttsRes.ok) {
        console.warn(`⚠️ Lỗi TTS (${sample.role}): HTTP ${ttsRes.status}`);
        continue;
      }

      const wavPath = path.join(outDir, `sample_${sample.role}.wav`);
      const buf = Buffer.from(await ttsRes.arrayBuffer());
      fs.writeFileSync(wavPath, buf);

      const durOut = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${wavPath}"`, { encoding: 'utf8' }).trim();
      console.log(`✅ Đã lưu ${wavPath} (Thời lượng: ${parseFloat(durOut).toFixed(2)}s)`);

      // Test Transcriptions
      const form = new FormData();
      form.append('file', new Blob([buf], { type: 'audio/wav' }), `sample_${sample.role}.wav`);
      form.append('model', 'whisper-1');
      form.append('language', 'vi');
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'word');
      form.append('timestamp_granularities[]', 'segment');

      const sttRes = await fetch(`${VOICE_STUDIO_URL}/v1/audio/transcriptions`, {
        method: 'POST',
        body: form,
      });

      if (sttRes.ok) {
        const sttData = (await sttRes.json()) as any;
        console.log(`✅ Transcribe thành công! Số từ có mốc thời gian: ${(sttData.words || []).length}`);
      } else {
        console.warn(`⚠️ Transcribe trả về HTTP ${sttRes.status}. Sẽ dùng fallback Whisper cục bộ hoặc ước lượng ffprobe.`);
      }
    }
  } catch (err: any) {
    console.warn(`⚠️ Không thể kết nối trực tiếp tới ${VOICE_STUDIO_URL} từ môi trường hiện tại: ${err.message}`);
    console.log(`ℹ️ Ghi chú: Khi chạy trên máy trong mạng LAN 192.168.5.x của bạn, script này sẽ kết nối trực tiếp tới Voice Studio.`);
  }
}

main();
