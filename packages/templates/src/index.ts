import type { AgentName } from '@videoforge/core';

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    bg: string;
    text: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  motionStyle: 'snappy' | 'smooth' | 'bouncy' | 'cinematic';
  useThreeJsDefault: boolean;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'neon_cyber',
    name: 'Neon Cyber',
    description: 'Nền tối sâu, gradient tím – xanh – hồng phát sáng, hạt 3D chuyển động, phù hợp công nghệ & AI',
    palette: {
      primary: '#8B5CF6',
      secondary: '#06B6D4',
      accent: '#EC4899',
      bg: '#090D16',
      text: '#F8FAFC',
    },
    fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
    motionStyle: 'snappy',
    useThreeJsDefault: true,
  },
  {
    id: 'news_modern',
    name: 'Tin tức (Newsroom)',
    description: 'Bố cục rõ ràng, độ tương phản cao, thanh tiêu đề động chuẩn bản tin nhanh',
    palette: {
      primary: '#EF4444',
      secondary: '#3B82F6',
      accent: '#F59E0B',
      bg: '#0F172A',
      text: '#FFFFFF',
    },
    fonts: { heading: 'Inter', body: 'Inter' },
    motionStyle: 'snappy',
    useThreeJsDefault: false,
  },
  {
    id: 'pastel_creator',
    name: 'Pastel Hiện đại',
    description: 'Tông màu dịu mắt, chuyển động nảy nhẹ nhàng, phù hợp lifestyle, giáo dục & giải thích',
    palette: {
      primary: '#6366F1',
      secondary: '#14B8A6',
      accent: '#F43F5E',
      bg: '#1E1B4B',
      text: '#F8FAFC',
    },
    fonts: { heading: 'Plus Jakarta Sans', body: 'Plus Jakarta Sans' },
    motionStyle: 'bouncy',
    useThreeJsDefault: false,
  },
  {
    id: 'minimal_dark',
    name: 'Tối giản (Minimalist)',
    description: 'Tập trung hoàn toàn vào con số và thông điệp chính với chuyển động cực mượt',
    palette: {
      primary: '#10B981',
      secondary: '#64748B',
      accent: '#38BDF8',
      bg: '#09090B',
      text: '#FAFAFA',
    },
    fonts: { heading: 'Inter', body: 'Inter' },
    motionStyle: 'smooth',
    useThreeJsDefault: false,
  },
  {
    id: 'retro_synth',
    name: 'Retro Cinematic',
    description: 'Màu cam vàng hoài cổ kết hợp hiệu ứng điện ảnh cho câu chuyện chiều sâu',
    palette: {
      primary: '#F97316',
      secondary: '#A855F7',
      accent: '#FACC15',
      bg: '#181124',
      text: '#FFFBEB',
    },
    fonts: { heading: 'Plus Jakarta Sans', body: 'Inter' },
    motionStyle: 'cinematic',
    useThreeJsDefault: true,
  },
];

export interface CastPreset {
  id: string;
  name: string;
  description: string;
  castMode: 'lead_accent' | 'dialogue' | 'alternating';
  selectionMode: 'auto_rotate' | 'lock_one' | 'fixed_pair' | 'advanced_scene';
  leadSpeed: number;
  accentSpeed: number;
  leadCaptionColor: string;
  accentCaptionColor: string;
  preferredTags: string[];
}

export const DEFAULT_CAST_PRESETS: CastPreset[] = [
  {
    id: 'news_cast',
    name: 'Tin tức (Dẫn chuyện + Điểm nhấn)',
    description: 'Giọng Lead dẫn mạch chính 65%, giọng Accent mở hook và nhấn số liệu quan trọng 35%',
    castMode: 'lead_accent',
    selectionMode: 'auto_rotate',
    leadSpeed: 1.03,
    accentSpeed: 1.05,
    leadCaptionColor: '#38BDF8',
    accentCaptionColor: '#F472B6',
    preferredTags: ['tin tức', 'rõ ràng', 'năng động'],
  },
  {
    id: 'story_cast',
    name: 'Kể chuyện (Truyền cảm)',
    description: 'Tốc độ đọc điềm tĩnh, chuyển đổi tự nhiên giữa người kể và giọng trích dẫn',
    castMode: 'lead_accent',
    selectionMode: 'auto_rotate',
    leadSpeed: 0.96,
    accentSpeed: 1.0,
    leadCaptionColor: '#F8FAFC',
    accentCaptionColor: '#FBBF24',
    preferredTags: ['trầm', 'ấm', 'kể chuyện'],
  },
  {
    id: 'debate_cast',
    name: 'Đối thoại Hỏi - Đáp',
    description: 'Hai giọng Nam và Nữ đối đáp liên tục giúp giải thích vấn đề phức tạp sinh động',
    castMode: 'dialogue',
    selectionMode: 'auto_rotate',
    leadSpeed: 1.02,
    accentSpeed: 1.02,
    leadCaptionColor: '#60A5FA',
    accentCaptionColor: '#FB7185',
    preferredTags: ['năng động', 'trò chuyện'],
  },
];

export type ModelPresetTier = 'economy' | 'balanced' | 'quality';

export const MODEL_PRESETS: Record<
  ModelPresetTier,
  { name: string; description: string; mapping: Record<AgentName, { model: string; temperature: number }> }
> = {
  economy: {
    name: 'Tiết kiệm (Economy)',
    description: 'Ưu tiên model nhỏ tốc độ cao, chi phí thấp nhất (~$0.01/video)',
    mapping: {
      Collector: { model: 'native-collector', temperature: 0 },
      Cleaner: { model: 'gpt-4o-mini', temperature: 0.2 },
      Analyzer: { model: 'gpt-4o-mini', temperature: 0.3 },
      Scorer: { model: 'gpt-4o-mini', temperature: 0.2 },
      Strategist: { model: 'gpt-4o-mini', temperature: 0.4 },
      Scriptwriter: { model: 'gpt-4o-mini', temperature: 0.6 },
      FactChecker: { model: 'gpt-4o-mini', temperature: 0.1 },
      Director: { model: 'gpt-4o-mini', temperature: 0.4 },
      AssetAgent: { model: 'gpt-4o-mini', temperature: 0.3 },
      VoiceStudio: { model: 'omnivoice', temperature: 0 },
      CaptionAgent: { model: 'whisper-1', temperature: 0 },
      SceneBuilder: { model: 'gpt-4o-mini', temperature: 0.2 },
      LintPreview: { model: 'native-linter', temperature: 0 },
      Renderer: { model: 'hyperframes-cli', temperature: 0 },
      Assembler: { model: 'ffmpeg-assembler', temperature: 0 },
      QAAgent: { model: 'gpt-4o-mini', temperature: 0.1 },
      Publisher: { model: 'gpt-4o-mini', temperature: 0.5 },
    },
  },
  balanced: {
    name: 'Cân bằng (Balanced - Khuyến nghị)',
    description: 'Dùng model mạnh cho Biên kịch, Đạo diễn, Sinh code cảnh và model nhanh cho các bước phụ',
    mapping: {
      Collector: { model: 'native-collector', temperature: 0 },
      Cleaner: { model: 'gpt-4o-mini', temperature: 0.2 },
      Analyzer: { model: 'gpt-4o-mini', temperature: 0.3 },
      Scorer: { model: 'gpt-4o-mini', temperature: 0.2 },
      Strategist: { model: 'gpt-4o', temperature: 0.4 },
      Scriptwriter: { model: 'claude-3-7-sonnet-latest', temperature: 0.65 },
      FactChecker: { model: 'gpt-4o-mini', temperature: 0.1 },
      Director: { model: 'gpt-4o', temperature: 0.45 },
      AssetAgent: { model: 'gpt-4o-mini', temperature: 0.3 },
      VoiceStudio: { model: 'omnivoice', temperature: 0 },
      CaptionAgent: { model: 'whisper-1', temperature: 0 },
      SceneBuilder: { model: 'claude-3-7-sonnet-latest', temperature: 0.25 },
      LintPreview: { model: 'native-linter', temperature: 0 },
      Renderer: { model: 'hyperframes-cli', temperature: 0 },
      Assembler: { model: 'ffmpeg-assembler', temperature: 0 },
      QAAgent: { model: 'gpt-4o', temperature: 0.1 },
      Publisher: { model: 'gpt-4o-mini', temperature: 0.5 },
    },
  },
  quality: {
    name: 'Chất lượng cao (High Quality)',
    description: 'Dùng các model hàng đầu cho toàn bộ chuỗi tư duy kịch bản, đạo diễn, code và kiểm định hình ảnh',
    mapping: {
      Collector: { model: 'native-collector', temperature: 0 },
      Cleaner: { model: 'gpt-4o', temperature: 0.2 },
      Analyzer: { model: 'gpt-4o', temperature: 0.3 },
      Scorer: { model: 'gpt-4o', temperature: 0.2 },
      Strategist: { model: 'claude-3-7-sonnet-latest', temperature: 0.4 },
      Scriptwriter: { model: 'claude-3-7-sonnet-latest', temperature: 0.7 },
      FactChecker: { model: 'gpt-4o', temperature: 0.1 },
      Director: { model: 'claude-3-7-sonnet-latest', temperature: 0.5 },
      AssetAgent: { model: 'gpt-4o', temperature: 0.3 },
      VoiceStudio: { model: 'omnivoice', temperature: 0 },
      CaptionAgent: { model: 'whisper-1', temperature: 0 },
      SceneBuilder: { model: 'claude-3-7-sonnet-latest', temperature: 0.2 },
      LintPreview: { model: 'native-linter', temperature: 0 },
      Renderer: { model: 'hyperframes-cli', temperature: 0 },
      Assembler: { model: 'ffmpeg-assembler', temperature: 0 },
      QAAgent: { model: 'gpt-4o', temperature: 0.1 },
      Publisher: { model: 'gpt-4o', temperature: 0.5 },
    },
  },
};
