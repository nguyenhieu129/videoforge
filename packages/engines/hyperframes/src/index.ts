import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
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
 * - Bố cục riêng cho 16:9 (1920x1080) và 9:16 (1080x1920, vùng an toàn 10% trên & 20% dưới)
 * - Đầy đủ thuộc tính data-composition-id, data-start, data-duration, data-width, data-height, data-track-index
 */
export function generateHyperFramesCompositionHtml(input: BuildHyperFramesSceneInput): string {
  const width = input.aspect === '16:9' ? 1920 : 1080;
  const height = input.aspect === '16:9' ? 1080 : 1920;
  const isVertical = input.aspect === '9:16';
  const duration = input.scene.durationSec;
  const { primary, secondary, accent, bg, text } = input.storyboard.palette;

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
    window.__words = ${wordsJson};
    if (window.gsap) {
      const tl = gsap.timeline({ paused: false });
      tl.from('.scene-tag', { y: -30, opacity: 0, duration: 0.35, ease: 'back.out(1.7)' }, 0)
        .from('.headline', { y: 40, opacity: 0, scale: 0.94, duration: 0.45, ease: 'power3.out' }, 0.08)
        .from('.segment-pill', { x: -40, opacity: 0, stagger: 0.14, duration: 0.4, ease: 'power2.out' }, 0.2);
      window.__hyperframesTimeline = tl;
    }

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

/**
 * Chia văn bản dài thành nhiều dòng vừa khung hình SVG
 */
function wrapTextLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    if (!current) {
      current = w;
    } else if ((current + ' ' + w).length <= maxCharsPerLine) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [text.slice(0, maxCharsPerLine)];
}

/**
 * Vẽ khung hình SVG chất lượng cao (Vector Card + Tiếng Việt Unicode đầy đủ + Phụ đề Lead/Accent)
 * và kết xuất sang PNG bằng `@resvg/resvg-js` (hoạt động 100% trên Windows/Linux/macOS không phụ thuộc FFmpeg drawtext).
 */
function renderSceneSlidePng(opts: {
  width: number;
  height: number;
  aspect: '16:9' | '9:16';
  headline: string;
  subline: string;
  captionChunk?: string;
  speaker?: 'lead' | 'accent';
  stepBadge?: string;
  progressRatio?: number;
  palette: { primary: string; secondary: string; accent: string; bg: string; text: string };
  outputPngPath: string;
}) {
  const { width, height, aspect, palette } = opts;
  const isVert = aspect === '9:16';

  const padX = isVert ? 68 : 110;
  const topY = isVert ? 210 : 95;
  const headlineSize = isVert ? 60 : 56;
  const bodySize = isVert ? 42 : 36;
  const captionSize = isVert ? 48 : 42;

  const headlineLines = wrapTextLines(opts.headline, isVert ? 22 : 38, 3);
  const sublineLines = wrapTextLines(opts.subline, isVert ? 30 : 52, 7);

  const speakerLabel = opts.speaker === 'accent' ? '★ ACCENT (ĐIỂM NHẤN)' : '● LEAD (DẪN CHÍNH)';
  const speakerColor = opts.speaker === 'accent' ? '#F472B6' : '#38BDF8';
  const progressWidth = Math.max(24, Math.round((width - padX * 2) * (opts.progressRatio ?? 0.5)));

  const headlineTspans = headlineLines
    .map(
      (line, idx) =>
        `<tspan x="${padX + 36}" dy="${idx === 0 ? 0 : headlineSize * 1.28}">${escapeHtml(line)}</tspan>`
    )
    .join('');

  const sublineTspans = sublineLines
    .map(
      (line, idx) =>
        `<tspan x="${padX + 36}" dy="${idx === 0 ? 0 : bodySize * 1.38}">${escapeHtml(line)}</tspan>`
    )
    .join('');

  const captionWords =
    opts.captionChunk || opts.subline.trim().split(/\s+/).slice(0, isVert ? 6 : 9).join(' ');

  const cardTopY = isVert ? 340 : 210;
  const cardHeight = isVert ? 860 : 520;
  const captionBoxY = isVert ? 1310 : 815;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${palette.bg}" />
        <stop offset="55%" stop-color="#111827" />
        <stop offset="100%" stop-color="${palette.bg}" />
      </linearGradient>
      <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${palette.primary}" />
        <stop offset="50%" stop-color="${palette.secondary}" />
        <stop offset="100%" stop-color="${palette.accent}" />
      </linearGradient>
    </defs>

    <!-- Background -->
    <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
    <circle cx="${Math.round(width * 0.85)}" cy="${Math.round(height * 0.18)}" r="${isVert ? 260 : 220}" fill="${palette.primary}" opacity="0.16" />
    <circle cx="${Math.round(width * 0.15)}" cy="${Math.round(height * 0.78)}" r="${isVert ? 280 : 240}" fill="${palette.accent}" opacity="0.14" />

    <!-- Top Brand Bar -->
    <rect x="${padX}" y="${topY}" width="${width - padX * 2}" height="12" rx="6" fill="#1E293B" />
    <rect x="${padX}" y="${topY}" width="${progressWidth}" height="12" rx="6" fill="url(#accentGrad)" />

    <!-- Speaker Badge -->
    <rect x="${padX}" y="${topY + 34}" width="380" height="52" rx="26" fill="${speakerColor}" fill-opacity="0.18" stroke="${speakerColor}" stroke-width="2" />
    <text x="${padX + 26}" y="${topY + 68}" fill="${speakerColor}" font-family="Arial, Segoe UI, DejaVu Sans, sans-serif" font-size="24" font-weight="bold">
      ${escapeHtml(opts.stepBadge || speakerLabel)}
    </text>

    <!-- Main Content Card -->
    <rect x="${padX}" y="${cardTopY}" width="${width - padX * 2}" height="${cardHeight}" rx="36" fill="#0F172A" fill-opacity="0.86" stroke="${palette.primary}" stroke-opacity="0.45" stroke-width="3" />
    <rect x="${padX}" y="${cardTopY}" width="14" height="${cardHeight}" rx="7" fill="url(#accentGrad)" />

    <!-- Headline Text -->
    <text x="${padX + 36}" y="${cardTopY + 95}" fill="${palette.text}" font-family="Arial, Segoe UI, DejaVu Sans, sans-serif" font-size="${headlineSize}" font-weight="bold">
      ${headlineTspans}
    </text>

    <!-- Divider -->
    <rect x="${padX + 36}" y="${cardTopY + 95 + headlineLines.length * headlineSize * 1.2}" width="180" height="6" rx="3" fill="${palette.accent}" />

    <!-- Segment Narration Text -->
    <text x="${padX + 36}" y="${cardTopY + 155 + headlineLines.length * headlineSize * 1.2}" fill="#E2E8F0" font-family="Arial, Segoe UI, DejaVu Sans, sans-serif" font-size="${bodySize}" font-weight="normal">
      ${sublineTspans}
    </text>

    <!-- Bottom Dynamic Caption Bar -->
    <rect x="${padX}" y="${captionBoxY}" width="${width - padX * 2}" height="145" rx="28" fill="#090D16" fill-opacity="0.92" stroke="${speakerColor}" stroke-width="3" />
    <text x="${Math.round(width / 2)}" y="${captionBoxY + 88}" text-anchor="middle" fill="${speakerColor}" font-family="Arial, Segoe UI, DejaVu Sans, sans-serif" font-size="${captionSize}" font-weight="bold">
      ${escapeHtml(captionWords)}
    </text>
  </svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
  });
  const pngBuffer = resvg.render().asPng();
  fs.writeFileSync(opts.outputPngPath, pngBuffer);
}

/**
 * Render composition HyperFrames ra MP4 và tạo ảnh Snapshot (Mục 7.1 & Bước 13/14)
 * - Gọi trực tiếp `npx hyperframes render` nếu CLI đã được cài đặt
 * - Nếu chưa có CLI ngoài, kết xuất chuỗi khung hình đồ họa tiếng Việt sắc nét bằng `@resvg/resvg-js` kèm phụ đề karaoke động theo cụm từ qua FFmpeg.
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
  segments?: Array<{ speaker: 'lead' | 'accent'; text: string }>;
  palette: { primary: string; secondary: string; accent: string; bg: string; text: string };
  timeoutSec?: number;
}): { clipPath: string; snapshotPath?: string; usedCli: boolean } {
  fs.mkdirSync(path.dirname(opts.outputMp4Path), { recursive: true });
  const width = opts.aspect === '16:9' ? 1920 : 1080;
  const height = opts.aspect === '16:9' ? 1080 : 1920;
  const timeoutMs = (opts.timeoutSec || 600) * 1000;
  const suffix = opts.aspect.replace(':', 'x');

  let usedCli = false;
  try {
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
    const segList =
      opts.segments && opts.segments.length > 0
        ? opts.segments
        : [{ speaker: 'lead' as const, text: opts.subline || opts.headline }];

    // Chia mỗi segment thành các cụm từ phụ đề (6 từ cho 9:16, 8 từ cho 16:9) để thanh caption bên dưới chạy liên tục
    const wordsPerChunk = opts.aspect === '9:16' ? 6 : 8;
    const slideFrames: Array<{
      speaker: 'lead' | 'accent';
      fullText: string;
      captionChunk: string;
      segIndex: number;
    }> = [];

    for (let sIdx = 0; sIdx < segList.length; sIdx++) {
      const seg = segList[sIdx];
      const words = seg.text.trim().split(/\s+/).filter(Boolean);
      if (opts.durationSec <= 1.5 || words.length <= wordsPerChunk) {
        slideFrames.push({
          speaker: seg.speaker,
          fullText: seg.text,
          captionChunk: words.slice(0, wordsPerChunk).join(' '),
          segIndex: sIdx,
        });
      } else {
        for (let w = 0; w < words.length; w += wordsPerChunk) {
          slideFrames.push({
            speaker: seg.speaker,
            fullText: seg.text,
            captionChunk: words.slice(w, w + wordsPerChunk).join(' '),
            segIndex: sIdx,
          });
        }
      }
    }

    const subClips: string[] = [];
    const frameDuration = Math.max(0.8, Number((opts.durationSec / slideFrames.length).toFixed(2)));

    for (let i = 0; i < slideFrames.length; i++) {
      const frame = slideFrames[i];
      const slidePngPath = path.join(opts.sceneDir, `_slide_${suffix}_${i}.png`);
      const subMp4Path = path.join(opts.sceneDir, `_subclip_${suffix}_${i}.mp4`);

      renderSceneSlidePng({
        width,
        height,
        aspect: opts.aspect,
        headline: opts.headline,
        subline: frame.fullText,
        captionChunk: frame.captionChunk,
        speaker: frame.speaker,
        progressRatio: (i + 1) / slideFrames.length,
        palette: opts.palette,
        outputPngPath: slidePngPath,
      });

      if (i === 0 && opts.snapshotPath) {
        fs.mkdirSync(path.dirname(opts.snapshotPath), { recursive: true });
        fs.copyFileSync(slidePngPath, opts.snapshotPath);
      }

      const vf =
        i === 0
          ? `scale=${width}:${height},fps=30,fade=t=in:st=0:d=0.18`
          : i === slideFrames.length - 1
            ? `scale=${width}:${height},fps=30,fade=t=out:st=${Math.max(0.1, frameDuration - 0.2).toFixed(2)}:d=0.18`
            : `scale=${width}:${height},fps=30`;

      execFileSync(
        'ffmpeg',
        [
          '-y',
          '-loop',
          '1',
          '-t',
          String(frameDuration),
          '-i',
          slidePngPath,
          '-vf',
          vf,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '20',
          '-pix_fmt',
          'yuv420p',
          subMp4Path,
        ],
        { stdio: 'ignore' }
      );

      subClips.push(subMp4Path);
    }

    if (subClips.length === 1) {
      fs.copyFileSync(subClips[0], opts.outputMp4Path);
    } else {
      const concatTxt = path.join(opts.sceneDir, `_subconcat_${suffix}.txt`);
      fs.writeFileSync(
        concatTxt,
        subClips.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'),
        'utf8'
      );
      execFileSync(
        'ffmpeg',
        ['-y', '-f', 'concat', '-safe', '0', '-i', concatTxt, '-c', 'copy', opts.outputMp4Path],
        { stdio: 'ignore' }
      );
    }
  }

  if (opts.snapshotPath && !fs.existsSync(opts.snapshotPath)) {
    fs.mkdirSync(path.dirname(opts.snapshotPath), { recursive: true });
    execFileSync(
      'ffmpeg',
      ['-y', '-i', opts.outputMp4Path, '-ss', '00:00:00.200', '-frames:v', '1', opts.snapshotPath],
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
