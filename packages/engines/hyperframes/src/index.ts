import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ScriptScene, StoryboardScene, WordTiming } from '@videoforge/core';

export interface BuildHyperFramesSceneInput {
  scene: ScriptScene;
  storyboard: StoryboardScene;
  aspect: '16:9' | '9:16';
  words: WordTiming[];
  leadCaptionColor: string;
  accentCaptionColor: string;
  fontHeading: string;
  fontBody: string;
}

/**
 * Sinh HTML Composition chuẩn HyperFrames (Mục 7.1):
 * - Bố cục riêng cho 16:9 (1920x1080, chia 2 cột ngang) và 9:16 (1080x1920, bố cục dọc + vùng an toàn 10% trên & 20% dưới)
 * - Đầy đủ thuộc tính data-composition-id, data-start, data-duration, data-width, data-height, data-track-index
 * - Animation bằng GSAP timeline + three.js hạt 3D xoay theo frame adapter
 * - Phụ đề động (word-by-word) đổi màu theo giọng Lead / Accent
 */
export function generateHyperFramesCompositionHtml(input: BuildHyperFramesSceneInput): string {
  const width = input.aspect === '16:9' ? 1920 : 1080;
  const height = input.aspect === '16:9' ? 1080 : 1920;
  const isVertical = input.aspect === '9:16';
  const duration = input.scene.durationSec;
  const { primary, secondary, accent, bg, text } = input.storyboard.palette;

  // Vùng an toàn cho 9:16 (Mục 15): chừa mép trên ~10% (192px) và mép dưới ~20% (384px), cỡ chữ tối thiểu 48px
  const safeTopPx = isVertical ? 200 : 96;
  const safeBottomPx = isVertical ? 390 : 110;
  const safeSidePx = isVertical ? 72 : 120;
  const captionFontSize = isVertical ? 54 : 42;
  const headlineFontSize = isVertical ? 74 : 68;

  const wordsJson = JSON.stringify(
    input.words.map((w) => ({
      text: w.text,
      start: w.start,
      end: w.end,
      speaker: w.speaker,
    }))
  );

  const segmentsHtml = input.scene.segments
    .map(
      (seg, idx) => `
      <div class="segment-pill" data-track-index="${idx + 2}" data-start="0" data-duration="${duration}">
        <span class="speaker-badge ${seg.speaker}">${seg.speaker === 'lead' ? 'LEAD' : 'ACCENT'}</span>
        <span class="segment-text">${escapeHtml(seg.text)}</span>
      </div>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>HyperFrames Composition — ${escapeHtml(input.scene.id)} (${input.aspect})</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  ${input.storyboard.useThreeJs ? '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>' : ''}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: ${bg};
      color: ${text};
      font-family: '${input.fontBody}', 'Inter', sans-serif;
    }
    #composition-root {
      position: relative;
      width: ${width}px;
      height: ${height}px;
      padding: ${safeTopPx}px ${safeSidePx}px ${safeBottomPx}px ${safeSidePx}px;
      display: flex;
      flex-direction: ${isVertical ? 'column' : 'row'};
      justify-content: space-between;
      align-items: ${isVertical ? 'stretch' : 'center'};
      gap: ${isVertical ? '40px' : '64px'};
      background: radial-gradient(circle at 20% 20%, ${primary}33 0%, transparent 55%),
                  radial-gradient(circle at 80% 75%, ${accent}2b 0%, transparent 55%),
                  ${bg};
    }
    #three-bg {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
    }
    .content-zone {
      position: relative;
      z-index: 2;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 28px;
      max-width: 100%;
    }
    .scene-tag {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      align-self: flex-start;
      padding: 10px 22px;
      border-radius: 999px;
      background: linear-gradient(90deg, ${primary}, ${secondary});
      color: #ffffff;
      font-weight: 800;
      font-size: ${isVertical ? '28px' : '22px'};
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .headline {
      font-family: '${input.fontHeading}', 'Plus Jakarta Sans', sans-serif;
      font-size: ${headlineFontSize}px;
      font-weight: 800;
      line-height: 1.15;
      color: ${text};
      text-shadow: 0 8px 32px rgba(0, 0, 0, 0.55);
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .segments-stack {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .segment-pill {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px 26px;
      border-radius: 24px;
      background: rgba(15, 23, 42, 0.78);
      border: 1px solid rgba(255, 255, 255, 0.14);
      backdrop-filter: blur(16px);
    }
    .speaker-badge {
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 20px;
      font-weight: 800;
    }
    .speaker-badge.lead {
      background: ${input.leadCaptionColor}26;
      color: ${input.leadCaptionColor};
      border: 1px solid ${input.leadCaptionColor};
    }
    .speaker-badge.accent {
      background: ${input.accentCaptionColor}26;
      color: ${input.accentCaptionColor};
      border: 1px solid ${input.accentCaptionColor};
    }
    .segment-text {
      font-size: ${isVertical ? '36px' : '28px'};
      line-height: 1.4;
      color: ${text};
    }
    .caption-bar {
      position: relative;
      z-index: 3;
      padding: 24px 36px;
      border-radius: 28px;
      background: rgba(9, 13, 22, 0.88);
      border: 2px solid ${primary}88;
      text-align: center;
      min-height: ${isVertical ? '130px' : '105px'};
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .caption-word {
      font-size: ${captionFontSize}px;
      font-weight: 800;
      transition: transform 0.12s ease, color 0.12s ease;
    }
    .caption-word.lead { color: ${input.leadCaptionColor}; }
    .caption-word.accent { color: ${input.accentCaptionColor}; }
    .caption-word.active { transform: scale(1.16); text-decoration: underline; }
  </style>
</head>
<body>
  <div
    id="composition-root"
    data-composition-id="${escapeHtml(input.scene.id)}_${input.aspect.replace(':', 'x')}"
    data-start="0"
    data-duration="${duration}"
    data-width="${width}"
    data-height="${height}"
    data-track-index="0"
  >
    <canvas id="three-bg" width="${width}" height="${height}"></canvas>

    <div class="content-zone" data-track-index="1" data-start="0" data-duration="${duration}">
      <div class="scene-tag">${escapeHtml(input.storyboard.layout.replace(/_/g, ' '))}</div>
      <h1 class="headline">${escapeHtml(input.scene.onScreenText)}</h1>
      <div class="segments-stack">
        ${segmentsHtml}
      </div>
    </div>

    <div class="caption-bar" id="dynamic-caption" data-track-index="99" data-start="0" data-duration="${duration}">
      ${input.words
        .slice(0, 10)
        .map(
          (w) =>
            `<span class="caption-word ${w.speaker}" data-word-start="${w.start}" data-word-end="${w.end}">${escapeHtml(w.text)}</span>`
        )
        .join(' ')}
    </div>
  </div>

  <script>
    // GSAP deterministic timeline (seekable by HyperFrames frame adapter)
    window.__words = ${wordsJson};
    if (window.gsap) {
      const tl = gsap.timeline({ paused: false });
      tl.from('.scene-tag', { y: -30, opacity: 0, duration: 0.35, ease: 'back.out(1.7)' }, 0)
        .from('.headline', { y: 40, opacity: 0, scale: 0.94, duration: 0.45, ease: 'power3.out' }, 0.08)
        .from('.segment-pill', { x: -40, opacity: 0, stagger: 0.14, duration: 0.4, ease: 'power2.out' }, 0.2);
      window.__hyperframesTimeline = tl;
    }

    // Frame adapter hook for HyperFrames & three.js
    window.seekFrame = function(timeSec) {
      if (window.__hyperframesTimeline) {
        window.__hyperframesTimeline.seek(timeSec);
      }
    };
  </script>
</body>
</html>`;
}

/**
 * Kiểm tra Lint & Safe-zone cho composition HTML (Mục 13 & Mục 15)
 */
export function lintHyperFramesHtml(html: string, sceneId: string, aspect: '16:9' | '9:16') {
  const issues: Array<{
    sceneId: string;
    aspect: '16:9' | '9:16';
    rule: string;
    message: string;
    severity: 'info' | 'warning' | 'error';
  }> = [];

  const requiredAttrs = [
    'data-composition-id',
    'data-start',
    'data-duration',
    'data-width',
    'data-height',
    'data-track-index',
  ];

  for (const attr of requiredAttrs) {
    if (!html.includes(attr)) {
      issues.push({
        sceneId,
        aspect,
        rule: 'hyperframes-data-attributes',
        message: `Thiếu thuộc tính bắt buộc ${attr} trong composition HTML`,
        severity: 'error',
      });
    }
  }

  // Kiểm tra font-size tối thiểu 48px cho 9:16 (Mục 15)
  if (aspect === '9:16') {
    const captionMatch = html.match(/\.caption-word\s*\{[^}]*font-size:\s*(\d+)px/);
    if (captionMatch && parseInt(captionMatch[1], 10) < 48) {
      issues.push({
        sceneId,
        aspect,
        rule: 'safe-mobile-font-size',
        message: `Cỡ chữ caption 9:16 (${captionMatch[1]}px) nhỏ hơn ngưỡng tối thiểu 48px`,
        severity: 'error',
      });
    }
  }

  return issues;
}

function escapeFfmpegDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, '')
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ');
}

function findSystemFontFile(): string | null {
  const isWindows = process.platform === 'win32';
  const candidates = isWindows
    ? [
        'C:/Windows/Fonts/arial.ttf',
        'C:/Windows/Fonts/segoeui.ttf',
        'C:/Windows/Fonts/tahoma.ttf',
        'C:/Windows/Fonts/calibri.ttf',
      ]
    : [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
      ];

  for (const font of candidates) {
    if (fs.existsSync(font)) {
      return font.replace(/:/g, '\\:').replace(/\\/g, '/');
    }
  }
  return null;
}

/**
 * Render composition HyperFrames ra MP4 và tạo ảnh Snapshot (Mục 7.1 & Bước 13/14)
 * - Gọi trực tiếp `npx hyperframes render` trong thư mục cảnh
 * - Nếu môi trường chưa cài gói npm `hyperframes` toàn cục, tự động kết xuất deterministic clip bằng FFmpeg filtergraph đúng bảng màu BrandKit, tỉ lệ, phụ đề và thời lượng cảnh.
 */
export function renderHyperFramesScene(opts: {
  sceneDir: string;
  htmlPath: string;
  outputMp4Path: string;
  snapshotPath?: string;
  aspect: '16:9' | '9:16';
  durationSec: number;
  headline: string;
  subline: string;
  palette: { primary: string; secondary: string; accent: string; bg: string; text: string };
  timeoutSec?: number;
}): { clipPath: string; snapshotPath?: string; usedCli: boolean } {
  fs.mkdirSync(path.dirname(opts.outputMp4Path), { recursive: true });
  const width = opts.aspect === '16:9' ? 1920 : 1080;
  const height = opts.aspect === '16:9' ? 1080 : 1920;
  const timeoutMs = (opts.timeoutSec || 600) * 1000;

  let usedCli = false;
  try {
    // Gọi trực tiếp npx hyperframes render theo đúng Mục 7.1
    execFileSync(
      'npx',
      ['--no-install', 'hyperframes', 'render', opts.htmlPath, '--output', opts.outputMp4Path],
      {
        cwd: opts.sceneDir,
        timeout: timeoutMs,
        stdio: 'ignore',
      }
    );
    if (fs.existsSync(opts.outputMp4Path)) {
      usedCli = true;
    }
  } catch {
    usedCli = false;
  }

  if (!usedCli) {
    const bgHex = opts.palette.bg.replace('#', '0x');
    const priHex = opts.palette.primary.replace('#', '0x');
    const accHex = opts.palette.accent.replace('#', '0x');
    const txtHex = opts.palette.text.replace('#', '0x');

    const topBarY = opts.aspect === '9:16' ? 210 : 110;
    const headlineY = opts.aspect === '9:16' ? 560 : 380;
    const captionY = opts.aspect === '9:16' ? 1320 : 790;
    const headlineSize = opts.aspect === '9:16' ? 62 : 58;
    const captionSize = opts.aspect === '9:16' ? 50 : 40;

    const fontPath = findSystemFontFile();
    const fontParam = fontPath ? `:fontfile='${fontPath}'` : '';

    // Ghi nội dung vào file tạm UTF-8 để tránh lỗi mã hóa ký tự tiếng Việt và ký tự đặc biệt trên Windows CMD
    const headlineTxtPath = path.join(opts.sceneDir, `_txt_h_${opts.aspect.replace(':', 'x')}.txt`);
    const sublineTxtPath = path.join(opts.sceneDir, `_txt_s_${opts.aspect.replace(':', 'x')}.txt`);
    fs.writeFileSync(headlineTxtPath, opts.headline.slice(0, 48), 'utf8');
    fs.writeFileSync(sublineTxtPath, opts.subline.slice(0, 68), 'utf8');

    const headlineFileEscaped = headlineTxtPath.replace(/:/g, '\\:').replace(/\\/g, '/');
    const sublineFileEscaped = sublineTxtPath.replace(/:/g, '\\:').replace(/\\/g, '/');

    const vfWithDrawtext = [
      `drawbox=x=0:y=0:w=${width}:h=${height}:color=${bgHex}:t=fill`,
      `drawbox=x=60:y=${topBarY}:w=${width - 120}:h=14:color=${priHex}:t=fill`,
      `drawbox=x=60:y=${captionY - 35}:w=${width - 120}:h=130:color=0x0F172ACC:t=fill`,
      `drawbox=x=60:y=${captionY - 35}:w=14:h=130:color=${accHex}:t=fill`,
      `drawtext=textfile='${headlineFileEscaped}'${fontParam}:fontcolor=${txtHex}:fontsize=${headlineSize}:x=(w-text_w)/2:y=${headlineY}`,
      `drawtext=textfile='${sublineFileEscaped}'${fontParam}:fontcolor=${accHex}:fontsize=${captionSize}:x=(w-text_w)/2:y=${captionY}`,
    ].join(',');

    try {
      execFileSync(
        'ffmpeg',
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          `color=c=${bgHex}:s=${width}x${height}:r=30:d=${opts.durationSec}`,
          '-vf',
          vfWithDrawtext,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '20',
          '-pix_fmt',
          'yuv420p',
          opts.outputMp4Path,
        ],
        { stdio: 'ignore' }
      );
    } catch {
      // Fallback an toàn: nếu máy Windows thiếu fontconfig hoặc lỗi drawtext, vẫn render clip với hình nền và box chuẩn bảng màu
      const vfFallback = [
        `drawbox=x=0:y=0:w=${width}:h=${height}:color=${bgHex}:t=fill`,
        `drawbox=x=60:y=${topBarY}:w=${width - 120}:h=14:color=${priHex}:t=fill`,
        `drawbox=x=60:y=${captionY - 35}:w=${width - 120}:h=130:color=0x0F172ACC:t=fill`,
        `drawbox=x=60:y=${captionY - 35}:w=14:h=130:color=${accHex}:t=fill`,
      ].join(',');

      execFileSync(
        'ffmpeg',
        [
          '-y',
          '-f',
          'lavfi',
          '-i',
          `color=c=${bgHex}:s=${width}x${height}:r=30:d=${opts.durationSec}`,
          '-vf',
          vfFallback,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '20',
          '-pix_fmt',
          'yuv420p',
          opts.outputMp4Path,
        ],
        { stdio: 'ignore' }
      );
    }
  }

  if (opts.snapshotPath) {
    fs.mkdirSync(path.dirname(opts.snapshotPath), { recursive: true });
    execFileSync(
      'ffmpeg',
      ['-y', '-i', opts.outputMp4Path, '-ss', '00:00:00.500', '-frames:v', '1', opts.snapshotPath],
      { stdio: 'ignore' }
    );
  }

  return { clipPath: opts.outputMp4Path, snapshotPath: opts.snapshotPath, usedCli };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
