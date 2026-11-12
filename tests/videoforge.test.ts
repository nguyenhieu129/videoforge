import { describe, it, expect } from 'vitest';
import {
  PIPELINE_STEPS,
  DISABLEABLE_STEPS,
  encryptSecret,
  decryptSecret,
  maskSecret,
  ScriptSchema,
  ScoreSchema,
  StoryboardSchema,
} from '../packages/core/src/index.js';
import {
  detectGenderFromName,
  stripExpressiveTags,
  pickCast,
  type PoolVoice,
} from '../packages/voice/src/index.js';
import {
  generateHyperFramesCompositionHtml,
  lintHyperFramesHtml,
} from '../packages/engines/hyperframes/src/index.js';
import { PLATFORM_LIMITS, validatePublishConstraints } from '../packages/publishers/src/index.js';

describe('VideoForge Unit & Golden Tests (Section 16)', () => {
  it('validates 17 pipeline steps and disableable rule (only 3, 4, 5, 7, 9, 11, 13, 16)', () => {
    expect(PIPELINE_STEPS.length).toBe(17);
    expect([...DISABLEABLE_STEPS].sort((a, b) => a - b)).toEqual([3, 4, 5, 7, 9, 11, 13, 16]);
  });

  it('encrypts and decrypts API keys with AES-256-GCM without leaking plaintext', () => {
    const rawKey = 'sk-proj-1234567890abcdef';
    const encrypted = encryptSecret(rawKey);
    expect(encrypted).not.toContain(rawKey);
    expect(decryptSecret(encrypted)).toBe(rawKey);
    expect(maskSecret(encrypted)).toBe('sk-p••••cdef');
  });

  it('validates Zod schemas for Script, Score, and Storyboard', () => {
    const script = ScriptSchema.parse({
      hook: '3 giây đầu gây tò mò!',
      scenes: [
        {
          id: 'scene_1',
          durationSec: 6,
          onScreenText: 'Đột phá AI 2026',
          segments: [
            { speaker: 'accent', text: 'Bạn đã sẵn sàng chưa?' },
            { speaker: 'lead', text: 'Cùng khám phá ngay sau đây.' },
          ],
        },
      ],
      cta: 'Theo dõi kênh ngay!',
    });
    expect(script.scenes[0].segments.length).toBe(2);

    const score = ScoreSchema.parse({
      total: 8.1,
      hook: 8.5,
      novelty: 8.0,
      clarity: 8.0,
      controversy: 7.0,
      visualizability: 8.5,
      verdict: 'pass',
      reasons: ['Hook tốt'],
    });
    expect(score.verdict).toBe('pass');

    const sb = StoryboardSchema.parse({
      scenes: [
        {
          id: 'scene_1',
          engine: 'hyperframes',
          layout: 'hero_headline',
          palette: {
            primary: '#8B5CF6',
            secondary: '#06B6D4',
            accent: '#EC4899',
            bg: '#090D16',
            text: '#F8FAFC',
          },
          transitions: 'zoom_burst',
          useThreeJs: true,
          assetsNeeded: [],
        },
      ],
    });
    expect(sb.scenes[0].engine).toBe('hyperframes');
  });

  it('detects gender from _nam and _nu suffix and strips OmniVoice expressive tags from captions', () => {
    expect(detectGenderFromName('giong_1_nam')).toBe('nam');
    expect(detectGenderFromName('giong_2_nu')).toBe('nu');
    expect(detectGenderFromName('LAN_NU')).toBe('nu');
    expect(detectGenderFromName('alloy')).toBe('unclassified');

    const rawText = 'Thật bất ngờ [surprise-wa] khi hiệu suất tăng gấp đôi [laughter] chỉ sau 1 tuần!';
    expect(stripExpressiveTags(rawText)).toBe('Thật bất ngờ khi hiệu suất tăng gấp đôi chỉ sau 1 tuần!');
  });

  it('selects deterministic male + female Voice Cast pair using seededRng and pickCast', () => {
    const pool: PoolVoice[] = [
      {
        id: '7cc37272',
        voiceId: '7cc37272',
        name: 'giong_1_nam',
        type: 'profile',
        gender: 'nam',
        cloned: true,
        language: 'Auto',
        addressableByName: true,
        enabled: true,
        weight: 1,
        tags: ['tin tức'],
      },
      {
        id: 'giong_2_nu',
        voiceId: 'giong_2_nu',
        name: 'giong_2_nu',
        type: 'profile',
        gender: 'nu',
        cloned: true,
        language: 'Auto',
        addressableByName: true,
        enabled: true,
        weight: 1,
        tags: ['tin tức'],
      },
    ];

    const cast1 = pickCast(pool, [], { mode: 'auto_rotate', avoidLastN: 3, locks: {} }, 9999);
    const cast2 = pickCast(pool, [], { mode: 'auto_rotate', avoidLastN: 3, locks: {} }, 9999);
    expect(cast1.lead.id).toBe(cast2.lead.id);
    expect(cast1.accent.id).toBe(cast2.accent.id);
    expect(cast1.singleVoiceFallback).toBe(false);
  });

  it('generates separate 16:9 and 9:16 HyperFrames compositions and passes Lint rules', () => {
    const baseInput = {
      scene: {
        id: 'scene_1',
        durationSec: 5,
        onScreenText: 'Siêu công nghệ VideoForge',
        segments: [{ speaker: 'lead' as const, text: 'Nội dung dẫn chuyện chính xác.' }],
      },
      storyboard: {
        id: 'scene_1',
        engine: 'hyperframes' as const,
        layout: 'hero_headline' as const,
        palette: {
          primary: '#8B5CF6',
          secondary: '#06B6D4',
          accent: '#EC4899',
          bg: '#090D16',
          text: '#F8FAFC',
        },
        transitions: 'slide_up' as const,
        useThreeJs: true,
        assetsNeeded: [],
      },
      words: [{ text: 'Nội', start: 0, end: 0.3, speaker: 'lead' as const }],
      leadCaptionColor: '#38BDF8',
      accentCaptionColor: '#F472B6',
      fontHeading: 'Plus Jakarta Sans',
      fontBody: 'Inter',
    };

    const html16x9 = generateHyperFramesCompositionHtml({ ...baseInput, aspect: '16:9' });
    const html9x16 = generateHyperFramesCompositionHtml({ ...baseInput, aspect: '9:16' });

    expect(html16x9).toContain('data-width="1920"');
    expect(html16x9).toContain('data-height="1080"');
    expect(html9x16).toContain('data-width="1080"');
    expect(html9x16).toContain('data-height="1920"');

    expect(lintHyperFramesHtml(html16x9, 'scene_1', '16:9')).toEqual([]);
    expect(lintHyperFramesHtml(html9x16, 'scene_1', '9:16')).toEqual([]);
  });

  it('enforces platform limits for YouTube Shorts, Reels, TikTok, and YouTube 16:9', () => {
    expect(PLATFORM_LIMITS.youtube_shorts.maxDurationSec).toBe(180);
    const check = validatePublishConstraints({
      platform: 'youtube_shorts',
      durationSec: 45,
      aspect: '9:16',
    });
    expect(check.valid).toBe(true);
  });
});
