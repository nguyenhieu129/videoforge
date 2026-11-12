import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import type { ScriptScene, StoryboardScene, WordTiming } from '@videoforge/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONTS_DIR = path.resolve(__dirname, '../fonts');
const BUNDLED_FONT_FILES = [
  path.join(FONTS_DIR, 'BeVietnamPro-ExtraBold.ttf'),
  path.join(FONTS_DIR, 'BeVietnamPro-SemiBold.ttf'),
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
 * - Bố cục riêng cho 16:9 (1920x1080) và 9:16 (1080x1920, vùng an toàn 10% trên & 20% dưới)
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
 * Trích xuất con số/phần trăm nổi bật từ câu thoại để đưa vào Infographic
 */
function extractMetricsFromText(
  headline: string,
  subline: string,
  dataPoints?: Array<{ label: string; value: number }>
): { mainStat: string; mainVal: number; items: Array<{ label: string; value: number; display: string }> } {
  const combined = `${headline} ${subline}`;
  const matches = combined.match(/(\d+(?:[.,]\d+)?\s*(?:%|phần trăm|nm|x|lần|nghìn|triệu|tỷ|k))/gi) || [];

  let mainStat = '94%';
  let mainVal = 94;
  if (matches.length > 0) {
    const raw = matches[0].replace(/phần trăm/i, '%').replace(/\s+/g, '');
    mainStat = raw.toUpperCase();
    const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
    mainVal = Number.isFinite(num) ? Math.min(99, Math.max(25, num > 100 ? 92 : num)) : 88;
  } else if (dataPoints && dataPoints.length > 0) {
    mainVal = Math.min(99, Math.max(25, dataPoints[0].value));
    mainStat = `${mainVal}%`;
  }

  const items =
    dataPoints && dataPoints.length >= 2
      ? dataPoints.slice(0, 4).map((d) => ({
          label: d.label.slice(0, 14).toUpperCase(),
          value: Math.min(98, Math.max(25, d.value)),
          display: `${d.value}%`,
        }))
      : [
          { label: 'HIỆU SUẤT', value: Math.max(68, mainVal), display: mainStat },
          { label: 'TỐC ĐỘ XỬ LÝ', value: 88, display: '+88%' },
          { label: 'ĐỘ CHÍNH XÁC', value: 95, display: '95%' },
          { label: 'TỐI ƯU HÓA', value: 82, display: '4.2X' },
        ];

  return { mainStat, mainVal, items };
}

/**
 * Vẽ 4 dạng Infographic động (Gauge HUD, Biểu đồ cột + đường xu hướng, Mạng lưới AI Core, Bento Spotlight)
 */
function renderInfographicZoneSvg(opts: {
  x: number;
  y: number;
  w: number;
  h: number;
  styleIndex: number;
  animProgress: number; // 0.35 -> 1.0
  frameIndex: number;
  palette: { primary: string; secondary: string; accent: string; bg: string; text: string };
  speakerColor: string;
  metrics: { mainStat: string; mainVal: number; items: Array<{ label: string; value: number; display: string }> };
}): string {
  const { x, y, w, h, styleIndex, animProgress, frameIndex, palette, speakerColor, metrics } = opts;
  const variant = styleIndex % 4;

  // Style 0: Vòng đồng hồ Neon HUD (Radial Gauge) + 2 thanh Telemetry
  if (variant === 0) {
    const cx = x + Math.round(w * 0.27);
    const cy = y + Math.round(h * 0.5);
    const r = Math.min(Math.round(h * 0.36), Math.round(w * 0.2));
    const circum = Number((2 * Math.PI * r).toFixed(1));
    const currentPct = Math.round(metrics.mainVal * (0.55 + 0.45 * animProgress));
    const dashOffset = Number((circum * (1 - currentPct / 100)).toFixed(1));

    const barX = x + Math.round(w * 0.52);
    const barW = Math.round(w * 0.43);
    const b1Val = Math.round(metrics.items[1].value * (0.6 + 0.4 * animProgress));
    const b2Val = Math.round(metrics.items[2].value * (0.65 + 0.35 * animProgress));

    return `
      <g>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="#0B1120" fill-opacity="0.9" stroke="${palette.primary}" stroke-opacity="0.4" stroke-width="2" />
        <!-- Radial Gauge -->
        <circle cx="${cx}" cy="${cy}" r="${r + 16}" fill="none" stroke="${palette.primary}" stroke-opacity="0.18" stroke-width="2" stroke-dasharray="8 8" />
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1E293B" stroke-width="18" />
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#accentGrad)" stroke-width="18" stroke-linecap="round"
          stroke-dasharray="${circum}" stroke-dashoffset="${dashOffset}" transform="rotate(-90 ${cx} ${cy})" />
        <text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="#FACC15" font-family="'JetBrains Mono', monospace" font-size="42" font-weight="800">
          ${escapeHtml(metrics.mainStat)}
        </text>
        <text x="${cx}" y="${cy + 44}" text-anchor="middle" fill="#94A3B8" font-family="'Be Vietnam Pro', sans-serif" font-size="16" font-weight="600">
          CHỈ SỐ ĐỘT PHÁ
        </text>

        <!-- Right Telemetry Bars -->
        <text x="${barX}" y="${y + 68}" fill="#E2E8F0" font-family="'Be Vietnam Pro', sans-serif" font-size="20" font-weight="800">
          ${escapeHtml(metrics.items[1].label)}
        </text>
        <text x="${barX + barW}" y="${y + 68}" text-anchor="end" fill="#38BDF8" font-family="'JetBrains Mono', monospace" font-size="22" font-weight="800">
          ${b1Val}%
        </text>
        <rect x="${barX}" y="${y + 82}" width="${barW}" height="18" rx="9" fill="#1E293B" />
        <rect x="${barX}" y="${y + 82}" width="${Math.round((barW * b1Val) / 100)}" height="18" rx="9" fill="#38BDF8" />

        <text x="${barX}" y="${y + 155}" fill="#E2E8F0" font-family="'Be Vietnam Pro', sans-serif" font-size="20" font-weight="800">
          ${escapeHtml(metrics.items[2].label)}
        </text>
        <text x="${barX + barW}" y="${y + 155}" text-anchor="end" fill="#F472B6" font-family="'JetBrains Mono', monospace" font-size="22" font-weight="800">
          ${b2Val}%
        </text>
        <rect x="${barX}" y="${y + 169}" width="${barW}" height="18" rx="9" fill="#1E293B" />
        <rect x="${barX}" y="${y + 169}" width="${Math.round((barW * b2Val) / 100)}" height="18" rx="9" fill="#F472B6" />

        <!-- Status Pill -->
        <rect x="${barX}" y="${y + h - 68}" width="${barW}" height="42" rx="12" fill="${speakerColor}" fill-opacity="0.15" stroke="${speakerColor}" stroke-opacity="0.5" stroke-width="1.5" />
        <text x="${barX + Math.round(barW / 2)}" y="${y + h - 41}" text-anchor="middle" fill="#F8FAFC" font-family="'JetBrains Mono', monospace" font-size="18" font-weight="700">
          ⚡ DỮ LIỆU ĐÃ KIỂM CHỨNG
        </text>
      </g>`;
  }

  // Style 1: Biểu đồ tăng trưởng đa cột + Đường xu hướng phát sáng
  if (variant === 1) {
    const chartTop = y + 52;
    const chartBottom = y + h - 48;
    const maxBarH = chartBottom - chartTop - 20;
    const colW = Math.round((w - 140) / 4);
    const points: string[] = [];

    const barsSvg = metrics.items
      .slice(0, 4)
      .map((it, idx) => {
        const bx = x + 46 + idx * (colW + 18);
        const factor = 0.55 + 0.45 * animProgress;
        const bh = Math.max(42, Math.round((maxBarH * it.value * factor) / 100));
        const by = chartBottom - bh;
        const cx = bx + Math.round(colW / 2);
        points.push(`${cx},${by - 10}`);
        const isHighlight = idx === 0 || idx === 3;
        return `
          <rect x="${bx}" y="${chartTop}" width="${colW}" height="${maxBarH}" rx="12" fill="#1E293B" fill-opacity="0.45" />
          <rect x="${bx}" y="${by}" width="${colW}" height="${bh}" rx="12" fill="${isHighlight ? 'url(#accentGrad)' : '#38BDF8'}" />
          <text x="${cx}" y="${by - 18}" text-anchor="middle" fill="#FACC15" font-family="'JetBrains Mono', monospace" font-size="22" font-weight="800">
            ${escapeHtml(it.display)}
          </text>
          <text x="${cx}" y="${chartBottom + 28}" text-anchor="middle" fill="#CBD5E1" font-family="'Be Vietnam Pro', sans-serif" font-size="15" font-weight="600">
            ${escapeHtml(it.label.slice(0, 13))}
          </text>`;
      })
      .join('');

    return `
      <g>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="#0B1120" fill-opacity="0.9" stroke="${palette.secondary}" stroke-opacity="0.45" stroke-width="2" />
        ${barsSvg}
        <polyline fill="none" stroke="#FACC15" stroke-width="4" points="${points.join(' ')}" />
        ${points
          .map((pt) => {
            const [px, py] = pt.split(',');
            return `<circle cx="${px}" cy="${py}" r="7" fill="#090D16" stroke="#FACC15" stroke-width="4" />`;
          })
          .join('')}
      </g>`;
  }

  // Style 2: Sơ đồ Mạng lưới AI Core (Cyber Hub + 3 Node vệ tinh)
  if (variant === 2) {
    const cx = x + Math.round(w * 0.5);
    const cy = y + Math.round(h * 0.52);
    const pulseR = 64 + (frameIndex % 3) * 10;
    const leftX = x + Math.round(w * 0.18);
    const rightX = x + Math.round(w * 0.82);
    const topNodeY = y + Math.round(h * 0.3);
    const botNodeY = y + Math.round(h * 0.74);

    return `
      <g>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="#0B1120" fill-opacity="0.9" stroke="${palette.accent}" stroke-opacity="0.4" stroke-width="2" />
        <!-- Connecting Laser Lines -->
        <line x1="${cx}" y1="${cy}" x2="${leftX}" y2="${topNodeY}" stroke="#38BDF8" stroke-width="3" stroke-dasharray="8 6" />
        <line x1="${cx}" y1="${cy}" x2="${rightX}" y2="${topNodeY}" stroke="#F472B6" stroke-width="3" stroke-dasharray="8 6" />
        <line x1="${cx}" y1="${cy}" x2="${leftX}" y2="${botNodeY}" stroke="#FACC15" stroke-width="3" stroke-dasharray="8 6" />
        <line x1="${cx}" y1="${cy}" x2="${rightX}" y2="${botNodeY}" stroke="#38BDF8" stroke-width="3" stroke-dasharray="8 6" />

        <!-- Satellite Nodes -->
        <rect x="${leftX - 95}" y="${topNodeY - 26}" width="190" height="52" rx="16" fill="#1E293B" stroke="#38BDF8" stroke-width="2" />
        <text x="${leftX}" y="${topNodeY + 7}" text-anchor="middle" fill="#38BDF8" font-family="'JetBrains Mono', monospace" font-size="20" font-weight="800">
          ${escapeHtml(metrics.items[0].display)} CORE
        </text>

        <rect x="${rightX - 95}" y="${topNodeY - 26}" width="190" height="52" rx="16" fill="#1E293B" stroke="#F472B6" stroke-width="2" />
        <text x="${rightX}" y="${topNodeY + 7}" text-anchor="middle" fill="#F472B6" font-family="'JetBrains Mono', monospace" font-size="20" font-weight="800">
          ${escapeHtml(metrics.items[1].display)} SPEED
        </text>

        <rect x="${leftX - 95}" y="${botNodeY - 26}" width="190" height="52" rx="16" fill="#1E293B" stroke="#FACC15" stroke-width="2" />
        <text x="${leftX}" y="${botNodeY + 7}" text-anchor="middle" fill="#FACC15" font-family="'JetBrains Mono', monospace" font-size="20" font-weight="800">
          AI SHIELD
        </text>

        <rect x="${rightX - 95}" y="${botNodeY - 26}" width="190" height="52" rx="16" fill="#1E293B" stroke="#38BDF8" stroke-width="2" />
        <text x="${rightX}" y="${botNodeY + 7}" text-anchor="middle" fill="#38BDF8" font-family="'JetBrains Mono', monospace" font-size="20" font-weight="800">
          VERIFIED
        </text>

        <!-- Center AI Core -->
        <circle cx="${cx}" cy="${cy}" r="${pulseR}" fill="${palette.primary}" fill-opacity="0.16" stroke="${palette.primary}" stroke-opacity="0.5" stroke-width="2" />
        <circle cx="${cx}" cy="${cy}" r="50" fill="url(#accentGrad)" />
        <text x="${cx}" y="${cy + 10}" text-anchor="middle" fill="#FFFFFF" font-family="'JetBrains Mono', monospace" font-size="28" font-weight="800">
          ${escapeHtml(metrics.mainStat)}
        </text>
      </g>`;
  }

  // Style 3: Bento Spotlight 2 cột + Sóng âm Equalizer đa dải
  const cardW = Math.round((w - 54) / 2);
  const cardH = h - 36;
  return `
    <g>
      <rect x="${x + 18}" y="${y + 18}" width="${cardW}" height="${cardH}" rx="24" fill="#0B1120" stroke="#38BDF8" stroke-opacity="0.6" stroke-width="2.5" />
      <text x="${x + 42}" y="${y + 68}" fill="#94A3B8" font-family="'Be Vietnam Pro', sans-serif" font-size="18" font-weight="600">
        ĐIỂM NHẤN DỮ LIỆU
      </text>
      <text x="${x + 42}" y="${y + 142}" fill="#FACC15" font-family="'JetBrains Mono', monospace" font-size="56" font-weight="800">
        ${escapeHtml(metrics.mainStat)}
      </text>
      <text x="${x + 42}" y="${y + 186}" fill="#E2E8F0" font-family="'Be Vietnam Pro', sans-serif" font-size="20" font-weight="800">
        ${escapeHtml(metrics.items[0].label)}
      </text>

      <rect x="${x + 36 + cardW}" y="${y + 18}" width="${cardW}" height="${cardH}" rx="24" fill="#0B1120" stroke="#F472B6" stroke-opacity="0.6" stroke-width="2.5" />
      <text x="${x + 60 + cardW}" y="${y + 68}" fill="#94A3B8" font-family="'Be Vietnam Pro', sans-serif" font-size="18" font-weight="600">
        CHỈ SỐ TỐI ƯU
      </text>
      <text x="${x + 60 + cardW}" y="${y + 142}" fill="#38BDF8" font-family="'JetBrains Mono', monospace" font-size="56" font-weight="800">
        ${escapeHtml(metrics.items[1].display)}
      </text>
      <text x="${x + 60 + cardW}" y="${y + 186}" fill="#E2E8F0" font-family="'Be Vietnam Pro', sans-serif" font-size="20" font-weight="800">
        ${escapeHtml(metrics.items[1].label)}
      </text>
    </g>`;
}

/**
 * Vẽ khung hình Motion Graphics SVG chất lượng studio (Font Be Vietnam Pro + JetBrains Mono,
 * Infographic động 4 chế độ, Sóng âm Equalizer, và Phụ đề Karaoke Highlight từng cụm từ)
 */
function renderSceneSlidePng(opts: {
  width: number;
  height: number;
  aspect: '16:9' | '9:16';
  headline: string;
  subline: string;
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
  const animProgress = Math.min(1, Math.max(0.35, opts.progressRatio ?? 0.7));

  // Lề an toàn chuẩn TikTok/Reels/Shorts (136px mỗi bên trên 9:16 để không bị cột nút Like/Comment/Share che)
  const padX = isVert ? 136 : 160;
  const innerPadX = isVert ? 38 : 44;
  const topY = isVert ? 195 : 86;
  const headlineSize = isVert ? 48 : 48;
  const bodySize = isVert ? 33 : 30;
  const captionSize = isVert ? 42 : 38;

  const headlineLines = wrapTextLines(opts.headline, isVert ? 20 : 34, 3);
  const sublineLines = wrapTextLines(opts.subline, isVert ? 27 : 48, 5);

  const speakerLabel = opts.speaker === 'accent' ? '★ ACCENT • ĐIỂM NHẤN' : '● LEAD • DẪN CHÍNH';
  const speakerColor = opts.speaker === 'accent' ? '#F472B6' : '#38BDF8';
  const progressWidth = Math.max(28, Math.round((width - padX * 2) * animProgress));

  // Tô màu vàng/cyan nổi bật cho dòng cuối của Headline để tạo điểm nhấn thị giác
  const headlineTspans = headlineLines
    .map((line, idx) => {
      const isLastLine = idx === headlineLines.length - 1 && headlineLines.length > 1;
      const lineColor = isLastLine ? '#FACC15' : palette.text;
      return `<tspan x="${padX + innerPadX}" dy="${idx === 0 ? 0 : Math.round(headlineSize * 1.26)}" fill="${lineColor}">${escapeHtml(line)}</tspan>`;
    })
    .join('');

  const sublineTspans = sublineLines
    .map(
      (line, idx) =>
        `<tspan x="${padX + innerPadX}" dy="${idx === 0 ? 0 : Math.round(bodySize * 1.38)}">${escapeHtml(line)}</tspan>`
    )
    .join('');

  // Sóng âm Equalizer 10 cột nhảy động theo từng frame
  const eqBarsSvg = Array.from({ length: 10 })
    .map((_, idx) => {
      const barH = 12 + ((idx * 13 + frameIdx * 17) % 28);
      const bx = width - padX - 130 + idx * 13;
      const by = topY + 59 - Math.round(barH / 2);
      return `<rect x="${bx}" y="${by}" width="7" height="${barH}" rx="3.5" fill="${speakerColor}" />`;
    })
    .join('');

  const cardTopY = isVert ? 310 : 190;
  const cardHeight = isVert ? 945 : 560;
  const captionBoxY = isVert ? 1315 : 805;

  // Vùng Infographic nằm ở nửa dưới của Main Card (trên 9:16) hoặc bên phải (trên 16:9)
  const metrics = extractMetricsFromText(opts.headline, opts.subline, opts.dataPoints);
  const infoX = isVert ? padX + 28 : padX + Math.round((width - padX * 2) * 0.54);
  const infoY = isVert ? cardTopY + 565 : cardTopY + 55;
  const infoW = isVert ? width - padX * 2 - 56 : Math.round((width - padX * 2) * 0.43);
  const infoH = isVert ? 345 : cardHeight - 110;

  const infographicSvg = renderInfographicZoneSvg({
    x: infoX,
    y: infoY,
    w: infoW,
    h: infoH,
    styleIndex: sceneIdx,
    animProgress,
    frameIndex: frameIdx,
    palette,
    speakerColor,
    metrics,
  });

  // Thanh phụ đề Karaoke có Highlight cụm từ đang đọc
  const windowWords =
    opts.captionWordsWindow && opts.captionWordsWindow.length > 0
      ? opts.captionWordsWindow
      : opts.subline.trim().split(/\s+/).slice(0, isVert ? 5 : 7);
  const activeIdx = opts.activeWordIndexInWindow ?? 0;

  const karaokeTspans = windowWords
    .map((w, idx) => {
      const isFocused = idx === activeIdx || idx === activeIdx + 1;
      const fill = isFocused ? '#FACC15' : '#F8FAFC';
      const prefix = idx === 0 ? '' : ' ';
      return `<tspan fill="${fill}" font-size="${isFocused ? captionSize + 4 : captionSize}">${escapeHtml(prefix + w)}</tspan>`;
    })
    .join('');

  // Hiệu ứng dịch chuyển nhẹ của quả cầu ánh sáng nền theo frame
  const orbOffsetX = (frameIdx % 6) * 14;
  const orbOffsetY = (frameIdx % 6) * 10;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#060913" />
        <stop offset="50%" stop-color="#0F172A" />
        <stop offset="100%" stop-color="#060913" />
      </linearGradient>
      <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${palette.primary}" />
        <stop offset="50%" stop-color="${palette.secondary}" />
        <stop offset="100%" stop-color="${palette.accent}" />
      </linearGradient>
      <pattern id="cyberGrid" width="60" height="60" patternUnits="userSpaceOnUse">
        <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#1E293B" stroke-width="1" stroke-opacity="0.55" />
      </pattern>
    </defs>

    <!-- Background + Cyber Grid + Moving Glow Orbs -->
    <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
    <rect width="${width}" height="${height}" fill="url(#cyberGrid)" />
    <circle cx="${Math.round(width * 0.82) - orbOffsetX}" cy="${Math.round(height * 0.18) + orbOffsetY}" r="${isVert ? 270 : 230}" fill="${palette.primary}" opacity="0.22" />
    <circle cx="${Math.round(width * 0.18) + orbOffsetX}" cy="${Math.round(height * 0.78) - orbOffsetY}" r="${isVert ? 290 : 250}" fill="${palette.accent}" opacity="0.18" />

    <!-- Top Progress Bar -->
    <rect x="${padX}" y="${topY}" width="${width - padX * 2}" height="12" rx="6" fill="#1E293B" />
    <rect x="${padX}" y="${topY}" width="${progressWidth}" height="12" rx="6" fill="url(#accentGrad)" />

    <!-- Scene Counter Pill + Speaker Badge + Live Audio Equalizer -->
    <rect x="${padX}" y="${topY + 32}" width="148" height="50" rx="16" fill="#1E293B" stroke="#475569" stroke-width="1.5" />
    <text x="${padX + 74}" y="${topY + 64}" text-anchor="middle" fill="#FACC15" font-family="'JetBrains Mono', monospace" font-size="21" font-weight="800">
      SCENE 0${sceneIdx + 1}
    </text>

    <rect x="${padX + 162}" y="${topY + 32}" width="320" height="50" rx="25" fill="${speakerColor}" fill-opacity="0.16" stroke="${speakerColor}" stroke-width="2" />
    <text x="${padX + 322}" y="${topY + 64}" text-anchor="middle" fill="${speakerColor}" font-family="'Be Vietnam Pro', sans-serif" font-size="21" font-weight="800">
      ${escapeHtml(speakerLabel)}
    </text>

    ${eqBarsSvg}

    <!-- Main Studio Glass Card -->
    <rect x="${padX}" y="${cardTopY}" width="${width - padX * 2}" height="${cardHeight}" rx="36" fill="#090D16" fill-opacity="0.88" stroke="${palette.primary}" stroke-opacity="0.55" stroke-width="3" />
    <rect x="${padX}" y="${cardTopY}" width="14" height="${cardHeight}" rx="7" fill="url(#accentGrad)" />

    <!-- Headline Text (Be Vietnam Pro ExtraBold) -->
    <text x="${padX + innerPadX}" y="${cardTopY + 82}" fill="${palette.text}" font-family="'Be Vietnam Pro', sans-serif" font-size="${headlineSize}" font-weight="800">
      ${headlineTspans}
    </text>

    <!-- Neon Accent Divider -->
    <rect x="${padX + innerPadX}" y="${cardTopY + 84 + headlineLines.length * Math.round(headlineSize * 1.2)}" width="210" height="7" rx="3.5" fill="url(#accentGrad)" />

    <!-- Segment Narration Text (Be Vietnam Pro SemiBold) -->
    <text x="${padX + innerPadX}" y="${cardTopY + 142 + headlineLines.length * Math.round(headlineSize * 1.2)}" fill="#E2E8F0" font-family="'Be Vietnam Pro', sans-serif" font-size="${bodySize}" font-weight="600">
      ${sublineTspans}
    </text>

    <!-- Visual Infographic Centerpiece -->
    ${infographicSvg}

    <!-- Bottom Karaoke Caption Pill Box -->
    <rect x="${padX}" y="${captionBoxY}" width="${width - padX * 2}" height="142" rx="30" fill="#060913" fill-opacity="0.95" stroke="${speakerColor}" stroke-width="3.5" />
    <rect x="${padX + 24}" y="${captionBoxY + 18}" width="92" height="28" rx="9" fill="${speakerColor}" />
    <text x="${padX + 70}" y="${captionBoxY + 38}" text-anchor="middle" fill="#060913" font-family="'JetBrains Mono', monospace" font-size="16" font-weight="800">
      ${opts.speaker === 'accent' ? 'ACCENT' : 'LEAD'}
    </text>
    <text x="${Math.round(width / 2)}" y="${captionBoxY + 96}" text-anchor="middle" font-family="'Be Vietnam Pro', sans-serif" font-weight="800">
      ${karaokeTspans}
    </text>
  </svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: {
      fontFiles: BUNDLED_FONT_FILES,
      loadSystemFonts: true,
      defaultFontFamily: 'Be Vietnam Pro',
    },
  });
  const pngBuffer = resvg.render().asPng();
  fs.writeFileSync(opts.outputPngPath, pngBuffer);
}

/**
 * Render composition HyperFrames ra MP4 và tạo ảnh Snapshot (Mục 7.1 & Bước 13/14)
 * - Gọi trực tiếp `npx hyperframes render` nếu CLI đã được cài đặt
 * - Nếu chưa có CLI ngoài, kết xuất chuỗi khung hình Motion Graphics + Infographic + Karaoke Highlight bằng `@resvg/resvg-js` & FFmpeg.
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
  dataPoints?: Array<{ label: string; value: number }>;
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

    // Chia mỗi segment thành các bước nhảy Karaoke 2 từ (trong cửa sổ 5 từ cho 9:16, 7 từ cho 16:9)
    // giúp chữ Karaoke đổi màu từng cụm 2 từ liên tục và Infographic/Sóng âm chuyển động mượt
    const windowSize = opts.aspect === '9:16' ? 5 : 7;
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
    const frameDuration = Math.max(0.45, Number((opts.durationSec / slideFrames.length).toFixed(2)));

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
          ? `scale=${width}:${height},fps=30,fade=t=in:st=0:d=0.15`
          : i === slideFrames.length - 1
            ? `scale=${width}:${height},fps=30,fade=t=out:st=${Math.max(0.08, frameDuration - 0.16).toFixed(2)}:d=0.15`
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
