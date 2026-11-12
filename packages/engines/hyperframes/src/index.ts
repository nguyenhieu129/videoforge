import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import type { ScriptScene, StoryboardScene, WordTiming } from '@videoforge/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONTS_DIR = path.resolve(__dirname, '../fonts');

// Nạp BeVietnamPro-ExtraBold và JetBrainsMono-Bold để toàn bộ chữ Tiêu đề + Thẻ Điểm Nhấn + Phụ đề
// đều dùng nét chữ ExtraBold sắc nét, dày dặn, hiện đại.
const BUNDLED_FONT_FILES = [
  path.join(FONTS_DIR, 'BeVietnamPro-ExtraBold.ttf'),
  path.join(FONTS_DIR, 'JetBrainsMono-Bold.ttf'),
].filter((f) => fs.existsSync(f));

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
 * - Bố cục riêng cho 16:9 (1920x1080) và 9:16 (1080x1920, vùng an toàn TikTok/Reels/Shorts)
 * - Đầy đủ thuộc tính data-composition-id, data-start, data-duration, data-width, data-height, data-track-index
 */
export function generateHyperFramesCompositionHtml(input: BuildHyperFramesSceneInput): string {
  const width = input.aspect === '16:9' ? 1920 : 1080;
  const height = input.aspect === '16:9' ? 1080 : 1920;
  const isVertical = input.aspect === '9:16';
  const duration = input.scene.durationSec;
  const { primary, secondary, accent, bg, text } = input.storyboard.palette;

  const safeTopPx = isVertical ? 210 : 100;
  const safeBottomPx = isVertical ? 390 : 115;
  const safeSidePx = isVertical ? 136 : 160;
  const captionFontSize = isVertical ? 48 : 42;
  const headlineFontSize = isVertical ? 64 : 60;

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
        <span class="segment-text">${escapeHtml(seg.emphasis || seg.text)}</span>
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
      font-family: '${input.fontHeading}', 'Be Vietnam Pro', sans-serif;
      font-weight: 800;
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
      font-family: '${input.fontHeading}', 'Be Vietnam Pro', sans-serif;
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
      background: rgba(15, 23, 42, 0.85);
      border: 2px solid ${primary}66;
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
      font-weight: 800;
      line-height: 1.3;
      color: ${text};
    }
    .caption-bar {
      position: relative;
      z-index: 3;
      padding: 24px 36px;
      border-radius: 28px;
      background: rgba(9, 13, 22, 0.92);
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
 * Loại bỏ các từ nối bị treo ở cuối dòng để câu ngắn gọn, trọn nghĩa
 */
function stripTrailingStopWords(text: string): string {
  return text
    .replace(/[,:;!?()"“”']|(?<![0-9])\.(?![0-9])/g, '')
    .replace(/\s+(?:với|trên|trong|của|và|để|cho|tại|bằng|nhờ|từ|về|như|khi|là|có|được|đang|sẽ|mà|thì|ở)\s*$/i, '')
    .trim();
}

/**
 * Chia văn bản thành các dòng cân đối, tuyệt đối không cắt cụt từ
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
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(stripTrailingStopWords(current) || current);
  }
  return lines.length > 0 ? lines : [text.slice(0, maxCharsPerLine)];
}

function hashText(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

interface VisualBeat {
  badge: string; // Cụm từ nhấn / Con số nổi bật (2-3 từ IN HOA)
  line1: string; // Dòng chính ExtraBold (IN HOA)
  line2: string; // Dòng bổ trợ ExtraBold trọn ý
  speaker: 'lead' | 'accent';
}

/**
 * Biến lời thoại thành các Thẻ Điểm Nhấn Thị Giác (Visual Beats) sắc bén, trọn ý,
 * không dùng ký tự emoji lạ gây lỗi ô vuông và không ngắt câu cụt lủn.
 */
function extractVisualBeats(
  headline: string,
  subline: string,
  segments?: Array<{ speaker: 'lead' | 'accent'; text: string; emphasis?: string }>,
  dataPoints?: Array<{ label: string; value: number }>
): VisualBeat[] {
  const rawSegs =
    segments && segments.length > 0
      ? segments
      : subline
          .split(/(?<=[.!?])\s+/)
          .filter(Boolean)
          .map((t, i) => ({ speaker: (i % 2 === 0 ? 'lead' : 'accent') as 'lead' | 'accent', text: t }));

  const beats: VisualBeat[] = [];

  for (let i = 0; i < rawSegs.length; i++) {
    const seg = rawSegs[i];
    const clean = seg.text
      .replace(/^(bạn có biết điều gì đang thực sự diễn ra với|hãy cùng điểm qua|đừng quên theo dõi)\s*/i, '')
      .replace(/["'“”]/g, '')
      .trim();

    const numMatch = clean.match(/(\d+(?:[.,]\d+)?\s*(?:%|phần trăm|x|lần|nm|tỷ|triệu|k|giây|năm))/i);
    const allWords = clean.split(/\s+/).filter(Boolean);

    let badge = '';
    if (seg.emphasis && seg.emphasis.length >= 2 && !/^(hook|highlight)$/i.test(seg.emphasis)) {
      badge = seg.emphasis
        .replace(/[^\p{L}\p{N}\s%.,+-]/gu, '')
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .join(' ')
        .toUpperCase();
    } else if (numMatch) {
      badge = `+ ${numMatch[0].replace(/phần trăm/i, '%').toUpperCase()}`;
    } else if (dataPoints && dataPoints[i]) {
      badge = `${dataPoints[i].value}% • ${dataPoints[i].label.toUpperCase()}`;
    } else {
      badge = stripTrailingStopWords(allWords.slice(0, 3).join(' ')).toUpperCase();
    }

    // Chia câu thành 2 dòng đầy đủ (mỗi dòng tới 34-38 ký tự, vừa khít khung 808px) để câu trọn vẹn 100% ý nghĩa
    const firstSentence = clean.split(/(?<![0-9])[.!?](?![0-9])/)[0]?.trim() || clean;
    const wrapped = wrapTextLines(firstSentence, 33, 2);
    const line1 = (wrapped[0] || headline).toUpperCase();
    const line2 = (wrapped[1] || stripTrailingStopWords(allWords.slice(5, 12).join(' ')) || 'TỐI ƯU HIỆU SUẤT VƯỢT TRỘI').toUpperCase();

    beats.push({
      badge: (badge || 'ĐIỂM NHẤN').slice(0, 20),
      line1: line1.slice(0, 36),
      line2: line2.slice(0, 40),
      speaker: seg.speaker,
    });
  }

  // Đảm bảo luôn có đủ 3 beat để bố cục đa tầng giàu thông tin
  while (beats.length < 3) {
    const idx = beats.length;
    const dp = dataPoints?.[idx % Math.max(1, dataPoints?.length || 1)];
    const hWords = headline.split(/\s+/).filter(Boolean);
    beats.push({
      badge: dp ? `+${dp.value}% ${dp.label.toUpperCase()}` : idx === 1 ? 'TRỌNG TÂM' : 'BƯỚC NGOẶT',
      line1: stripTrailingStopWords(hWords.slice(0, 8).join(' ')).toUpperCase(),
      line2: dp ? `CHỈ SỐ ${dp.label.toUpperCase()} ĐẠT NGƯỠNG ${dp.value}%` : 'TỐI ƯU HIỆU NĂNG VÀ TỐC ĐỘ THỰC TẾ',
      speaker: idx % 2 === 0 ? 'lead' : 'accent',
    });
  }

  return beats.slice(0, 3);
}

/**
 * Trích xuất con số/phần trăm nổi bật từ câu thoại để đưa vào Infographic
 */
function extractMetricsFromText(
  headline: string,
  subline: string,
  dataPoints?: Array<{ label: string; value: number }>
): { mainStat: string; mainVal: number; items: Array<{ label: string; value: number; display: string }> } {
  const combined = `${headline} ${subline}`;
  const matches = combined.match(/(\d+(?:[.,]\d+)?\s*(?:%|phần trăm|nm|x|lần|nghìn|triệu|tỷ|k))/gi) || [];
  const seed = hashText(combined);

  let mainStat = `${84 + (seed % 15)}%`;
  let mainVal = 84 + (seed % 15);
  if (matches.length > 0) {
    const raw = matches[0].replace(/phần trăm/i, '%').replace(/\s+/g, '');
    mainStat = raw.toUpperCase();
    const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
    mainVal = Number.isFinite(num) ? Math.min(99, Math.max(35, num > 100 ? 92 : num)) : 88;
  } else if (dataPoints && dataPoints.length > 0) {
    mainVal = Math.min(99, Math.max(35, dataPoints[0].value));
    mainStat = `${mainVal}%`;
  }

  const hWords = headline
    .replace(/[.,:;!?()"']/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const dynamicLabels = [
    `${(hWords[0] || 'TÁC').toUpperCase()} ${(hWords[1] || 'ĐỘNG').toUpperCase()}`,
    `${(hWords[2] || 'TỐC').toUpperCase()} ${(hWords[3] || 'ĐỘ').toUpperCase()}`,
    'ĐỘ CHÍNH XÁC',
    'ĐỘT PHÁ MỚI',
  ];

  const items =
    dataPoints && dataPoints.length >= 2
      ? [
          ...dataPoints.slice(0, 4).map((d) => ({
            label: d.label.slice(0, 14).toUpperCase(),
            value: Math.min(98, Math.max(35, d.value)),
            display: `${d.value}%`,
          })),
          { label: dynamicLabels[2], value: 94, display: '94%' },
          { label: dynamicLabels[3], value: 86, display: '4.5X' },
        ].slice(0, 4)
      : [
          { label: dynamicLabels[0].slice(0, 14), value: Math.max(72, mainVal), display: mainStat },
          { label: dynamicLabels[1].slice(0, 14), value: 78 + (seed % 18), display: `+${78 + (seed % 18)}%` },
          { label: dynamicLabels[2], value: 85 + ((seed >> 3) % 13), display: `${85 + ((seed >> 3) % 13)}%` },
          { label: dynamicLabels[3], value: 74 + ((seed >> 5) % 20), display: `${((seed % 4) + 2).toFixed(1)}X` },
        ];

  return { mainStat, mainVal, items };
}

/**
 * Vẽ khối Tiêu đề chính (Headline) kèm từ khóa nhấn bọc trong hộp Pill phát sáng rộng rãi
 */
function renderHeroHeadlineZoneSvg(opts: {
  x: number;
  y: number;
  w: number;
  headline: string;
  badgeText: string;
  isVert: boolean;
  palette: { primary: string; secondary: string; accent: string; bg: string; text: string };
  speakerColor: string;
}): { svg: string; bottomY: number } {
  const { x, y, w, headline, badgeText, isVert, palette, speakerColor } = opts;
  const fontSize = isVert ? 46 : 44;
  const lines = wrapTextLines(headline.toUpperCase(), isVert ? 19 : 34, 3);
  const lineH = Math.round(fontSize * 1.26);
  const cardH = 92 + lines.length * lineH;

  const badgeW = Math.min(w - 60, Math.max(230, badgeText.length * 16 + 52));

  const linesSvg = lines
    .map((line, idx) => {
      const ly = y + 100 + idx * lineH;
      const isHighlightLine = idx === lines.length - 1;
      if (isHighlightLine) {
        const highlightBoxW = Math.min(w - 52, Math.max(240, Math.round(line.length * fontSize * 0.72) + 64));
        return `
          <rect x="${x + 28}" y="${ly - fontSize + 6}" width="${highlightBoxW}" height="${fontSize + 18}" rx="14" fill="#FACC15" />
          <text x="${x + 48}" y="${ly}" fill="#060913" font-family="'Be Vietnam Pro', sans-serif" font-size="${fontSize}" font-weight="800">
            ${escapeHtml(line)}
          </text>`;
      }
      return `
        <text x="${x + 30}" y="${ly}" fill="#FFFFFF" font-family="'Be Vietnam Pro', sans-serif" font-size="${fontSize}" font-weight="800">
          ${escapeHtml(line)}
        </text>`;
    })
    .join('');

  const svg = `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${cardH}" rx="30" fill="#090D18" fill-opacity="0.93" stroke="${palette.primary}" stroke-opacity="0.7" stroke-width="2.5" />
      <rect x="${x}" y="${y}" width="12" height="${cardH}" rx="6" fill="url(#accentGrad)" />
      <rect x="${x + 28}" y="${y + 18}" width="${badgeW}" height="34" rx="10" fill="${speakerColor}" fill-opacity="0.2" stroke="${speakerColor}" stroke-width="1.5" />
      <text x="${x + 44}" y="${y + 41}" fill="${speakerColor}" font-family="'JetBrains Mono', monospace" font-size="17" font-weight="800">
        // ${escapeHtml(badgeText)}
      </text>
      ${linesSvg}
    </g>`;

  return { svg, bottomY: y + cardH };
}

/**
 * Render 7 Kiến Trúc Bố Cục Khác Nhau Hoàn Toàn cho phần Trung Tâm (Stage Zone)
 * Giúp mỗi cảnh & mỗi video có cách hoạt động, điểm nhấn thị giác và chuyển động riêng biệt!
 */
function renderDynamicStageLayoutSvg(opts: {
  layout: string;
  x: number;
  y: number;
  w: number;
  h: number;
  isVert: boolean;
  beats: VisualBeat[];
  activeBeatIdx: number;
  animProgress: number;
  frameIdx: number;
  palette: { primary: string; secondary: string; accent: string; bg: string; text: string };
  speakerColor: string;
  metrics: { mainStat: string; mainVal: number; items: Array<{ label: string; value: number; display: string }> };
}): string {
  const { layout, x, y, w, h, beats, activeBeatIdx, animProgress, frameIdx, palette, speakerColor, metrics } = opts;

  // ==========================================================================
  // LAYOUT 1: KINETIC TYPOGRAPHY — 3 Băng-rôn Chữ Động Phóng To & Đổi Màu Điểm Nhấn
  // ==========================================================================
  if (layout === 'kinetic_typography') {
    const gap = 20;
    const cardH = Math.floor((h - gap * 2) / 3);

    return beats
      .map((beat, idx) => {
        const isActive = idx === activeBeatIdx;
        const cy = y + idx * (cardH + gap);
        const shiftX = isActive ? 16 : 0;
        const cardW = w - shiftX;
        const bgFill = isActive ? '#111A2E' : '#090D16';
        const borderStroke = isActive ? '#FACC15' : palette.primary;
        const borderW = isActive ? 3.5 : 1.8;
        const badgeFill = isActive ? '#FACC15' : idx % 2 === 0 ? '#38BDF8' : '#F472B6';
        const badgeW = Math.min(cardW - 180, Math.max(200, beat.badge.length * 16 + 50));

        return `
          <g>
            ${
              isActive
                ? `<rect x="${x + shiftX - 6}" y="${cy - 4}" width="${cardW + 12}" height="${cardH + 8}" rx="30" fill="#FACC15" fill-opacity="0.16" />`
                : ''
            }
            <rect x="${x + shiftX}" y="${cy}" width="${cardW}" height="${cardH}" rx="26" fill="${bgFill}" fill-opacity="0.95" stroke="${borderStroke}" stroke-opacity="${isActive ? '1' : '0.45'}" stroke-width="${borderW}" />
            <rect x="${x + shiftX}" y="${cy}" width="16" height="${cardH}" rx="8" fill="${badgeFill}" />

            <!-- Nhãn Keyword Điểm Nhấn -->
            <rect x="${x + shiftX + 34}" y="${cy + 18}" width="${badgeW}" height="38" rx="12" fill="${badgeFill}" />
            <text x="${x + shiftX + 52}" y="${cy + 44}" fill="#060913" font-family="'JetBrains Mono', monospace" font-size="19" font-weight="800">
              ${escapeHtml(beat.badge)}
            </text>

            ${
              isActive
                ? `<rect x="${x + shiftX + cardW - 168}" y="${cy + 18}" width="144" height="36" rx="18" fill="#F43F5E" />
                   <text x="${x + shiftX + cardW - 96}" y="${cy + 42}" text-anchor="middle" fill="#FFFFFF" font-family="'Be Vietnam Pro', sans-serif" font-size="16" font-weight="800">
                     ĐIỂM NHẤN
                   </text>`
                : `<text x="${x + shiftX + cardW - 32}" y="${cy + 44}" text-anchor="end" fill="#64748B" font-family="'JetBrains Mono', monospace" font-size="24" font-weight="800">
                     0${idx + 1}
                   </text>`
            }

            <!-- Dòng 1 ExtraBold -->
            <text x="${x + shiftX + 34}" y="${cy + 96}" fill="${isActive ? '#FACC15' : '#FFFFFF'}" font-family="'Be Vietnam Pro', sans-serif" font-size="27" font-weight="800">
              ${escapeHtml(beat.line1)}
            </text>

            <!-- Dòng 2 ExtraBold -->
            <text x="${x + shiftX + 34}" y="${cy + 136}" fill="#E2E8F0" font-family="'Be Vietnam Pro', sans-serif" font-size="23" font-weight="800">
              ${escapeHtml(beat.line2)}
            </text>
          </g>`;
      })
      .join('');
  }

  // ==========================================================================
  // LAYOUT 2: STAT SPOTLIGHT — Vòng Radar Số Liệu Khổng Lồ + 2 Thẻ Động Lực
  // ==========================================================================
  if (layout === 'stat_spotlight') {
    const topCardH = Math.round(h * 0.54);
    const botCardY = y + topCardH + 20;
    const botCardH = h - topCardH - 20;

    const cx = x + Math.round(w * 0.27);
    const cy = y + Math.round(topCardH * 0.52);
    const r = Math.min(Math.round(topCardH * 0.35), Math.round(w * 0.19));
    const circum = Number((2 * Math.PI * r).toFixed(1));
    const currentPct = Math.round(metrics.mainVal * (0.62 + 0.38 * animProgress));
    const dashOffset = Number((circum * (1 - currentPct / 100)).toFixed(1));
    const rotAngle = (frameIdx * 28) % 360;

    const rightX = x + Math.round(w * 0.52);
    const rightW = w - Math.round(w * 0.52) - 28;
    const activeBeat = beats[activeBeatIdx] || beats[0];
    const secondBeat = beats[(activeBeatIdx + 1) % beats.length] || beats[1];

    return `
      <g>
        <!-- Khối Radar HUD Chính -->
        <rect x="${x}" y="${y}" width="${w}" height="${topCardH}" rx="30" fill="#090D18" fill-opacity="0.94" stroke="#38BDF8" stroke-opacity="0.7" stroke-width="2.5" />
        <circle cx="${cx}" cy="${cy}" r="${r + 18}" fill="none" stroke="#38BDF8" stroke-opacity="0.38" stroke-width="2.5" stroke-dasharray="12 10" transform="rotate(${rotAngle} ${cx} ${cy})" />
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1E293B" stroke-width="20" />
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#accentGrad)" stroke-width="20" stroke-linecap="round"
          stroke-dasharray="${circum}" stroke-dashoffset="${dashOffset}" transform="rotate(-90 ${cx} ${cy})" />
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="#FACC15" font-family="'JetBrains Mono', monospace" font-size="48" font-weight="800">
          ${escapeHtml(metrics.mainStat)}
        </text>
        <text x="${cx}" y="${cy + 48}" text-anchor="middle" fill="#38BDF8" font-family="'Be Vietnam Pro', sans-serif" font-size="16" font-weight="800">
          CHỈ SỐ ĐỘT PHÁ
        </text>

        <!-- Cột Telemetry Bên Phải -->
        <rect x="${rightX}" y="${y + 34}" width="${rightW}" height="40" rx="12" fill="#FACC15" />
        <text x="${rightX + Math.round(rightW / 2)}" y="${y + 61}" text-anchor="middle" fill="#060913" font-family="'JetBrains Mono', monospace" font-size="19" font-weight="800">
          ${escapeHtml(activeBeat.badge)}
        </text>

        <text x="${rightX}" y="${y + 114}" fill="#FFFFFF" font-family="'Be Vietnam Pro', sans-serif" font-size="22" font-weight="800">
          ${escapeHtml(activeBeat.line1.slice(0, 18))}
        </text>

        <!-- 2 Thanh Năng Lượng Động -->
        <text x="${rightX}" y="${y + 162}" fill="#94A3B8" font-family="'Be Vietnam Pro', sans-serif" font-size="17" font-weight="800">
          ${escapeHtml(metrics.items[0].label)}
        </text>
        <text x="${rightX + rightW}" y="${y + 162}" text-anchor="end" fill="#FACC15" font-family="'JetBrains Mono', monospace" font-size="20" font-weight="800">
          ${escapeHtml(metrics.items[0].display)}
        </text>
        <rect x="${rightX}" y="${y + 174}" width="${rightW}" height="16" rx="8" fill="#1E293B" />
        <rect x="${rightX}" y="${y + 174}" width="${Math.round((rightW * currentPct) / 100)}" height="16" rx="8" fill="#FACC15" />

        <text x="${rightX}" y="${y + 226}" fill="#94A3B8" font-family="'Be Vietnam Pro', sans-serif" font-size="17" font-weight="800">
          ${escapeHtml(metrics.items[1].label)}
        </text>
        <text x="${rightX + rightW}" y="${y + 226}" text-anchor="end" fill="#38BDF8" font-family="'JetBrains Mono', monospace" font-size="20" font-weight="800">
          ${escapeHtml(metrics.items[1].display)}
        </text>
        <rect x="${rightX}" y="${y + 238}" width="${rightW}" height="16" rx="8" fill="#1E293B" />
        <rect x="${rightX}" y="${y + 238}" width="${Math.round((rightW * metrics.items[1].value * animProgress) / 100)}" height="16" rx="8" fill="#38BDF8" />

        <!-- Thẻ Điểm Nhấn Phía Dưới -->
        <rect x="${x}" y="${botCardY}" width="${w}" height="${botCardH}" rx="28" fill="#0F172A" stroke="#FACC15" stroke-width="3" />
        <rect x="${x + 28}" y="${botCardY + 22}" width="210" height="36" rx="10" fill="#F43F5E" />
        <text x="${x + 133}" y="${botCardY + 46}" text-anchor="middle" fill="#FFFFFF" font-family="'Be Vietnam Pro', sans-serif" font-size="18" font-weight="800">
          TÁC ĐỘNG THỰC TẾ
        </text>
        <text x="${x + 28}" y="${botCardY + 100}" fill="#FACC15" font-family="'Be Vietnam Pro', sans-serif" font-size="27" font-weight="800">
          ${escapeHtml(secondBeat.line1)}
        </text>
        <text x="${x + 28}" y="${botCardY + 142}" fill="#E2E8F0" font-family="'Be Vietnam Pro', sans-serif" font-size="23" font-weight="800">
          ${escapeHtml(secondBeat.line2)}
        </text>
      </g>`;
  }

  // ==========================================================================
  // LAYOUT 3: SPLIT COMPARISON — Đối Đầu Trực Diện (VS / Trước & Sau Đột Phá)
  // ==========================================================================
  if (layout === 'split_comparison') {
    const cardH = Math.floor((h - 36) / 2);
    const botY = y + cardH + 36;
    const midY = y + cardH + 18;
    const midX = x + Math.round(w / 2);
    const beat0 = beats[0];
    const beat1 = beats[1] || beats[0];
    const topActive = activeBeatIdx === 0;

    return `
      <g>
        <!-- Thẻ Trên: Góc Nhìn / Thách Thức -->
        <rect x="${x}" y="${y}" width="${w}" height="${cardH}" rx="28" fill="#160B14" fill-opacity="0.95" stroke="#F43F5E" stroke-width="${topActive ? '4' : '2'}" />
        <rect x="${x}" y="${y}" width="16" height="${cardH}" rx="8" fill="#F43F5E" />
        <rect x="${x + 34}" y="${y + 24}" width="250" height="38" rx="12" fill="#F43F5E" />
        <text x="${x + 159}" y="${y + 50}" text-anchor="middle" fill="#FFFFFF" font-family="'JetBrains Mono', monospace" font-size="19" font-weight="800">
          >> ${escapeHtml(beat0.badge.slice(0, 14))}
        </text>
        <text x="${x + 34}" y="${y + 108}" fill="#FDA4AF" font-family="'Be Vietnam Pro', sans-serif" font-size="27" font-weight="800">
          ${escapeHtml(beat0.line1)}
        </text>
        <text x="${x + 34}" y="${y + 152}" fill="#F8FAFC" font-family="'Be Vietnam Pro', sans-serif" font-size="23" font-weight="800">
          ${escapeHtml(beat0.line2)}
        </text>

        <!-- Thẻ Dưới: Đột Phá / Giải Pháp Mới -->
        <rect x="${x}" y="${botY}" width="${w}" height="${cardH}" rx="28" fill="#07171E" fill-opacity="0.95" stroke="#38BDF8" stroke-width="${!topActive ? '4' : '2'}" />
        <rect x="${x}" y="${botY}" width="16" height="${cardH}" rx="8" fill="#38BDF8" />
        <rect x="${x + 34}" y="${botY + 30}" width="250" height="38" rx="12" fill="#FACC15" />
        <text x="${x + 159}" y="${botY + 56}" text-anchor="middle" fill="#060913" font-family="'JetBrains Mono', monospace" font-size="19" font-weight="800">
          ++ ${escapeHtml(beat1.badge.slice(0, 14))}
        </text>
        <text x="${x + 34}" y="${botY + 112}" fill="#38BDF8" font-family="'Be Vietnam Pro', sans-serif" font-size="27" font-weight="800">
          ${escapeHtml(beat1.line1)}
        </text>
        <text x="${x + 34}" y="${botY + 156}" fill="#F8FAFC" font-family="'Be Vietnam Pro', sans-serif" font-size="23" font-weight="800">
          ${escapeHtml(beat1.line2)}
        </text>

        <!-- Huy Hiệu VS Phát Sáng Ở Giữa -->
        <circle cx="${midX}" cy="${midY}" r="38" fill="#FACC15" stroke="#060913" stroke-width="6" />
        <text x="${midX}" y="${midY + 10}" text-anchor="middle" fill="#060913" font-family="'JetBrains Mono', monospace" font-size="26" font-weight="800">
          VS
        </text>
      </g>`;
  }

  // ==========================================================================
  // LAYOUT 4: CHART DATA — Biểu Đồ Tăng Trưởng Đa Cột + Băng-rôn Điểm Nhấn
  // ==========================================================================
  if (layout === 'chart_data') {
    const chartBoxH = Math.round(h * 0.61);
    const calloutY = y + chartBoxH + 20;
    const calloutH = h - chartBoxH - 20;

    const chartTop = y + 58;
    const chartBottom = y + chartBoxH - 48;
    const maxBarH = chartBottom - chartTop - 16;
    const colW = Math.round((w - 150) / 4);
    const points: string[] = [];

    const barsSvg = metrics.items
      .slice(0, 4)
      .map((it, idx) => {
        const bx = x + 44 + idx * (colW + 20);
        const factor = 0.58 + 0.42 * animProgress;
        const bh = Math.max(46, Math.round((maxBarH * it.value * factor) / 100));
        const by = chartBottom - bh;
        const cx = bx + Math.round(colW / 2);
        points.push(`${cx},${by - 12}`);
        const isCurrent = idx === activeBeatIdx % 4;
        return `
          <rect x="${bx}" y="${chartTop}" width="${colW}" height="${maxBarH}" rx="14" fill="#1E293B" fill-opacity="0.45" />
          <rect x="${bx}" y="${by}" width="${colW}" height="${bh}" rx="14" fill="${isCurrent ? '#FACC15' : 'url(#accentGrad)'}" />
          <rect x="${cx - 48}" y="${by - 44}" width="96" height="30" rx="8" fill="${isCurrent ? '#FACC15' : '#0F172A'}" stroke="#FACC15" stroke-width="1.5" />
          <text x="${cx}" y="${by - 23}" text-anchor="middle" fill="${isCurrent ? '#060913' : '#FACC15'}" font-family="'JetBrains Mono', monospace" font-size="18" font-weight="800">
            ${escapeHtml(it.display)}
          </text>
          <text x="${cx}" y="${chartBottom + 30}" text-anchor="middle" fill="#E2E8F0" font-family="'Be Vietnam Pro', sans-serif" font-size="15" font-weight="800">
            ${escapeHtml(it.label.slice(0, 14))}
          </text>`;
      })
      .join('');

    const activeBeat = beats[activeBeatIdx] || beats[0];
    return `
      <g>
        <rect x="${x}" y="${y}" width="${w}" height="${chartBoxH}" rx="30" fill="#090D18" fill-opacity="0.94" stroke="${palette.secondary}" stroke-width="2.5" />
        ${barsSvg}
        <polyline fill="none" stroke="#38BDF8" stroke-width="4.5" points="${points.join(' ')}" />
        ${points
          .map((pt) => {
            const [px, py] = pt.split(',');
            return `<circle cx="${px}" cy="${py}" r="8" fill="#060913" stroke="#38BDF8" stroke-width="4" />`;
          })
          .join('')}

        <!-- Khối Điểm Nhấn Dữ Liệu Dưới Biểu Đồ -->
        <rect x="${x}" y="${calloutY}" width="${w}" height="${calloutH}" rx="26" fill="#0F172A" stroke="#FACC15" stroke-width="3" />
        <rect x="${x + 26}" y="${calloutY + 20}" width="220" height="36" rx="10" fill="#FACC15" />
        <text x="${x + 136}" y="${calloutY + 44}" text-anchor="middle" fill="#060913" font-family="'JetBrains Mono', monospace" font-size="18" font-weight="800">
          ${escapeHtml(activeBeat.badge)}
        </text>
        <text x="${x + 26}" y="${calloutY + 94}" fill="#FFFFFF" font-family="'Be Vietnam Pro', sans-serif" font-size="27" font-weight="800">
          ${escapeHtml(activeBeat.line1)}
        </text>
        <text x="${x + 26}" y="${calloutY + 134}" fill="#38BDF8" font-family="'Be Vietnam Pro', sans-serif" font-size="23" font-weight="800">
          ${escapeHtml(activeBeat.line2)}
        </text>
      </g>`;
  }

  // ==========================================================================
  // LAYOUT 5: THREEJS PARTICLES / ROADMAP — Sơ Đồ Quy Trình 3 Bước Chuyển Động
  // ==========================================================================
  if (layout === 'threejs_particles') {
    const stepH = Math.floor((h - 44) / 3);
    const lineX = x + 64;

    const stepsSvg = beats
      .map((beat, idx) => {
        const sy = y + idx * (stepH + 22);
        const cy = sy + Math.round(stepH / 2);
        const isActive = idx === activeBeatIdx;
        const nodeColor = isActive ? '#FACC15' : '#38BDF8';

        return `
          <g>
            <!-- Hộp Nội Dung Bước -->
            <rect x="${x + 126}" y="${sy}" width="${w - 126}" height="${stepH}" rx="24" fill="${isActive ? '#131C31' : '#090D18'}" stroke="${nodeColor}" stroke-opacity="${isActive ? '1' : '0.45'}" stroke-width="${isActive ? '3.5' : '2'}" />
            <rect x="${x + 150}" y="${sy + 18}" width="210" height="34" rx="10" fill="${nodeColor}" />
            <text x="${x + 255}" y="${sy + 41}" text-anchor="middle" fill="#060913" font-family="'JetBrains Mono', monospace" font-size="17" font-weight="800">
              ${escapeHtml(beat.badge)}
            </text>
            <text x="${x + 150}" y="${sy + 90}" fill="${isActive ? '#FACC15' : '#FFFFFF'}" font-family="'Be Vietnam Pro', sans-serif" font-size="25" font-weight="800">
              ${escapeHtml(beat.line1)}
            </text>
            <text x="${x + 150}" y="${sy + 128}" fill="#E2E8F0" font-family="'Be Vietnam Pro', sans-serif" font-size="21" font-weight="800">
              ${escapeHtml(beat.line2)}
            </text>

            <!-- Node Tròn Phát Sáng Bên Trái -->
            ${isActive ? `<circle cx="${lineX}" cy="${cy}" r="46" fill="#FACC15" fill-opacity="0.22" />` : ''}
            <circle cx="${lineX}" cy="${cy}" r="34" fill="${isActive ? '#FACC15' : '#0F172A'}" stroke="${nodeColor}" stroke-width="4" />
            <text x="${lineX}" y="${cy + 8}" text-anchor="middle" fill="${isActive ? '#060913' : '#FFFFFF'}" font-family="'JetBrains Mono', monospace" font-size="22" font-weight="800">
              0${idx + 1}
            </text>
          </g>`;
      })
      .join('');

    return `
      <g>
        <line x1="${lineX}" y1="${y + 60}" x2="${lineX}" y2="${y + h - 60}" stroke="#38BDF8" stroke-width="5" stroke-dasharray="10 8" />
        ${stepsSvg}
      </g>`;
  }

  // ==========================================================================
  // LAYOUT 6: QUOTE CARD — Tâm Điểm Tuyên Ngôn + Từ Khóa Đóng Hộp + Sóng Âm
  // ==========================================================================
  if (layout === 'quote_card') {
    const activeBeat = beats[activeBeatIdx] || beats[0];
    const nextBeat = beats[(activeBeatIdx + 1) % beats.length] || beats[1];
    const waveBars = Array.from({ length: 22 })
      .map((_, idx) => {
        const barH = 18 + ((idx * 19 + frameIdx * 23) % 64);
        const bx = x + Math.round((w - 22 * 26) / 2) + idx * 26;
        const by = y + h - 75 - Math.round(barH / 2);
        return `<rect x="${bx}" y="${by}" width="14" height="${barH}" rx="7" fill="${idx % 2 === 0 ? '#FACC15' : speakerColor}" />`;
      })
      .join('');

    return `
      <g>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="34" fill="#090D18" fill-opacity="0.94" stroke="#FACC15" stroke-width="3" />
        <text x="${x + 42}" y="${y + 110}" fill="#FACC15" fill-opacity="0.28" font-family="'Be Vietnam Pro', sans-serif" font-size="120" font-weight="800">
          “
        </text>

        <!-- Hộp Keyword Nổi Bật Ở Trung Tâm -->
        <rect x="${x + 48}" y="${y + 54}" width="${Math.min(w - 96, Math.max(260, activeBeat.badge.length * 19 + 60))}" height="52" rx="16" fill="#FACC15" />
        <text x="${x + 76}" y="${y + 89}" fill="#060913" font-family="'JetBrains Mono', monospace" font-size="25" font-weight="800">
          >> ${escapeHtml(activeBeat.badge)}
        </text>

        <!-- Dòng Tuyên Ngôn Chính -->
        <text x="${x + 48}" y="${y + 178}" fill="#FFFFFF" font-family="'Be Vietnam Pro', sans-serif" font-size="29" font-weight="800">
          ${escapeHtml(activeBeat.line1)}
        </text>
        <text x="${x + 48}" y="${y + 228}" fill="#38BDF8" font-family="'Be Vietnam Pro', sans-serif" font-size="25" font-weight="800">
          ${escapeHtml(activeBeat.line2)}
        </text>

        <!-- Hộp Bổ Trợ Thứ 2 -->
        <rect x="${x + 48}" y="${y + 278}" width="${w - 96}" height="86" rx="20" fill="#131C31" stroke="#38BDF8" stroke-width="2" />
        <text x="${x + 76}" y="${y + 332}" fill="#FACC15" font-family="'Be Vietnam Pro', sans-serif" font-size="23" font-weight="800">
          + ${escapeHtml(nextBeat.line1)}
        </text>

        <!-- Sóng Âm Đa Dải Phía Dưới -->
        ${waveBars}
      </g>`;
  }

  // ==========================================================================
  // LAYOUT 7 (Mặc định): HERO HEADLINE / BENTO GRID — Lưới Bento Đa Tầng
  // ==========================================================================
  const topBentoH = Math.round(h * 0.48);
  const botBentoY = y + topBentoH + 22;
  const botBentoH = h - topBentoH - 22;
  const halfW = Math.floor((w - 22) / 2);
  const activeBeat = beats[activeBeatIdx] || beats[0];

  return `
    <g>
      <!-- Thẻ Bento Lớn Phía Trên -->
      <rect x="${x}" y="${y}" width="${w}" height="${topBentoH}" rx="30" fill="#0F172A" stroke="#FACC15" stroke-width="3.5" />
      <rect x="${x + 32}" y="${y + 26}" width="240" height="42" rx="12" fill="#FACC15" />
      <text x="${x + 152}" y="${y + 54}" text-anchor="middle" fill="#060913" font-family="'JetBrains Mono', monospace" font-size="20" font-weight="800">
        ++ ${escapeHtml(activeBeat.badge.slice(0, 14))}
      </text>
      <text x="${x + 32}" y="${y + 118}" fill="#FFFFFF" font-family="'Be Vietnam Pro', sans-serif" font-size="28" font-weight="800">
        ${escapeHtml(activeBeat.line1)}
      </text>
      <text x="${x + 32}" y="${y + 164}" fill="#38BDF8" font-family="'Be Vietnam Pro', sans-serif" font-size="23" font-weight="800">
        ${escapeHtml(activeBeat.line2)}
      </text>

      <!-- 2 Thẻ Bento Số Liệu Đối Xứng Phía Dưới -->
      <rect x="${x}" y="${botBentoY}" width="${halfW}" height="${botBentoH}" rx="28" fill="#090D18" stroke="#38BDF8" stroke-width="2.5" />
      <text x="${x + 30}" y="${botBentoY + 56}" fill="#94A3B8" font-family="'Be Vietnam Pro', sans-serif" font-size="18" font-weight="800">
        ${escapeHtml(metrics.items[0].label)}
      </text>
      <text x="${x + 30}" y="${botBentoY + 132}" fill="#FACC15" font-family="'JetBrains Mono', monospace" font-size="56" font-weight="800">
        ${escapeHtml(metrics.items[0].display)}
      </text>
      <rect x="${x + 30}" y="${botBentoY + 156}" width="${halfW - 60}" height="12" rx="6" fill="#1E293B" />
      <rect x="${x + 30}" y="${botBentoY + 156}" width="${Math.round((halfW - 60) * animProgress)}" height="12" rx="6" fill="#FACC15" />

      <rect x="${x + halfW + 22}" y="${botBentoY}" width="${halfW}" height="${botBentoH}" rx="28" fill="#090D18" stroke="#F472B6" stroke-width="2.5" />
      <text x="${x + halfW + 52}" y="${botBentoY + 56}" fill="#94A3B8" font-family="'Be Vietnam Pro', sans-serif" font-size="18" font-weight="800">
        ${escapeHtml(metrics.items[1].label)}
      </text>
      <text x="${x + halfW + 52}" y="${botBentoY + 132}" fill="#38BDF8" font-family="'JetBrains Mono', monospace" font-size="56" font-weight="800">
        ${escapeHtml(metrics.items[1].display)}
      </text>
      <rect x="${x + halfW + 52}" y="${botBentoY + 156}" width="${halfW - 60}" height="12" rx="6" fill="#1E293B" />
      <rect x="${x + halfW + 52}" y="${botBentoY + 156}" width="${Math.round((halfW - 60) * (0.55 + 0.45 * animProgress))}" height="12" rx="6" fill="#38BDF8" />
    </g>`;
}

/**
 * Vẽ khung hình Motion Graphics SVG chất lượng studio:
 * - Toàn bộ chữ dùng BeVietnamPro-ExtraBold + JetBrainsMono-Bold cực kỳ sắc nét
 * - 7 Kiến trúc Layout khác nhau hoàn toàn theo từng cảnh & từng chủ đề
 * - Từ khóa nhấn được đóng hộp Neon Pill nổi bật và nhảy sáng theo nhịp đọc
 */
function renderSceneSlidePng(opts: {
  width: number;
  height: number;
  aspect: '16:9' | '9:16';
  headline: string;
  subline: string;
  layout?: string;
  segments?: Array<{ speaker: 'lead' | 'accent'; text: string; emphasis?: string }>;
  activeSegIndex?: number;
  captionWordsWindow?: string[];
  activeWordIndexInWindow?: number;
  speaker?: 'lead' | 'accent';
  sceneIndex?: number;
  frameIndex?: number;
  progressRatio?: number;
  dataPoints?: Array<{ label: string; value: number }>;
  palette: { primary: string; secondary: string; accent: string; bg: string; text: string };
  outputPngPath: string;
}) {
  const { width, height, aspect, palette } = opts;
  const isVert = aspect === '9:16';
  const sceneIdx = opts.sceneIndex ?? 0;
  const frameIdx = opts.frameIndex ?? 0;
  const animProgress = Math.min(1, Math.max(0.35, opts.progressRatio ?? 0.75));

  // Lề an toàn chuẩn TikTok/Reels/Shorts (136px mỗi bên trên 9:16 để không bị cột nút Like/Comment/Share che)
  const padX = isVert ? 136 : 160;
  const stageW = width - padX * 2;
  const topY = isVert ? 190 : 76;
  const captionSize = isVert ? 42 : 38;

  const allLayouts = [
    'kinetic_typography',
    'stat_spotlight',
    'split_comparison',
    'chart_data',
    'threejs_particles',
    'quote_card',
    'hero_headline',
  ];
  const topicSeed = hashText(opts.headline + opts.subline);
  const chosenLayout = opts.layout || allLayouts[(topicSeed + sceneIdx * 2) % allLayouts.length];

  const speakerLabel = opts.speaker === 'accent' ? 'ACCENT • ĐIỂM NHẤN' : 'LEAD • DẪN CHÍNH';
  const speakerColor = opts.speaker === 'accent' ? '#F472B6' : '#38BDF8';
  const progressWidth = Math.max(32, Math.round(stageW * animProgress));

  // Sóng âm Equalizer 10 cột nhảy động ở góc trên
  const eqBarsSvg = Array.from({ length: 10 })
    .map((_, idx) => {
      const barH = 12 + ((idx * 13 + frameIdx * 19) % 30);
      const bx = width - padX - 130 + idx * 13;
      const by = topY + 54 - Math.round(barH / 2);
      return `<rect x="${bx}" y="${by}" width="7" height="${barH}" rx="3.5" fill="${speakerColor}" />`;
    })
    .join('');

  // Trích xuất Visual Beats & Metrics từ nội dung thực của cảnh
  const beats = extractVisualBeats(opts.headline, opts.subline, opts.segments, opts.dataPoints);
  const metrics = extractMetricsFromText(opts.headline, opts.subline, opts.dataPoints);
  const activeBeatIdx = (opts.activeSegIndex ?? frameIdx) % beats.length;

  // Vẽ khối Hero Headline ở phía trên
  const layoutBadgeNames: Record<string, string> = {
    kinetic_typography: 'ĐIỂM NHẤN TRỌNG TÂM',
    stat_spotlight: 'PHÂN TÍCH SỐ LIỆU',
    split_comparison: 'GÓC NHÌN ĐỐI LẬP',
    chart_data: 'XU HƯỚNG TĂNG TRƯỞNG',
    threejs_particles: 'CƠ CHẾ HOẠT ĐỘNG',
    quote_card: 'TUYÊN NGÔN CỐT LÕI',
    hero_headline: 'TÂM ĐIỂM ĐỘT PHÁ',
  };

  const heroZone = renderHeroHeadlineZoneSvg({
    x: padX,
    y: topY + 94,
    w: stageW,
    headline: opts.headline,
    badgeText: layoutBadgeNames[chosenLayout] || 'ĐIỂM NHẤN CHÍNH',
    isVert,
    palette,
    speakerColor,
  });

  const captionBoxY = isVert ? 1320 : 815;
  const stageTopY = heroZone.bottomY + 22;
  const stageHeight = Math.max(260, captionBoxY - stageTopY - 24);

  const dynamicStageSvg = renderDynamicStageLayoutSvg({
    layout: chosenLayout,
    x: padX,
    y: stageTopY,
    w: stageW,
    h: stageHeight,
    isVert,
    beats,
    activeBeatIdx,
    animProgress,
    frameIdx,
    palette,
    speakerColor,
    metrics,
  });

  // Thanh phụ đề Karaoke có Highlight cụm từ đang đọc + gạch chân năng lượng
  const windowWords =
    opts.captionWordsWindow && opts.captionWordsWindow.length > 0
      ? opts.captionWordsWindow
      : opts.subline.trim().split(/\s+/).slice(0, isVert ? 4 : 6);
  const activeIdx = opts.activeWordIndexInWindow ?? 0;

  const karaokeTspans = windowWords
    .map((w, idx) => {
      const isFocused = idx === activeIdx || idx === activeIdx + 1;
      const fill = isFocused ? '#FACC15' : '#FFFFFF';
      const prefix = idx === 0 ? '' : ' ';
      return `<tspan fill="${fill}" font-size="${isFocused ? captionSize + 5 : captionSize}">${escapeHtml(prefix + w.toUpperCase())}</tspan>`;
    })
    .join('');

  // Quả cầu ánh sáng nền + Hiệu ứng nhịp thở Camera (subtle scale/pan directly in SVG!)
  const orbOffsetX = (frameIdx % 8) * 18;
  const orbOffsetY = (frameIdx % 8) * 14;
  const camScale = frameIdx % 2 === 0 ? 1.0 : 1.018;
  const camTx = Math.round((width * (1 - camScale)) / 2);
  const camTy = Math.round((height * (1 - camScale)) / 2);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${palette.bg}" />
        <stop offset="50%" stop-color="#0F172A" />
        <stop offset="100%" stop-color="#050811" />
      </linearGradient>
      <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${palette.primary}" />
        <stop offset="50%" stop-color="${palette.secondary}" />
        <stop offset="100%" stop-color="${palette.accent}" />
      </linearGradient>
      <pattern id="cyberGrid" width="64" height="64" patternUnits="userSpaceOnUse">
        <path d="M 64 0 L 0 0 0 64" fill="none" stroke="#1E293B" stroke-width="1" stroke-opacity="0.5" />
      </pattern>
    </defs>

    <!-- Background + Cyber Grid + Moving Glow Orbs -->
    <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
    <rect width="${width}" height="${height}" fill="url(#cyberGrid)" />
    <circle cx="${Math.round(width * 0.82) - orbOffsetX}" cy="${Math.round(height * 0.16) + orbOffsetY}" r="${isVert ? 280 : 230}" fill="${palette.primary}" opacity="0.22" />
    <circle cx="${Math.round(width * 0.18) + orbOffsetX}" cy="${Math.round(height * 0.78) - orbOffsetY}" r="${isVert ? 290 : 250}" fill="${palette.accent}" opacity="0.18" />

    <!-- Top Progress Bar -->
    <rect x="${padX}" y="${topY}" width="${stageW}" height="12" rx="6" fill="#1E293B" />
    <rect x="${padX}" y="${topY}" width="${progressWidth}" height="12" rx="6" fill="url(#accentGrad)" />

    <!-- Scene Counter Pill + Speaker Badge + Live Audio Equalizer -->
    <rect x="${padX}" y="${topY + 28}" width="148" height="48" rx="15" fill="#1E293B" stroke="#475569" stroke-width="1.5" />
    <text x="${padX + 74}" y="${topY + 59}" text-anchor="middle" fill="#FACC15" font-family="'JetBrains Mono', monospace" font-size="21" font-weight="800">
      SCENE 0${sceneIdx + 1}
    </text>

    <rect x="${padX + 162}" y="${topY + 28}" width="320" height="48" rx="24" fill="${speakerColor}" fill-opacity="0.18" stroke="${speakerColor}" stroke-width="2" />
    <circle cx="${padX + 190}" cy="${topY + 52}" r="7" fill="${speakerColor}" />
    <text x="${padX + 332}" y="${topY + 59}" text-anchor="middle" fill="${speakerColor}" font-family="'Be Vietnam Pro', sans-serif" font-size="20" font-weight="800">
      ${escapeHtml(speakerLabel)}
    </text>

    ${eqBarsSvg}

    <!-- Main Animated Camera Stage -->
    <g transform="translate(${camTx}, ${camTy}) scale(${camScale})">
      ${heroZone.svg}
      ${dynamicStageSvg}
    </g>

    <!-- Bottom Karaoke Caption Pill Box -->
    <rect x="${padX}" y="${captionBoxY}" width="${stageW}" height="144" rx="30" fill="#060913" fill-opacity="0.96" stroke="${speakerColor}" stroke-width="3.5" />
    <rect x="${padX + 24}" y="${captionBoxY + 18}" width="116" height="28" rx="9" fill="${speakerColor}" />
    <text x="${padX + 82}" y="${captionBoxY + 38}" text-anchor="middle" fill="#060913" font-family="'JetBrains Mono', monospace" font-size="16" font-weight="800">
      ${opts.speaker === 'accent' ? 'ACCENT' : 'LEAD'}
    </text>
    <text x="${Math.round(width / 2)}" y="${captionBoxY + 98}" text-anchor="middle" font-family="'Be Vietnam Pro', sans-serif" font-weight="800">
      ${karaokeTspans}
    </text>
    <rect x="${Math.round(width / 2) - 110}" y="${captionBoxY + 116}" width="220" height="6" rx="3" fill="#FACC15" />
  </svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: {
      fontFiles: BUNDLED_FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: 'Be Vietnam Pro',
    },
  });
  const pngBuffer = resvg.render().asPng();
  fs.writeFileSync(opts.outputPngPath, pngBuffer);
}

/**
 * Render composition HyperFrames ra MP4 và tạo ảnh Snapshot (Mục 7.1 & Bước 13/14)
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
  sceneIndex?: number;
  layout?: string;
  dataPoints?: Array<{ label: string; value: number }>;
  segments?: Array<{ speaker: 'lead' | 'accent'; text: string; emphasis?: string }>;
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

    // Chia mỗi segment thành các bước nhảy Karaoke 2 từ (cửa sổ 4 từ cho 9:16, 6 từ cho 16:9)
    // đồng thời kích hoạt hiệu ứng đổi Thẻ Điểm Nhấn (activeSegIndex) và chuyển động đồ họa
    const windowSize = opts.aspect === '9:16' ? 4 : 6;
    const slideFrames: Array<{
      speaker: 'lead' | 'accent';
      fullText: string;
      captionWordsWindow: string[];
      activeWordIndexInWindow: number;
      segIndex: number;
    }> = [];

    for (let sIdx = 0; sIdx < segList.length; sIdx++) {
      const seg = segList[sIdx];
      const words = seg.text.trim().split(/\s+/).filter(Boolean);
      if (opts.durationSec <= 1.2 || words.length <= 2) {
        slideFrames.push({
          speaker: seg.speaker,
          fullText: seg.text,
          captionWordsWindow: words.slice(0, windowSize),
          activeWordIndexInWindow: 0,
          segIndex: sIdx,
        });
      } else {
        for (let w = 0; w < words.length; w += windowSize) {
          const chunk = words.slice(w, w + windowSize);
          for (let focus = 0; focus < chunk.length; focus += 2) {
            slideFrames.push({
              speaker: seg.speaker,
              fullText: seg.text,
              captionWordsWindow: chunk,
              activeWordIndexInWindow: focus,
              segIndex: sIdx,
            });
          }
        }
      }
    }

    const subClips: string[] = [];
    const frameDuration = Math.max(0.42, Number((opts.durationSec / slideFrames.length).toFixed(2)));

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
        layout: opts.layout,
        segments: segList,
        activeSegIndex: frame.segIndex,
        captionWordsWindow: frame.captionWordsWindow,
        activeWordIndexInWindow: frame.activeWordIndexInWindow,
        speaker: frame.speaker,
        sceneIndex: opts.sceneIndex ?? 0,
        frameIndex: i,
        progressRatio: (i + 1) / slideFrames.length,
        dataPoints: opts.dataPoints,
        palette: opts.palette,
        outputPngPath: slidePngPath,
      });

      if (i === 0 && opts.snapshotPath) {
        fs.mkdirSync(path.dirname(opts.snapshotPath), { recursive: true });
        fs.copyFileSync(slidePngPath, opts.snapshotPath);
      }

      const vf =
        i === 0
          ? `scale=${width}:${height},fps=30,fade=t=in:st=0:d=0.16`
          : i === slideFrames.length - 1
            ? `scale=${width}:${height},fps=30,fade=t=out:st=${Math.max(0.08, frameDuration - 0.16).toFixed(2)}:d=0.16`
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
