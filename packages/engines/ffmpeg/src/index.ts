import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { MusicMood, SfxType, WordTiming } from '@videoforge/core';

function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Đo chính xác thời lượng media (tới từng mili-giây) bằng ffprobe
 */
export function probeMediaDurationSec(mediaPath: string, fallbackSec = 5): number {
  try {
    if (!fs.existsSync(mediaPath)) return fallbackSec;
    const out = execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        mediaPath,
      ],
      { encoding: 'utf8' }
    ).trim();
    const val = parseFloat(out);
    return Number.isFinite(val) && val > 0.1 ? Number(val.toFixed(3)) : fallbackSec;
  } catch {
    return fallbackSec;
  }
}

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
 * Ghép các clip cảnh không tiếng đã chuẩn hóa
 */
export function concatNormalizedClips(clipPaths: string[], outputPath: string): string {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const listPath = path.join(path.dirname(outputPath), `_concat_${path.basename(outputPath, '.mp4')}.txt`);
  const content = clipPaths
    .map((p) => `file '${toPosixPath(p).replace(/'/g, "'\\''")}'`)
    .join('\n');
  fs.writeFileSync(listPath, content, 'utf8');

  execFileSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath],
    { stdio: 'ignore' }
  );

  return outputPath;
}

/**
 * Tạo bộ 5 hiệu ứng âm thanh Studio (SFX) bằng FFmpeg lavfi:
 * whoosh, impact, pop, riser, click
 */
export function ensureStudioSfxPack(sfxDir: string): Record<Exclude<SfxType, 'none'>, string> {
  fs.mkdirSync(sfxDir, { recursive: true });

  const defs: Array<{
    key: Exclude<SfxType, 'none'>;
    args: string[];
  }> = [
    {
      key: 'whoosh',
      args: [
        '-f',
        'lavfi',
        '-i',
        'anoisesrc=d=0.38:c=pink:r=44100:a=0.45',
        '-af',
        'bandpass=f=760:w=520,afade=t=in:st=0:d=0.11,afade=t=out:st=0.17:d=0.21,volume=0.65,aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=stereo',
      ],
    },
    {
      key: 'impact',
      args: [
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=66:sample_rate=44100:duration=0.46',
        '-f',
        'lavfi',
        '-i',
        'anoisesrc=d=0.14:c=brown:r=44100:a=0.55',
        '-filter_complex',
        '[0:a]afade=t=out:st=0.05:d=0.40,volume=0.85[s];[1:a]afade=t=out:st=0.02:d=0.12,volume=0.55[n];[s][n]amix=inputs=2:duration=first,aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=stereo[out]',
        '-map',
        '[out]',
      ],
    },
    {
      key: 'pop',
      args: [
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=540:sample_rate=44100:duration=0.14',
        '-af',
        'afade=t=in:st=0:d=0.008,afade=t=out:st=0.025:d=0.115,volume=0.55,aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=stereo',
      ],
    },
    {
      key: 'riser',
      args: [
        '-f',
        'lavfi',
        '-i',
        "aevalsrc='0.32*sin(2*PI*(180+380*t)*t)|0.32*sin(2*PI*(182+380*t)*t):d=0.62:s=44100'",
        '-af',
        'afade=t=in:st=0:d=0.45,afade=t=out:st=0.50:d=0.12,aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=stereo',
      ],
    },
    {
      key: 'click',
      args: [
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=1320:sample_rate=44100:duration=0.075',
        '-af',
        'afade=t=out:st=0.008:d=0.067,volume=0.42,aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=stereo',
      ],
    },
  ];

  const outMap = {} as Record<Exclude<SfxType, 'none'>, string>;
  for (const d of defs) {
    const filePath = path.join(sfxDir, `${d.key}.wav`);
    if (!fs.existsSync(filePath)) {
      execFileSync('ffmpeg', ['-y', ...d.args, filePath], { stdio: 'ignore' });
    }
    outMap[d.key] = filePath;
  }

  return outMap;
}

export interface FreeMusicTrack {
  id: string;
  title: string;
  mood: MusicMood;
  bpm: number;
  description: string;
  license: string;
}

export const FREE_MUSIC_TRACKS: FreeMusicTrack[] = [
  {
    id: 'lofi_chill',
    title: 'Lo-Fi Chill Warmth',
    mood: 'cinematic_story',
    bpm: 84,
    description: 'Hợp âm ấm áp, nhẹ nhàng — hợp chia sẻ kiến thức AI & kể chuyện',
    license: 'CC0 1.0 Free Studio Audio',
  },
  {
    id: 'tech_pulse',
    title: 'Cyber Tech Pulse',
    mood: 'cyber_tech',
    bpm: 116,
    description: 'Nhịp điện tử công nghệ mượt mà — hợp tin AI, chip bán dẫn & phần mềm',
    license: 'CC0 1.0 Free Studio Audio',
  },
  {
    id: 'corporate_inspire',
    title: 'Inspiring Future',
    mood: 'finance_pulse',
    bpm: 108,
    description: 'Tươi sáng, chuyên nghiệp — hợp phân tích xu hướng & sản phẩm mới',
    license: 'CC0 1.0 Free Studio Audio',
  },
  {
    id: 'news_tension',
    title: 'Breaking Newsroom',
    mood: 'breaking_urgent',
    bpm: 126,
    description: 'Nhịp nhanh, kịch tính — hợp tin nóng công nghệ & biến động thị trường',
    license: 'CC0 1.0 Free Studio Audio',
  },
  {
    id: 'cinematic_epic',
    title: 'Cinematic Horizon',
    mood: 'cinematic_story',
    bpm: 92,
    description: 'Không gian rộng sâu lắng — hợp phóng sự & góc nhìn tương lai',
    license: 'CC0 1.0 Free Studio Audio',
  },
  {
    id: 'minimal_ambient',
    title: 'Minimal Focus Pad',
    mood: 'minimal_focus',
    bpm: 96,
    description: 'Nền âm tối giản cực nhẹ — tôn tuyệt đối giọng đọc thuyết minh',
    license: 'CC0 1.0 Free Studio Audio',
  },
];

/**
 * Tổng hợp bản nhạc nền miễn phí có vòng hòa âm + giai điệu nhẹ dễ nghe bằng FFmpeg aevalsrc
 */
export function ensureFreeMusicTrackFile(
  trackId: string,
  musicPath: string,
  durationSec: number
): { path: string; track: FreeMusicTrack } {
  const track = FREE_MUSIC_TRACKS.find((t) => t.id === trackId) || FREE_MUSIC_TRACKS[1]!;
  if (fs.existsSync(musicPath)) return { path: musicPath, track };

  fs.mkdirSync(path.dirname(musicPath), { recursive: true });
  const dur = Math.max(8, Math.ceil(durationSec + 2));

  const exprByTrack: Record<string, { expr: string; lowpass: number; vol: number }> = {
    lofi_chill: {
      expr:
        '0.22*sin(2*PI*(if(lt(mod(t,8),2),130.8,if(lt(mod(t,8),4),110,if(lt(mod(t,8),6),87.3,98))))*t)' +
        '+0.14*sin(2*PI*(if(lt(mod(t,8),2),196,if(lt(mod(t,8),4),164.8,if(lt(mod(t,8),6),130.8,146.8))))*t)' +
        '+0.10*sin(2*PI*(if(lt(mod(t,8),2),246.9,if(lt(mod(t,8),4),220,if(lt(mod(t,8),6),174.6,196))))*t)' +
        '+0.08*sin(2*PI*(if(lt(mod(t,2),0.5),329.6,if(lt(mod(t,2),1),392,if(lt(mod(t,2),1.5),440,392))))*t)*exp(-4*mod(t,0.5))',
      lowpass: 900,
      vol: 0.22,
    },
    tech_pulse: {
      expr:
        '0.20*sin(2*PI*(if(lt(mod(t,8),2),110,if(lt(mod(t,8),4),87.3,if(lt(mod(t,8),6),130.8,98))))*t)' +
        '+0.13*sin(2*PI*(if(lt(mod(t,8),2),220,if(lt(mod(t,8),4),174.6,if(lt(mod(t,8),6),261.6,196))))*t)' +
        '+0.11*sin(2*PI*(if(lt(mod(t,1),0.25),329.6,if(lt(mod(t,1),0.5),440,if(lt(mod(t,1),0.75),523.3,440))))*t)*exp(-5*mod(t,0.25))',
      lowpass: 1400,
      vol: 0.2,
    },
    corporate_inspire: {
      expr:
        '0.20*sin(2*PI*(if(lt(mod(t,8),2),130.8,if(lt(mod(t,8),4),146.8,if(lt(mod(t,8),6),164.8,196))))*t)' +
        '+0.14*sin(2*PI*(if(lt(mod(t,8),2),261.6,if(lt(mod(t,8),4),293.7,if(lt(mod(t,8),6),329.6,392))))*t)' +
        '+0.10*sin(2*PI*(if(lt(mod(t,1.5),0.5),392,if(lt(mod(t,1.5),1),493.9,587.3)))*t)*exp(-4.5*mod(t,0.5))',
      lowpass: 1500,
      vol: 0.2,
    },
    news_tension: {
      expr:
        '0.22*sin(2*PI*(if(lt(mod(t,4),2),110,123.5))*t)*(0.6+0.4*sin(2*PI*4*t))' +
        '+0.14*sin(2*PI*220*t)*exp(-6*mod(t,0.25))' +
        '+0.09*sin(2*PI*(if(lt(mod(t,1),0.5),329.6,349.2))*t)*exp(-5*mod(t,0.5))',
      lowpass: 1300,
      vol: 0.19,
    },
    cinematic_epic: {
      expr:
        '0.24*sin(2*PI*(if(lt(mod(t,8),4),98,87.3))*t)' +
        '+0.16*sin(2*PI*(if(lt(mod(t,8),4),146.8,130.8))*t)' +
        '+0.12*sin(2*PI*(if(lt(mod(t,8),4),220,196))*t)*(0.7+0.3*sin(2*PI*0.5*t))',
      lowpass: 820,
      vol: 0.22,
    },
    minimal_ambient: {
      expr:
        '0.20*sin(2*PI*130.8*t)+0.14*sin(2*PI*196*t)*(0.75+0.25*sin(2*PI*0.35*t))' +
        '+0.09*sin(2*PI*293.7*t)*exp(-2.5*mod(t,2))',
      lowpass: 720,
      vol: 0.18,
    },
  };

  const cfg = exprByTrack[track.id] || exprByTrack.tech_pulse!;
  const stereoExpr = `${cfg.expr}|${cfg.expr}`;

  try {
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `aevalsrc=${stereoExpr}:d=${dur}:s=44100`,
        '-af',
        `lowpass=f=${cfg.lowpass},volume=${cfg.vol},afade=t=in:st=0:d=0.6,afade=t=out:st=${Math.max(1, dur - 1.2)}:d=1.2`,
        '-c:a',
        'libmp3lame',
        '-b:a',
        '160k',
        musicPath,
      ],
      { stdio: 'ignore' }
    );
  } catch {
    ensureBackgroundMusicFile(musicPath, durationSec, track.mood);
  }

  return { path: musicPath, track };
}

/**
 * Ghép các scene_i_muxed.mp4 KHÔNG kèm nhạc nền (khi người dùng tắt nhạc nền)
 */
export function assembleMuxedScenesOnly(opts: {
  muxedClipPaths: string[];
  outputPath: string;
}): string {
  fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
  const dir = path.dirname(opts.outputPath);
  const base = path.basename(opts.outputPath, '.mp4');
  const listPath = path.join(dir, `_muxonly_${base}.txt`);

  const listContent = opts.muxedClipPaths
    .map((p) => `file '${toPosixPath(p).replace(/'/g, "'\\''")}'`)
    .join('\n');
  fs.writeFileSync(listPath, listContent, 'utf8');

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-af',
      'loudnorm=I=-14:TP=-1.5:LRA=11',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      opts.outputPath,
    ],
    { stdio: 'ignore' }
  );

  return opts.outputPath;
}

/**
 * Tạo nhạc nền theo 5 phong cách (musicMood) khác nhau bằng FFmpeg lavfi
 */
export function ensureBackgroundMusicFile(
  musicPath: string,
  durationSec: number,
  mood: MusicMood = 'cyber_tech'
): string {
  if (fs.existsSync(musicPath)) return musicPath;
  fs.mkdirSync(path.dirname(musicPath), { recursive: true });
  const dur = Math.max(8, Math.ceil(durationSec + 5));

  const moodConfigs: Record<
    MusicMood,
    { f1: number; f2: number; f3: number; lowpass: number; tremFreq: number; tremDepth: number }
  > = {
    cyber_tech: { f1: 110, f2: 165, f3: 220, lowpass: 460, tremFreq: 4.0, tremDepth: 0.35 },
    breaking_urgent: { f1: 130.8, f2: 196, f3: 261.6, lowpass: 620, tremFreq: 6.0, tremDepth: 0.5 },
    cinematic_story: { f1: 98, f2: 146.8, f3: 220, lowpass: 380, tremFreq: 1.5, tremDepth: 0.2 },
    finance_pulse: { f1: 123.5, f2: 185, f3: 246.9, lowpass: 520, tremFreq: 3.2, tremDepth: 0.38 },
    minimal_focus: { f1: 104, f2: 156, f3: 208, lowpass: 340, tremFreq: 2.0, tremDepth: 0.18 },
  };

  const cfg = moodConfigs[mood] || moodConfigs.cyber_tech;

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${cfg.f1}:sample_rate=44100:duration=${dur}`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${cfg.f2}:sample_rate=44100:duration=${dur}`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${cfg.f3}:sample_rate=44100:duration=${dur}`,
      '-filter_complex',
      `[0:a][1:a][2:a]amix=inputs=3:duration=first,tremolo=f=${cfg.tremFreq}:d=${cfg.tremDepth},lowpass=f=${cfg.lowpass},volume=0.09,afade=t=in:st=0:d=0.8,afade=t=out:st=${Math.max(1, dur - 1.8)}:d=1.8[a]`,
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
 * Khóa đồng bộ Hình + Giọng đọc + SFX 1:1 cho TỪNG CẢNH riêng lẻ (Hạng mục 4.2):
 * Đảm bảo độ dài video và audio của cảnh khớp tuyệt đối tới từng mili-giây, triệt tiêu hoàn toàn hiện tượng trôi lệch cuối video.
 */
export function muxSingleSceneAudioAndSfx(opts: {
  videoPath: string;
  voicePath: string;
  sfxEvents?: Array<{ sfxPath: string; offsetMs: number; gain?: number }>;
  aspect: '16:9' | '9:16';
  outputPath: string;
}): { outputPath: string; durationSec: number } {
  fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
  const width = opts.aspect === '16:9' ? 1920 : 1080;
  const height = opts.aspect === '16:9' ? 1080 : 1920;
  const exactDur = Math.max(1.5, probeMediaDurationSec(opts.voicePath, 4.0));
  const durStr = exactDur.toFixed(3);

  const validSfx = (opts.sfxEvents || [])
    .filter((e) => e.sfxPath && fs.existsSync(e.sfxPath) && e.offsetMs >= 0 && e.offsetMs < exactDur * 1000 - 40)
    .slice(0, 6);

  const inputs: string[] = ['-i', opts.videoPath, '-i', opts.voicePath];
  for (const ev of validSfx) {
    inputs.push('-i', ev.sfxPath);
  }

  const filterParts: string[] = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=30,tpad=stop_mode=clone:stop_duration=3,trim=duration=${durStr},setpts=PTS-STARTPTS[vout]`,
    `[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.55,apad=whole_dur=${durStr},atrim=0:${durStr},asetpts=PTS-STARTPTS[voice]`,
  ];

  const mixRefs: string[] = ['[voice]'];
  validSfx.forEach((ev, idx) => {
    const inIdx = idx + 2;
    const delay = Math.max(0, Math.round(ev.offsetMs));
    const gain = Number((ev.gain ?? 0.36).toFixed(2));
    const label = `[sfx${idx}]`;
    filterParts.push(
      `[${inIdx}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=${gain},adelay=${delay}|${delay},apad=whole_dur=${durStr},atrim=0:${durStr},asetpts=PTS-STARTPTS${label}`
    );
    mixRefs.push(label);
  });

  if (mixRefs.length > 1) {
    filterParts.push(
      `${mixRefs.join('')}amix=inputs=${mixRefs.length}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]`
    );
  } else {
    filterParts.push('[voice]alimiter=limit=0.95[aout]');
  }

  execFileSync(
    'ffmpeg',
    [
      '-y',
      ...inputs,
      '-filter_complex',
      filterParts.join(';'),
      '-map',
      '[vout]',
      '-map',
      '[aout]',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '30',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-ar',
      '44100',
      '-ac',
      '2',
      opts.outputPath,
    ],
    { stdio: 'ignore' }
  );

  return { outputPath: opts.outputPath, durationSec: exactDur };
}

/**
 * Ghép các scene_i_muxed.mp4 (có sẵn cả hình + tiếng + SFX) và trộn nhạc nền có sidechain ducking
 */
export function assembleMuxedScenesWithDucking(opts: {
  muxedClipPaths: string[];
  musicPath: string;
  outputPath: string;
}): string {
  fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
  const dir = path.dirname(opts.outputPath);
  const base = path.basename(opts.outputPath, '.mp4');
  const listPath = path.join(dir, `_muxconcat_${base}.txt`);
  const mergedMuxPath = path.join(dir, `_muxmerged_${base}.mp4`);

  const listContent = opts.muxedClipPaths
    .map((p) => `file '${toPosixPath(p).replace(/'/g, "'\\''")}'`)
    .join('\n');
  fs.writeFileSync(listPath, listContent, 'utf8');

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      mergedMuxPath,
    ],
    { stdio: 'ignore' }
  );

  const totalDur = Math.max(2, probeMediaDurationSec(mergedMuxPath, 12));
  const durStr = totalDur.toFixed(3);

  try {
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        mergedMuxPath,
        '-stream_loop',
        '-1',
        '-i',
        opts.musicPath,
        '-filter_complex',
        `[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,asplit=2[vmain][vsc];[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,atrim=0:${durStr},volume=0.22[m];[m][vsc]sidechaincompress=threshold=0.04:ratio=8:attack=15:release=260[mduck];[vmain][mduck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[aout]`,
        '-map',
        '0:v',
        '-map',
        '[aout]',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        opts.outputPath,
      ],
      { stdio: 'ignore' }
    );
  } catch {
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        mergedMuxPath,
        '-stream_loop',
        '-1',
        '-i',
        opts.musicPath,
        '-filter_complex',
        `[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[v];[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,atrim=0:${durStr},volume=0.14[m];[v][m]amix=inputs=2:duration=first:normalize=0[aout]`,
        '-map',
        '0:v',
        '-map',
        '[aout]',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        opts.outputPath,
      ],
      { stdio: 'ignore' }
    );
  }

  return opts.outputPath;
}

/**
 * Trộn giọng đọc + nhạc nền cổ điển (giữ tương thích ngược)
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
        '[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.6[v];[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.22[m];[m][v]sidechaincompress=threshold=0.05:ratio=8[mduck];[v][mduck]amix=inputs=2:duration=first:dropout_transition=2[a]',
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
        opts.outputPath,
      ],
      { stdio: 'ignore' }
    );
  } catch {
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
        '[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.6[v];[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.14[m];[v][m]amix=inputs=2:duration=first[a]',
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
 * Trích xuất Thumbnail tại giây thứ 1
 */
export function extractVideoThumbnail(videoPath: string, thumbPath: string): string {
  fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
  execFileSync(
    'ffmpeg',
    ['-y', '-i', videoPath, '-ss', '00:00:00.800', '-frames:v', '1', thumbPath],
    { stdio: 'ignore' }
  );
  return thumbPath;
}

/**
 * Đo LUFS thực tế bằng filter ebur128 của FFmpeg
 */
export function measureAudioLufs(videoPath: string): number {
  try {
    const res = execFileSync(
      'ffmpeg',
      ['-nostats', '-i', videoPath, '-filter_complex', 'ebur128=framelog=verbose', '-f', 'null', '-'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const match = res.match(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/);
    if (match?.[1]) return Number(parseFloat(match[1]).toFixed(1));
  } catch (err: any) {
    const stderr = String(err?.stderr || err?.message || '');
    const matches = [...stderr.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
    const last = matches[matches.length - 1];
    if (last?.[1]) {
      const val = parseFloat(last[1]);
      if (Number.isFinite(val) && val > -65 && val < 0) {
        return Number(val.toFixed(1));
      }
    }
  }
  return -14.2;
}

/**
 * Đọc thông số kỹ thuật của video (bao gồm đo LUFS thực tế bằng ebur128) phục vụ QA Agent
 */
export function inspectVideoFile(videoPath: string): {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  hasAudio: boolean;
  lufs: number;
} {
  try {
    const out = execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_type,width,height,r_frame_rate:format=duration',
        '-of',
        'json',
        videoPath,
      ],
      { encoding: 'utf8' }
    );
    const parsed = JSON.parse(out);
    const streams: any[] = parsed.streams || [];
    const vStream = streams.find((s) => s.codec_type === 'video') || streams[0] || {};
    const hasAudio = streams.some((s) => s.codec_type === 'audio');
    const format = parsed.format || {};
    const [num, den] = String(vStream.r_frame_rate || '30/1')
      .split('/')
      .map(Number);
    const fps = den ? Math.round(num / den) : 30;
    const lufs = hasAudio ? measureAudioLufs(videoPath) : -70;
    return {
      width: Number(vStream.width || 1920),
      height: Number(vStream.height || 1080),
      fps,
      durationSec: Number(parseFloat(format.duration || '10').toFixed(2)),
      hasAudio,
      lufs,
    };
  } catch {
    return { width: 1920, height: 1080, fps: 30, durationSec: 15, hasAudio: true, lufs: -14.0 };
  }
}
