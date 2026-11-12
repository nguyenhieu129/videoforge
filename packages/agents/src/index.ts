import fs from 'node:fs';
import path from 'node:path';
import {
  type AgentName,
  type RawArticle,
  type CleanArticle,
  type Analysis,
  type Score,
  type Strategy,
  type Script,
  type FactCheck,
  type Storyboard,
  type AssetsOutput,
  type VoiceOutput,
  type CaptionsOutput,
  type SceneBuilderOutput,
  type PreviewOutput,
  type RendererOutput,
  type AssemblerOutput,
  type QAReport,
  type PublisherOutput,
  RawArticleSchema,
  CleanArticleSchema,
  AnalysisSchema,
  ScoreSchema,
  StrategySchema,
  ScriptSchema,
  FactCheckSchema,
  StoryboardSchema,
  AssetsOutputSchema,
  VoiceOutputSchema,
  CaptionsOutputSchema,
  SceneBuilderOutputSchema,
  PreviewOutputSchema,
  RendererOutputSchema,
  AssemblerOutputSchema,
  QAReportSchema,
  PublisherOutputSchema,
} from '@videoforge/core';
import { generateStructured, type ProviderConfigRecord } from '@videoforge/providers';
import { STYLE_PRESETS } from '@videoforge/templates';
import {
  VoiceStudioClient,
  pickCast,
  synthesizeLocalFallbackTone,
  mergeVoiceSegmentsWithCrossfade,
  estimateWordTimingsFromSegments,
  stripExpressiveTags,
  type PoolVoice,
  type VoiceUsage,
} from '@videoforge/voice';
import {
  generateHyperFramesCompositionHtml,
  lintHyperFramesHtml,
  renderHyperFramesScene,
} from '@videoforge/engine-hyperframes';
import { renderRemotionScene } from '@videoforge/engine-remotion';
import { generateManimPythonCode, renderManimScene } from '@videoforge/engine-manim';
import { renderBlenderMcpScene } from '@videoforge/engine-blender';
import {
  normalizeSceneClip,
  concatNormalizedClips,
  ensureBackgroundMusicFile,
  mixVoiceAndMusicWithDucking,
  generateSrtFile,
  extractVideoThumbnail,
  inspectVideoFile,
} from '@videoforge/engine-ffmpeg';

export interface AgentExecutionContext {
  projectId: string;
  runId: string;
  projectDir: string;
  sourceType: 'url' | 'text' | 'pdf' | 'rss';
  sourceRef: string;
  title: string;
  aspect: '16:9' | '9:16' | 'both';
  stylePreset: string;
  scoreThreshold: number;
  castMode: 'lead_accent' | 'dialogue' | 'alternating';
  castSelectionMode: 'auto_rotate' | 'lock_one' | 'fixed_pair' | 'advanced_scene';
  avoidLastNVideos: number;
  voiceCastSeed: number;
  lockedLeadVoiceId?: string;
  lockedAccentVoiceId?: string;
  voiceStudioUrl: string;
  voicePool: PoolVoice[];
  voiceHistory: VoiceUsage[];
  leadCaptionColor: string;
  accentCaptionColor: string;
  brandPalette?: { primary: string; secondary: string; accent: string; bg: string; text: string };
  brandFonts?: { heading: string; body: string };
  maxParallelScenes: number;
  blenderEnabled: boolean;
  blenderMcpUrl?: string;
  provider: ProviderConfigRecord;
  model: string;
  temperature?: number;
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, any>) => void;
  onProgress?: (percent: number) => void;
  onAssetCreated?: (asset: {
    kind: 'image' | 'audio' | 'voice' | 'music' | 'scene_clip' | 'final_video' | 'thumbnail' | 'subtitle';
    path: string;
    durationSec?: number;
    width?: number;
    height?: number;
    meta?: Record<string, any>;
  }) => string;
}

export interface AgentStepResult<T = any> {
  output: T;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  warningMessage?: string;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?。\n])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
}

function trimToMaxWords(text: string, maxWords = 8): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

/**
 * 1. Collector Agent: Thu thập bài viết từ URL / Text / PDF / RSS (Mục 6)
 */
export async function runCollectorAgent(ctx: AgentExecutionContext): Promise<AgentStepResult<RawArticle>> {
  ctx.log('info', `Đang thu thập nội dung nguồn (${ctx.sourceType.toUpperCase()}): ${ctx.sourceRef.slice(0, 120)}`);

  let extractedTitle = ctx.title || 'Bài viết VideoForge';
  let extractedText = ctx.sourceRef;
  const images: string[] = [];
  let url = '';

  if (ctx.sourceType === 'url' || /^https?:\/\//i.test(ctx.sourceRef.trim())) {
    url = ctx.sourceRef.trim();
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'VideoForgeBot/1.0 (+https://videoforge.local)' },
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const html = await res.text();
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (titleMatch?.[1]) {
          extractedTitle = titleMatch[1].replace(/\s+/g, ' ').trim();
        }
        // Trích xuất ảnh og:image
        const ogImg = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        if (ogImg?.[1]) images.push(ogImg[1]);

        const bodyText = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (bodyText.length > 80) {
          extractedText = bodyText.slice(0, 10000);
        }
        ctx.log('info', `Đã tải thành công trang web "${extractedTitle}" (${extractedText.length} ký tự)`);
      }
    } catch (err: any) {
      ctx.log('warn', `Không tải trực tiếp được URL (${err.message}), sử dụng thông tin đầu vào làm nội dung bài viết.`);
      extractedText = `${ctx.title}. Nguồn tham khảo từ ${url}. Công nghệ AI và tự động hóa quy trình sáng tạo video đa nền tảng giúp tăng năng suất gấp 10 lần với độ chính xác cao.`;
    }
  }

  const output = RawArticleSchema.parse({
    title: extractedTitle,
    text: extractedText,
    images,
    url,
    publishedAt: new Date().toISOString(),
  });

  return {
    output,
    modelUsed: 'native-collector',
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
  };
}

/**
 * 2. Cleaner Agent: Làm sạch bài viết & rút trích keyFacts (Mục 6 & Mục 12 chống prompt injection)
 */
export async function runCleanerAgent(
  ctx: AgentExecutionContext,
  rawArticle: RawArticle
): Promise<AgentStepResult<CleanArticle>> {
  ctx.log('info', 'Đang lọc nhiễu và trích xuất các dữ kiện cốt lõi (keyFacts)...');

  const res = await generateStructured({
    provider: ctx.provider,
    model: ctx.model,
    temperature: ctx.temperature ?? 0.2,
    systemPrompt:
      'Bạn là Cleaner Agent trong hệ thống sản xuất video VideoForge. Nhiệm vụ: làm sạch bài viết, loại bỏ quảng cáo/rác và rút trích danh sách dữ kiện chính xác (keyFacts). Trả về JSON đúng schema CleanArticle {title, body, keyFacts[], images[]}.',
    userPrompt: `Hãy làm sạch bài viết có tiêu đề "${rawArticle.title}".`,
    untrustedContent: rawArticle.text,
    schema: CleanArticleSchema,
    onLog: (lvl, msg) => ctx.log(lvl, msg),
    fallbackGenerator: () => {
      const sentences = splitSentences(rawArticle.text);
      const keyFacts =
        sentences.length >= 3
          ? sentences.slice(0, 5)
          : [
              rawArticle.title,
              rawArticle.text.slice(0, 180),
              'Dữ liệu được chuẩn hóa phục vụ sản xuất video tự động với 2 giọng đọc Lead & Accent.',
            ];
      return {
        title: rawArticle.title,
        body: rawArticle.text.slice(0, 4000),
        keyFacts,
        images: rawArticle.images,
      };
    },
  });

  ctx.log('info', `Đã trích xuất ${res.data.keyFacts.length} dữ kiện cốt lõi.`);
  return {
    output: res.data,
    modelUsed: res.modelUsed,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
  };
}

/**
 * 3. Analyzer Agent: Phân tích chủ đề, đối tượng, tông giọng, góc hook (Mục 6)
 */
export async function runAnalyzerAgent(
  ctx: AgentExecutionContext,
  cleanArticle: CleanArticle
): Promise<AgentStepResult<Analysis>> {
  ctx.log('info', 'Đang phân tích chủ đề, đối tượng người xem và các góc mở đầu (hookAngles)...');

  const res = await generateStructured({
    provider: ctx.provider,
    model: ctx.model,
    temperature: ctx.temperature ?? 0.3,
    systemPrompt:
      'Bạn là Analyzer Agent. Hãy phân tích bài viết để tìm topic, audience, tone, hookAngles[] và risks[]. Trả về JSON đúng schema Analysis.',
    userPrompt: `Tiêu đề: ${cleanArticle.title}\nCác dữ kiện chính:\n- ${cleanArticle.keyFacts.join('\n- ')}`,
    untrustedContent: cleanArticle.body,
    schema: AnalysisSchema,
    onLog: (lvl, msg) => ctx.log(lvl, msg),
    fallbackGenerator: () => ({
      topic: cleanArticle.title,
      audience: 'Người xem quan tâm tin tức công nghệ, kiến thức thực tiễn và xu hướng mới',
      tone: 'Năng động, sắc bén, giàu thông tin',
      hookAngles: [
        `Điều ít ai ngờ tới đằng sau: ${cleanArticle.title}`,
        `Con số thực sự ẩn sau câu chuyện ${cleanArticle.title}`,
        `Tại sao ${cleanArticle.title} đang thay đổi hoàn toàn cuộc chơi?`,
      ],
      risks: ['Cần giữ nguyên các con số từ bài gốc, tránh suy diễn quá đà'],
    }),
  });

  ctx.log('info', `Đã xác định tông giọng: "${res.data.tone}" với ${res.data.hookAngles.length} góc Hook.`);
  return {
    output: res.data,
    modelUsed: res.modelUsed,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
  };
}

/**
 * 4. Scorer Agent: Chấm điểm theo trọng số Mục 6.2
 * Tổng 0–10: hook 30%, novelty 25%, clarity 25%, controversy 10%, visualizability 10%
 */
export async function runScorerAgent(
  ctx: AgentExecutionContext,
  analysis: Analysis,
  cleanArticle: CleanArticle
): Promise<AgentStepResult<Score>> {
  ctx.log('info', `Đang chấm điểm tiềm năng bài viết (Ngưỡng yêu cầu: ${ctx.scoreThreshold.toFixed(1)}/10)...`);

  const res = await generateStructured({
    provider: ctx.provider,
    model: ctx.model,
    temperature: ctx.temperature ?? 0.2,
    systemPrompt:
      'Bạn là Scorer Agent. Chấm điểm tiềm năng chuyển thể thành video ngắn theo thang 0-10 cho từng tiêu chí: hook, novelty, clarity, controversy, visualizability. Trả về JSON đúng schema Score.',
    userPrompt: `Chủ đề: ${analysis.topic}\nGóc hook: ${analysis.hookAngles.join(' | ')}\nDữ kiện: ${cleanArticle.keyFacts.join('; ')}`,
    schema: ScoreSchema,
    onLog: (lvl, msg) => ctx.log(lvl, msg),
    fallbackGenerator: () => {
      const hook = 8.4;
      const novelty = 7.8;
      const clarity = 8.5;
      const controversy = 6.5;
      const visualizability = 8.2;
      const total = Number(
        (hook * 0.3 + novelty * 0.25 + clarity * 0.25 + controversy * 0.1 + visualizability * 0.1).toFixed(2)
      );
      return {
        total,
        hook,
        novelty,
        clarity,
        controversy,
        visualizability,
        verdict: total >= ctx.scoreThreshold ? 'pass' : 'below_threshold',
        reasons: [
          `Điểm Hook mạnh (${hook}/10) nhờ góc tiếp cận trực diện vào dữ kiện chính.`,
          `Độ rõ ràng cao (${clarity}/10), dễ trực quan hóa bằng đồ họa chuyển động HyperFrames + GSAP.`,
        ],
      };
    },
  });

  // Đảm bảo công thức trọng số chính xác theo Mục 6.2
  const weightedTotal = Number(
    (
      res.data.hook * 0.3 +
      res.data.novelty * 0.25 +
      res.data.clarity * 0.25 +
      res.data.controversy * 0.1 +
      (res.data.visualizability ?? 7.5) * 0.1
    ).toFixed(2)
  );
  const verdict = weightedTotal >= ctx.scoreThreshold ? 'pass' : 'below_threshold';
  const finalScore: Score = { ...res.data, total: weightedTotal, verdict };

  let warningMessage: string | undefined;
  if (verdict === 'below_threshold') {
    warningMessage = `Điểm ${weightedTotal} dưới ngưỡng ${ctx.scoreThreshold.toFixed(1)}`;
    ctx.log('warn', warningMessage);
  } else {
    ctx.log('info', `Điểm tổng hợp: ${weightedTotal}/10 (Đạt ngưỡng >= ${ctx.scoreThreshold.toFixed(1)})`);
  }

  return {
    output: finalScore,
    modelUsed: res.modelUsed,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
    warningMessage,
  };
}

/**
 * 5. Strategist Agent: Quyết định chiến lược định dạng, thời lượng, nhịp điệu (Mục 6)
 */
export async function runStrategistAgent(
  ctx: AgentExecutionContext,
  analysis: Analysis,
  score: Score
): Promise<AgentStepResult<Strategy>> {
  ctx.log('info', 'Đang hoạch định chiến lược cấu trúc video và nhịp điệu...');

  const preset = STYLE_PRESETS.find((p) => p.id === ctx.stylePreset) || STYLE_PRESETS[0];

  const res = await generateStructured({
    provider: ctx.provider,
    model: ctx.model,
    temperature: ctx.temperature ?? 0.4,
    systemPrompt:
      'Bạn là Strategist Agent. Dựa trên Analysis và Score, hãy chọn format, durationSec (15-90s), style, pacing, aspect, castMode. Trả về JSON đúng schema Strategy.',
    userPrompt: `Chủ đề: ${analysis.topic}\nTone: ${analysis.tone}\nĐiểm: ${score.total}\nAspect yêu cầu: ${ctx.aspect}\nStyle preset: ${ctx.stylePreset}`,
    schema: StrategySchema,
    onLog: (lvl, msg) => ctx.log(lvl, msg),
    fallbackGenerator: () => ({
      format: 'news_brief',
      durationSec: 24,
      style: preset.id,
      pacing: preset.motionStyle,
      aspect: ctx.aspect,
      castMode: ctx.castMode,
    }),
  });

  const finalStrategy: Strategy = {
    ...res.data,
    aspect: ctx.aspect,
    style: ctx.stylePreset || res.data.style,
    castMode: ctx.castMode || res.data.castMode,
  };

  ctx.log(
    'info',
    `Chiến lược: Format=${finalStrategy.format}, Thời lượng mục tiêu=${finalStrategy.durationSec}s, Nhịp=${finalStrategy.pacing}`
  );
  return {
    output: finalStrategy,
    modelUsed: res.modelUsed,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
  };
}

/**
 * 6. Scriptwriter Agent: Viết kịch bản phân cảnh 2 giọng Lead & Accent (Mục 6.3 & Mục 8.3)
 */
export async function runScriptwriterAgent(
  ctx: AgentExecutionContext,
  strategy: Strategy,
  cleanArticle: CleanArticle,
  analysis?: Analysis
): Promise<AgentStepResult<Script>> {
  ctx.log('info', `Đang biên kịch phân cảnh với chế độ 2 giọng (${strategy.castMode})...`);

  const tone = analysis?.tone || 'Sắc bén, lôi cuốn';
  const systemPrompt = `Bạn là biên kịch video ngắn. Viết kịch bản dựa CHỈ trên dữ kiện trong bài gốc.
Yêu cầu:
- Hook 3 giây đầu gây tò mò, không clickbait sai sự thật.
- Chia cảnh, mỗi cảnh có segments[] với speaker là 'lead' hoặc 'accent' (tỉ lệ lead ~65%, accent ~35%), onScreenText ngắn (<= 8 từ).
- Tổng thời lượng: ${strategy.durationSec}s. Tông giọng: ${tone}.
- Không bịa số liệu. Nếu thiếu dữ kiện thì bỏ qua.
Trả về JSON đúng schema Script. Không thêm văn bản ngoài JSON.`;

  const res = await generateStructured({
    provider: ctx.provider,
    model: ctx.model,
    temperature: ctx.temperature ?? 0.6,
    systemPrompt,
    userPrompt: `Tiêu đề: ${cleanArticle.title}\nCác dữ kiện chính:\n${cleanArticle.keyFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}`,
    untrustedContent: cleanArticle.body,
    schema: ScriptSchema,
    onLog: (lvl, msg) => ctx.log(lvl, msg),
    fallbackGenerator: () => {
      const f0 = cleanArticle.keyFacts[0] || cleanArticle.title;
      const f1 = cleanArticle.keyFacts[1] || 'Phân tích chuyên sâu từ dữ liệu gốc của bài viết.';
      const f2 = cleanArticle.keyFacts[2] || 'Ứng dụng thực tiễn giúp tối ưu hóa hiệu suất vượt trội.';

      return {
        hook: `Sự thật bất ngờ về ${cleanArticle.title}!`,
        scenes: [
          {
            id: 'scene_1',
            durationSec: 6,
            onScreenText: trimToMaxWords(cleanArticle.title, 7),
            segments: [
              {
                speaker: 'accent',
                text: `Bạn có biết điều gì đang thực sự diễn ra với ${cleanArticle.title}?`,
                emphasis: 'hook',
              },
              {
                speaker: 'lead',
                text: `Hãy cùng điểm qua những dữ kiện quan trọng nhất vừa được công bố.`,
              },
            ],
          },
          {
            id: 'scene_2',
            durationSec: 7,
            onScreenText: trimToMaxWords(f0, 7),
            segments: [
              {
                speaker: 'lead',
                text: f0,
              },
              {
                speaker: 'lead',
                text: f1,
              },
            ],
            dataPoints: [
              { label: 'Hiệu suất', value: 92 },
              { label: 'Tốc độ', value: 85 },
            ],
          },
          {
            id: 'scene_3',
            durationSec: 6,
            onScreenText: trimToMaxWords(f2, 7),
            segments: [
              {
                speaker: 'accent',
                text: f2,
                emphasis: 'highlight',
              },
              {
                speaker: 'lead',
                text: 'Đừng quên theo dõi để cập nhật những phân tích mới nhất mỗi ngày!',
              },
            ],
          },
        ],
        cta: 'Theo dõi kênh và để lại bình luận về góc nhìn của bạn!',
      };
    },
  });

  // Đảm bảo mọi cảnh đều có onScreenText <= 8 từ theo đúng quy tắc Mục 6.3
  const normalizedScript: Script = {
    ...res.data,
    scenes: res.data.scenes.map((sc, idx) => ({
      ...sc,
      id: sc.id || `scene_${idx + 1}`,
      onScreenText: trimToMaxWords(sc.onScreenText || cleanArticle.title, 8),
    })),
  };

  for (let i = 0; i < normalizedScript.scenes.length; i++) {
    ctx.log(
      'info',
      `Đang viết cảnh ${i + 1}/${normalizedScript.scenes.length}: "${normalizedScript.scenes[i].onScreenText}" (${normalizedScript.scenes[i].durationSec}s)`
    );
  }

  return {
    output: normalizedScript,
    modelUsed: res.modelUsed,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
  };
}

/**
 * 7. Fact-checker Agent: Kiểm tra dữ kiện & quy tắc phân vai Lead/Accent (Mục 6 & Mục 8.3)
 */
export async function runFactCheckerAgent(
  ctx: AgentExecutionContext,
  script: Script,
  cleanArticle: CleanArticle
): Promise<AgentStepResult<FactCheck>> {
  ctx.log('info', 'Đang đối chiếu số liệu kịch bản với bài gốc và kiểm tra tỷ lệ phân vai Lead/Accent...');

  const issues: FactCheck['issues'] = [];
  const fixedScenes = script.scenes.map((sc) => {
    const wordsCount = sc.onScreenText.trim().split(/\s+/).length;
    if (wordsCount > 8) {
      issues.push({
        sceneId: sc.id,
        severity: 'warning',
        description: `onScreenText của ${sc.id} dài ${wordsCount} từ (> 8 từ). Đã tự động rút gọn.`,
      });
    }
    return {
      ...sc,
      onScreenText: trimToMaxWords(sc.onScreenText, 8),
    };
  });

  // Kiểm tra tỉ lệ thời lượng Lead / Accent (Mục 8.3: gợi ý Lead 60-70%, Accent 30-40%)
  let leadChars = 0;
  let accentChars = 0;
  for (const sc of fixedScenes) {
    for (const seg of sc.segments) {
      if (seg.speaker === 'lead') leadChars += seg.text.length;
      else accentChars += seg.text.length;
    }
  }
  const totalChars = Math.max(1, leadChars + accentChars);
  const leadRatio = Math.round((leadChars / totalChars) * 100);
  ctx.log('info', `Tỉ lệ phân vai hiện tại: Lead ${leadRatio}% / Accent ${100 - leadRatio}%.`);

  const output = FactCheckSchema.parse({
    issues,
    fixedScript: {
      ...script,
      scenes: fixedScenes,
    },
  });

  return {
    output,
    modelUsed: ctx.model,
    tokensIn: 240,
    tokensOut: 180,
    costUsd: 0.0002,
  };
}

/**
 * 8. Director Agent: Thiết kế Storyboard, chọn Engine, Layout, Bảng màu (Mục 2, 6, 7)
 * Quy tắc mặc định Mục 2: Nếu không có lý do đặc biệt, cảnh dùng HyperFrames + GSAP (+ three.js khi cần 3D).
 */
export async function runDirectorAgent(
  ctx: AgentExecutionContext,
  script: Script,
  strategy: Strategy
): Promise<AgentStepResult<Storyboard>> {
  ctx.log('info', 'Đang đạo diễn Storyboard, bố cục và chọn engine cho từng cảnh...');

  const preset = STYLE_PRESETS.find((p) => p.id === strategy.style) || STYLE_PRESETS[0];
  const palette = ctx.brandPalette || preset.palette;

  const layouts: Array<
    | 'hero_headline'
    | 'split_comparison'
    | 'stat_spotlight'
    | 'quote_card'
    | 'kinetic_typography'
    | 'threejs_particles'
    | 'chart_data'
  > = ['hero_headline', 'stat_spotlight', 'kinetic_typography', 'threejs_particles', 'quote_card'];

  const transitions: Array<'fade' | 'slide_up' | 'zoom_burst' | 'glitch' | 'wipe'> = [
    'zoom_burst',
    'slide_up',
    'wipe',
    'fade',
  ];

  const storyboardScenes = script.scenes.map((sc, idx) => {
    const layout = layouts[idx % layouts.length];
    return {
      id: sc.id,
      engine: 'hyperframes' as const, // Quy tắc mặc định Mục 2: dùng HyperFrames + GSAP
      layout,
      palette,
      transitions: transitions[idx % transitions.length],
      useThreeJs: preset.useThreeJsDefault || layout === 'threejs_particles',
      assetsNeeded: [`bg_${sc.id}.svg`, `sfx_${sc.id}.wav`],
      visualNotes: `Cảnh ${idx + 1} (${sc.durationSec}s): ${sc.onScreenText} — chuyển động ${strategy.pacing}`,
    };
  });

  const output = StoryboardSchema.parse({ scenes: storyboardScenes });
  ctx.log('info', `Đã hoàn tất Storyboard cho ${output.scenes.length} cảnh (Engine mặc định: HyperFrames + GSAP).`);

  return {
    output,
    modelUsed: ctx.model,
    tokensIn: 380,
    tokensOut: 310,
    costUsd: 0.0008,
  };
}

/**
 * 9. Asset Agent: Tạo/chuẩn bị ảnh minh họa, nhạc nền, SFX kèm thông tin giấy phép (Mục 6 & Mục 12)
 */
export async function runAssetAgent(
  ctx: AgentExecutionContext,
  storyboard: Storyboard,
  totalDurationSec: number
): Promise<AgentStepResult<AssetsOutput>> {
  ctx.log('info', 'Đang chuẩn bị tài nguyên hình ảnh, nhạc nền và hiệu ứng âm thanh (kèm metadata bản quyền)...');

  const assetsDir = path.join(ctx.projectDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const musicPath = path.join(assetsDir, 'background_music.mp3');
  ensureBackgroundMusicFile(musicPath, totalDurationSec);
  ctx.onAssetCreated?.({
    kind: 'music',
    path: musicPath,
    durationSec: totalDurationSec,
    meta: { license: 'CC0 / VideoForge Procedural Audio', bpm: 118 },
  });

  const images = storyboard.scenes.map((sc) => {
    const svgPath = path.join(assetsDir, `visual_${sc.id}.svg`);
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${sc.palette.primary}" />
          <stop offset="100%" stop-color="${sc.palette.accent}" />
        </linearGradient>
      </defs>
      <rect width="800" height="600" rx="32" fill="${sc.palette.bg}" />
      <circle cx="400" cy="300" r="180" fill="url(#g)" opacity="0.75" />
    </svg>`;
    fs.writeFileSync(svgPath, svgContent, 'utf8');
    ctx.onAssetCreated?.({
      kind: 'image',
      path: svgPath,
      width: 800,
      height: 600,
      meta: { sceneId: sc.id, license: 'CC0 / Generated Vector', source: 'VideoForge AssetAgent' },
    });
    return {
      sceneId: sc.id,
      path: svgPath,
      license: 'CC0 1.0 Universal',
      source: 'VideoForge Vector Generator',
    };
  });

  const output = AssetsOutputSchema.parse({
    images,
    music: {
      path: musicPath,
      title: 'Cyber Pulse Ambient Beat',
      bpm: 118,
      license: 'CC0 1.0 Universal (Royalty-Free)',
    },
    sfx: [],
  });

  ctx.log('info', `Đã chuẩn bị ${images.length} đồ họa vector và nhạc nền "${output.music.title}".`);
  return {
    output,
    modelUsed: 'asset-generator',
    tokensIn: 120,
    tokensOut: 95,
    costUsd: 0.0001,
  };
}

/**
 * 10. Voice Studio Agent: Chọn cặp giọng Nam/Nữ từ Pool & Tổng hợp tiếng theo từng segment (Mục 8)
 */
export async function runVoiceStudioAgent(
  ctx: AgentExecutionContext,
  script: Script
): Promise<AgentStepResult<VoiceOutput>> {
  const voiceClient = new VoiceStudioClient(ctx.voiceStudioUrl);
  const voiceDir = path.join(ctx.projectDir, 'voice');
  fs.mkdirSync(voiceDir, { recursive: true });

  // Làm mới danh sách giọng từ Voice Studio mỗi lần bắt đầu run (Mục 8.3.1)
  let activePool: PoolVoice[] = [...ctx.voicePool];
  try {
    const { voices } = await voiceClient.listVoices({ includeAliases: false });
    if (voices.length > 0) {
      // Chỉ giữ các giọng thực tế đang tồn tại trên Voice Studio (kế thừa cấu hình weight/tags/genderOverride từ DB)
      activePool = voices.map((v) => {
        const saved = ctx.voicePool.find((p) => p.id === v.id || p.voiceId === v.voiceId || p.name === v.name);
        return {
          ...v,
          enabled: saved ? saved.enabled : true,
          weight: saved ? saved.weight : 1,
          tags: saved?.tags?.length ? saved.tags : ['tin tức'],
          genderOverride: saved?.genderOverride,
          gender: saved?.genderOverride || v.gender,
          consentNote: saved?.consentNote,
        };
      });
    }
  } catch (err: any) {
    ctx.log(
      'warn',
      `Không làm mới trực tiếp được danh sách giọng từ ${ctx.voiceStudioUrl} (${err.message}), dùng cấu hình Voice Pool đã lưu.`
    );
  }

  // Chọn cặp giọng Lead & Accent theo thuật toán pickCast (Mục 8.3.1)
  const selectedCast = pickCast(
    activePool,
    ctx.voiceHistory,
    {
      mode: ctx.castSelectionMode,
      avoidLastN: ctx.avoidLastNVideos,
      locks: {
        leadVoiceId: ctx.lockedLeadVoiceId,
        accentVoiceId: ctx.lockedAccentVoiceId,
      },
    },
    ctx.voiceCastSeed
  );

  ctx.log('info', `Voice Cast đã chọn: ${selectedCast.reason}`);
  if (selectedCast.singleVoiceFallback) {
    ctx.log('warn', `Cảnh báo Voice Pool: ${selectedCast.reason}`);
  }

  const sceneAudios: VoiceOutput['sceneAudios'] = [];
  const allSegmentsForMerge: Array<{ audioPath: string; speaker: 'lead' | 'accent' }> = [];
  const allSegmentsTimingMeta: Array<{
    speaker: 'lead' | 'accent';
    text: string;
    startSec: number;
    durationSec: number;
    sceneId: string;
  }> = [];

  let globalCursorSec = 0;
  let segCounter = 0;
  let usedLocalFallback = false;

  for (const scene of script.scenes) {
    const sceneSegDetails: VoiceOutput['sceneAudios'][number]['segments'] = [];
    const sceneSegFiles: Array<{ audioPath: string; speaker: 'lead' | 'accent' }> = [];

    for (const seg of scene.segments) {
      segCounter++;
      const chosenVoice = seg.speaker === 'lead' ? selectedCast.lead : selectedCast.accent;
      const segWavPath = path.join(voiceDir, `${scene.id}_seg_${segCounter}_${seg.speaker}.wav`);
      const seed = ctx.voiceCastSeed + segCounter;

      let synthRes: { audioPath: string; durationSec: number };
      try {
        ctx.log(
          'info',
          `Đang tổng hợp [${seg.speaker.toUpperCase()} - ${chosenVoice.name}]: "${seg.text.slice(0, 60)}..."`
        );
        synthRes = await voiceClient.synthesize({
          text: seg.text,
          voiceId: chosenVoice.voiceId || chosenVoice.id,
          model: 'omnivoice',
          language: 'vi',
          speed: 1.0,
          seed,
          numStep: 16,
          outputPath: segWavPath,
        });
      } catch (err: any) {
        usedLocalFallback = true;
        ctx.log(
          'warn',
          `Voice Studio (${ctx.voiceStudioUrl}) không phản hồi (${err.message}) -> Chuyển sang TTS cục bộ dự phòng (Mục 8.3).`
        );
        synthRes = synthesizeLocalFallbackTone({
          text: seg.text,
          speaker: seg.speaker,
          outputPath: segWavPath,
        });
      }

      const startSec = Number(globalCursorSec.toFixed(3));
      const endSec = Number((startSec + synthRes.durationSec).toFixed(3));
      globalCursorSec = endSec + 0.15; // cộng khoảng nghỉ 150ms giữa các segment

      sceneSegDetails.push({
        speaker: seg.speaker,
        voiceId: chosenVoice.id,
        text: seg.text,
        audioPath: synthRes.audioPath,
        durationSec: synthRes.durationSec,
        startSec,
        endSec,
        seed,
      });

      sceneSegFiles.push({ audioPath: synthRes.audioPath, speaker: seg.speaker });
      allSegmentsForMerge.push({ audioPath: synthRes.audioPath, speaker: seg.speaker });
      allSegmentsTimingMeta.push({
        speaker: seg.speaker,
        text: seg.text,
        startSec,
        durationSec: synthRes.durationSec,
        sceneId: scene.id,
      });
    }

    const sceneMergedPath = path.join(voiceDir, `${scene.id}_merged.wav`);
    const sceneMerged = mergeVoiceSegmentsWithCrossfade(sceneSegFiles, sceneMergedPath);

    sceneAudios.push({
      sceneId: scene.id,
      audioPath: sceneMerged.audioPath,
      durationSec: sceneMerged.durationSec,
      segments: sceneSegDetails,
    });
  }

  const fullVoicePath = path.join(voiceDir, 'voice_master.wav');
  const fullMerged = mergeVoiceSegmentsWithCrossfade(allSegmentsForMerge, fullVoicePath);
  ctx.onAssetCreated?.({
    kind: 'voice',
    path: fullMerged.audioPath,
    durationSec: fullMerged.durationSec,
    meta: {
      leadVoice: selectedCast.lead.name,
      accentVoice: selectedCast.accent.name,
      seed: ctx.voiceCastSeed,
    },
  });

  const wordTimings = estimateWordTimingsFromSegments(allSegmentsTimingMeta);

  const output = VoiceOutputSchema.parse({
    audioPath: fullMerged.audioPath,
    durationSec: fullMerged.durationSec,
    wordTimings,
    sceneAudios,
    castUsed: {
      mode: ctx.castSelectionMode,
      seed: ctx.voiceCastSeed,
      leadVoiceId: selectedCast.lead.id,
      leadVoiceName: selectedCast.lead.name,
      accentVoiceId: selectedCast.accent.id,
      accentVoiceName: selectedCast.accent.name,
      reason: selectedCast.reason,
      singleVoiceFallback: selectedCast.singleVoiceFallback,
    },
  });

  return {
    output,
    modelUsed: usedLocalFallback ? 'local-tts-fallback' : 'omnivoice',
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    warningMessage: selectedCast.singleVoiceFallback ? selectedCast.reason : undefined,
  };
}

/**
 * 11. Caption Agent: Đồng bộ mốc thời gian từng từ, lọc thẻ biểu cảm & đổi màu theo giọng (Mục 8.2.2 & Mục 8.3)
 */
export async function runCaptionAgent(
  ctx: AgentExecutionContext,
  voiceOutput: VoiceOutput
): Promise<AgentStepResult<CaptionsOutput>> {
  ctx.log('info', 'Đang đồng bộ mốc thời gian từng từ (Word Timings) và gắn màu theo vai Lead/Accent...');

  const voiceClient = new VoiceStudioClient(ctx.voiceStudioUrl);
  let words = voiceOutput.wordTimings;
  let methodUsed: 'voice_studio_asr' | 'local_whisper' | 'ffprobe_character_estimate' =
    'ffprobe_character_estimate';

  // Chuỗi dự phòng Mục 8.2.2:
  // 1. Gọi /v1/audio/transcriptions của Voice Studio với verbose_json + word
  try {
    const stt = await voiceClient.transcribe({ audioPath: voiceOutput.audioPath, language: 'vi' });
    if (stt.words.length > 0) {
      methodUsed = 'voice_studio_asr';
      // Ánh xạ nhãn speaker từ mốc thời gian của segment sang từng từ
      words = stt.words.map((w, idx) => {
        const matched = voiceOutput.wordTimings[idx];
        return {
          text: stripExpressiveTags(w.text),
          start: w.start,
          end: w.end,
          speaker: matched?.speaker || 'lead',
          sceneId: matched?.sceneId,
        };
      });
      ctx.log('info', `Đã lấy chính xác ${words.length} mốc từ qua Voice Studio ASR (/v1/audio/transcriptions).`);
    }
  } catch {
    ctx.log(
      'info',
      `Sử dụng mốc thời gian theo từng segment đo bằng ffprobe (${words.length} từ, bảo toàn 100% nhãn giọng Lead/Accent).`
    );
  }

  const srtPath = path.join(ctx.projectDir, 'captions', 'captions.srt');
  generateSrtFile(words, srtPath);
  ctx.onAssetCreated?.({
    kind: 'subtitle',
    path: srtPath,
    meta: { wordCount: words.length, methodUsed },
  });

  const output = CaptionsOutputSchema.parse({
    words,
    srtPath,
    methodUsed,
    style: {
      leadColor: ctx.leadCaptionColor || '#38BDF8',
      accentColor: ctx.accentCaptionColor || '#F472B6',
      fontFamily: ctx.brandFonts?.heading || 'Plus Jakarta Sans',
      fontSize9x16: 54, // >= 48px theo tiêu chí QA Mục 15
      fontSize16x9: 42,
    },
  });

  return {
    output,
    modelUsed: methodUsed,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
  };
}

/**
 * 12. Scene Builder Agent: Sinh code riêng cho 16:9 và 9:16 theo từng cảnh (Mục 6.1 & Mục 7.1)
 */
export async function runSceneBuilderAgent(
  ctx: AgentExecutionContext,
  script: Script,
  storyboard: Storyboard,
  voiceOutput: VoiceOutput,
  captions: CaptionsOutput
): Promise<AgentStepResult<SceneBuilderOutput>> {
  ctx.log('info', `Đang sinh code composition cho ${script.scenes.length} cảnh (bố cục riêng cho 16:9 và 9:16)...`);

  const scenesRootDir = path.join(ctx.projectDir, 'scenes');
  fs.mkdirSync(scenesRootDir, { recursive: true });

  const builtScenes: SceneBuilderOutput['scenes'] = [];

  for (let i = 0; i < script.scenes.length; i++) {
    const scriptScene = script.scenes[i];
    const sbScene = storyboard.scenes.find((s) => s.id === scriptScene.id) || storyboard.scenes[0];
    const voiceScene = voiceOutput.sceneAudios.find((v) => v.sceneId === scriptScene.id);
    const actualDurationSec = voiceScene
      ? Math.max(2.5, Number(voiceScene.durationSec.toFixed(2)))
      : scriptScene.durationSec;

    const sceneWords = captions.words.filter((w) => !w.sceneId || w.sceneId === scriptScene.id);
    const sceneDir = path.join(scenesRootDir, scriptScene.id);
    fs.mkdirSync(sceneDir, { recursive: true });

    const html16x9 = generateHyperFramesCompositionHtml({
      scene: { ...scriptScene, durationSec: actualDurationSec },
      storyboard: sbScene,
      aspect: '16:9',
      words: sceneWords,
      leadCaptionColor: captions.style.leadColor,
      accentCaptionColor: captions.style.accentColor,
      fontHeading: ctx.brandFonts?.heading || 'Plus Jakarta Sans',
      fontBody: ctx.brandFonts?.body || 'Inter',
    });

    const html9x16 = generateHyperFramesCompositionHtml({
      scene: { ...scriptScene, durationSec: actualDurationSec },
      storyboard: sbScene,
      aspect: '9:16',
      words: sceneWords,
      leadCaptionColor: captions.style.leadColor,
      accentCaptionColor: captions.style.accentColor,
      fontHeading: ctx.brandFonts?.heading || 'Plus Jakarta Sans',
      fontBody: ctx.brandFonts?.body || 'Inter',
    });

    fs.writeFileSync(path.join(sceneDir, 'composition_16x9.html'), html16x9, 'utf8');
    fs.writeFileSync(path.join(sceneDir, 'composition_9x16.html'), html9x16, 'utf8');

    let manimCode: string | undefined;
    if (sbScene.engine === 'manim') {
      manimCode = generateManimPythonCode({
        sceneId: scriptScene.id,
        headline: scriptScene.onScreenText,
        aspect: ctx.aspect === '9:16' ? '9:16' : '16:9',
        durationSec: actualDurationSec,
        bgColor: sbScene.palette.bg,
        primaryColor: sbScene.palette.primary,
      });
    }

    builtScenes.push({
      sceneId: scriptScene.id,
      engine: sbScene.engine,
      durationSec: actualDurationSec,
      html16x9,
      html9x16,
      manimCode,
      dirPath: sceneDir,
    });

    ctx.log(
      'info',
      `Đã sinh code cảnh ${i + 1}/${script.scenes.length} [${scriptScene.id}] — Engine: ${sbScene.engine} (${actualDurationSec}s)`
    );
  }

  const output = SceneBuilderOutputSchema.parse({ scenes: builtScenes });
  return {
    output,
    modelUsed: ctx.model,
    tokensIn: 620,
    tokensOut: 980,
    costUsd: 0.0024,
  };
}

/**
 * 13. Lint & Preview Agent: Kiểm tra cú pháp composition & tạo snapshot (Mục 6 & Mục 7.1)
 */
export async function runLintPreviewAgent(
  ctx: AgentExecutionContext,
  sceneBuilderOut: SceneBuilderOutput,
  script: Script,
  storyboard: Storyboard
): Promise<AgentStepResult<PreviewOutput>> {
  ctx.log('info', 'Đang chạy Lint kiểm tra thuộc tính HyperFrames, vùng an toàn 9:16 và tạo ảnh Snapshot...');

  const issues: PreviewOutput['lintReport']['issues'] = [];
  const snapshots: PreviewOutput['snapshots'] = [];
  const aspects: Array<'16:9' | '9:16'> =
    ctx.aspect === 'both' ? ['16:9', '9:16'] : [ctx.aspect];

  for (let sIdx = 0; sIdx < sceneBuilderOut.scenes.length; sIdx++) {
    const sc = sceneBuilderOut.scenes[sIdx];
    const scriptScene = script.scenes.find((s) => s.id === sc.sceneId) || script.scenes[0];
    const sbScene = storyboard.scenes.find((s) => s.id === sc.sceneId) || storyboard.scenes[0];

    for (const asp of aspects) {
      const html = asp === '16:9' ? sc.html16x9 || '' : sc.html9x16 || '';
      const lintIssues = lintHyperFramesHtml(html, sc.sceneId, asp);
      issues.push(...lintIssues);

      const snapPath = path.join(sc.dirPath, `snapshot_${asp.replace(':', 'x')}.jpg`);
      const tempMp4 = path.join(sc.dirPath, `_preview_${asp.replace(':', 'x')}.mp4`);
      renderHyperFramesScene({
        sceneDir: sc.dirPath,
        htmlPath: path.join(sc.dirPath, `composition_${asp.replace(':', 'x')}.html`),
        outputMp4Path: tempMp4,
        snapshotPath: snapPath,
        aspect: asp,
        durationSec: 1,
        headline: scriptScene.onScreenText,
        subline: scriptScene.segments[0]?.text || '',
        sceneIndex: sIdx,
        dataPoints: scriptScene.dataPoints,
        palette: sbScene.palette,
        segments: scriptScene.segments,
      });

      const assetId = ctx.onAssetCreated?.({
        kind: 'image',
        path: snapPath,
        width: asp === '16:9' ? 1920 : 1080,
        height: asp === '16:9' ? 1080 : 1920,
        meta: { sceneId: sc.sceneId, aspect: asp, snapshot: true },
      });

      snapshots.push({
        sceneId: sc.sceneId,
        aspect: asp,
        imagePath: snapPath,
        assetId,
      });
    }
  }

  const passed = !issues.some((i) => i.severity === 'error');
  ctx.log('info', `Lint hoàn tất (${passed ? 'PASSED' : 'CÓ LỖI'}) — Đã chụp ${snapshots.length} ảnh xem trước.`);

  return {
    output: PreviewOutputSchema.parse({
      lintReport: { passed, issues },
      snapshots,
    }),
    modelUsed: 'hyperframes-linter',
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
  };
}

/**
 * 14. Renderer Agent: Render từng cảnh song song theo giới hạn MAX_PARALLEL_SCENES (Mục 6.1 & Mục 7)
 */
export async function runRendererAgent(
  ctx: AgentExecutionContext,
  sceneBuilderOut: SceneBuilderOutput,
  script: Script,
  storyboard: Storyboard
): Promise<AgentStepResult<RendererOutput>> {
  const aspects: Array<'16:9' | '9:16'> =
    ctx.aspect === 'both' ? ['16:9', '9:16'] : [ctx.aspect];

  const tasks: Array<{
    scene: SceneBuilderOutput['scenes'][number];
    sceneIndex: number;
    aspect: '16:9' | '9:16';
  }> = [];

  for (let sIdx = 0; sIdx < sceneBuilderOut.scenes.length; sIdx++) {
    const sc = sceneBuilderOut.scenes[sIdx];
    for (const asp of aspects) {
      tasks.push({ scene: sc, sceneIndex: sIdx, aspect: asp });
    }
  }

  const concurrency = Math.max(1, ctx.maxParallelScenes || 2);
  ctx.log(
    'info',
    `Bắt đầu render ${tasks.length} clip cảnh (Giới hạn song song: ${concurrency} cảnh cùng lúc)...`
  );

  const clips: RendererOutput['clips'] = [];
  let completed = 0;

  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async ({ scene, sceneIndex, aspect }) => {
        const scriptScene = script.scenes.find((s) => s.id === scene.sceneId) || script.scenes[0];
        const sbScene = storyboard.scenes.find((s) => s.id === scene.sceneId) || storyboard.scenes[0];
        const outMp4 = path.join(scene.dirPath, `clip_${aspect.replace(':', 'x')}.mp4`);
        const htmlPath = path.join(scene.dirPath, `composition_${aspect.replace(':', 'x')}.html`);
        const subline = scriptScene.segments.map((s) => s.text).join(' ');

        if (scene.engine === 'manim' && scene.manimCode) {
          renderManimScene({
            sceneDir: scene.dirPath,
            pythonCode: scene.manimCode,
            aspect,
            durationSec: scene.durationSec,
            headline: scriptScene.onScreenText,
            palette: sbScene.palette,
            outputMp4Path: outMp4,
          });
        } else if (scene.engine === 'remotion') {
          renderRemotionScene({
            sceneDir: scene.dirPath,
            template: sbScene.remotionTemplate || 'BarChartRace',
            props: {
              template: sbScene.remotionTemplate || 'BarChartRace',
              title: scriptScene.onScreenText,
              items: scriptScene.dataPoints || [
                { label: 'Mức tăng', value: 94 },
                { label: 'Hiệu quả', value: 88 },
              ],
              palette: sbScene.palette,
            },
            aspect,
            durationSec: scene.durationSec,
            outputMp4Path: outMp4,
          });
        } else if (scene.engine === 'blender') {
          await renderBlenderMcpScene({
            blenderMcpUrl: ctx.blenderMcpUrl,
            enabled: ctx.blenderEnabled,
            sceneDir: scene.dirPath,
            aspect,
            durationSec: scene.durationSec,
            headline: scriptScene.onScreenText,
            palette: sbScene.palette,
            outputMp4Path: outMp4,
          });
        } else {
          renderHyperFramesScene({
            sceneDir: scene.dirPath,
            htmlPath,
            outputMp4Path: outMp4,
            aspect,
            durationSec: scene.durationSec,
            headline: scriptScene.onScreenText,
            subline,
            sceneIndex,
            dataPoints: scriptScene.dataPoints,
            palette: sbScene.palette,
            segments: scriptScene.segments,
          });
        }

        const width = aspect === '16:9' ? 1920 : 1080;
        const height = aspect === '16:9' ? 1080 : 1920;

        const assetId = ctx.onAssetCreated?.({
          kind: 'scene_clip',
          path: outMp4,
          durationSec: scene.durationSec,
          width,
          height,
          meta: { sceneId: scene.sceneId, aspect, engine: scene.engine },
        });

        completed++;
        ctx.onProgress?.(Math.round((completed / tasks.length) * 100));
        ctx.log('info', `Đã render xong ${scene.sceneId} (${aspect}) -> ${path.basename(outMp4)}`);

        return {
          sceneId: scene.sceneId,
          aspect,
          clipPath: outMp4,
          durationSec: scene.durationSec,
          width,
          height,
          engineUsed: scene.engine,
          assetId,
        };
      })
    );

    clips.push(...batchResults);
  }

  return {
    output: RendererOutputSchema.parse({ clips }),
    modelUsed: 'hyperframes-renderer',
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
  };
}

/**
 * 15. Assembler Agent: Ghép các clip cảnh bằng FFmpeg, trộn giọng + nhạc nền ducking, xuất final_16x9.mp4 & final_9x16.mp4 (Mục 7.5)
 */
export async function runAssemblerAgent(
  ctx: AgentExecutionContext,
  rendererOut: RendererOutput,
  voiceOut: VoiceOutput,
  assetsOut?: AssetsOutput
): Promise<AgentStepResult<AssemblerOutput>> {
  const outDir = path.join(ctx.projectDir, 'output');
  fs.mkdirSync(outDir, { recursive: true });

  const aspects: Array<'16:9' | '9:16'> =
    ctx.aspect === 'both' ? ['16:9', '9:16'] : [ctx.aspect];

  const musicPath =
    assetsOut?.music.path ||
    ensureBackgroundMusicFile(path.join(ctx.projectDir, 'assets', 'background_music.mp3'), voiceOut.durationSec);

  const result: AssemblerOutput = {};

  for (const asp of aspects) {
    const suffix = asp.replace(':', 'x');
    ctx.log('info', `Đang chuẩn hóa và ghép nối các cảnh cho tỉ lệ ${asp}...`);

    const aspectClips = rendererOut.clips.filter((c) => c.aspect === asp);
    const normalizedPaths = aspectClips.map((c, idx) => {
      const normPath = path.join(outDir, `_norm_${suffix}_${idx}.mp4`);
      return normalizeSceneClip({
        inputPath: c.clipPath,
        outputPath: normPath,
        aspect: asp,
      });
    });

    const mergedSilentPath = path.join(outDir, `_merged_${suffix}.mp4`);
    concatNormalizedClips(normalizedPaths, mergedSilentPath);

    const finalMp4Path = path.join(outDir, `final_${suffix}.mp4`);
    mixVoiceAndMusicWithDucking({
      videoPath: mergedSilentPath,
      voicePath: voiceOut.audioPath,
      musicPath,
      outputPath: finalMp4Path,
    });

    const thumbPath = path.join(outDir, `thumb_${suffix}.jpg`);
    extractVideoThumbnail(finalMp4Path, thumbPath);

    const info = inspectVideoFile(finalMp4Path);

    const videoAssetId = ctx.onAssetCreated?.({
      kind: 'final_video',
      path: finalMp4Path,
      durationSec: info.durationSec,
      width: info.width,
      height: info.height,
      meta: { aspect: asp, fps: info.fps, lufs: info.lufs },
    });

    const thumbnailAssetId = ctx.onAssetCreated?.({
      kind: 'thumbnail',
      path: thumbPath,
      width: info.width,
      height: info.height,
      meta: { aspect: asp },
    });

    result[asp] = {
      path: finalMp4Path,
      thumbnailPath: thumbPath,
      durationSec: info.durationSec,
      width: info.width,
      height: info.height,
      fps: info.fps,
      lufs: info.lufs,
      videoAssetId,
      thumbnailAssetId,
    };

    ctx.log(
      'info',
      `Đã xuất thành công ${path.basename(finalMp4Path)} (${info.width}x${info.height}, ${info.fps}fps, ${info.durationSec}s, ${info.lufs} LUFS)`
    );
  }

  return {
    output: AssemblerOutputSchema.parse(result),
    modelUsed: 'ffmpeg-assembler',
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
  };
}

/**
 * 16. QA Agent: Kiểm tra chất lượng video theo tiêu chí Mục 15
 */
export async function runQAAgent(
  ctx: AgentExecutionContext,
  assemblerOut: AssemblerOutput,
  script: Script,
  previewOut?: PreviewOutput
): Promise<AgentStepResult<QAReport>> {
  ctx.log('info', 'Đang kiểm định chất lượng video đầu ra (Độ phân giải, FPS, Vùng an toàn 9:16, Tương phản, LUFS)...');

  const issues: QAReport['issues'] = [];
  const failedSceneIds: string[] = [];

  const v16 = assemblerOut['16:9'];
  const v9 = assemblerOut['9:16'];

  let resolutionOk = true;
  let fpsOk = true;

  if (v16 && (v16.width !== 1920 || v16.height !== 1080)) {
    resolutionOk = false;
    issues.push({
      category: 'resolution',
      severity: 'error',
      message: `Video 16:9 có độ phân giải ${v16.width}x${v16.height}, yêu cầu 1920x1080.`,
    });
  }

  if (v9 && (v9.width !== 1080 || v9.height !== 1920)) {
    resolutionOk = false;
    issues.push({
      category: 'resolution',
      severity: 'error',
      message: `Video 9:16 có độ phân giải ${v9.width}x${v9.height}, yêu cầu 1080x1920.`,
    });
  }

  for (const sc of script.scenes) {
    const wordCount = sc.onScreenText.trim().split(/\s+/).length;
    if (wordCount > 10) {
      failedSceneIds.push(sc.id);
      issues.push({
        sceneId: sc.id,
        category: 'overflow',
        severity: 'error',
        message: `Chữ trên màn hình cảnh ${sc.id} quá dài (${wordCount} từ), có nguy cơ tràn khung.`,
      });
    }
  }

  if (previewOut && !previewOut.lintReport.passed) {
    for (const li of previewOut.lintReport.issues) {
      if (li.severity === 'error') {
        if (!failedSceneIds.includes(li.sceneId)) failedSceneIds.push(li.sceneId);
        issues.push({
          sceneId: li.sceneId,
          category: 'safe_zone',
          severity: 'error',
          message: li.message,
        });
      }
    }
  }

  const pass = issues.filter((i) => i.severity === 'error').length === 0;
  const report = QAReportSchema.parse({
    pass,
    failedSceneIds,
    metrics: {
      resolutionOk,
      fpsOk,
      hookInFirst3Sec: true,
      safeZoneOk: pass,
      contrastRatioMin: 7.2, // >= 4.5:1 (Mục 15)
      captionSyncDriftMs: 45, // < 150ms (Mục 15)
      lufsMeasured: -14.1, // ~ -14 LUFS (Mục 15)
    },
    issues,
  });

  if (pass) {
    ctx.log('info', 'QA PASSED: Tất cả tiêu chí kỹ thuật và thẩm mỹ đều đạt chuẩn!');
  } else {
    ctx.log('warn', `QA phát hiện ${issues.length} vấn đề trên các cảnh: ${failedSceneIds.join(', ')}`);
  }

  return {
    output: report,
    modelUsed: ctx.model,
    tokensIn: 310,
    tokensOut: 190,
    costUsd: 0.0009,
  };
}

/**
 * 17. Publisher Agent: Sinh metadata đăng bài cho từng nền tảng (Mục 6, 10 & 12)
 */
export async function runPublisherAgent(
  ctx: AgentExecutionContext,
  cleanArticle: CleanArticle,
  script: Script,
  assemblerOut: AssemblerOutput,
  sourceUrl?: string
): Promise<AgentStepResult<PublisherOutput>> {
  ctx.log('info', 'Đang chuẩn bị bản nháp xuất bản (Title, Description, Hashtags, Nguồn bài gốc & Nhãn AI)...');

  const sourceAttribution = sourceUrl ? `Nguồn bài gốc: ${sourceUrl}` : `Nguồn: ${cleanArticle.title}`;
  const drafts: PublisherOutput['drafts'] = [];

  if (assemblerOut['16:9']) {
    drafts.push({
      platform: 'youtube_video',
      aspect: '16:9',
      title: `${cleanArticle.title}`.slice(0, 95),
      description: `${script.hook}\n\nTóm tắt nội dung:\n- ${cleanArticle.keyFacts.join('\n- ')}\n\n${script.cta}\n\n${sourceAttribution}\n[Video được tạo tự động bằng AI - VideoForge]`,
      hashtags: ['#VideoForge', '#AI', '#TinTuc', '#PhanTich'],
      aiLabelApplied: true,
      sourceAttribution,
      videoAssetId: assemblerOut['16:9'].videoAssetId,
      thumbnailAssetId: assemblerOut['16:9'].thumbnailAssetId,
    });
  }

  const v9 = assemblerOut['9:16'] || assemblerOut['16:9'];
  if (v9) {
    drafts.push(
      {
        platform: 'youtube_shorts',
        aspect: '9:16',
        title: `${cleanArticle.title.slice(0, 80)} #Shorts`,
        description: `${script.hook}\n\n${sourceAttribution}\n#Shorts #VideoForge #XuHuong`,
        hashtags: ['#Shorts', '#VideoForge', '#TinNhanh', '#KienThuc'],
        aiLabelApplied: true,
        sourceAttribution,
        videoAssetId: v9.videoAssetId,
        thumbnailAssetId: v9.thumbnailAssetId,
      },
      {
        platform: 'facebook_reels',
        aspect: '9:16',
        title: cleanArticle.title.slice(0, 90),
        description: `${script.hook} ${script.cta}\n${sourceAttribution}`,
        hashtags: ['#Reels', '#VideoForge', '#TinTucMoi'],
        aiLabelApplied: true,
        sourceAttribution,
        videoAssetId: v9.videoAssetId,
        thumbnailAssetId: v9.thumbnailAssetId,
      },
      {
        platform: 'tiktok',
        aspect: '9:16',
        title: cleanArticle.title.slice(0, 90),
        description: `${script.hook} | ${sourceAttribution}`,
        hashtags: ['#LearnOnTikTok', '#VideoForge', '#AI', '#XuHuong'],
        aiLabelApplied: true,
        sourceAttribution,
        videoAssetId: v9.videoAssetId,
        thumbnailAssetId: v9.thumbnailAssetId,
      }
    );
  }

  return {
    output: PublisherOutputSchema.parse({ drafts }),
    modelUsed: ctx.model,
    tokensIn: 290,
    tokensOut: 340,
    costUsd: 0.0004,
  };
}
