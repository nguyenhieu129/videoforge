import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  PIPELINE_STEPS,
  encryptSecret,
  maskSecret,
  type AgentName,
} from '@videoforge/core';
import { MODEL_PRESETS, STYLE_PRESETS, DEFAULT_CAST_PRESETS } from '@videoforge/templates';
import type { PoolVoice, VoiceUsage } from '@videoforge/voice';

import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.resolve(__dirname, '../../../');
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(MONOREPO_ROOT, process.env.DATA_DIR)
  : path.join(MONOREPO_ROOT, 'data');
fs.mkdirSync(path.join(DATA_DIR, 'projects'), { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'app.db');

export const db = new DatabaseSync(DB_PATH);

export function getDataDir(): string {
  return DATA_DIR;
}

export function initDatabase() {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      sourceType TEXT NOT NULL,
      sourceRef TEXT NOT NULL,
      aspect TEXT NOT NULL DEFAULT 'both',
      stylePreset TEXT NOT NULL DEFAULT 'neon_cyber',
      brandKitId TEXT,
      scoreThreshold REAL NOT NULL DEFAULT 5.0,
      disabledStepsJson TEXT NOT NULL DEFAULT '[]',
      approvalStepsJson TEXT NOT NULL DEFAULT '[6,8,17]',
      castMode TEXT NOT NULL DEFAULT 'lead_accent',
      castSelectionMode TEXT NOT NULL DEFAULT 'auto_rotate',
      status TEXT NOT NULL DEFAULT 'draft',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      currentStep INTEGER NOT NULL DEFAULT 1,
      costUsd REAL NOT NULL DEFAULT 0,
      tokensIn INTEGER NOT NULL DEFAULT 0,
      tokensOut INTEGER NOT NULL DEFAULT 0,
      voiceCastSeed INTEGER NOT NULL DEFAULT 12345,
      voiceCastJson TEXT NOT NULL DEFAULT '{}',
      startedAt TEXT NOT NULL,
      finishedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS step_runs (
      id TEXT PRIMARY KEY,
      runId TEXT NOT NULL,
      stepIndex INTEGER NOT NULL,
      agent TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      inputJson TEXT NOT NULL DEFAULT '{}',
      outputJson TEXT NOT NULL DEFAULT '{}',
      modelUsed TEXT,
      tokensIn INTEGER NOT NULL DEFAULT 0,
      tokensOut INTEGER NOT NULL DEFAULT 0,
      costUsd REAL NOT NULL DEFAULT 0,
      startedAt TEXT,
      finishedAt TEXT,
      error TEXT,
      attempt INTEGER NOT NULL DEFAULT 0,
      requiresApproval INTEGER NOT NULL DEFAULT 0,
      approved INTEGER
    );

    CREATE TABLE IF NOT EXISTS log_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      runId TEXT NOT NULL,
      stepRunId TEXT NOT NULL,
      stepIndex INTEGER NOT NULL,
      ts TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      metaJson TEXT
    );

    CREATE TABLE IF NOT EXISTS run_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      runId TEXT NOT NULL,
      ts TEXT NOT NULL,
      payloadJson TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      runId TEXT,
      stepRunId TEXT,
      kind TEXT NOT NULL,
      path TEXT NOT NULL,
      durationSec REAL,
      width INTEGER,
      height INTEGER,
      metaJson TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      baseUrl TEXT,
      apiKeyEncrypted TEXT,
      modelsJson TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS agent_model_maps (
      agent TEXT PRIMARY KEY,
      providerId TEXT NOT NULL,
      model TEXT NOT NULL,
      temperature REAL NOT NULL DEFAULT 0.3,
      fallbacksJson TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS brand_kits (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      paletteJson TEXT NOT NULL,
      fontsJson TEXT NOT NULL,
      logoAssetId TEXT,
      motionStyle TEXT NOT NULL DEFAULT 'snappy'
    );

    CREATE TABLE IF NOT EXISTS voice_settings (
      voiceId TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'profile',
      cloned INTEGER NOT NULL DEFAULT 1,
      language TEXT NOT NULL DEFAULT 'Auto',
      enabled INTEGER NOT NULL DEFAULT 1,
      weight REAL NOT NULL DEFAULT 1.0,
      tagsJson TEXT NOT NULL DEFAULT '[]',
      genderOverride TEXT,
      consentNote TEXT
    );

    CREATE TABLE IF NOT EXISTS voice_usages (
      id TEXT PRIMARY KEY,
      voiceId TEXT NOT NULL,
      projectId TEXT NOT NULL,
      runId TEXT NOT NULL,
      role TEXT NOT NULL,
      usedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS publish_jobs (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      assetId TEXT,
      platform TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      hashtagsJson TEXT NOT NULL DEFAULT '[]',
      thumbnailAssetId TEXT,
      scheduledAt TEXT,
      method TEXT NOT NULL DEFAULT 'api',
      status TEXT NOT NULL DEFAULT 'draft',
      remoteUrl TEXT,
      error TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      valueJson TEXT NOT NULL
    );
  `);

  seedDefaultData();
}

function seedDefaultData() {
  // 1. Seed Default Providers
  const provCount = (db.prepare('SELECT COUNT(*) as c FROM provider_configs').get() as any).c;
  if (provCount === 0) {
    const insertProv = db.prepare(`
      INSERT INTO provider_configs (id, name, type, baseUrl, apiKeyEncrypted, modelsJson, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertProv.run(
      'provider_builtin',
      'VideoForge Smart Engine (Built-in)',
      'openai_compatible',
      'builtin://videoforge',
      encryptSecret('builtin-key'),
      JSON.stringify(['gpt-4o-mini', 'gpt-4o', 'claude-3-7-sonnet-latest', 'videoforge-smart-v1']),
      1
    );
    insertProv.run(
      'provider_openai',
      'OpenAI Official',
      'openai',
      'https://api.openai.com/v1',
      '',
      JSON.stringify(['gpt-4o', 'gpt-4o-mini', 'o3-mini']),
      1
    );
    insertProv.run(
      'provider_anthropic',
      'Anthropic Claude',
      'anthropic',
      'https://api.anthropic.com/v1',
      '',
      JSON.stringify(['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest']),
      1
    );
    insertProv.run(
      'provider_gemini',
      'Google Gemini',
      'gemini',
      'https://generativelanguage.googleapis.com/v1beta',
      '',
      JSON.stringify(['gemini-2.5-pro', 'gemini-2.5-flash']),
      1
    );
    insertProv.run(
      'provider_openrouter',
      'OpenRouter',
      'openrouter',
      'https://openrouter.ai/api/v1',
      '',
      JSON.stringify(['anthropic/claude-3.7-sonnet', 'openai/gpt-4o-mini', 'deepseek/deepseek-chat']),
      1
    );
  }

  // 2. Seed Default AgentModelMap (17 dòng)
  const mapCount = (db.prepare('SELECT COUNT(*) as c FROM agent_model_maps').get() as any).c;
  if (mapCount === 0) {
    const balanced = MODEL_PRESETS.balanced.mapping;
    const insertMap = db.prepare(`
      INSERT INTO agent_model_maps (agent, providerId, model, temperature, fallbacksJson)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const step of PIPELINE_STEPS) {
      const cfg = balanced[step.agent];
      insertMap.run(
        step.agent,
        'provider_builtin',
        cfg.model,
        cfg.temperature,
        JSON.stringify([{ providerId: 'provider_builtin', model: 'gpt-4o-mini' }])
      );
    }
  }

  // 3. Seed Default BrandKits
  const bkCount = (db.prepare('SELECT COUNT(*) as c FROM brand_kits').get() as any).c;
  if (bkCount === 0) {
    const insertBk = db.prepare(`
      INSERT INTO brand_kits (id, name, paletteJson, fontsJson, motionStyle)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const preset of STYLE_PRESETS) {
      insertBk.run(
        `bk_${preset.id}`,
        `Brand Kit — ${preset.name}`,
        JSON.stringify(preset.palette),
        JSON.stringify(preset.fonts),
        preset.motionStyle
      );
    }
  }

  // 4. Seed Default Voice Pool (giong_1_nam từ Voice Studio thực tế của người dùng + giong_2_nu mẫu)
  const vpCount = (db.prepare('SELECT COUNT(*) as c FROM voice_settings').get() as any).c;
  if (vpCount === 0) {
    const insertVp = db.prepare(`
      INSERT INTO voice_settings (voiceId, name, type, cloned, language, enabled, weight, tagsJson, genderOverride, consentNote)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    // Đúng giọng thực tế đã xác nhận ở Mục 8.2.1: giong_1_nam (id = 7cc37272)
    insertVp.run(
      '7cc37272',
      'giong_1_nam',
      'profile',
      1,
      'Auto',
      1,
      1.2,
      JSON.stringify(['tin tức', 'trầm', 'rõ ràng']),
      'nam',
      'Chủ sở hữu giọng (Sys017) đã xác nhận đồng ý sử dụng.'
    );
    insertVp.run(
      'giong_2_nu',
      'giong_2_nu',
      'profile',
      1,
      'Auto',
      1,
      1.0,
      JSON.stringify(['điểm nhấn', 'năng động', 'tin tức']),
      'nu',
      'Profile giọng nữ phối hợp Cast.'
    );
  }

  // 5. Seed Default System Settings
  const sysCount = (db.prepare('SELECT COUNT(*) as c FROM system_settings').get() as any).c;
  if (sysCount === 0) {
    const defaultSettings = {
      voiceStudioUrl: process.env.VOICE_STUDIO_URL || 'http://localhost:3900',
      showOpenAiVoiceAliases: false,
      castSelectionMode: 'auto_rotate',
      defaultCastMode: 'lead_accent',
      avoidLastNVideos: 3,
      leadSpeed: 1.0,
      accentSpeed: 1.03,
      leadCaptionColor: '#38BDF8',
      accentCaptionColor: '#F472B6',
      castPresets: DEFAULT_CAST_PRESETS,
      budgetLimitUsdPerVideo: 1.5,
      budgetExceededAction: 'warn', // 'warn' | 'stop'
      defaultAspect: 'both',
      defaultStylePreset: 'neon_cyber',
      defaultScoreThreshold: 5.0,
      disabledSteps: [] as number[],
      approvalSteps: [6, 8, 17],
      maxParallelScenes: Number(process.env.MAX_PARALLEL_SCENES || 2),
      blenderEnabled: false,
      blenderMcpUrl: process.env.BLENDER_MCP_URL || '',
      rssFeeds: [] as string[],
      rssAutoEnabled: false,
    };
    db.prepare('INSERT INTO system_settings (key, valueJson) VALUES (?, ?)').run(
      'global',
      JSON.stringify(defaultSettings)
    );
  }
}

export function getGlobalSettings(): Record<string, any> {
  const row = db.prepare('SELECT valueJson FROM system_settings WHERE key = ?').get('global') as any;
  const parsed = row ? JSON.parse(row.valueJson) : {};
  if (
    process.env.VOICE_STUDIO_URL &&
    (!parsed.voiceStudioUrl || parsed.voiceStudioUrl === 'http://192.168.5.18:3900')
  ) {
    parsed.voiceStudioUrl = process.env.VOICE_STUDIO_URL.replace(/\/+$/, '');
  }
  return parsed;
}

export function updateGlobalSettings(patch: Record<string, any>): Record<string, any> {
  const current = getGlobalSettings();
  const next = { ...current, ...patch };
  db.prepare('INSERT OR REPLACE INTO system_settings (key, valueJson) VALUES (?, ?)').run(
    'global',
    JSON.stringify(next)
  );
  return next;
}

export function getVoicePoolFromDb(): PoolVoice[] {
  const rows = db.prepare('SELECT * FROM voice_settings ORDER BY cloned DESC, name ASC').all() as any[];
  return rows.map((r) => {
    const match = String(r.name).match(/^(.+)_(nam|nu)$/i);
    const inferredGender = match ? (match[2].toLowerCase() === 'nam' ? 'nam' : 'nu') : 'unclassified';
    return {
      id: r.voiceId,
      voiceId: r.voiceId,
      name: r.name,
      type: r.type,
      gender: r.genderOverride || inferredGender,
      cloned: Boolean(r.cloned),
      language: r.language,
      addressableByName: true,
      enabled: Boolean(r.enabled),
      weight: Number(r.weight || 1),
      tags: JSON.parse(r.tagsJson || '[]'),
      genderOverride: r.genderOverride || undefined,
      consentNote: r.consentNote || undefined,
    };
  });
}

export function getVoiceHistoryFromDb(): VoiceUsage[] {
  const rows = db.prepare('SELECT * FROM voice_usages ORDER BY usedAt DESC LIMIT 50').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    voiceId: r.voiceId,
    projectId: r.projectId,
    runId: r.runId,
    role: r.role,
    usedAt: r.usedAt,
  }));
}

export function listProvidersSafe() {
  const rows = db.prepare('SELECT * FROM provider_configs').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    baseUrl: r.baseUrl,
    hasApiKey: Boolean(r.apiKeyEncrypted),
    apiKeyMasked: maskSecret(r.apiKeyEncrypted),
    models: JSON.parse(r.modelsJson || '[]'),
    enabled: Boolean(r.enabled),
  }));
}

export function getProviderRaw(id: string) {
  const r = db.prepare('SELECT * FROM provider_configs WHERE id = ?').get(id) as any;
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    baseUrl: r.baseUrl,
    apiKeyEncrypted: r.apiKeyEncrypted,
    models: JSON.parse(r.modelsJson || '[]'),
    enabled: Boolean(r.enabled),
  };
}

export function createAssetRecord(asset: {
  projectId: string;
  runId?: string;
  stepRunId?: string;
  kind: string;
  path: string;
  durationSec?: number;
  width?: number;
  height?: number;
  meta?: Record<string, any>;
}): string {
  const id = `asset_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare(`
    INSERT INTO assets (id, projectId, runId, stepRunId, kind, path, durationSec, width, height, metaJson, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    asset.projectId,
    asset.runId || null,
    asset.stepRunId || null,
    asset.kind,
    asset.path,
    asset.durationSec ?? null,
    asset.width ?? null,
    asset.height ?? null,
    JSON.stringify(asset.meta || {}),
    new Date().toISOString()
  );
  return id;
}
