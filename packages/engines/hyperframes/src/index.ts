import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import type {
  ScriptScene,
  StoryboardScene,
  VisualCue,
  WordTiming,
} from '@videoforge/core';
import {
  captureHtmlSnapshotWithCdp,
  detectLocalChromiumExecutable,
  renderHtmlWithCdp30Fps,
} from './cdpRenderer.js';

export {
  captureHtmlSnapshotWithCdp,
  detectLocalChromiumExecutable,
  renderHtmlWithCdp30Fps,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONTS_DIR = path.resolve(__dirname, '../fonts');

const FONT_EXTRABOLD_PATH = path.join(FONTS_DIR, 'BeVietnamPro-ExtraBold.ttf');
const FONT_SEMIBOLD_PATH = path.join(FONTS_DIR, 'BeVietnamPro-SemiBold.ttf');
const FONT_MONO_PATH = path.join(FONTS_DIR, 'JetBrainsMono-Bold.ttf');

const BUNDLED_FONT_FILES = [
  FONT_EXTRABOLD_PATH,
  FONT_SEMIBOLD_PATH,
  FONT_MONO_PATH,
].filter((f) => fs.existsSync(f));

export interface BuildHyperFramesSceneInput {
  scene: ScriptScene;
  storyboard: StoryboardScene;
  aspect: '16:9' | '9:16';
  words: WordTiming[];
  timedCues?: VisualCue[];
  bgImagePath?: string;
  brollVideoPath?: string;
  customHtmlStage?: string;
  customCss?: string;
  sceneIndex?: number;
  leadCaptionColor: string;
  accentCaptionColor: string;
  fontHeading: string;
  fontBody: string;
}

function toLocalOrRemoteUrl(fileOrUrl?: string): string {
  if (!fileOrUrl) return '';
  if (/^(https?:|data:|file:)/i.test(fileOrUrl)) return fileOrUrl;
  if (fs.existsSync(fileOrUrl)) {
    return pathToFileURL(path.resolve(fileOrUrl)).href;
  }
  return '';
}

function isLightHexColor(hex: string): boolean {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return false;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58;
}

/**
 * Làm sạch HTML/CSS do LLM sinh ra để đảm bảo không chứa thẻ script nguy hiểm hoặc phá vỡ Safe Zone
 */
export function sanitizeGenerativeStage(rawHtml?: string, rawCss?: string): {
  html: string;
  css: string;
} {
  const html = (rawHtml || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .trim();

  const css = (rawCss || '')
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/@import[^;]+;/gi, '')
    .replace(/position\s*:\s*fixed/gi, 'position: absolute')
    .trim();

  return { html, css };
}

/**
 * Tính toán các VisualCue mặc định có thời gian thực nếu cảnh chưa có sẵn timedCues
 */
export function buildDefaultTimedCues(
  scene: ScriptScene,
  durationSec: number,
  words?: WordTiming[]
): VisualCue[] {
  const rawCues = scene.visualCues && scene.visualCues.length > 0 ? scene.visualCues : [];
  const effects: Array<VisualCue['effect']> = [
    'slam_impact',
    'marker_highlight',
    'counter_stat',
    'split_versus',
    'terminal_type',
  ];

  let cues: VisualCue[] = rawCues.map((c) => ({ ...c }));

  if (cues.length === 0) {
    cues = scene.segments.map((seg, idx) => {
      const numMatch = seg.text.match(/(\d+(?:[.,]\d+)?\s*(?:%|phần trăm|x|lần|nm|tỷ|triệu|k|giây|năm))/i);
      const cleanWords = seg.text.replace(/[.,:;!?()"“”']/g, '').trim().split(/\s+/);
      const phrase = seg.emphasis || (numMatch ? numMatch[0] : cleanWords.slice(0, 3).join(' '));
      return {
        triggerPhrase: phrase,
        displayHeadline: phrase.toUpperCase().slice(0, 28),
        subLabel: trimSentence(seg.text, 56),
        effect: numMatch ? 'counter_stat' : effects[idx % effects.length],
        sfx: numMatch ? 'impact' : idx === 0 ? 'whoosh' : 'pop',
      };
    });
  }

  // Chuẩn hóa thời gian từ theo phạm vi [0, durationSec] của cảnh
  const sceneWords = words && words.length > 0 ? words : [];
  const minWordStart = sceneWords.length > 0 ? sceneWords[0]!.start : 0;
  const maxWordEnd =
    sceneWords.length > 0 ? sceneWords[sceneWords.length - 1]!.end : durationSec;
  const wordSpan = Math.max(0.5, maxWordEnd - minWordStart);

  const slotDur = durationSec / Math.max(1, cues.length);

  return cues.map((cue, idx) => {
    if (typeof cue.startSec === 'number' && typeof cue.endSec === 'number') {
      return cue;
    }

    // Thử tìm vị trí triggerPhrase trong mảng words
    const triggerTokens = cue.triggerPhrase
      .toLowerCase()
      .replace(/[.,:;!?()"“”']/g, '')
      .split(/\s+/)
      .filter(Boolean);

    let matchedStart: number | undefined;
    if (triggerTokens.length > 0 && sceneWords.length > 0) {
      const firstToken = triggerTokens[0]!;
      const foundIdx = sceneWords.findIndex((w) =>
        w.text.toLowerCase().replace(/[.,:;!?()"“”']/g, '').includes(firstToken)
      );
      if (foundIdx >= 0) {
        const rawStart = sceneWords[foundIdx]!.start;
        matchedStart = ((rawStart - minWordStart) / wordSpan) * durationSec;
      }
    }

    const startSec = Number(
      Math.min(durationSec - 0.5, Math.max(0, matchedStart ?? idx * slotDur)).toFixed(2)
    );
    const nextSlotEnd = Math.min(durationSec, (idx + 1) * slotDur);
    const endSec = Number(Math.max(startSec + 0.8, nextSlotEnd).toFixed(2));

    return {
      ...cue,
      startSec,
      endSec,
    };
  });
}

function trimSentence(str: string, maxLen: number): string {
  const clean = str.trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

/**
 * Sinh HTML5 + CSS3 + Deterministic 30fps Motion Engine chuẩn VideoForge 2.0 (Hạng mục 1, 2, 3):
 * - Safe Zone 9:16: Top 200px, Bottom 380px, Left/Right 136px
 * - Nạp trực tiếp BeVietnamPro-ExtraBold.ttf & JetBrainsMono-Bold.ttf từ đĩa cứng
 * - Lớp nền ảnh bài báo / B-Roll với chuyển động Ken Burns mượt 30fps
 * - Hỗ trợ customHtmlStage + customCss do LLM đạo diễn + 7 hiệu ứng VisualCue khớp mili-giây giọng đọc
 */
export function generateHyperFramesCompositionHtml(input: BuildHyperFramesSceneInput): string {
  const width = input.aspect === '16:9' ? 1920 : 1080;
  const height = input.aspect === '16:9' ? 1080 : 1920;
  const isVertical = input.aspect === '9:16';
  const duration = Math.max(1, input.scene.durationSec);
  const { primary, secondary, accent, bg, text } = input.storyboard.palette;
  const isLightTheme = isLightHexColor(bg);
  const concept = input.storyboard.visualConcept || 'cyber_hud';

  // Vùng an toàn bắt buộc theo Đặc tả Mục 1: 9:16 -> Trái/Phải 136px, Trên 200px, Dưới 380px
  const safeTopPx = isVertical ? 200 : 84;
  const safeBottomPx = isVertical ? 380 : 92;
  const safeSidePx = isVertical ? 136 : 140;
  const captionFontSize = isVertical ? 50 : 40;
  const headlineFontSize = isVertical ? 54 : 52;

  const fontExtraBoldUrl = toLocalOrRemoteUrl(FONT_EXTRABOLD_PATH);
  const fontSemiBoldUrl = toLocalOrRemoteUrl(FONT_SEMIBOLD_PATH);
  const fontMonoUrl = toLocalOrRemoteUrl(FONT_MONO_PATH);
  const bgImgUrl = toLocalOrRemoteUrl(input.bgImagePath || input.storyboard.bgImagePath);

  // Chuẩn hóa thời gian từ về [0, duration] của riêng cảnh này
  const rawWords = input.words || [];
  const minW = rawWords.length > 0 ? rawWords[0]!.start : 0;
  const maxW = rawWords.length > 0 ? rawWords[rawWords.length - 1]!.end : duration;
  const spanW = Math.max(0.4, maxW - minW);

  const normalizedWords =
    rawWords.length > 0
      ? rawWords.map((w) => ({
          text: w.text,
          start: Number((((w.start - minW) / spanW) * duration).toFixed(3)),
          end: Number((((w.end - minW) / spanW) * duration).toFixed(3)),
          speaker: w.speaker,
        }))
      : (() => {
          const tokens: Array<{ text: string; speaker: 'lead' | 'accent' }> = [];
          for (const seg of input.scene.segments) {
            for (const tk of seg.text.trim().split(/\s+/).filter(Boolean)) {
              tokens.push({ text: tk, speaker: seg.speaker });
            }
          }
          const step = duration / Math.max(1, tokens.length);
          return tokens.map((t, i) => ({
            text: t.text,
            start: Number((i * step).toFixed(3)),
            end: Number(((i + 1) * step).toFixed(3)),
            speaker: t.speaker,
          }));
        })();

  const timedCues =
    input.timedCues && input.timedCues.length > 0
      ? input.timedCues
      : buildDefaultTimedCues(input.scene, duration, input.words);

  const sanitized = sanitizeGenerativeStage(
    input.customHtmlStage || input.storyboard.customHtmlStage,
    input.customCss || input.storyboard.customCss
  );

  const cardSurface = isLightTheme
    ? 'rgba(255, 255, 255, 0.90)'
    : 'rgba(10, 15, 28, 0.86)';
  const cardBorder = isLightTheme ? `${primary}55` : `${primary}88`;
  const subTextColor = isLightTheme ? '#334155' : '#CBD5E1';

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>VideoForge 2.0 Generative Scene — ${escapeHtml(input.scene.id)} (${input.aspect})</title>
  <style>
    ${
      fontExtraBoldUrl
        ? `@font-face { font-family: 'Be Vietnam Pro'; src: url('${fontExtraBoldUrl}') format('truetype'); font-weight: 800; font-style: normal; }`
        : ''
    }
    ${
      fontSemiBoldUrl
        ? `@font-face { font-family: 'Be Vietnam Pro'; src: url('${fontSemiBoldUrl}') format('truetype'); font-weight: 600; font-style: normal; }`
        : ''
    }
    ${
      fontMonoUrl
        ? `@font-face { font-family: 'JetBrains Mono'; src: url('${fontMonoUrl}') format('truetype'); font-weight: 700; font-style: normal; }`
        : ''
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: ${bg};
      color: ${text};
      font-family: 'Be Vietnam Pro', '${input.fontHeading}', sans-serif;
      font-weight: 800;
      -webkit-font-smoothing: antialiased;
    }

    #composition-root {
      position: relative;
      width: ${width}px;
      height: ${height}px;
      padding: ${safeTopPx}px ${safeSidePx}px ${safeBottomPx}px ${safeSidePx}px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: ${isVertical ? '24px' : '20px'};
      overflow: hidden;
    }

    #bg-layer {
      position: absolute;
      inset: 0;
      z-index: 0;
      overflow: hidden;
      background:
        radial-gradient(circle at 18% 18%, ${primary}38 0%, transparent 52%),
        radial-gradient(circle at 84% 78%, ${accent}32 0%, transparent 54%),
        linear-gradient(145deg, ${bg} 0%, ${isLightTheme ? '#F1F5F9' : '#060913'} 100%);
    }

    #broll-img {
      position: absolute;
      inset: -6%;
      width: 112%;
      height: 112%;
      object-fit: cover;
      opacity: ${bgImgUrl ? (isLightTheme ? '0.24' : '0.36') : '0'};
      filter: contrast(1.06) saturate(1.12);
      transform-origin: center center;
    }

    #bg-scrim {
      position: absolute;
      inset: 0;
      background: ${
        isLightTheme
          ? `linear-gradient(180deg, ${bg}d8 0%, ${bg}b0 48%, ${bg}ea 100%)`
          : `linear-gradient(180deg, ${bg}dc 0%, ${bg}98 48%, ${bg}f0 100%)`
      };
    }

    #bg-pattern {
      position: absolute;
      inset: -64px;
      background-image:
        linear-gradient(to right, ${isLightTheme ? 'rgba(15,23,42,0.06)' : 'rgba(148,163,184,0.08)'} 1px, transparent 1px),
        linear-gradient(to bottom, ${isLightTheme ? 'rgba(15,23,42,0.06)' : 'rgba(148,163,184,0.08)'} 1px, transparent 1px);
      background-size: 64px 64px;
    }

    .hud-header {
      position: relative;
      z-index: 3;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .progress-track {
      width: 100%;
      height: 8px;
      border-radius: 999px;
      background: ${isLightTheme ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.12)'};
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      width: 0%;
      border-radius: 999px;
      background: linear-gradient(90deg, ${primary}, ${secondary}, ${accent});
    }

    .hud-meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .concept-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 18px;
      border-radius: 999px;
      background: linear-gradient(90deg, ${primary}, ${secondary});
      color: #FFFFFF;
      font-family: 'JetBrains Mono', monospace;
      font-size: ${isVertical ? '19px' : '17px'};
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      box-shadow: 0 8px 24px ${primary}44;
    }

    .headline-banner {
      padding: ${isVertical ? '20px 26px' : '16px 24px'};
      border-radius: 24px;
      background: ${cardSurface};
      border: 2px solid ${cardBorder};
      border-left: 10px solid ${accent};
      backdrop-filter: blur(12px);
      box-shadow: 0 16px 40px rgba(0,0,0,0.22);
    }

    .headline-title {
      font-size: ${headlineFontSize}px;
      line-height: 1.15;
      font-weight: 800;
      color: ${text};
      letter-spacing: -0.02em;
    }

    #generative-stage {
      position: relative;
      z-index: 3;
      flex: 1;
      width: 100%;
      max-width: 100%;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 18px;
    }

    #cue-kinetic-card {
      position: relative;
      padding: ${isVertical ? '30px 32px' : '24px 32px'};
      border-radius: 28px;
      background: ${cardSurface};
      border: 2.5px solid ${accent};
      box-shadow: 0 22px 50px rgba(0, 0, 0, 0.32);
      overflow: hidden;
    }

    .cue-effect-tag {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 10px;
      background: ${accent};
      color: #060913;
      font-family: 'JetBrains Mono', monospace;
      font-size: 17px;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 14px;
    }

    .cue-main-wrap {
      position: relative;
      display: inline-block;
      max-width: 100%;
    }

    #cue-marker-bar {
      position: absolute;
      left: -8px;
      right: -8px;
      bottom: 4px;
      height: 42%;
      background: ${accent}55;
      border-radius: 8px;
      z-index: 0;
      transform-origin: left center;
      transform: scaleX(0);
    }

    #cue-display-headline {
      position: relative;
      z-index: 1;
      font-size: ${isVertical ? '52px' : '50px'};
      line-height: 1.14;
      font-weight: 800;
      color: ${text};
      word-break: break-word;
    }

    #cue-sub-label {
      margin-top: 12px;
      font-size: ${isVertical ? '26px' : '24px'};
      line-height: 1.35;
      font-weight: 600;
      color: ${subTextColor};
    }

    #custom-llm-stage {
      position: relative;
      width: 100%;
      max-height: 48%;
      overflow: hidden;
    }

    .caption-bar {
      position: relative;
      z-index: 4;
      padding: ${isVertical ? '22px 28px' : '16px 28px'};
      border-radius: 26px;
      background: rgba(8, 12, 22, 0.94);
      border: 2.5px solid ${primary}aa;
      min-height: ${isVertical ? '124px' : '96px'};
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 10px 14px;
      box-shadow: 0 14px 34px rgba(0,0,0,0.42);
    }

    .caption-word {
      font-size: ${captionFontSize}px;
      font-weight: 800;
      color: #F8FAFC;
      line-height: 1.18;
    }

    .caption-word.lead { color: #F8FAFC; }
    .caption-word.accent { color: #FDE047; }
    .caption-word.active {
      color: ${accent};
      transform: scale(1.12);
      text-shadow: 0 0 24px ${accent}88;
    }

    ${sanitized.css}
  </style>
</head>
<body>
  <div id="bg-layer">
    ${bgImgUrl ? `<img id="broll-img" src="${escapeHtml(bgImgUrl)}" alt="B-Roll" />` : ''}
    <div id="bg-scrim"></div>
    <div id="bg-pattern"></div>
  </div>

  <div
    id="composition-root"
    data-composition-id="${escapeHtml(input.scene.id)}_${input.aspect.replace(':', 'x')}"
    data-start="0"
    data-duration="${duration}"
    data-width="${width}"
    data-height="${height}"
    data-track-index="0"
  >
    <div class="hud-header" data-track-index="1" data-start="0" data-duration="${duration}">
      <div class="progress-track">
        <div class="progress-fill" id="hud-progress"></div>
      </div>
      <div class="hud-meta-row">
        <div class="concept-pill">
          <span>0${(input.sceneIndex ?? 0) + 1}</span>
          <span>•</span>
          <span>${escapeHtml(concept.replace(/_/g, ' '))}</span>
        </div>
      </div>
      <div class="headline-banner" id="headline-banner">
        <h1 class="headline-title">${escapeHtml(input.scene.onScreenText)}</h1>
      </div>
    </div>

    <div id="generative-stage" data-track-index="2" data-start="0" data-duration="${duration}">
      <div id="cue-kinetic-card">
        <div class="cue-effect-tag" id="cue-tag">KEY POINT</div>
        <div>
          <div class="cue-main-wrap">
            <div id="cue-marker-bar"></div>
            <div id="cue-display-headline">${escapeHtml(timedCues[0]?.displayHeadline || input.scene.onScreenText)}</div>
          </div>
        </div>
        <div id="cue-sub-label">${escapeHtml(timedCues[0]?.subLabel || input.scene.segments[0]?.text || '')}</div>
      </div>

      ${sanitized.html ? `<div id="custom-llm-stage">${sanitized.html}</div>` : ''}
    </div>

    <div class="caption-bar" id="dynamic-caption" data-track-index="99" data-start="0" data-duration="${duration}">
      <span class="caption-word lead">${escapeHtml(normalizedWords[0]?.text || '')}</span>
    </div>
  </div>

  <script>
    window.__sceneDuration = ${duration};
    window.__isVertical = ${isVertical ? 'true' : 'false'};
    window.__words = ${JSON.stringify(normalizedWords)};
    window.__cues = ${JSON.stringify(timedCues)};
    window.__leadColor = ${JSON.stringify(input.leadCaptionColor || '#38BDF8')};
    window.__accentColor = ${JSON.stringify(input.accentCaptionColor || '#F472B6')};

    function clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }

    function easeOutBack(x) {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }

    function easeOutCubic(x) {
      return 1 - Math.pow(1 - x, 3);
    }

    window.seekFrame = function(timeSec) {
      const dur = window.__sceneDuration || 5;
      const t = clamp(timeSec, 0, dur);
      const ratio = dur > 0 ? t / dur : 0;

      // 1. Progress bar + Ken Burns B-Roll + Grid drift
      const progEl = document.getElementById('hud-progress');
      if (progEl) progEl.style.width = (ratio * 100).toFixed(2) + '%';

      const brollEl = document.getElementById('broll-img');
      if (brollEl) {
        const scale = 1.0 + ratio * 0.11;
        const tx = Math.sin(ratio * Math.PI) * -18;
        const ty = (ratio - 0.5) * -22;
        brollEl.style.transform = 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) scale(' + scale.toFixed(4) + ')';
      }

      const patEl = document.getElementById('bg-pattern');
      if (patEl) {
        const shift = (ratio * 64).toFixed(1);
        patEl.style.transform = 'translate3d(' + shift + 'px,' + shift + 'px,0)';
      }

      // 2. Entrance animation cho Headline Banner
      const bannerEl = document.getElementById('headline-banner');
      if (bannerEl) {
        const enterP = clamp(t / 0.38, 0, 1);
        const eased = easeOutCubic(enterP);
        bannerEl.style.opacity = eased.toFixed(3);
        bannerEl.style.transform = 'translateY(' + ((1 - eased) * -26).toFixed(1) + 'px)';
      }

      // 3. Keyword-Driven VisualCue Kinetic Engine (7 hiệu ứng vật lý 30fps)
      const cues = window.__cues || [];
      let activeCue = cues[0];
      let cueIndex = 0;
      for (let i = 0; i < cues.length; i++) {
        const c = cues[i];
        const s = typeof c.startSec === 'number' ? c.startSec : 0;
        const e = typeof c.endSec === 'number' ? c.endSec : dur;
        if (t >= s && t <= e + 0.05) {
          activeCue = c;
          cueIndex = i;
          break;
        }
        if (t > e) {
          activeCue = c;
          cueIndex = i;
        }
      }

      if (activeCue) {
        const cStart = typeof activeCue.startSec === 'number' ? activeCue.startSec : 0;
        const localT = Math.max(0, t - cStart);
        const cardEl = document.getElementById('cue-kinetic-card');
        const headEl = document.getElementById('cue-display-headline');
        const subEl = document.getElementById('cue-sub-label');
        const tagEl = document.getElementById('cue-tag');
        const markerEl = document.getElementById('cue-marker-bar');

        if (tagEl) {
          tagEl.textContent = 'POINT 0' + (cueIndex + 1) + ' • ' + String(activeCue.effect || 'FOCUS').replace(/_/g, ' ');
        }
        if (subEl) {
          subEl.textContent = activeCue.subLabel || activeCue.triggerPhrase || '';
        }

        const rawHeadline = String(activeCue.displayHeadline || activeCue.triggerPhrase || '').toUpperCase();
        const effect = activeCue.effect || 'slam_impact';

        if (markerEl) markerEl.style.transform = 'scaleX(0)';
        if (headEl) headEl.style.textShadow = 'none';

        if (effect === 'slam_impact') {
          const p = clamp(localT / 0.28, 0, 1);
          const scale = p < 1 ? 1.65 - 0.65 * easeOutBack(p) : 1.0;
          const shake = localT > 0.18 && localT < 0.34 ? Math.sin(localT * 90) * 5 : 0;
          if (headEl) headEl.textContent = rawHeadline;
          if (cardEl) {
            cardEl.style.transform = 'translateX(' + shake.toFixed(1) + 'px) scale(' + scale.toFixed(3) + ')';
            cardEl.style.opacity = clamp(localT / 0.12, 0.2, 1).toFixed(3);
          }
        } else if (effect === 'marker_highlight') {
          const sweep = easeOutCubic(clamp(localT / 0.42, 0, 1));
          if (headEl) headEl.textContent = rawHeadline;
          if (markerEl) markerEl.style.transform = 'scaleX(' + sweep.toFixed(3) + ')';
          if (cardEl) {
            cardEl.style.transform = 'translateY(' + ((1 - sweep) * 18).toFixed(1) + 'px)';
            cardEl.style.opacity = '1';
          }
        } else if (effect === 'counter_stat') {
          const countP = 0.22 + 0.78 * easeOutCubic(clamp(localT / 0.65, 0, 1));
          const numMatch = rawHeadline.match(/(\\d+(?:[.,]\\d+)?)/);
          if (numMatch && headEl) {
            const targetVal = parseFloat(numMatch[1].replace(',', '.'));
            const curVal =
              targetVal < 5 && targetVal % 1 === 0
                ? String(targetVal)
                : targetVal % 1 !== 0
                  ? Math.max(0.5, targetVal * countP).toFixed(1)
                  : String(Math.max(1, Math.round(targetVal * countP)));
            headEl.textContent = rawHeadline.replace(numMatch[1], curVal);
          } else if (headEl) {
            headEl.textContent = rawHeadline;
          }
          if (cardEl) {
            cardEl.style.transform = 'scale(' + (0.94 + 0.06 * countP).toFixed(3) + ')';
            cardEl.style.opacity = '1';
          }
        } else if (effect === 'terminal_type') {
          const typeP = clamp(localT / 0.55, 0.1, 1);
          const chars = Math.max(1, Math.round(rawHeadline.length * typeP));
          const cursor = Math.floor(t * 6) % 2 === 0 ? '▌' : '';
          if (headEl) headEl.textContent = rawHeadline.slice(0, chars) + (typeP < 1 ? cursor : '');
          if (cardEl) {
            cardEl.style.transform = 'none';
            cardEl.style.opacity = '1';
          }
        } else if (effect === 'glitch_focus') {
          const glitchActive = localT < 0.32;
          const gx = glitchActive ? (Math.floor(localT * 60) % 2 === 0 ? 6 : -6) : 0;
          if (headEl) {
            headEl.textContent = rawHeadline;
            if (glitchActive) {
              headEl.style.textShadow = '3px 0 #F43F5E, -3px 0 #38BDF8';
            }
          }
          if (cardEl) {
            cardEl.style.transform = 'translateX(' + gx + 'px)';
            cardEl.style.opacity = '1';
          }
        } else if (effect === 'split_versus') {
          const slideP = easeOutCubic(clamp(localT / 0.36, 0, 1));
          if (headEl) headEl.textContent = rawHeadline;
          if (cardEl) {
            cardEl.style.transform = 'translateX(' + ((1 - slideP) * -42).toFixed(1) + 'px)';
            cardEl.style.opacity = slideP.toFixed(3);
          }
        } else {
          // cinematic_minimal
          const fadeP = easeOutCubic(clamp(localT / 0.45, 0, 1));
          if (headEl) {
            headEl.textContent = rawHeadline;
            headEl.style.letterSpacing = ((1 - fadeP) * 0.08).toFixed(3) + 'em';
          }
          if (cardEl) {
            cardEl.style.opacity = fadeP.toFixed(3);
            cardEl.style.transform = 'scale(' + (1.04 - 0.04 * fadeP).toFixed(3) + ')';
          }
        }
      }

      // 4. Custom GSAP timeline hoặc hook tùy chỉnh nếu LLM có định nghĩa
      if (window.__hyperframesTimeline && typeof window.__hyperframesTimeline.seek === 'function') {
        window.__hyperframesTimeline.seek(t);
      }
      if (typeof window.__customSeek === 'function') {
        try { window.__customSeek(t, ratio); } catch (e) {}
      }

      // 5. Thanh phụ đề Karaoke dưới đáy khớp từng từ theo WordTiming[]
      const words = window.__words || [];
      const capEl = document.getElementById('dynamic-caption');
      if (capEl && words.length > 0) {
        let activeIdx = 0;
        for (let i = 0; i < words.length; i++) {
          if (t >= words[i].start && t <= words[i].end + 0.04) {
            activeIdx = i;
            break;
          }
          if (t > words[i].end) activeIdx = i;
        }
        const winSize = window.__isVertical ? 4 : 6;
        const winStart = Math.floor(activeIdx / winSize) * winSize;
        const slice = words.slice(winStart, winStart + winSize);
        const activeSpk = words[activeIdx] ? words[activeIdx].speaker : 'lead';
        capEl.style.borderColor = activeSpk === 'accent' ? window.__accentColor : window.__leadColor;

        capEl.innerHTML = slice.map(function(w, idx) {
          const realIdx = winStart + idx;
          const isAct = realIdx === activeIdx;
          const cls = 'caption-word ' + w.speaker + (isAct ? ' active' : '');
          const safeTxt = String(w.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          return '<span class="' + cls + '">' + safeTxt.toUpperCase() + '</span>';
        }).join(' ');
      }
    };

    // Khởi tạo trạng thái ban đầu tại t = 0.25s
    window.seekFrame(0.25);
  </script>
</body>
</html>`;
}

/**
 * Kiểm tra Lint & Safe-zone cho composition HTML (Mục 1 & Mục 13)
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
    if (captionMatch && captionMatch[1] && parseInt(captionMatch[1], 10) < 48) {
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

function stripTrailingStopWords(text: string): string {
  return text
    .replace(/[,:;!?()"“”']|(?<![0-9])\.(?![0-9])/g, '')
    .replace(/\s+(?:với|trên|trong|của|và|để|cho|tại|bằng|nhờ|từ|về|như|khi|là|có|được|đang|sẽ|mà|thì|ở)\s*$/i, '')
    .trim();
}

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

/**
 * Vẽ khung hình SVG dự phòng đa VisualCue (dùng khi máy chủ không cài Edge/Chrome)
 */
function renderFallbackCueSlidePng(opts: {
  width: number;
  height: number;
  aspect: '16:9' | '9:16';
  headline: string;
  cueHeadline: string;
  cueSubLabel: string;
  cueTag: string;
  captionWords: string[];
  activeWordIdx: number;
  progressRatio: number;
  palette: { primary: string; secondary: string; accent: string; bg: string; text: string };
  outputPngPath: string;
}) {
  const { width, height, aspect, palette } = opts;
  const isVert = aspect === '9:16';
  const safeSide = isVert ? 136 : 140;
  const safeTop = isVert ? 200 : 84;
  const safeBottom = isVert ? 380 : 96;
  const stageW = width - safeSide * 2;
  const captionY = height - safeBottom - 124;

  const headLines = wrapTextLines(opts.headline.toUpperCase(), isVert ? 22 : 38, 2);
  const cueLines = wrapTextLines(opts.cueHeadline.toUpperCase(), isVert ? 18 : 32, 3);
  const subLines = wrapTextLines(opts.cueSubLabel, isVert ? 32 : 54, 2);

  const captionTspans = opts.captionWords
    .map((w, idx) => {
      const isAct = idx === opts.activeWordIdx;
      return `<tspan fill="${isAct ? palette.accent : '#FFFFFF'}" font-size="${isVert ? 50 : 40}">${escapeHtml((idx === 0 ? '' : ' ') + w.toUpperCase())}</tspan>`;
    })
    .join('');

  const cardY = safeTop + 210;
  const cardH = Math.max(260, captionY - cardY - 32);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bgG" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${palette.bg}" />
        <stop offset="100%" stop-color="#060913" />
      </linearGradient>
      <linearGradient id="accG" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${palette.primary}" />
        <stop offset="50%" stop-color="${palette.secondary}" />
        <stop offset="100%" stop-color="${palette.accent}" />
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bgG)" />
    <circle cx="${Math.round(width * 0.8)}" cy="${Math.round(height * 0.2)}" r="260" fill="${palette.primary}" opacity="0.2" />
    <circle cx="${Math.round(width * 0.2)}" cy="${Math.round(height * 0.78)}" r="260" fill="${palette.accent}" opacity="0.18" />

    <!-- Progress -->
    <rect x="${safeSide}" y="${safeTop}" width="${stageW}" height="10" rx="5" fill="#1E293B" />
    <rect x="${safeSide}" y="${safeTop}" width="${Math.max(24, Math.round(stageW * opts.progressRatio))}" height="10" rx="5" fill="url(#accG)" />

    <!-- Headline Banner -->
    <rect x="${safeSide}" y="${safeTop + 32}" width="${stageW}" height="148" rx="24" fill="#0B1120" fill-opacity="0.92" stroke="${palette.primary}" stroke-width="2" />
    ${headLines
      .map(
        (ln, i) =>
          `<text x="${safeSide + 32}" y="${safeTop + 88 + i * 48}" fill="${palette.text}" font-family="'Be Vietnam Pro', sans-serif" font-size="38" font-weight="800">${escapeHtml(ln)}</text>`
      )
      .join('')}

    <!-- Kinetic VisualCue Stage Card -->
    <rect x="${safeSide}" y="${cardY}" width="${stageW}" height="${cardH}" rx="28" fill="#0F172A" fill-opacity="0.95" stroke="${palette.accent}" stroke-width="3" />
    <rect x="${safeSide + 32}" y="${cardY + 28}" width="260" height="38" rx="10" fill="${palette.accent}" />
    <text x="${safeSide + 162}" y="${cardY + 53}" text-anchor="middle" fill="#060913" font-family="'JetBrains Mono', monospace" font-size="18" font-weight="800">${escapeHtml(opts.cueTag)}</text>

    ${cueLines
      .map(
        (ln, i) =>
          `<text x="${safeSide + 32}" y="${cardY + 128 + i * 58}" fill="${palette.text}" font-family="'Be Vietnam Pro', sans-serif" font-size="${isVert ? 48 : 46}" font-weight="800">${escapeHtml(ln)}</text>`
      )
      .join('')}

    ${subLines
      .map(
        (ln, i) =>
          `<text x="${safeSide + 32}" y="${cardY + 148 + cueLines.length * 58 + i * 36}" fill="#CBD5E1" font-family="'Be Vietnam Pro', sans-serif" font-size="25" font-weight="600">${escapeHtml(ln)}</text>`
      )
      .join('')}

    <!-- Karaoke Caption -->
    <rect x="${safeSide}" y="${captionY}" width="${stageW}" height="124" rx="26" fill="#060913" stroke="${palette.primary}" stroke-width="3" />
    <text x="${Math.round(width / 2)}" y="${captionY + 76}" text-anchor="middle" font-family="'Be Vietnam Pro', sans-serif" font-weight="800">${captionTspans}</text>
  </svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: {
      fontFiles: BUNDLED_FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: 'Be Vietnam Pro',
    },
  });
  fs.writeFileSync(opts.outputPngPath, resvg.render().asPng());
}

export interface RenderHyperFramesSceneOptions {
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
  visualCues?: VisualCue[];
  dataPoints?: Array<{ label: string; value: number }>;
  segments?: Array<{ speaker: 'lead' | 'accent'; text: string; emphasis?: string }>;
  palette: { primary: string; secondary: string; accent: string; bg: string; text: string };
  timeoutSec?: number;
  onProgress?: (percent: number) => void;
}

/**
 * Dự phòng đồng bộ bằng @resvg/resvg-js (luôn thành công 100% kể cả khi không có trình duyệt)
 */
export function renderHyperFramesScene(opts: RenderHyperFramesSceneOptions): {
  clipPath: string;
  snapshotPath?: string;
  usedCli: boolean;
} {
  fs.mkdirSync(path.dirname(opts.outputMp4Path), { recursive: true });
  fs.mkdirSync(opts.sceneDir, { recursive: true });
  const width = opts.aspect === '16:9' ? 1920 : 1080;
  const height = opts.aspect === '16:9' ? 1080 : 1920;
  const suffix = opts.aspect.replace(':', 'x');

  const allWords = (opts.subline || opts.headline).trim().split(/\s+/).filter(Boolean);
  const winSize = opts.aspect === '9:16' ? 4 : 6;
  const cues =
    opts.visualCues && opts.visualCues.length > 0
      ? opts.visualCues
      : [
          {
            triggerPhrase: opts.headline,
            displayHeadline: opts.headline.toUpperCase(),
            subLabel: opts.subline,
            effect: 'slam_impact' as const,
            sfx: 'pop' as const,
          },
        ];

  const stepsCount = Math.max(2, Math.min(12, Math.ceil(allWords.length / 2)));
  const stepDur = Number(Math.max(0.35, opts.durationSec / stepsCount).toFixed(3));
  const subClips: string[] = [];

  for (let i = 0; i < stepsCount; i++) {
    const ratio = (i + 1) / stepsCount;
    const wordCursor = Math.min(allWords.length - 1, Math.floor(ratio * allWords.length));
    const winStart = Math.floor(wordCursor / winSize) * winSize;
    const windowWords = allWords.slice(winStart, winStart + winSize);
    const cue = cues[Math.min(cues.length - 1, Math.floor((i / stepsCount) * cues.length))]!;

    const pngPath = path.join(opts.sceneDir, `_fb_slide_${suffix}_${i}.png`);
    const subMp4 = path.join(opts.sceneDir, `_fb_clip_${suffix}_${i}.mp4`);

    renderFallbackCueSlidePng({
      width,
      height,
      aspect: opts.aspect,
      headline: opts.headline,
      cueHeadline: cue.displayHeadline || cue.triggerPhrase,
      cueSubLabel: cue.subLabel || opts.subline,
      cueTag: `POINT 0${(i % cues.length) + 1} • ${cue.effect}`,
      captionWords: windowWords.length > 0 ? windowWords : [opts.headline],
      activeWordIdx: Math.max(0, wordCursor - winStart),
      progressRatio: ratio,
      palette: opts.palette,
      outputPngPath: pngPath,
    });

    if (i === 0 && opts.snapshotPath) {
      fs.mkdirSync(path.dirname(opts.snapshotPath), { recursive: true });
      fs.copyFileSync(pngPath, opts.snapshotPath);
    }

    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-loop',
        '1',
        '-t',
        String(stepDur),
        '-i',
        pngPath,
        '-vf',
        `scale=${width}:${height},fps=30`,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        subMp4,
      ],
      { stdio: 'ignore' }
    );
    subClips.push(subMp4);
  }

  if (subClips.length === 1) {
    fs.copyFileSync(subClips[0]!, opts.outputMp4Path);
  } else {
    const concatTxt = path.join(opts.sceneDir, `_fb_concat_${suffix}.txt`);
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

  return { clipPath: opts.outputMp4Path, snapshotPath: opts.snapshotPath, usedCli: false };
}

/**
 * Kết xuất chính thức VideoForge 2.0: Ưu tiên chạy HTML5/CSS3/GSAP ở 30fps mượt qua Edge/Chrome CDP,
 * tự động fallback sang @resvg/resvg-js nếu không có trình duyệt.
 */
export async function renderHyperFramesSceneAsync(
  opts: RenderHyperFramesSceneOptions
): Promise<{
  clipPath: string;
  snapshotPath?: string;
  engineMode: 'cdp-30fps' | 'resvg-fallback';
}> {
  const width = opts.aspect === '16:9' ? 1920 : 1080;
  const height = opts.aspect === '16:9' ? 1080 : 1920;

  if (fs.existsSync(opts.htmlPath)) {
    try {
      const ok = await renderHtmlWithCdp30Fps({
        htmlPath: opts.htmlPath,
        outputMp4Path: opts.outputMp4Path,
        snapshotPath: opts.snapshotPath,
        width,
        height,
        durationSec: opts.durationSec,
        fps: 30,
        onProgress: opts.onProgress,
      });
      if (ok && fs.existsSync(opts.outputMp4Path)) {
        return {
          clipPath: opts.outputMp4Path,
          snapshotPath: opts.snapshotPath,
          engineMode: 'cdp-30fps',
        };
      }
    } catch {
      // Rơi về Resvg fallback an toàn
    }
  }

  const fb = renderHyperFramesScene(opts);
  return {
    clipPath: fb.clipPath,
    snapshotPath: fb.snapshotPath,
    engineMode: 'resvg-fallback',
  };
}

/**
 * Chụp nhanh ảnh xem trước (Snapshot) của cảnh bằng CDP (có fallback Resvg nếu thiếu trình duyệt)
 */
export async function captureScenePreviewSnapshotAsync(
  opts: RenderHyperFramesSceneOptions & { snapshotPath: string }
): Promise<{ snapshotPath: string; usedCdp: boolean }> {
  const width = opts.aspect === '16:9' ? 1920 : 1080;
  const height = opts.aspect === '16:9' ? 1080 : 1920;

  if (fs.existsSync(opts.htmlPath)) {
    try {
      const ok = await captureHtmlSnapshotWithCdp({
        htmlPath: opts.htmlPath,
        width,
        height,
        seekSec: Math.min(1.2, Math.max(0.35, opts.durationSec * 0.35)),
        outputJpgPath: opts.snapshotPath,
      });
      if (ok && fs.existsSync(opts.snapshotPath)) {
        return { snapshotPath: opts.snapshotPath, usedCdp: true };
      }
    } catch {
      // Fallback sang Resvg
    }
  }

  renderHyperFramesScene({ ...opts, durationSec: 1 });
  return { snapshotPath: opts.snapshotPath, usedCdp: false };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
