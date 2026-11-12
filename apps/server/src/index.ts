import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  PIPELINE_STEPS,
  DISABLEABLE_STEPS,
  encryptSecret,
} from '@videoforge/core';
import { testProviderConnection } from '@videoforge/providers';
import { MODEL_PRESETS, STYLE_PRESETS, DEFAULT_CAST_PRESETS } from '@videoforge/templates';
import {
  VoiceStudioClient,
  pickCast,
  synthesizeLocalFallbackTone,
  mergeVoiceSegmentsWithCrossfade,
} from '@videoforge/voice';
import { executePublishJob, PLATFORM_LIMITS, type PublishPlatform } from '@videoforge/publishers';
import {
  db,
  initDatabase,
  getDataDir,
  getGlobalSettings,
  updateGlobalSettings,
  getVoicePoolFromDb,
  getVoiceHistoryFromDb,
  listProvidersSafe,
  getProviderRaw,
} from './db.js';
import {
  createPipelineRun,
  pausePipelineRun,
  resumePipelineRun,
  cancelPipelineRun,
  approveStepAndContinue,
  subscribeRunEvents,
  getMissedRunEvents,
} from './orchestrator.js';

initDatabase();

export const app = Fastify({ logger: false });

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

// ============================================================================
// HEALTH & METADATA
// ============================================================================
app.get('/api/health', async () => ({
  ok: true,
  service: 'videoforge-server',
  nodeVersion: process.version,
  pipelineStepsCount: PIPELINE_STEPS.length,
}));

app.get('/api/meta/pipeline-steps', async () => ({
  steps: PIPELINE_STEPS,
  stylePresets: STYLE_PRESETS,
  castPresets: DEFAULT_CAST_PRESETS,
  modelPresets: MODEL_PRESETS,
  platformLimits: PLATFORM_LIMITS,
}));

// ============================================================================
// PROJECTS & RUNS (Mục 11.1)
// ============================================================================
app.get('/api/projects', async () => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY createdAt DESC').all() as any[];
  const result = projects.map((p) => {
    const latestRun = db
      .prepare('SELECT * FROM runs WHERE projectId = ? ORDER BY startedAt DESC LIMIT 1')
      .get(p.id) as any;
    const assets = db
      .prepare("SELECT * FROM assets WHERE projectId = ? AND kind IN ('final_video', 'thumbnail') ORDER BY createdAt DESC")
      .all(p.id) as any[];
    return {
      ...p,
      disabledSteps: JSON.parse(p.disabledStepsJson || '[]'),
      approvalSteps: JSON.parse(p.approvalStepsJson || '[6,8,17]'),
      latestRun: latestRun
        ? {
            ...latestRun,
            voiceCast: JSON.parse(latestRun.voiceCastJson || '{}'),
          }
        : null,
      finalAssets: assets,
    };
  });
  return { projects: result };
});

app.post('/api/projects', async (req) => {
  const body = (req.body || {}) as any;
  const id = `proj_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const globalSettings = getGlobalSettings();

  // Chỉ cho phép tắt các bước thuộc DISABLEABLE_STEPS (Mục 6.1: 3, 4, 5, 7, 9, 11, 13, 16)
  const rawDisabled: number[] = Array.isArray(body.disabledSteps)
    ? body.disabledSteps
    : globalSettings.disabledSteps || [];
  const validDisabled = rawDisabled.filter((stepIdx) => DISABLEABLE_STEPS.has(Number(stepIdx)));

  const approvalSteps: number[] = Array.isArray(body.approvalSteps)
    ? body.approvalSteps
    : globalSettings.approvalSteps || [6, 8, 17];

  const title = String(body.title || 'Video mới từ bài viết').trim();
  const sourceType = body.sourceType || 'text';
  const sourceRef = String(body.sourceRef || title).trim();
  const aspect = body.aspect || globalSettings.defaultAspect || 'both';
  const stylePreset = body.stylePreset || globalSettings.defaultStylePreset || 'neon_cyber';
  const brandKitId = body.brandKitId || `bk_${stylePreset}`;
  const scoreThreshold = Number(body.scoreThreshold ?? globalSettings.defaultScoreThreshold ?? 5.0);
  const castMode = body.castMode || globalSettings.defaultCastMode || 'lead_accent';
  const castSelectionMode = body.castSelectionMode || globalSettings.castSelectionMode || 'auto_rotate';

  db.prepare(`
    INSERT INTO projects (
      id, title, sourceType, sourceRef, aspect, stylePreset, brandKitId,
      scoreThreshold, disabledStepsJson, approvalStepsJson, castMode, castSelectionMode,
      status, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
  `).run(
    id,
    title,
    sourceType,
    sourceRef,
    aspect,
    stylePreset,
    brandKitId,
    scoreThreshold,
    JSON.stringify(validDisabled),
    JSON.stringify(approvalSteps),
    castMode,
    castSelectionMode,
    now,
    now
  );

  // Nếu autoStart === true, tạo luôn Run và khởi chạy pipeline
  let runId: string | null = null;
  if (body.autoStart) {
    runId = createPipelineRun(id);
    resumePipelineRun(runId, 1);
  }

  const created = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
  return {
    project: {
      ...created,
      disabledSteps: validDisabled,
      approvalSteps,
    },
    runId,
  };
});

app.get('/api/projects/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
  if (!project) return reply.code(404).send({ error: 'Project not found' });

  const runs = db.prepare('SELECT * FROM runs WHERE projectId = ? ORDER BY startedAt DESC').all(id) as any[];
  const assets = db.prepare('SELECT * FROM assets WHERE projectId = ? ORDER BY createdAt DESC').all(id) as any[];

  return {
    project: {
      ...project,
      disabledSteps: JSON.parse(project.disabledStepsJson || '[]'),
      approvalSteps: JSON.parse(project.approvalStepsJson || '[6,8,17]'),
    },
    runs: runs.map((r) => ({ ...r, voiceCast: JSON.parse(r.voiceCastJson || '{}') })),
    assets: assets.map((a) => ({ ...a, meta: JSON.parse(a.metaJson || '{}') })),
  };
});

app.post('/api/projects/:id/runs', async (req) => {
  const { id } = req.params as { id: string };
  const body = (req.body || {}) as any;
  const runId = createPipelineRun(id, { voiceCastSeed: body.voiceCastSeed });
  resumePipelineRun(runId, 1);
  return { runId };
});

app.get('/api/runs/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as any;
  if (!run) return reply.code(404).send({ error: 'Run not found' });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(run.projectId) as any;
  const stepRuns = db
    .prepare('SELECT * FROM step_runs WHERE runId = ? ORDER BY stepIndex ASC')
    .all(id) as any[];
  const assets = db
    .prepare('SELECT * FROM assets WHERE runId = ? ORDER BY createdAt ASC')
    .all(id) as any[];

  return {
    run: {
      ...run,
      voiceCast: JSON.parse(run.voiceCastJson || '{}'),
    },
    project: project
      ? {
          ...project,
          disabledSteps: JSON.parse(project.disabledStepsJson || '[]'),
          approvalSteps: JSON.parse(project.approvalStepsJson || '[6,8,17]'),
        }
      : null,
    steps: stepRuns.map((sr) => {
      const def = PIPELINE_STEPS.find((p) => p.stepIndex === sr.stepIndex);
      return {
        id: sr.id,
        runId: sr.runId,
        stepIndex: sr.stepIndex,
        agent: sr.agent,
        displayName: def?.displayName || sr.agent,
        description: def?.description || '',
        canDisable: def?.canDisable ?? false,
        status: sr.status,
        input: JSON.parse(sr.inputJson || '{}'),
        output: JSON.parse(sr.outputJson || '{}'),
        modelUsed: sr.modelUsed,
        tokensIn: sr.tokensIn,
        tokensOut: sr.tokensOut,
        costUsd: sr.costUsd,
        startedAt: sr.startedAt,
        finishedAt: sr.finishedAt,
        error: sr.error,
        attempt: sr.attempt,
        requiresApproval: Boolean(sr.requiresApproval),
        approved: sr.approved === null ? undefined : Boolean(sr.approved),
      };
    }),
    assets: assets.map((a) => ({
      ...a,
      meta: JSON.parse(a.metaJson || '{}'),
    })),
  };
});

app.get('/api/runs/:id/steps/:i', async (req, reply) => {
  const { id, i } = req.params as { id: string; i: string };
  const stepIndex = Number(i);
  const sr = db
    .prepare('SELECT * FROM step_runs WHERE runId = ? AND stepIndex = ?')
    .get(id, stepIndex) as any;
  if (!sr) return reply.code(404).send({ error: 'Step not found' });

  const logs = db
    .prepare('SELECT * FROM log_entries WHERE runId = ? AND stepIndex = ? ORDER BY id ASC')
    .all(id, stepIndex) as any[];

  return {
    step: {
      ...sr,
      input: JSON.parse(sr.inputJson || '{}'),
      output: JSON.parse(sr.outputJson || '{}'),
      requiresApproval: Boolean(sr.requiresApproval),
      approved: sr.approved === null ? undefined : Boolean(sr.approved),
    },
    logs: logs.map((l) => ({
      id: l.id,
      stepRunId: l.stepRunId,
      stepIndex: l.stepIndex,
      ts: l.ts,
      level: l.level,
      message: l.message,
      meta: l.metaJson ? JSON.parse(l.metaJson) : undefined,
    })),
  };
});

app.get('/api/runs/:id/logs', async (req) => {
  const { id } = req.params as { id: string };
  const logs = db
    .prepare('SELECT * FROM log_entries WHERE runId = ? ORDER BY id ASC')
    .all(id) as any[];
  return {
    logs: logs.map((l) => ({
      id: l.id,
      stepRunId: l.stepRunId,
      stepIndex: l.stepIndex,
      ts: l.ts,
      level: l.level,
      message: l.message,
      meta: l.metaJson ? JSON.parse(l.metaJson) : undefined,
    })),
  };
});

app.post('/api/runs/:id/pause', async (req) => {
  const { id } = req.params as { id: string };
  pausePipelineRun(id);
  return { ok: true, status: 'paused' };
});

app.post('/api/runs/:id/resume', async (req) => {
  const { id } = req.params as { id: string };
  resumePipelineRun(id);
  return { ok: true, status: 'running' };
});

app.post('/api/runs/:id/cancel', async (req) => {
  const { id } = req.params as { id: string };
  cancelPipelineRun(id);
  return { ok: true, status: 'canceled' };
});

app.post('/api/runs/:id/steps/:i/retry', async (req) => {
  const { id, i } = req.params as { id: string; i: string };
  const stepIndex = Number(i);
  const body = (req.body || {}) as any;
  if (body.reseedVoiceCast) {
    const newSeed = Math.floor(10000 + Math.random() * 90000);
    db.prepare('UPDATE runs SET voiceCastSeed = ? WHERE id = ?').run(newSeed, id);
  }
  resumePipelineRun(id, stepIndex);
  return { ok: true, fromStep: stepIndex };
});

app.post('/api/runs/:id/steps/:i/approve', async (req) => {
  const { id, i } = req.params as { id: string; i: string };
  const stepIndex = Number(i);
  const body = (req.body || {}) as any;
  approveStepAndContinue(id, stepIndex, body.output);
  return { ok: true, stepIndex };
});

// ============================================================================
// SERVER-SENT EVENTS (Mục 11.2: GET /api/runs/:id/events với Last-Event-ID)
// ============================================================================
app.get('/api/runs/:id/events', async (req, reply) => {
  const { id } = req.params as { id: string };
  const lastEventIdHeader = req.headers['last-event-id'] || (req.query as any)?.lastEventId;
  const lastEventId = lastEventIdHeader ? Number(lastEventIdHeader) : 0;

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Gửi bù các sự kiện bị bỏ lỡ từ Last-Event-ID
  const missed = getMissedRunEvents(id, Number.isFinite(lastEventId) ? lastEventId : 0);
  for (const ev of missed) {
    reply.raw.write(`id: ${ev.id}\ndata: ${JSON.stringify(ev.payload)}\n\n`);
  }

  const unsubscribe = subscribeRunEvents(id, (eventId, payload) => {
    reply.raw.write(`id: ${eventId}\ndata: ${JSON.stringify(payload)}\n\n`);
  });

  const keepAlive = setInterval(() => {
    try {
      reply.raw.write(': keep-alive\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 15000);

  req.raw.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

// ============================================================================
// ASSETS & MEDIA STREAMING (Mục 11.1: GET /api/assets/:id)
// ============================================================================
app.get('/api/assets', async () => {
  const rows = db
    .prepare(`
      SELECT a.*, p.title as projectTitle
      FROM assets a
      LEFT JOIN projects p ON p.id = a.projectId
      ORDER BY a.createdAt DESC
    `)
    .all() as any[];
  return {
    assets: rows.map((a) => ({
      ...a,
      meta: JSON.parse(a.metaJson || '{}'),
    })),
  };
});

app.get('/api/assets/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as any;
  if (!asset || !fs.existsSync(asset.path)) {
    return reply.code(404).send({ error: 'Asset file not found' });
  }

  const ext = path.extname(asset.path).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.srt': 'text/plain; charset=utf-8',
  };

  const contentType = mimeMap[ext] || 'application/octet-stream';
  const stat = fs.statSync(asset.path);
  const range = req.headers.range;

  if (range && ext === '.mp4') {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;
    reply.raw.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(asset.path, { start, end }).pipe(reply.raw);
    return reply;
  }

  reply.header('Content-Type', contentType);
  reply.header('Content-Length', stat.size);
  return reply.send(fs.createReadStream(asset.path));
});

// ============================================================================
// PROVIDERS & AGENT MODEL MAPPING (Mục 9.4 & Mục 11.1)
// ============================================================================
app.get('/api/providers', async () => ({
  providers: listProvidersSafe(),
}));

app.post('/api/providers', async (req) => {
  const body = (req.body || {}) as any;
  const id = body.id || `prov_${crypto.randomUUID().slice(0, 8)}`;
  const encrypted = body.apiKey ? encryptSecret(String(body.apiKey)) : '';
  const models = Array.isArray(body.models)
    ? body.models
    : String(body.models || 'gpt-4o-mini,gpt-4o')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  db.prepare(`
    INSERT INTO provider_configs (id, name, type, baseUrl, apiKeyEncrypted, modelsJson, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    body.name || 'Custom Provider',
    body.type || 'openai_compatible',
    body.baseUrl || '',
    encrypted,
    JSON.stringify(models),
    body.enabled !== false ? 1 : 0
  );

  return { providers: listProvidersSafe() };
});

app.put('/api/providers/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const existing = getProviderRaw(id);
  if (!existing) return reply.code(404).send({ error: 'Provider not found' });

  const body = (req.body || {}) as any;
  const nextEncrypted =
    body.apiKey !== undefined && body.apiKey !== ''
      ? encryptSecret(String(body.apiKey))
      : existing.apiKeyEncrypted;
  const nextModels = Array.isArray(body.models) ? body.models : existing.models;

  db.prepare(`
    UPDATE provider_configs
    SET name = ?, type = ?, baseUrl = ?, apiKeyEncrypted = ?, modelsJson = ?, enabled = ?
    WHERE id = ?
  `).run(
    body.name ?? existing.name,
    body.type ?? existing.type,
    body.baseUrl ?? existing.baseUrl,
    nextEncrypted,
    JSON.stringify(nextModels),
    body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled ? 1 : 0,
    id
  );

  return { providers: listProvidersSafe() };
});

app.delete('/api/providers/:id', async (req) => {
  const { id } = req.params as { id: string };
  if (id !== 'provider_builtin') {
    db.prepare('DELETE FROM provider_configs WHERE id = ?').run(id);
  }
  return { providers: listProvidersSafe() };
});

app.post('/api/providers/:id/test', async (req, reply) => {
  const { id } = req.params as { id: string };
  const prov = getProviderRaw(id);
  if (!prov) return reply.code(404).send({ error: 'Provider not found' });
  const result = await testProviderConnection(prov);
  if (result.ok && result.models.length > 0) {
    db.prepare('UPDATE provider_configs SET modelsJson = ? WHERE id = ?').run(
      JSON.stringify(result.models),
      id
    );
  }
  return result;
});

app.get('/api/agent-models', async () => {
  const rows = db.prepare('SELECT * FROM agent_model_maps').all() as any[];
  const mapping = PIPELINE_STEPS.map((s) => {
    const found = rows.find((r) => r.agent === s.agent);
    return {
      stepIndex: s.stepIndex,
      agent: s.agent,
      displayName: s.displayName,
      usesLlm: s.usesLlm,
      recommendedTier: s.recommendedTier,
      providerId: found?.providerId || 'provider_builtin',
      model: found?.model || 'gpt-4o-mini',
      temperature: Number(found?.temperature ?? 0.3),
      fallbacks: found?.fallbacksJson ? JSON.parse(found.fallbacksJson) : [],
    };
  });
  return { agentModels: mapping };
});

app.put('/api/agent-models', async (req) => {
  const body = (req.body || {}) as any;

  // Hỗ trợ áp dụng nhanh Preset: economy / balanced / quality (Mục 9.4)
  if (body.preset && MODEL_PRESETS[body.preset as keyof typeof MODEL_PRESETS]) {
    const presetCfg = MODEL_PRESETS[body.preset as keyof typeof MODEL_PRESETS].mapping;
    const providerId = body.providerId || 'provider_builtin';
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO agent_model_maps (agent, providerId, model, temperature, fallbacksJson)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const [agent, cfg] of Object.entries(presetCfg)) {
      stmt.run(
        agent,
        providerId,
        cfg.model,
        cfg.temperature,
        JSON.stringify([{ providerId: 'provider_builtin', model: 'gpt-4o-mini' }])
      );
    }
  } else if (Array.isArray(body.agentModels)) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO agent_model_maps (agent, providerId, model, temperature, fallbacksJson)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const item of body.agentModels) {
      stmt.run(
        item.agent,
        item.providerId || 'provider_builtin',
        item.model || 'gpt-4o-mini',
        Number(item.temperature ?? 0.3),
        JSON.stringify(item.fallbacks || [])
      );
    }
  }

  const rows = db.prepare('SELECT * FROM agent_model_maps').all() as any[];
  return { agentModels: rows };
});

// ============================================================================
// SETTINGS & BRAND KITS (Mục 9.4 & Mục 11.1)
// ============================================================================
app.get('/api/settings', async () => {
  const settings = getGlobalSettings();
  const brandKits = (db.prepare('SELECT * FROM brand_kits').all() as any[]).map((b) => ({
    id: b.id,
    name: b.name,
    palette: JSON.parse(b.paletteJson),
    fonts: JSON.parse(b.fontsJson),
    logoAssetId: b.logoAssetId,
    motionStyle: b.motionStyle,
  }));
  return { settings, brandKits };
});

app.put('/api/settings', async (req) => {
  const body = (req.body || {}) as any;
  const updated = updateGlobalSettings(body);
  return { settings: updated };
});

app.post('/api/brand-kits', async (req) => {
  const body = (req.body || {}) as any;
  const id = body.id || `bk_${crypto.randomUUID().slice(0, 8)}`;
  db.prepare(`
    INSERT OR REPLACE INTO brand_kits (id, name, paletteJson, fontsJson, logoAssetId, motionStyle)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    body.name || 'Custom Brand Kit',
    JSON.stringify(
      body.palette || {
        primary: '#8B5CF6',
        secondary: '#06B6D4',
        accent: '#EC4899',
        bg: '#090D16',
        text: '#F8FAFC',
      }
    ),
    JSON.stringify(body.fonts || { heading: 'Plus Jakarta Sans', body: 'Inter' }),
    body.logoAssetId || null,
    body.motionStyle || 'snappy'
  );
  const brandKits = (db.prepare('SELECT * FROM brand_kits').all() as any[]).map((b) => ({
    id: b.id,
    name: b.name,
    palette: JSON.parse(b.paletteJson),
    fonts: JSON.parse(b.fontsJson),
    logoAssetId: b.logoAssetId,
    motionStyle: b.motionStyle,
  }));
  return { brandKits };
});

// ============================================================================
// VOICE STUDIO & VOICE POOL (Mục 8 & Mục 11.1)
// ============================================================================
app.get('/api/voices', async (req) => {
  const query = (req.query || {}) as any;
  const settings = getGlobalSettings();
  const includeAliases = query.includeAliases === 'true' || Boolean(settings.showOpenAiVoiceAliases);
  const refresh = query.refresh === 'true';

  const client = new VoiceStudioClient(settings.voiceStudioUrl);
  let remoteReachable = false;
  let remoteEngines: any[] = [
    { id: 'omnivoice', available: true, supportsEmotion: false, maxRefSeconds: 20 },
    { id: 'omnivoice-subprocess', available: true, supportsEmotion: false },
    { id: 'kittentts', available: true },
  ];

  if (refresh) {
    try {
      const { voices, engines } = await client.listVoices({ includeAliases: true });
      remoteReachable = true;
      remoteEngines = engines;

      const upsert = db.prepare(`
        INSERT INTO voice_settings (voiceId, name, type, cloned, language, enabled, weight, tagsJson, genderOverride)
        VALUES (?, ?, ?, ?, ?, 1, 1.0, '["tin tức"]', ?)
        ON CONFLICT(voiceId) DO UPDATE SET
          name = excluded.name,
          type = excluded.type,
          language = excluded.language
      `);

      for (const v of voices) {
        if (v.type !== 'openai_alias') {
          upsert.run(
            v.id,
            v.name,
            v.type,
            v.cloned ? 1 : 0,
            v.language,
            v.gender === 'unclassified' ? null : v.gender
          );
        }
      }
    } catch {
      remoteReachable = false;
    }
  }

  const pool = getVoicePoolFromDb();
  const history = getVoiceHistoryFromDb();

  // Tính số lần dùng gần đây cho từng giọng (Mục 8.4)
  const voicesWithStats = pool.map((v) => ({
    ...v,
    recentUsageCount: history.filter((h) => h.voiceId === v.id || h.voiceId === v.voiceId).length,
  }));

  // Mô phỏng cặp giọng sẽ chọn cho lần chạy kế tiếp
  const previewNextCast = pickCast(
    pool,
    history,
    {
      mode: settings.castSelectionMode || 'auto_rotate',
      avoidLastN: Number(settings.avoidLastNVideos ?? 3),
      locks: {
        leadVoiceId: settings.lockedLeadVoiceId,
        accentVoiceId: settings.lockedAccentVoiceId,
      },
    },
    Date.now()
  );

  return {
    voiceStudioUrl: client.getEndpoint(),
    remoteReachable,
    engines: remoteEngines,
    voices: includeAliases
      ? [
          ...voicesWithStats,
          ...['alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'fable', 'marin', 'nova', 'onyx', 'sage', 'shimmer', 'verse'].map(
            (alias) => ({
              id: alias,
              voiceId: alias,
              name: alias,
              type: 'openai_alias',
              gender: 'unclassified',
              cloned: false,
              language: 'Auto',
              enabled: false,
              weight: 0,
              tags: ['openai_alias'],
              recentUsageCount: 0,
            })
          ),
        ]
      : voicesWithStats,
    history,
    previewNextCast,
  };
});

app.post('/api/voices/test-connection', async (req) => {
  const body = (req.body || {}) as any;
  const settings = getGlobalSettings();
  const url = body.voiceStudioUrl || settings.voiceStudioUrl;
  const client = new VoiceStudioClient(url);
  return client.testConnection();
});

app.put('/api/voices/:voiceId', async (req) => {
  const { voiceId } = req.params as { voiceId: string };
  const body = (req.body || {}) as any;

  const existing = db.prepare('SELECT * FROM voice_settings WHERE voiceId = ?').get(voiceId) as any;
  if (existing) {
    db.prepare(`
      UPDATE voice_settings
      SET name = ?, enabled = ?, weight = ?, tagsJson = ?, genderOverride = ?, consentNote = ?
      WHERE voiceId = ?
    `).run(
      body.name ?? existing.name,
      body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled,
      Number(body.weight ?? existing.weight),
      JSON.stringify(body.tags ?? JSON.parse(existing.tagsJson || '[]')),
      body.genderOverride !== undefined ? body.genderOverride : existing.genderOverride,
      body.consentNote ?? existing.consentNote,
      voiceId
    );
  } else {
    db.prepare(`
      INSERT INTO voice_settings (voiceId, name, type, cloned, language, enabled, weight, tagsJson, genderOverride, consentNote)
      VALUES (?, ?, 'profile', 1, 'Auto', ?, ?, ?, ?, ?)
    `).run(
      voiceId,
      body.name || voiceId,
      body.enabled !== false ? 1 : 0,
      Number(body.weight ?? 1.0),
      JSON.stringify(body.tags || ['tin tức']),
      body.genderOverride || null,
      body.consentNote || 'Đã xác nhận quyền sử dụng giọng clone'
    );
  }

  return { voices: getVoicePoolFromDb() };
});

/**
 * Nghe thử 1 giọng hoặc nghe thử cả cặp Lead + Accent có đổi giọng (Mục 8.4 & Mục 11.1: POST /api/voices/preview)
 */
app.post('/api/voices/preview', async (req) => {
  const body = (req.body || {}) as any;
  const settings = getGlobalSettings();
  const client = new VoiceStudioClient(settings.voiceStudioUrl);
  const previewDir = path.join(getDataDir(), 'voice-previews');
  fs.mkdirSync(previewDir, { recursive: true });

  const id = `prev_${Date.now()}`;
  const outWav = path.join(previewDir, `${id}.wav`);

  if (body.pairMode) {
    const leadVoiceId = body.leadVoiceId || '7cc37272';
    const accentVoiceId = body.accentVoiceId || 'giong_2_nu';
    const seg1Path = path.join(previewDir, `${id}_accent.wav`);
    const seg2Path = path.join(previewDir, `${id}_lead.wav`);

    const textAccent =
      body.accentText || 'Điểm nhấn quan trọng: Hệ thống VideoForge tự động phối hợp hai giọng Nam và Nữ!';
    const textLead =
      body.leadText || 'Giọng chính tiếp nối mạch câu chuyện mượt mà với khoảng nghỉ 150 mili giây và chuẩn hóa âm lượng.';

    try {
      await client.synthesize({
        text: textAccent,
        voiceId: accentVoiceId,
        speed: Number(body.accentSpeed ?? 1.03),
        outputPath: seg1Path,
      });
      await client.synthesize({
        text: textLead,
        voiceId: leadVoiceId,
        speed: Number(body.leadSpeed ?? 1.0),
        outputPath: seg2Path,
      });
    } catch {
      synthesizeLocalFallbackTone({ text: textAccent, speaker: 'accent', outputPath: seg1Path });
      synthesizeLocalFallbackTone({ text: textLead, speaker: 'lead', outputPath: seg2Path });
    }

    const merged = mergeVoiceSegmentsWithCrossfade(
      [
        { audioPath: seg1Path, speaker: 'accent' },
        { audioPath: seg2Path, speaker: 'lead' },
      ],
      outWav
    );

    const assetId = `asset_${id}`;
    db.prepare(`
      INSERT INTO assets (id, projectId, kind, path, durationSec, metaJson, createdAt)
      VALUES (?, 'voice_studio_preview', 'voice', ?, ?, ?, ?)
    `).run(
      assetId,
      merged.audioPath,
      merged.durationSec,
      JSON.stringify({ pairMode: true, leadVoiceId, accentVoiceId }),
      new Date().toISOString()
    );

    return {
      ok: true,
      assetId,
      audioUrl: `/api/assets/${assetId}`,
      durationSec: merged.durationSec,
    };
  }

  // Nghe thử đơn lẻ 1 giọng
  const voiceId = body.voiceId || '7cc37272';
  const text =
    body.text || 'Xin chào, đây là bản nghe thử giọng đọc tiếng Việt chất lượng cao từ Voice Studio.';
  let durationSec = 3.0;
  let usedVoiceStudio = true;

  try {
    const res = await client.synthesize({
      text,
      voiceId,
      model: body.model || 'omnivoice',
      speed: Number(body.speed ?? 1.0),
      numStep: Number(body.numStep ?? 16),
      outputPath: outWav,
    });
    durationSec = res.durationSec;
  } catch {
    usedVoiceStudio = false;
    const fb = synthesizeLocalFallbackTone({
      text,
      speaker: voiceId.includes('_nu') ? 'accent' : 'lead',
      outputPath: outWav,
    });
    durationSec = fb.durationSec;
  }

  const assetId = `asset_${id}`;
  db.prepare(`
    INSERT INTO assets (id, projectId, kind, path, durationSec, metaJson, createdAt)
    VALUES (?, 'voice_studio_preview', 'voice', ?, ?, ?, ?)
  `).run(
    assetId,
    outWav,
    durationSec,
    JSON.stringify({ voiceId, usedVoiceStudio }),
    new Date().toISOString()
  );

  return {
    ok: true,
    assetId,
    audioUrl: `/api/assets/${assetId}`,
    durationSec,
    usedVoiceStudio,
  };
});

// ============================================================================
// PUBLISH QUEUE (Mục 10 & Mục 11.1)
// ============================================================================
app.get('/api/publish', async () => {
  const rows = db
    .prepare(`
      SELECT pj.*, p.title as projectTitle
      FROM publish_jobs pj
      LEFT JOIN projects p ON p.id = pj.projectId
      ORDER BY pj.createdAt DESC
    `)
    .all() as any[];

  return {
    jobs: rows.map((r) => ({
      ...r,
      hashtags: JSON.parse(r.hashtagsJson || '[]'),
    })),
  };
});

app.post('/api/publish', async (req) => {
  const body = (req.body || {}) as any;
  const id = `pub_${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO publish_jobs (
      id, projectId, assetId, platform, title, description,
      hashtagsJson, thumbnailAssetId, scheduledAt, method, status, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    body.projectId,
    body.assetId || null,
    body.platform || 'youtube_shorts',
    body.title || 'Video mới',
    body.description || '',
    JSON.stringify(body.hashtags || ['#VideoForge', '#Shorts']),
    body.thumbnailAssetId || null,
    body.scheduledAt || null,
    body.method || 'api',
    body.scheduledAt ? 'queued' : 'draft',
    now
  );

  const created = db.prepare('SELECT * FROM publish_jobs WHERE id = ?').get(id) as any;
  return {
    job: {
      ...created,
      hashtags: JSON.parse(created.hashtagsJson || '[]'),
    },
  };
});

app.put('/api/publish/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const existing = db.prepare('SELECT * FROM publish_jobs WHERE id = ?').get(id) as any;
  if (!existing) return reply.code(404).send({ error: 'PublishJob not found' });

  const body = (req.body || {}) as any;
  db.prepare(`
    UPDATE publish_jobs
    SET title = ?, description = ?, hashtagsJson = ?, scheduledAt = ?, method = ?
    WHERE id = ?
  `).run(
    body.title ?? existing.title,
    body.description ?? existing.description,
    JSON.stringify(body.hashtags ?? JSON.parse(existing.hashtagsJson || '[]')),
    body.scheduledAt !== undefined ? body.scheduledAt : existing.scheduledAt,
    body.method ?? existing.method,
    id
  );

  const updated = db.prepare('SELECT * FROM publish_jobs WHERE id = ?').get(id) as any;
  return {
    job: {
      ...updated,
      hashtags: JSON.parse(updated.hashtagsJson || '[]'),
    },
  };
});

app.post('/api/publish/:id/confirm', async (req, reply) => {
  const { id } = req.params as { id: string };
  const job = db.prepare('SELECT * FROM publish_jobs WHERE id = ?').get(id) as any;
  if (!job) return reply.code(404).send({ error: 'PublishJob not found' });

  db.prepare("UPDATE publish_jobs SET status = 'publishing' WHERE id = ?").run(id);

  // Tìm video file từ assetId hoặc từ final_video của project
  let videoPath = '';
  if (job.assetId) {
    const asset = db.prepare('SELECT path FROM assets WHERE id = ?').get(job.assetId) as any;
    if (asset) videoPath = asset.path;
  }
  if (!videoPath) {
    const fallbackAsset = db
      .prepare("SELECT path FROM assets WHERE projectId = ? AND kind = 'final_video' ORDER BY createdAt DESC LIMIT 1")
      .get(job.projectId) as any;
    if (fallbackAsset) videoPath = fallbackAsset.path;
  }

  const res = await executePublishJob({
    jobId: job.id,
    platform: job.platform as PublishPlatform,
    method: (job.method as 'api' | 'browser') || 'api',
    videoPath,
    title: job.title,
    description: job.description,
    hashtags: JSON.parse(job.hashtagsJson || '[]'),
  });

  if (res.ok) {
    db.prepare("UPDATE publish_jobs SET status = 'published', remoteUrl = ?, error = NULL WHERE id = ?").run(
      res.remoteUrl,
      id
    );
    db.prepare("UPDATE projects SET status = 'published', updatedAt = ? WHERE id = ?").run(
      new Date().toISOString(),
      job.projectId
    );
  } else {
    db.prepare("UPDATE publish_jobs SET status = 'failed', error = ? WHERE id = ?").run(
      res.error || 'Publish failed',
      id
    );
  }

  const updated = db.prepare('SELECT * FROM publish_jobs WHERE id = ?').get(id) as any;
  return {
    ok: res.ok,
    job: {
      ...updated,
      hashtags: JSON.parse(updated.hashtagsJson || '[]'),
    },
    logs: res.logs,
  };
});

// Khởi động server nếu không phải môi trường import kiểm thử
const PORT = Number(process.env.PORT || 4000);
if (process.env.NODE_ENV !== 'test') {
  app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
    console.log(`🚀 VideoForge API & Orchestrator đang chạy tại http://localhost:${PORT}`);
  });
}
