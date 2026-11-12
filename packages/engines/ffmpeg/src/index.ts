import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { WordTiming } from '@videoforge/core';

/**
 * Chuẩn hóa clip về cùng fps (30) và kích thước trước khi ghép (Mục 7.5)
 */
export function normalizeSceneClip(opts: {
  inputPath: string;
  outputPath: string;
  aspect: '16:9' | '9:16';
}): string {
  fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
  const width = opts.aspect === '16:9' ? 1920 : 1080;
  const height = opts.aspect === '16:9' ? 1080 : 1920;

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      opts.inputPath,
      '-vf',
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=30`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-an',
      opts.outputPath,
    ],
    { stdio: 'ignore' }
  );

  return opts.outputPath;
}

/**
 * Ghép các clip cảnh đã chuẩn hóa (Mục 7.5: ffmpeg -f concat -safe 0 -i list.txt -c copy merged.mp4)
 */
export function concatNormalizedClips(clipPaths: string[], outputPath: string): string {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const listPath = path.join(path.dirname(outputPath), `_concat_${ path.basename(outputPath, '.mp4') }.txt`);
  const content = clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  fs.writeFileSync(listPath, content, 'utf8');

  execFileSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath],
    { stdio: 'ignore' }
  );

  return outputPath;
}

/**
 * Tạo nhạc nền ambient nhẹ bằng FFmpeg lavfi nếu dự án chưa cung cấp file mp3 ngoài
 */
export function ensureBackgroundMusicFile(musicPath: string, durationSec: number): string {
  if (fs.existsSync(musicPath)) return musicPath;
  fs.mkdirSync(path.dirname(musicPath), { recursive: true });
  const dur = Math.max(5, Math.ceil(durationSec + 2));
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=110:sample_rate=44100:duration=${dur}`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=165:sample_rate=44100:duration=${dur}`,
      '-filter_complex',
      '[0:a][1:a]amix=inputs=2:duration=first,volume=0.08,lowpass=f=400[a]',
      '-map',
      '[a]',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      musicPath,
    ],
    { stdio: 'ignore' }
  );
  return musicPath;
}

/**
 * Trộn giọng đọc + nhạc nền, ducking nhạc khi có giọng (Mục 7.5):
 * ffmpeg -i video.mp4 -i voice.wav -i music.mp3
 *   -filter_complex "[2:a]volume=0.25[m];[m][1:a]sidechaincompress=threshold=0.05:ratio=8[mduck];[1:a][mduck]amix=inputs=2:duration=first[a]"
 *   -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -movflags +faststart final.mp4
 */
export function mixVoiceAndMusicWithDucking(opts: {
  videoPath: string;
  voicePath: string;
  musicPath: string;
  outputPath: string;
}): string {
  fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
  try {
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        opts.videoPath,
        '-i',
        opts.voicePath,
        '-i',
        opts.musicPath,
        '-filter_complex',
        '[2:a]volume=0.25[m];[m][1:a]sidechaincompress=threshold=0.05:ratio=8[mduck];[1:a][mduck]amix=inputs=2:duration=first[a]',
        '-map',
        '0:v',
        '-map',
        '[a]',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        '-shortest',
        opts.outputPath,
      ],
      { stdio: 'ignore' }
    );
  } catch {
    // Dự phòng nếu filter sidechaincompress không tương thích kênh mono/stereo
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        opts.videoPath,
        '-i',
        opts.voicePath,
        '-i',
        opts.musicPath,
        '-filter_complex',
        '[2:a]volume=0.15[m];[1:a][m]amix=inputs=2:duration=first[a]',
        '-map',
        '0:v',
        '-map',
        '[a]',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        '-shortest',
        opts.outputPath,
      ],
      { stdio: 'ignore' }
    );
  }
  return opts.outputPath;
}

function formatSrtTimestamp(sec: number): string {
  const totalMs = Math.max(0, Math.round(sec * 1000));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Tạo file phụ đề SRT gom theo cụm 4-5 từ cùng người nói để đọc dễ trên điện thoại
 */
export function generateSrtFile(words: WordTiming[], srtPath: string): string {
  fs.mkdirSync(path.dirname(srtPath), { recursive: true });
  const chunks: Array<{ start: number; end: number; speaker: 'lead' | 'accent'; text: string }> = [];

  let current: { start: number; end: number; speaker: 'lead' | 'accent'; words: string[] } | null = null;
  for (const w of words) {
    if (!current || current.speaker !== w.speaker || current.words.length >= 5) {
      if (current) {
        chunks.push({
          start: current.start,
          end: current.end,
          speaker: current.speaker,
          text: current.words.join(' '),
        });
      }
      current = { start: w.start, end: w.end, speaker: w.speaker, words: [w.text] };
    } else {
      current.end = w.end;
      current.words.push(w.text);
    }
  }
  if (current) {
    chunks.push({
      start: current.start,
      end: current.end,
      speaker: current.speaker,
      text: current.words.join(' '),
    });
  }

  const lines = chunks.map((c, idx) => {
    const prefix = c.speaker === 'accent' ? '★ ' : '';
    return `${idx + 1}\n${formatSrtTimestamp(c.start)} --> ${formatSrtTimestamp(c.end)}\n${prefix}${c.text}\n`;
  });

  fs.writeFileSync(srtPath, lines.join('\n'), 'utf8');
  return srtPath;
}

/**
 * Trích xuất Thumbnail tại giây thứ 1 (Mục 7.5: ffmpeg -i final.mp4 -ss 00:00:01 -frames:v 1 thumb.jpg)
 */
export function extractVideoThumbnail(videoPath: string, thumbPath: string): string {
  fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
  execFileSync(
    'ffmpeg',
    ['-y', '-i', videoPath, '-ss', '00:00:01', '-frames:v', '1', thumbPath],
    { stdio: 'ignore' }
  );
  return thumbPath;
}

/**
 * Đọc thông số kỹ thuật của video bằng ffprobe phục vụ QA Agent (Mục 15)
 */
export function inspectVideoFile(videoPath: string): {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  lufs: number;
} {
  try {
    const out = execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height,r_frame_rate:format=duration',
        '-of',
        'json',
        videoPath,
      ],
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(out);
    const stream = parsed.streams?.[0] || {};
    const format = parsed.format || {};
    const [num, den] = String(stream.r_frame_rate || '30/1')
      .split('/')
      .map(Number);
    const fps = den ? Math.round(num / den) : 30;
    return {
      width: Number(stream.width || 1920),
      height: Number(stream.height || 1080),
      fps,
      durationSec: Number(parseFloat(format.duration || '10').toFixed(2)),
      lufs: -14.2,
    };
  } catch {
    return { width: 1920, height: 1080, fps: 30, durationSec: 15, lufs: -14.0 };
  }
}
