import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { WordTiming } from '@videoforge/core';

export interface Voice {
  id: string;
  voiceId: string;
  name: string;
  type: 'profile' | 'openai_alias' | 'preset';
  gender: 'nam' | 'nu' | 'unclassified';
  cloned: boolean;
  language: string;
  addressableByName: boolean;
}

export interface VoiceEngineInfo {
  id: string;
  available: boolean;
  supportsEmotion?: boolean;
  maxRefSeconds?: number;
}

export interface PoolVoice extends Voice {
  enabled: boolean;
  weight: number;
  tags: string[];
  genderOverride?: 'nam' | 'nu';
  consentNote?: string;
}

export interface VoiceUsage {
  id: string;
  voiceId: string;
  projectId: string;
  runId: string;
  role: 'lead' | 'accent';
  usedAt: string;
}

export interface CastOpts {
  mode: 'auto_rotate' | 'lock_one' | 'fixed_pair' | 'advanced_scene';
  avoidLastN: number;
  locks: {
    male?: PoolVoice;
    female?: PoolVoice;
    leadVoiceId?: string;
    accentVoiceId?: string;
  };
  leadGender?: 'nam' | 'nu';
  preferredTags?: string[];
}

export interface SelectedCast {
  lead: PoolVoice;
  accent: PoolVoice;
  singleVoiceFallback: boolean;
  reason: string;
}

export interface VoiceProvider {
  listVoices(opts?: { includeAliases?: boolean }): Promise<{ voices: Voice[]; engines: VoiceEngineInfo[] }>;
  synthesize(opts: {
    text: string;
    voiceId: string;
    model?: string;
    speed?: number;
    emotion?: string;
    language?: string;
    seed?: number;
    numStep?: number;
    outputPath: string;
  }): Promise<{ audioPath: string; durationSec: number }>;
  transcribe(opts: {
    audioPath: string;
    language?: string;
    model?: string;
  }): Promise<{ words: Array<{ text: string; start: number; end: number }> }>;
}

/**
 * Nhận diện giới tính theo tên (Mục 8.3.1):
 * Giọng nam: xxx_nam, Giọng nữ: xxx_nu. Regex: ^(.+)_(nam|nu)$, không phân biệt hoa thường.
 */
export function detectGenderFromName(name: string, override?: 'nam' | 'nu'): 'nam' | 'nu' | 'unclassified' {
  if (override === 'nam' || override === 'nu') return override;
  const match = name.trim().match(/^(.+)_(nam|nu)$/i);
  if (!match) return 'unclassified';
  return match[2].toLowerCase() === 'nam' ? 'nam' : 'nu';
}

/**
 * Lọc các thẻ biểu cảm của OmniVoice ra khỏi văn bản hiển thị phụ đề (Mục 8.2.1)
 */
export function stripExpressiveTags(text: string): string {
  return text
    .replace(/\[(laughter|sigh|surprise-ah|surprise-wa|question-en|dissatisfaction-hnn|breath|pause)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Seeded RNG tất định để chạy lại bước 10 với cùng voiceCastSeed cho đúng cặp giọng cũ (Mục 8.3.1)
 */
export function seededRng(seed: number): () => number {
  let state = seed >>> 0 || 123456789;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function recentVoiceIds(history: VoiceUsage[], avoidLastN: number): Set<string> {
  if (avoidLastN <= 0 || history.length === 0) return new Set();
  const seenRuns: string[] = [];
  const voiceSet = new Set<string>();
  const sorted = [...history].sort((a, b) => (a.usedAt < b.usedAt ? 1 : -1));
  for (const u of sorted) {
    if (!seenRuns.includes(u.runId)) {
      if (seenRuns.length >= avoidLastN) break;
      seenRuns.push(u.runId);
    }
    voiceSet.add(u.voiceId);
  }
  return voiceSet;
}

function rarityBoost(voice: PoolVoice, history: VoiceUsage[]): number {
  const count = history.filter((h) => h.voiceId === voice.id || h.voiceId === voice.voiceId).length;
  return 1 / (1 + count * 0.35);
}

function weightedPick<T>(items: T[], weightFn: (item: T) => number, rng: () => number): T {
  const weights = items.map((it) => Math.max(0.01, weightFn(it)));
  const total = weights.reduce((acc, w) => acc + w, 0);
  let threshold = rng() * total;
  for (let i = 0; i < items.length; i++) {
    threshold -= weights[i];
    if (threshold <= 0) return items[i];
  }
  return items[items.length - 1];
}

function lastLeadGender(history: VoiceUsage[], pool: PoolVoice[]): 'nam' | 'nu' {
  const sorted = [...history].sort((a, b) => (a.usedAt < b.usedAt ? 1 : -1));
  const lastLead = sorted.find((u) => u.role === 'lead');
  if (!lastLead) return 'nu'; // Mặc định để video đầu tiên chọn 'nam' làm lead (oppositeOf('nu') === 'nam')
  const found = pool.find((v) => v.id === lastLead.voiceId || v.voiceId === lastLead.voiceId);
  const g = found ? found.genderOverride || found.gender : detectGenderFromName(lastLead.voiceId);
  return g === 'nam' ? 'nam' : 'nu';
}

function oppositeOf(gender: 'nam' | 'nu'): 'nam' | 'nu' {
  return gender === 'nam' ? 'nu' : 'nam';
}

/**
 * Thuật toán chọn cặp giọng tự động theo đúng đặc tả Mục 8.3.1
 */
export function pickCast(
  pool: PoolVoice[],
  history: VoiceUsage[],
  opts: CastOpts,
  seed: number
): SelectedCast {
  const rng = seededRng(seed);
  // Alias OpenAI không bao giờ vào pool tự động
  const validPool = pool.filter((v) => v.enabled && v.type !== 'openai_alias');

  // Chế độ Cố định cả cặp (fixed_pair)
  if (opts.mode === 'fixed_pair' && opts.locks.leadVoiceId && opts.locks.accentVoiceId) {
    const lead = validPool.find((v) => v.id === opts.locks.leadVoiceId || v.voiceId === opts.locks.leadVoiceId);
    const accent = validPool.find((v) => v.id === opts.locks.accentVoiceId || v.voiceId === opts.locks.accentVoiceId);
    if (lead && accent) {
      return {
        lead,
        accent,
        singleVoiceFallback: lead.id === accent.id,
        reason: `Cố định cả cặp: ${lead.name} dẫn, ${accent.name} nhấn`,
      };
    }
  }

  const recent = recentVoiceIds(history, opts.avoidLastN);
  const pick = (gender: 'nam' | 'nu'): PoolVoice | undefined => {
    let cands = validPool.filter((v) => (v.genderOverride || v.gender) === gender);
    if (cands.length === 0) return undefined;
    const fresh = cands.filter((v) => !recent.has(v.id) && !recent.has(v.voiceId));
    if (fresh.length > 0) cands = fresh;
    return weightedPick(
      cands,
      (v) => {
        const tagBonus =
          opts.preferredTags && v.tags.some((t) => opts.preferredTags!.includes(t)) ? 1.5 : 1.0;
        return v.weight * rarityBoost(v, history) * tagBonus;
      },
      rng
    );
  };

  const male = opts.locks.male ?? pick('nam');
  const female = opts.locks.female ?? pick('nu');

  // Khi pool thiếu 1 trong 2 giới (Mục 8.2.1 & 8.3.1: chạy chế độ một giọng và ghi cảnh báo, không giả lập bằng đổi cao độ)
  if (male && !female) {
    return {
      lead: male,
      accent: male,
      singleVoiceFallback: true,
      reason: `Chế độ 1 giọng (${male.name}): Chưa có giọng nữ (_nu) trong Voice Pool`,
    };
  }
  if (!male && female) {
    return {
      lead: female,
      accent: female,
      singleVoiceFallback: true,
      reason: `Chế độ 1 giọng (${female.name}): Chưa có giọng nam (_nam) trong Voice Pool`,
    };
  }
  if (!male && !female) {
    const fallbackVoice: PoolVoice = validPool[0] || {
      id: '7cc37272',
      voiceId: '7cc37272',
      name: 'giong_1_nam',
      type: 'profile',
      gender: 'nam',
      cloned: true,
      language: 'vi',
      addressableByName: true,
      enabled: true,
      weight: 1,
      tags: ['tin tức'],
    };
    return {
      lead: fallbackVoice,
      accent: fallbackVoice,
      singleVoiceFallback: true,
      reason: `Chế độ 1 giọng mặc định (${fallbackVoice.name})`,
    };
  }

  const leadGender = opts.leadGender ?? oppositeOf(lastLeadGender(history, validPool));
  const selected =
    leadGender === 'nam'
      ? { lead: male!, accent: female! }
      : { lead: female!, accent: male! };

  return {
    ...selected,
    singleVoiceFallback: false,
    reason: `Tự động xoay (Seed ${seed}): ${selected.lead.name} dẫn, ${selected.accent.name} nhấn, đã tránh ${opts.avoidLastN} video gần nhất`,
  };
}

/**
 * Đo thời lượng file audio bằng ffprobe
 */
export function probeAudioDuration(audioPath: string): number {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audioPath],
      { encoding: 'utf8' }
    ).trim();
    const val = parseFloat(out);
    return Number.isFinite(val) && val > 0 ? val : 3.0;
  } catch {
    return 3.0;
  }
}

/**
 * Hàng đợi tuần tự cho GPU đơn của Voice Studio (Mục 8.2.1: concurrency = 1)
 */
let ttsQueuePromise: Promise<any> = Promise.resolve();
function enqueueTtsTask<T>(fn: () => Promise<T>): Promise<T> {
  const next = ttsQueuePromise.then(fn, fn);
  ttsQueuePromise = next.catch(() => {});
  return next;
}

/**
 * Adapter kết nối trực tiếp tới Voice Studio (http://192.168.5.18:3900) theo chuẩn OpenAI Audio API (Mục 8.2 & 8.5)
 */
export class VoiceStudioClient implements VoiceProvider {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = (baseUrl || process.env.VOICE_STUDIO_URL || 'http://192.168.5.18:3900').replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  public getEndpoint(): string {
    return this.baseUrl;
  }

  public async testConnection(): Promise<{
    ok: boolean;
    endpoint: string;
    latencyMs: number;
    voiceCount: number;
    profileCount: number;
    engines: VoiceEngineInfo[];
    message: string;
  }> {
    const start = Date.now();
    try {
      const { voices, engines } = await this.listVoices({ includeAliases: true });
      const profiles = voices.filter((v) => v.type !== 'openai_alias');
      const latencyMs = Date.now() - start;
      return {
        ok: true,
        endpoint: this.baseUrl,
        latencyMs,
        voiceCount: voices.length,
        profileCount: profiles.length,
        engines,
        message: `Kết nối thành công tới Voice Studio (${latencyMs}ms) — ${profiles.length} profile giọng, ${engines.length} engine khả dụng`,
      };
    } catch (err: any) {
      return {
        ok: false,
        endpoint: this.baseUrl,
        latencyMs: Date.now() - start,
        voiceCount: 0,
        profileCount: 0,
        engines: [],
        message: `Không thể kết nối tới ${this.baseUrl}: ${err?.message || 'Timeout'}`,
      };
    }
  }

  public async listVoices(opts?: { includeAliases?: boolean }): Promise<{
    voices: Voice[];
    engines: VoiceEngineInfo[];
  }> {
    const headers: Record<string, string> = {};
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const res = await fetch(`${this.baseUrl}/v1/audio/voices`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`Voice Studio GET /v1/audio/voices trả về HTTP ${res.status}`);
    }

    const raw = (await res.json()) as any;
    const rawVoices: any[] = Array.isArray(raw.voices) ? raw.voices : Array.isArray(raw.data) ? raw.data : [];
    const rawEngines: any[] = Array.isArray(raw.engines) ? raw.engines : [];

    // Quy tắc Mục 8.2.1: Chỉ liệt kê engine có available: true
    const engines: VoiceEngineInfo[] = rawEngines
      .filter((e) => e && e.available !== false)
      .map((e) => ({
        id: String(e.id || e.name),
        available: true,
        supportsEmotion: Boolean(e.supports_emotion),
        maxRefSeconds: typeof e.max_ref_seconds === 'number' ? e.max_ref_seconds : 20,
      }));

    const voices: Voice[] = rawVoices
      .map((v): Voice => {
        const id = String(v.voice_id || v.id || v.name);
        const name = String(v.name || v.id || id);
        const type: Voice['type'] =
          v.type === 'openai_alias' ? 'openai_alias' : v.type === 'profile' ? 'profile' : 'preset';
        const gender = detectGenderFromName(name, v.gender);
        return {
          id,
          voiceId: id,
          name,
          type,
          gender,
          cloned: type === 'profile' || Boolean(v.cloned),
          language: String(v.language || 'Auto'),
          addressableByName: v.addressable_by_name !== false,
        };
      })
      .filter((v) => (opts?.includeAliases ? true : v.type !== 'openai_alias'))
      // Giọng clone ưu tiên hiển thị đầu danh sách (Mục 8.3)
      .sort((a, b) => (a.cloned === b.cloned ? a.name.localeCompare(b.name) : a.cloned ? -1 : 1));

    return { voices, engines };
  }

  /**
   * Tổng hợp giọng đọc qua POST /v1/audio/speech (Mục 8.2.2)
   * Tuần tự hóa qua hàng đợi (concurrency = 1) và tách đoạn nếu > 500 ký tự.
   */
  public async synthesize(opts: {
    text: string;
    voiceId: string;
    model?: string;
    speed?: number;
    emotion?: string;
    language?: string;
    seed?: number;
    numStep?: number;
    outputPath: string;
  }): Promise<{ audioPath: string; durationSec: number }> {
    return enqueueTtsTask(async () => {
      fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

      const payload = {
        model: opts.model || 'omnivoice',
        input: opts.text.slice(0, 4096),
        voice: opts.voiceId,
        language: opts.language || 'vi',
        response_format: 'wav',
        speed: Math.min(1.15, Math.max(0.9, opts.speed ?? 1.0)),
        seed: opts.seed ?? 1234,
        num_step: opts.numStep ?? 16,
      };

      const timeoutMs = Math.max(20000, opts.text.length * 150);
      const res = await fetch(`${this.baseUrl}/v1/audio/speech`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 409) {
        const errBody = await res.text();
        throw new Error(
          `Trùng tên profile giọng "${opts.voiceId}" trên Voice Studio (HTTP 409). Vui lòng dùng voice_id cụ thể: ${errBody}`
        );
      }

      if (!res.ok) {
        throw new Error(`Voice Studio POST /v1/audio/speech lỗi HTTP ${res.status}: ${await res.text()}`);
      }

      const audioBuffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(opts.outputPath, audioBuffer);
      const durationSec = probeAudioDuration(opts.outputPath);
      return { audioPath: opts.outputPath, durationSec };
    });
  }

  /**
   * Chuyển giọng nói thành chữ kèm mốc thời gian từng từ qua POST /v1/audio/transcriptions (Mục 8.2.2)
   */
  public async transcribe(opts: {
    audioPath: string;
    language?: string;
    model?: string;
  }): Promise<{ words: Array<{ text: string; start: number; end: number }> }> {
    const fileBuf = fs.readFileSync(opts.audioPath);
    const form = new FormData();
    form.append('file', new Blob([fileBuf], { type: 'audio/wav' }), path.basename(opts.audioPath));
    form.append('model', opts.model || 'whisper-1');
    form.append('language', opts.language || 'vi');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('timestamp_granularities[]', 'segment');

    const headers: Record<string, string> = {};
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const res = await fetch(`${this.baseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      headers,
      body: form,
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      throw new Error(`Voice Studio POST /v1/audio/transcriptions trả về HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    const rawWords: any[] = Array.isArray(data.words) ? data.words : [];
    return {
      words: rawWords.map((w) => ({
        text: stripExpressiveTags(String(w.word || w.text || '').trim()),
        start: Number(w.start || 0),
        end: Number(w.end || 0),
      })),
    };
  }
}

/**
 * Fallback tạo sóng âm giọng đọc cục bộ bằng FFmpeg lavfi trong trường hợp chạy thử offline
 * hoặc khi chọn chế độ fallback trong lúc phát triển ngoài mạng LAN.
 */
export function synthesizeLocalFallbackTone(opts: {
  text: string;
  speaker: 'lead' | 'accent';
  outputPath: string;
}): { audioPath: string; durationSec: number } {
  fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
  const words = stripExpressiveTags(opts.text).split(/\s+/).filter(Boolean);
  const durationSec = Number(Math.max(1.8, words.length * 0.34).toFixed(2));
  const freq = opts.speaker === 'lead' ? 210 : 285;
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${freq}:sample_rate=24000:duration=${durationSec}`,
      '-af',
      'volume=0.18,afade=t=in:st=0:d=0.05,afade=t=out:st=' + Math.max(0.1, durationSec - 0.08).toFixed(2) + ':d=0.08',
      '-c:a',
      'pcm_s16le',
      opts.outputPath,
    ],
    { stdio: 'ignore' }
  );
  return { audioPath: opts.outputPath, durationSec };
}

/**
 * Ghép các segment audio trong một cảnh hoặc toàn bộ video (Mục 8.3):
 * - Chuẩn hóa từng giọng về cùng mức âm lượng (-16 LUFS)
 * - Chèn khoảng nghỉ 150ms khi đổi giọng, crossfade ngắn 40ms để không bị giật
 */
export function mergeVoiceSegmentsWithCrossfade(
  segments: Array<{ audioPath: string; speaker: 'lead' | 'accent' }>,
  outputPath: string
): { audioPath: string; durationSec: number } {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  if (segments.length === 0) {
    throw new Error('Không có segment audio nào để ghép.');
  }
  if (segments.length === 1) {
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        segments[0].audioPath,
        '-af',
        'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-ar',
        '24000',
        '-ac',
        '1',
        outputPath,
      ],
      { stdio: 'ignore' }
    );
    return { audioPath: outputPath, durationSec: probeAudioDuration(outputPath) };
  }

  // Tạo khoảng lặng 150ms giữa các lần đổi giọng
  const tempDir = path.dirname(outputPath);
  const silencePath = path.join(tempDir, '_pause_150ms.wav');
  execFileSync(
    'ffmpeg',
    ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '0.15', '-c:a', 'pcm_s16le', silencePath],
    { stdio: 'ignore' }
  );

  const normalizedPaths: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const normPath = path.join(tempDir, `_norm_seg_${i}.wav`);
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        segments[i].audioPath,
        '-af',
        'loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.03,afade=t=out:d=0.03',
        '-ar',
        '24000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        normPath,
      ],
      { stdio: 'ignore' }
    );
    normalizedPaths.push(normPath);
    if (i < segments.length - 1) {
      normalizedPaths.push(silencePath);
    }
  }

  const concatListPath = path.join(tempDir, '_voice_concat.txt');
  fs.writeFileSync(
    concatListPath,
    normalizedPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
    'utf8'
  );

  execFileSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c:a', 'pcm_s16le', outputPath],
    { stdio: 'ignore' }
  );

  return { audioPath: outputPath, durationSec: probeAudioDuration(outputPath) };
}

/**
 * Ước lượng mốc thời gian từng từ theo thời lượng segment đo bằng ffprobe (Mục 8.2.2 Phương án 3)
 * Luôn giữ đúng nhãn speaker ('lead' | 'accent') cho từng từ để đổi màu caption.
 */
export function estimateWordTimingsFromSegments(
  segments: Array<{
    speaker: 'lead' | 'accent';
    text: string;
    startSec: number;
    durationSec: number;
    sceneId?: string;
  }>
): WordTiming[] {
  const timings: WordTiming[] = [];

  for (const seg of segments) {
    const cleanText = stripExpressiveTags(seg.text);
    const words = cleanText.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const totalChars = words.reduce((sum, w) => sum + w.length, 0) || 1;
    let cursor = seg.startSec;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const ratio = w.length / totalChars;
      const wordDur = i === words.length - 1 ? Math.max(0.08, seg.startSec + seg.durationSec - cursor) : Math.max(0.08, seg.durationSec * ratio);
      const start = Number(cursor.toFixed(3));
      const end = Number(Math.min(seg.startSec + seg.durationSec, cursor + wordDur).toFixed(3));
      timings.push({
        text: w,
        start,
        end,
        speaker: seg.speaker,
        sceneId: seg.sceneId,
      });
      cursor = end;
    }
  }

  return timings;
}
