import { z } from 'zod';

/**
 * Danh sách 17 Agent trong Pipeline (Mục 6)
 */
export const AGENT_NAMES = [
  'Collector',
  'Cleaner',
  'Analyzer',
  'Scorer',
  'Strategist',
  'Scriptwriter',
  'FactChecker',
  'Director',
  'AssetAgent',
  'VoiceStudio',
  'CaptionAgent',
  'SceneBuilder',
  'LintPreview',
  'Renderer',
  'Assembler',
  'QAAgent',
  'Publisher',
] as const;

export type AgentName = (typeof AGENT_NAMES)[number];

export interface AgentStepDefinition {
  stepIndex: number; // 1..17
  agent: AgentName;
  displayName: string;
  description: string;
  usesLlm: boolean;
  recommendedTier: 'none' | 'small' | 'medium' | 'strong_writing' | 'strong_coding' | 'vision' | 'tts' | 'stt';
  defaultRequiresApproval: boolean;
  canDisable: boolean; // Mục 6.1: Chỉ các bước 3, 4, 5, 7, 9, 11, 13, 16 được phép tắt
}

export const PIPELINE_STEPS: AgentStepDefinition[] = [
  {
    stepIndex: 1,
    agent: 'Collector',
    displayName: '1. Collector (Thu thập nguồn)',
    description: 'Trích xuất văn bản, tiêu đề và hình ảnh từ URL, Text, PDF hoặc RSS',
    usesLlm: false,
    recommendedTier: 'none',
    defaultRequiresApproval: false,
    canDisable: false,
  },
  {
    stepIndex: 2,
    agent: 'Cleaner',
    displayName: '2. Cleaner (Làm sạch nội dung)',
    description: 'Lọc nhiễu quảng cáo, chuẩn hóa nội dung và trích xuất các dữ kiện cốt lõi (keyFacts)',
    usesLlm: true,
    recommendedTier: 'small',
    defaultRequiresApproval: false,
    canDisable: false,
  },
  {
    stepIndex: 3,
    agent: 'Analyzer',
    displayName: '3. Analyzer (Phân tích chủ đề)',
    description: 'Xác định chủ đề, đối tượng khán giả, tông giọng, góc tiếp cận hook và rủi ro',
    usesLlm: true,
    recommendedTier: 'medium',
    defaultRequiresApproval: false,
    canDisable: true,
  },
  {
    stepIndex: 4,
    agent: 'Scorer',
    displayName: '4. Scorer (Chấm điểm tiềm năng)',
    description: 'Chấm điểm bài viết theo thang 0-10 (Hook 30%, Novelty 25%, Clarity 25%, Controversy 10%, Visualizability 10%)',
    usesLlm: true,
    recommendedTier: 'medium',
    defaultRequiresApproval: false,
    canDisable: true,
  },
  {
    stepIndex: 5,
    agent: 'Strategist',
    displayName: '5. Strategist (Chiến lược video)',
    description: 'Quyết định định dạng, thời lượng, nhịp điệu, phong cách thị giác và tỉ lệ khung hình',
    usesLlm: true,
    recommendedTier: 'medium',
    defaultRequiresApproval: false,
    canDisable: true,
  },
  {
    stepIndex: 6,
    agent: 'Scriptwriter',
    displayName: '6. Scriptwriter (Biên kịch 2 giọng)',
    description: 'Viết kịch bản phân cảnh với Hook 3s đầu, phân vai giọng Lead & Accent, chữ trên màn hình <= 8 từ',
    usesLlm: true,
    recommendedTier: 'strong_writing',
    defaultRequiresApproval: true,
    canDisable: false,
  },
  {
    stepIndex: 7,
    agent: 'FactChecker',
    displayName: '7. Fact-checker (Kiểm chứng dữ kiện)',
    description: 'Đối chiếu số liệu kịch bản với bài gốc và kiểm tra quy tắc phân vai Lead/Accent',
    usesLlm: true,
    recommendedTier: 'medium',
    defaultRequiresApproval: false,
    canDisable: true,
  },
  {
    stepIndex: 8,
    agent: 'Director',
    displayName: '8. Director (Đạo diễn Storyboard)',
    description: 'Thiết kế Storyboard từng cảnh, chọn engine (HyperFrames/Remotion/Manim/Blender), bố cục, bảng màu và chuyển cảnh',
    usesLlm: true,
    recommendedTier: 'strong_writing',
    defaultRequiresApproval: true,
    canDisable: false,
  },
  {
    stepIndex: 9,
    agent: 'AssetAgent',
    displayName: '9. Asset Agent (Tài nguyên & Âm nhạc)',
    description: 'Chuẩn bị hình ảnh minh họa, nhạc nền (beat) và hiệu ứng âm thanh (SFX) có thông tin bản quyền',
    usesLlm: true,
    recommendedTier: 'small',
    defaultRequiresApproval: false,
    canDisable: true,
  },
  {
    stepIndex: 10,
    agent: 'VoiceStudio',
    displayName: '10. Voice Studio (Tổng hợp giọng Cast)',
    description: 'Chọn cặp giọng Nam/Nữ từ Voice Pool, tổng hợp từng đoạn qua Voice Studio (192.168.5.18:3900), chèn nghỉ & chuẩn hóa LUFS',
    usesLlm: false,
    recommendedTier: 'tts',
    defaultRequiresApproval: false,
    canDisable: false,
  },
  {
    stepIndex: 11,
    agent: 'CaptionAgent',
    displayName: '11. Caption Agent (Đồng bộ phụ đề)',
    description: 'Lấy mốc thời gian từng từ qua Transcriptions/Whisper, lọc thẻ biểu cảm và gắn nhãn màu theo giọng Lead/Accent',
    usesLlm: false,
    recommendedTier: 'stt',
    defaultRequiresApproval: false,
    canDisable: true,
  },
  {
    stepIndex: 12,
    agent: 'SceneBuilder',
    displayName: '12. Scene Builder (Sinh code cảnh)',
    description: 'Sinh code composition cho từng cảnh (HTML HyperFrames + GSAP + three.js riêng cho 16:9 & 9:16, TSX Remotion, Python Manim)',
    usesLlm: true,
    recommendedTier: 'strong_coding',
    defaultRequiresApproval: false,
    canDisable: false,
  },
  {
    stepIndex: 13,
    agent: 'LintPreview',
    displayName: '13. Lint & Preview (Kiểm tra & Ảnh chụp)',
    description: 'Kiểm tra cú pháp HTML/TSX/Python, vùng an toàn 9:16, độ tương phản chữ và tạo ảnh snapshot xem trước',
    usesLlm: false,
    recommendedTier: 'none',
    defaultRequiresApproval: false,
    canDisable: true,
  },
  {
    stepIndex: 14,
    agent: 'Renderer',
    displayName: '14. Renderer (Kết xuất cảnh)',
    description: 'Chạy HyperFrames CLI (npx hyperframes), Remotion, Manim hoặc Blender MCP để render từng clip cảnh MP4',
    usesLlm: false,
    recommendedTier: 'none',
    defaultRequiresApproval: false,
    canDisable: false,
  },
  {
    stepIndex: 15,
    agent: 'Assembler',
    displayName: '15. Assembler (Ghép nối FFmpeg)',
    description: 'Chuẩn hóa FPS/kích thước, ghép các cảnh, trộn giọng đọc + nhạc nền sidechain ducking, burn phụ đề và tạo thumbnail',
    usesLlm: false,
    recommendedTier: 'none',
    defaultRequiresApproval: false,
    canDisable: false,
  },
  {
    stepIndex: 16,
    agent: 'QAAgent',
    displayName: '16. QA Agent (Kiểm định chất lượng)',
    description: 'Kiểm tra độ phân giải, thời lượng, chữ tràn khung, tương phản >= 4.5:1, vùng an toàn và âm lượng LUFS',
    usesLlm: true,
    recommendedTier: 'vision',
    defaultRequiresApproval: false,
    canDisable: true,
  },
  {
    stepIndex: 17,
    agent: 'Publisher',
    displayName: '17. Publisher (Chuẩn bị đăng bài)',
    description: 'Sinh tiêu đề, mô tả (kèm nguồn bài gốc & nhãn AI), bộ hashtag tối ưu và bản nháp cho YouTube, Shorts, Reels, TikTok',
    usesLlm: true,
    recommendedTier: 'small',
    defaultRequiresApproval: true,
    canDisable: false,
  },
];

export const DISABLEABLE_STEPS = new Set(
  PIPELINE_STEPS.filter((s) => s.canDisable).map((s) => s.stepIndex)
);

// ============================================================================
// ZOD SCHEMAS CHO 17 AGENT (Mục 6)
// ============================================================================

// Step 1: Collector -> RawArticle
export const RawArticleSchema = z.object({
  title: z.string().min(1),
  text: z.string().min(1),
  images: z.array(z.string()).default([]),
  url: z.string().default(''),
  publishedAt: z.string().optional(),
});
export type RawArticle = z.infer<typeof RawArticleSchema>;

// Step 2: Cleaner -> CleanArticle
export const CleanArticleSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  keyFacts: z.array(z.string()).min(1),
  images: z.array(z.string()).default([]),
});
export type CleanArticle = z.infer<typeof CleanArticleSchema>;

// Step 3: Analyzer -> Analysis
export const AnalysisSchema = z.object({
  topic: z.string(),
  audience: z.string(),
  tone: z.string(),
  hookAngles: z.array(z.string()).min(1),
  risks: z.array(z.string()).default([]),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

// Step 4: Scorer -> Score (Mục 6.2: hook 30%, novelty 25%, clarity 25%, controversy 10%, visualizability 10%)
export const ScoreSchema = z.object({
  total: z.number().min(0).max(10),
  hook: z.number().min(0).max(10),
  novelty: z.number().min(0).max(10),
  clarity: z.number().min(0).max(10),
  controversy: z.number().min(0).max(10),
  visualizability: z.number().min(0).max(10).default(7.5),
  verdict: z.enum(['pass', 'below_threshold']),
  reasons: z.array(z.string()),
});
export type Score = z.infer<typeof ScoreSchema>;

// Step 5: Strategist -> Strategy
export const StrategySchema = z.object({
  format: z.enum(['news_brief', 'explainer', 'storytelling', 'data_ranking', 'debate']),
  durationSec: z.number().min(15).max(180),
  style: z.string(),
  pacing: z.enum(['snappy', 'smooth', 'bouncy', 'cinematic']),
  aspect: z.enum(['16:9', '9:16', 'both']),
  castMode: z.enum(['lead_accent', 'dialogue', 'alternating']).default('lead_accent'),
});
export type Strategy = z.infer<typeof StrategySchema>;

// Step 6: Scriptwriter -> Script (Mục 6 & 8.3: phân vai lead/accent, onScreenText <= 8 từ)
export const ScriptSegmentSchema = z.object({
  speaker: z.enum(['lead', 'accent']),
  text: z.string().min(1),
  emphasis: z.string().optional(),
});
export type ScriptSegment = z.infer<typeof ScriptSegmentSchema>;

export const ScriptSceneSchema = z.object({
  id: z.string(),
  segments: z.array(ScriptSegmentSchema).min(1),
  onScreenText: z.string(),
  durationSec: z.number().min(2).max(45),
  dataPoints: z.array(z.object({ label: z.string(), value: z.number() })).optional(),
});
export type ScriptScene = z.infer<typeof ScriptSceneSchema>;

export const ScriptSchema = z.object({
  hook: z.string().min(1),
  scenes: z.array(ScriptSceneSchema).min(1),
  cta: z.string().min(1),
});
export type Script = z.infer<typeof ScriptSchema>;

// Step 7: Fact-checker -> FactCheck
export const FactCheckSchema = z.object({
  issues: z.array(
    z.object({
      sceneId: z.string().optional(),
      severity: z.enum(['info', 'warning', 'critical']),
      description: z.string(),
    })
  ),
  fixedScript: ScriptSchema,
});
export type FactCheck = z.infer<typeof FactCheckSchema>;

// Step 8: Director -> Storyboard
export const StoryboardSceneSchema = z.object({
  id: z.string(),
  engine: z.enum(['hyperframes', 'remotion', 'manim', 'blender']).default('hyperframes'),
  remotionTemplate: z.enum(['BarChartRace', 'Counter', 'Leaderboard']).optional(),
  layout: z.enum([
    'hero_headline',
    'split_comparison',
    'stat_spotlight',
    'quote_card',
    'kinetic_typography',
    'threejs_particles',
    'chart_data',
  ]),
  palette: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    bg: z.string(),
    text: z.string(),
  }),
  transitions: z.enum(['fade', 'slide_up', 'zoom_burst', 'glitch', 'wipe']).default('slide_up'),
  useThreeJs: z.boolean().default(false),
  assetsNeeded: z.array(z.string()).default([]),
  visualNotes: z.string().optional(),
});
export type StoryboardScene = z.infer<typeof StoryboardSceneSchema>;

export const StoryboardSchema = z.object({
  scenes: z.array(StoryboardSceneSchema).min(1),
});
export type Storyboard = z.infer<typeof StoryboardSchema>;

// Step 9: Asset Agent -> Assets
export const AssetsOutputSchema = z.object({
  images: z.array(
    z.object({
      sceneId: z.string(),
      path: z.string(),
      license: z.string(),
      source: z.string(),
    })
  ),
  music: z.object({
    path: z.string(),
    title: z.string(),
    bpm: z.number(),
    license: z.string(),
  }),
  sfx: z.array(
    z.object({
      sceneId: z.string(),
      path: z.string(),
      kind: z.string(),
      license: z.string(),
    })
  ),
});
export type AssetsOutput = z.infer<typeof AssetsOutputSchema>;

// Step 10: Voice Studio -> VoiceOutput
export const WordTimingSchema = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
  speaker: z.enum(['lead', 'accent']),
  sceneId: z.string().optional(),
});
export type WordTiming = z.infer<typeof WordTimingSchema>;

export const VoiceSceneAudioSchema = z.object({
  sceneId: z.string(),
  audioPath: z.string(),
  durationSec: z.number(),
  segments: z.array(
    z.object({
      speaker: z.enum(['lead', 'accent']),
      voiceId: z.string(),
      text: z.string(),
      audioPath: z.string(),
      durationSec: z.number(),
      startSec: z.number(),
      endSec: z.number(),
      seed: z.number(),
    })
  ),
});

export const VoiceOutputSchema = z.object({
  audioPath: z.string(),
  durationSec: z.number(),
  wordTimings: z.array(WordTimingSchema),
  sceneAudios: z.array(VoiceSceneAudioSchema),
  castUsed: z.object({
    mode: z.string(),
    seed: z.number(),
    leadVoiceId: z.string(),
    leadVoiceName: z.string(),
    accentVoiceId: z.string(),
    accentVoiceName: z.string(),
    reason: z.string(),
    singleVoiceFallback: z.boolean().default(false),
  }),
});
export type VoiceOutput = z.infer<typeof VoiceOutputSchema>;

// Step 11: Caption Agent -> CaptionsOutput
export const CaptionsOutputSchema = z.object({
  words: z.array(WordTimingSchema),
  srtPath: z.string(),
  assPath: z.string().optional(),
  methodUsed: z.enum(['voice_studio_asr', 'local_whisper', 'ffprobe_character_estimate']),
  style: z.object({
    leadColor: z.string(),
    accentColor: z.string(),
    fontFamily: z.string(),
    fontSize9x16: z.number().min(48),
    fontSize16x9: z.number().min(36),
  }),
});
export type CaptionsOutput = z.infer<typeof CaptionsOutputSchema>;

// Step 12: Scene Builder -> SceneCode[]
export const SceneCodeItemSchema = z.object({
  sceneId: z.string(),
  engine: z.enum(['hyperframes', 'remotion', 'manim', 'blender']),
  durationSec: z.number(),
  html16x9: z.string().optional(),
  html9x16: z.string().optional(),
  remotionProps: z.record(z.any()).optional(),
  manimCode: z.string().optional(),
  blenderScript: z.string().optional(),
  dirPath: z.string(),
});
export type SceneCodeItem = z.infer<typeof SceneCodeItemSchema>;

export const SceneBuilderOutputSchema = z.object({
  scenes: z.array(SceneCodeItemSchema).min(1),
});
export type SceneBuilderOutput = z.infer<typeof SceneBuilderOutputSchema>;

// Step 13: Lint & Preview -> PreviewOutput
export const PreviewOutputSchema = z.object({
  lintReport: z.object({
    passed: z.boolean(),
    issues: z.array(
      z.object({
        sceneId: z.string(),
        aspect: z.enum(['16:9', '9:16']).optional(),
        rule: z.string(),
        message: z.string(),
        severity: z.enum(['info', 'warning', 'error']),
      })
    ),
  }),
  snapshots: z.array(
    z.object({
      sceneId: z.string(),
      aspect: z.enum(['16:9', '9:16']),
      imagePath: z.string(),
      assetId: z.string().optional(),
    })
  ),
});
export type PreviewOutput = z.infer<typeof PreviewOutputSchema>;

// Step 14: Renderer -> SceneClips[]
export const SceneClipItemSchema = z.object({
  sceneId: z.string(),
  aspect: z.enum(['16:9', '9:16']),
  clipPath: z.string(),
  durationSec: z.number(),
  width: z.number(),
  height: z.number(),
  engineUsed: z.string(),
  assetId: z.string().optional(),
});
export type SceneClipItem = z.infer<typeof SceneClipItemSchema>;

export const RendererOutputSchema = z.object({
  clips: z.array(SceneClipItemSchema).min(1),
});
export type RendererOutput = z.infer<typeof RendererOutputSchema>;

// Step 15: Assembler -> FinalVideos
export const FinalVideoInfoSchema = z.object({
  path: z.string(),
  thumbnailPath: z.string(),
  durationSec: z.number(),
  width: z.number(),
  height: z.number(),
  fps: z.number(),
  lufs: z.number(),
  videoAssetId: z.string().optional(),
  thumbnailAssetId: z.string().optional(),
});

export const AssemblerOutputSchema = z.object({
  '16:9': FinalVideoInfoSchema.optional(),
  '9:16': FinalVideoInfoSchema.optional(),
});
export type AssemblerOutput = z.infer<typeof AssemblerOutputSchema>;

// Step 16: QA Agent -> QAReport
export const QAReportSchema = z.object({
  pass: z.boolean(),
  failedSceneIds: z.array(z.string()).default([]),
  metrics: z.object({
    resolutionOk: z.boolean(),
    fpsOk: z.boolean(),
    hookInFirst3Sec: z.boolean(),
    safeZoneOk: z.boolean(),
    contrastRatioMin: z.number(),
    captionSyncDriftMs: z.number(),
    lufsMeasured: z.number(),
  }),
  issues: z.array(
    z.object({
      sceneId: z.string().optional(),
      category: z.enum(['resolution', 'overflow', 'contrast', 'safe_zone', 'audio_lufs', 'black_frame', 'hook']),
      severity: z.enum(['warning', 'error']),
      message: z.string(),
    })
  ),
});
export type QAReport = z.infer<typeof QAReportSchema>;

// Step 17: Publisher -> PublishDrafts[]
export const PublishDraftSchema = z.object({
  platform: z.enum(['youtube_video', 'youtube_shorts', 'facebook_reels', 'tiktok']),
  aspect: z.enum(['16:9', '9:16']),
  title: z.string(),
  description: z.string(),
  hashtags: z.array(z.string()),
  aiLabelApplied: z.boolean().default(true),
  sourceAttribution: z.string(),
  videoAssetId: z.string().optional(),
  thumbnailAssetId: z.string().optional(),
});
export type PublishDraft = z.infer<typeof PublishDraftSchema>;

export const PublisherOutputSchema = z.object({
  drafts: z.array(PublishDraftSchema).min(1),
});
export type PublisherOutput = z.infer<typeof PublisherOutputSchema>;
