/**
 * Giới hạn kỹ thuật hiện hành theo từng nền tảng (Mục 10.3: packages/publishers/limits.ts)
 */
export type PublishPlatform = 'youtube_video' | 'youtube_shorts' | 'facebook_reels' | 'tiktok';

export interface PlatformLimit {
  platform: PublishPlatform;
  displayName: string;
  aspect: '16:9' | '9:16';
  maxDurationSec: number;
  maxFileSizeMb: number;
  maxTitleLength: number;
  maxDescriptionLength: number;
  requiredHashtags?: string[];
  requiresAiDisclosure: boolean;
}

export const PLATFORM_LIMITS: Record<PublishPlatform, PlatformLimit> = {
  youtube_shorts: {
    platform: 'youtube_shorts',
    displayName: 'YouTube Shorts',
    aspect: '9:16',
    maxDurationSec: 180, // Tối đa 3 phút (Mục 10.1 & 10.3)
    maxFileSizeMb: 2048,
    maxTitleLength: 100,
    maxDescriptionLength: 5000,
    requiredHashtags: ['#Shorts'],
    requiresAiDisclosure: true,
  },
  youtube_video: {
    platform: 'youtube_video',
    displayName: 'YouTube Video (16:9)',
    aspect: '16:9',
    maxDurationSec: 43200, // 12 giờ
    maxFileSizeMb: 128000,
    maxTitleLength: 100,
    maxDescriptionLength: 5000,
    requiresAiDisclosure: true,
  },
  facebook_reels: {
    platform: 'facebook_reels',
    displayName: 'Facebook Reels',
    aspect: '9:16',
    maxDurationSec: 90,
    maxFileSizeMb: 1024,
    maxTitleLength: 255,
    maxDescriptionLength: 2200,
    requiresAiDisclosure: true,
  },
  tiktok: {
    platform: 'tiktok',
    displayName: 'TikTok',
    aspect: '9:16',
    maxDurationSec: 600, // 10 phút qua Content Posting API
    maxFileSizeMb: 4096,
    maxTitleLength: 150,
    maxDescriptionLength: 2200,
    requiresAiDisclosure: true,
  },
};
