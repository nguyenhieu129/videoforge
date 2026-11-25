import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  PIPELINE_STEPS,
  DISABLEABLE_STEPS,
  type AgentName,
} from '@videoforge/core';
import {
  runCollectorAgent,
  runCleanerAgent,
  runAnalyzerAgent,
  runScorerAgent,
  runStrategistAgent,
  runScriptwriterAgent,
  runFactCheckerAgent,
  runDirectorAgent,
  runAssetAgent,
  runVoiceStudioAgent,
  runCaptionAgent,
  runSceneBuilderAgent,
  runLintPreviewAgent,
  runRendererAgent,
  runAssemblerAgent,
  runQAAgent,
  runPublisherAgent,
  type AgentExecutionContext,
  type AgentStepResult,
} from '@videoforge/agents';
import {
  db,
  getDataDir,
  getGlobalSettings,
  getVoicePoolFromDb,
  getVoiceHistoryFromDb,
  getProviderRaw,
  createAssetRecord,
} from './db.js';

export type SseSubscriber = (eventId: number, payload: Record<string, any>) => void;

const runSubscribers = new Map<string, Set<SseSubscriber>>();
const activeRunState = new Map<
  string,
  {
    status: 'running' | 'paused' | 'canceled';
    qaRetryCount: number;
  }
>();

export function subscribeRunEvents(runId: string, fn: SseSubscriber): () => void {
  if (!runSubscribers.has(runId)) {
    runSubscribers.set(runId, new Set());
  }
  runSubscribers.get(runId)!.add(fn);
  return () => {
    runSubscribers.get(runId)?.delete(fn);
  };
}

export function getMissedRunEvents(runId: string, lastEventId: number): Array<{ id: number; payload: any }> {
  const rows = db
    .prepare('SELECT id, payloadJson FROM run_events WHERE runId = ? AND id > ? ORDER BY id ASC')
    .all(runId, lastEventId) as any[];
  return rows.map((r) => ({ id: r.id, payload: JSON.parse(r.payloadJson) }));
}

export function emitRunEvent(runId: string, payload: Record<string, any>) {
  const ts = new Date().toISOString();
  const fullPayload = { ...payload, ts };
  const info = db
    .prepare('INSERT INTO run_events (runId, ts, payloadJson) VALUES (?, ?, ?)')
    .run(runId, ts, JSON.stringify(fullPayload));
  const eventId = Number(info.lastInsertRowid);

  const subs = runSubscribers.get(runId);
  if (subs) {
    for (const sub of subs) {
      try {
        sub(eventId, fullPayload);
      } catch {
        // ignore closed stream
      }
    }
  }
}

export function appendStepLog(
  runId: string,
  stepRunId: string,
  stepIndex: number,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, any>
) {
  const ts = new Date().toISOString();
  db.prepare(`
    INSERT INTO log_entries (runId, stepRunId, stepIndex, ts, level, message, metaJson)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(runId, stepRunId, stepIndex, ts, level, message, meta ? JSON.stringify(meta) : null);

  emitRunEvent(runId, {
    type: 'step.log',
    step: stepIndex,
    level,
    message,
    meta,
    ts,
  });
}

function getAgentModelAndFallbacks(agent: AgentName) {
  const row = db.prepare('SELECT * FROM agent_model_maps WHERE agent = ?').get(agent) as any;
  const primaryProviderId = row?.providerId || 'provider_builtin';
  const primaryModel = row?.model || 'gpt-4o-mini';
  const temperature = Number(row?.temperature ?? 0.3);
  const fallbacks: Array<{ providerId: string; model: string }> = row?.fallbacksJson
    ? JSON.parse(row.fallbacksJson)
    : [];

  const candidates = [
    { providerId: primaryProviderId, model: primaryModel },
    ...fallbacks,
    { providerId: 'provider_builtin', model: primaryModel },
  ];

  return { candidates, temperature };
}

/**
 * Khởi tạo một Run mới với đầy đủ 17 StepRun trong DB
 */
export function createPipelineRun(projectId: string, opts?: { voiceCastSeed?: number }): string {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) throw new Error('Không tìm thấy Project');

  const runId = `run_${crypto.randomUUID().slice(0, 10)}`;
  const now = new Date().toISOString();
  const seed = opts?.voiceCastSeed ?? Math.floor(10000 + Math.random() * 90000);

  const disabledSteps: number[] = JSON.parse(project.disabledStepsJson || '[]');
  const approvalSteps: number[] = JSON.parse(project.approvalStepsJson || '[6,8,17]');

  db.prepare(`
    INSERT INTO runs (id, projectId, status, currentStep, costUsd, tokensIn, tokensOut, voiceCastSeed, voiceCastJson, startedAt)
    VALUES (?, ?, 'queued', 1, 0, 0, 0, ?, '{}', ?)
  `).run(runId, projectId, seed, now);

  const insertStep = db.prepare(`
    INSERT INTO step_runs (id, runId, stepIndex, agent, status, inputJson, outputJson, requiresApproval, attempt)
    VALUES (?, ?, ?, ?, ?, '{}', '{}', ?, 0)
  `);

  for (const s of PIPELINE_STEPS) {
    const stepId = `sr_${runId}_${s.stepIndex}`;
    const isSkipped = disabledSteps.includes(s.stepIndex) && DISABLEABLE_STEPS.has(s.stepIndex);
    const reqApproval = approvalSteps.includes(s.stepIndex) ? 1 : 0;
    insertStep.run(stepId, runId, s.stepIndex, s.agent, isSkipped ? 'skipped' : 'pending', reqApproval);
  }

  db.prepare('UPDATE projects SET status = ?, updatedAt = ? WHERE id = ?').run('running', now, projectId);
  return runId;
}

/**
 * Điều khiển Pause / Resume / Cancel Run
 */
export function pausePipelineRun(runId: string) {
  const state = activeRunState.get(runId);
  if (state) state.status = 'paused';
  db.prepare('UPDATE runs SET status = ? WHERE id = ?').run('paused', runId);
  const run = db.prepare('SELECT projectId FROM runs WHERE id = ?').get(runId) as any;
  if (run) db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('paused', run.projectId);
  emitRunEvent(runId, { type: 'run.paused', runId });
}

export function cancelPipelineRun(runId: string) {
  const state = activeRunState.get(runId);
  if (state) state.status = 'canceled';
  db.prepare('UPDATE runs SET status = ?, finishedAt = ? WHERE id = ?').run(
    'canceled',
    new Date().toISOString(),
    runId
  );
  const run = db.prepare('SELECT projectId FROM runs WHERE id = ?').get(runId) as any;
  if (run) db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('failed', run.projectId);
  emitRunEvent(runId, { type: 'run.canceled', runId });
}

export function resumePipelineRun(runId: string, fromStepIndex?: number) {
  const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as any;
  if (!run) throw new Error('Không tìm thấy Run');
  const startStep = fromStepIndex ?? run.currentStep ?? 1;

  if (fromStepIndex !== undefined) {
    const project = db.prepare('SELECT disabledStepsJson FROM projects WHERE id = ?').get(run.projectId) as any;
    const disabledSteps: number[] = project ? JSON.parse(project.disabledStepsJson || '[]') : [];
    for (const s of PIPELINE_STEPS) {
      if (s.stepIndex >= fromStepIndex) {
        const isSkipped = disabledSteps.includes(s.stepIndex) && DISABLEABLE_STEPS.has(s.stepIndex);
        db.prepare(`
          UPDATE step_runs
          SET status = ?, error = NULL, approved = NULL
          WHERE runId = ? AND stepIndex = ?
        `).run(isSkipped ? 'skipped' : 'pending', runId, s.stepIndex);
      }
    }
  }

  setImmediate(() => {
    executePipelineOrchestrator(runId, startStep).catch((err) => {
      console.error('Orchestrator fatal error:', err);
    });
  });
}

/**
 * Duyệt thủ công một bước (Mục 9.2 & Mục 11.1: POST /api/runs/:id/steps/:i/approve)
 * Cho phép người dùng sửa trực tiếp JSON đầu ra (ví dụ sửa Script hoặc Storyboard) rồi chạy tiếp.
 */
export function approveStepAndContinue(runId: string, stepIndex: number, customOutput?: any) {
  const stepRow = db
    .prepare('SELECT * FROM step_runs WHERE runId = ? AND stepIndex = ?')
    .get(runId, stepIndex) as any;
  if (!stepRow) throw new Error(`Không tìm thấy bước ${stepIndex}`);

  const nextOutputJson = customOutput ? JSON.stringify(customOutput) : stepRow.outputJson;
  db.prepare(`
    UPDATE step_runs
    SET approved = 1, status = 'done', outputJson = ?, finishedAt = COALESCE(finishedAt, ?)
    WHERE id = ?
  `).run(nextOutputJson, new Date().toISOString(), stepRow.id);

  appendStepLog(runId, stepRow.id, stepIndex, 'info', 'Người dùng đã duyệt bước này và cho phép tiếp tục.');

  // Nếu duyệt bước 17 (Publisher), tự động tạo các PublishJob ở trạng thái confirmed/draft
  if (stepIndex === 17) {
    const out = JSON.parse(nextOutputJson);
    const run = db.prepare('SELECT projectId FROM runs WHERE id = ?').get(runId) as any;
    if (run && Array.isArray(out.drafts)) {
      const insertPub = db.prepare(`
        INSERT INTO publish_jobs (id, projectId, assetId, platform, title, description, hashtagsJson, thumbnailAssetId, method, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'api', 'confirmed', ?)
      `);
      for (const d of out.drafts) {
        insertPub.run(
          `pub_${crypto.randomUUID().slice(0, 8)}`,
          run.projectId,
          d.videoAssetId || null,
          d.platform,
          d.title,
          d.description,
          JSON.stringify(d.hashtags || []),
          d.thumbnailAssetId || null,
          new Date().toISOString()
        );
      }
    }
  }

  resumePipelineRun(runId, stepIndex + 1);
}

function getStepOutput<T = any>(runId: string, stepIndex: number): T | undefined {
  const row = db
    .prepare('SELECT outputJson FROM step_runs WHERE runId = ? AND stepIndex = ?')
    .get(runId, stepIndex) as any;
  if (!row || !row.outputJson || row.outputJson === '{}') return undefined;
  return JSON.parse(row.outputJson) as T;
}

/**
 * State Machine điều phối 17 bước của Pipeline (Mục 3, 6, 11.2)
 */
export async function executePipelineOrchestrator(runId: string, startFromStep = 1) {
  const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as any;
  if (!run) return;
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(run.projectId) as any;
  if (!project) return;

  const existingState = activeRunState.get(runId);
  const state = {
    status: 'running' as 'running' | 'paused' | 'canceled',
    qaRetryCount: existingState?.qaRetryCount ?? 0,
  };
  activeRunState.set(runId, state);

  db.prepare('UPDATE runs SET status = ? WHERE id = ?').run('running', runId);
  db.prepare('UPDATE projects SET status = ?, updatedAt = ? WHERE id = ?').run(
    'running',
    new Date().toISOString(),
    project.id
  );

  if (startFromStep === 1) {
    emitRunEvent(runId, { type: 'run.started', runId });
  }

  const projectDir = path.join(getDataDir(), 'projects', project.id, runId);
  fs.mkdirSync(projectDir, { recursive: true });

  let stepIdx = startFromStep;
  while (stepIdx <= 17) {
    if (state.status !== 'running') {
      return;
    }

    const stepDef = PIPELINE_STEPS.find((s) => s.stepIndex === stepIdx)!;
    const stepRow = db
      .prepare('SELECT * FROM step_runs WHERE runId = ? AND stepIndex = ?')
      .get(runId, stepIdx) as any;

    db.prepare('UPDATE runs SET currentStep = ? WHERE id = ?').run(stepIdx, runId);

    // Nếu bước đã được đánh dấu skipped
    if (stepRow.status === 'skipped') {
      appendStepLog(runId, stepRow.id, stepIdx, 'info', `Bước ${stepIdx} (${stepDef.agent}) đã được tắt trong cấu hình -> Bỏ qua.`);
      stepIdx++;
      continue;
    }

    const globalSettings = getGlobalSettings();
    const { candidates, temperature } = getAgentModelAndFallbacks(stepDef.agent);
    const chosenCandidate = candidates[0];
    const providerRecord =
      getProviderRaw(chosenCandidate.providerId) ||
      getProviderRaw('provider_builtin') || {
        id: 'provider_builtin',
        name: 'Built-in',
        type: 'openai_compatible' as const,
        baseUrl: 'builtin://videoforge',
        models: ['gpt-4o-mini'],
        enabled: true,
      };

    const isDefaultPresetKit =
      typeof project.brandKitId === 'string' && project.brandKitId.startsWith('bk_');
    const brandKitRow =
      project.brandKitId && !isDefaultPresetKit
        ? (db.prepare('SELECT * FROM brand_kits WHERE id = ?').get(project.brandKitId) as any)
        : null;

    const stepStartMs = Date.now();
    const attempt = Number(stepRow.attempt || 0) + 1;

    // Thu thập input cho bước hiện tại để lưu vào DB
    const stepInputSummary = buildStepInputSummary(runId, stepIdx, project);
    db.prepare(`
      UPDATE step_runs
      SET status = 'running', startedAt = ?, attempt = ?, inputJson = ?, modelUsed = ?, error = NULL
      WHERE id = ?
    `).run(
      new Date().toISOString(),
      attempt,
      JSON.stringify(stepInputSummary),
      chosenCandidate.model,
      stepRow.id
    );

    emitRunEvent(runId, {
      type: 'step.started',
      step: stepIdx,
      agent: stepDef.agent,
      model: chosenCandidate.model,
    });

    const ctx: AgentExecutionContext = {
      projectId: project.id,
      runId,
      projectDir,
      sourceType: project.sourceType,
      sourceRef: project.sourceRef,
      title: project.title,
      aspect: project.aspect,
      stylePreset: project.stylePreset,
      scoreThreshold: Number(project.scoreThreshold ?? globalSettings.defaultScoreThreshold ?? 5.0),
      castMode: project.castMode || globalSettings.defaultCastMode || 'lead_accent',
      castSelectionMode: project.castSelectionMode || globalSettings.castSelectionMode || 'auto_rotate',
      avoidLastNVideos: Number(globalSettings.avoidLastNVideos ?? 3),
      voiceCastSeed: Number(run.voiceCastSeed || 12345),
      lockedLeadVoiceId: globalSettings.lockedLeadVoiceId,
      lockedAccentVoiceId: globalSettings.lockedAccentVoiceId,
      voiceStudioUrl: globalSettings.voiceStudioUrl || process.env.VOICE_STUDIO_URL || 'http://192.168.5.18:3900',
      voicePool: getVoicePoolFromDb(),
      voiceHistory: getVoiceHistoryFromDb(),
      leadCaptionColor: globalSettings.leadCaptionColor || '#38BDF8',
      accentCaptionColor: globalSettings.accentCaptionColor || '#F472B6',
      brandPalette: brandKitRow ? JSON.parse(brandKitRow.paletteJson) : undefined,
      brandFonts: brandKitRow ? JSON.parse(brandKitRow.fontsJson) : undefined,
      maxParallelScenes: Number(globalSettings.maxParallelScenes || 2),
      blenderEnabled: Boolean(globalSettings.blenderEnabled),
      blenderMcpUrl: globalSettings.blenderMcpUrl,
      enableAutoBroll: globalSettings.enableAutoBroll !== false,
      pexelsApiKey: globalSettings.pexelsApiKey || '',
      pixabayApiKey: globalSettings.pixabayApiKey || '',
      provider: providerRecord,
      model: chosenCandidate.model,
      temperature,
      log: (level, message, meta) => appendStepLog(runId, stepRow.id, stepIdx, level, message, meta),
      onProgress: (percent) => emitRunEvent(runId, { type: 'step.progress', step: stepIdx, percent }),
      onAssetCreated: (asset) => {
        const assetId = createAssetRecord({
          projectId: project.id,
          runId,
          stepRunId: stepRow.id,
          ...asset,
        });
        emitRunEvent(runId, { type: 'asset.created', assetId, kind: asset.kind, step: stepIdx });
        return assetId;
      },
    };

    // Thực thi bước với cơ chế Retry tối đa 2 lần có backoff (Mục 6.1)
    let stepResult: AgentStepResult | null = null;
    let lastError: any = null;

    for (let retry = 0; retry <= 2; retry++) {
      try {
        if (retry > 0) {
          const backoffMs = retry * 600;
          ctx.log('warn', `Thử lại lần ${retry}/2 sau ${backoffMs}ms...`);
          await new Promise((r) => setTimeout(r, backoffMs));
        }
        stepResult = await executeSingleAgentStep(stepIdx, ctx, runId);
        break;
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!stepResult) {
      const errMsg = lastError?.message || 'Lỗi không xác định khi chạy Agent';
      db.prepare(`
        UPDATE step_runs SET status = 'failed', finishedAt = ?, error = ? WHERE id = ?
      `).run(new Date().toISOString(), errMsg, stepRow.id);
      db.prepare('UPDATE runs SET status = ? WHERE id = ?').run('failed', runId);
      db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('failed', project.id);

      appendStepLog(runId, stepRow.id, stepIdx, 'error', `Thất bại sau khi retry: ${errMsg}`);
      emitRunEvent(runId, { type: 'step.failed', step: stepIdx, error: errMsg });
      return;
    }

    // Lưu lịch sử VoiceUsage nếu là bước 10 (Voice Studio)
    if (stepIdx === 10 && stepResult.output?.castUsed) {
      const cast = stepResult.output.castUsed;
      db.prepare('UPDATE runs SET voiceCastJson = ? WHERE id = ?').run(JSON.stringify(cast), runId);
      const nowIso = new Date().toISOString();
      const insertUsage = db.prepare(`
        INSERT INTO voice_usages (id, voiceId, projectId, runId, role, usedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertUsage.run(`vu_${crypto.randomUUID().slice(0, 8)}`, cast.leadVoiceId, project.id, runId, 'lead', nowIso);
      insertUsage.run(`vu_${crypto.randomUUID().slice(0, 8)}`, cast.accentVoiceId, project.id, runId, 'accent', nowIso);
    }

    const durationMs = Date.now() - stepStartMs;
    const finalStatus = stepResult.warningMessage ? 'warning' : 'done';

    db.prepare(`
      UPDATE step_runs
      SET status = ?, outputJson = ?, modelUsed = ?, tokensIn = ?, tokensOut = ?, costUsd = ?, finishedAt = ?
      WHERE id = ?
    `).run(
      finalStatus,
      JSON.stringify(stepResult.output),
      stepResult.modelUsed,
      stepResult.tokensIn,
      stepResult.tokensOut,
      stepResult.costUsd,
      new Date().toISOString(),
      stepRow.id
    );

    // Cộng dồn token và chi phí vào Run
    db.prepare(`
      UPDATE runs
      SET tokensIn = tokensIn + ?, tokensOut = tokensOut + ?, costUsd = ROUND(costUsd + ?, 6)
      WHERE id = ?
    `).run(stepResult.tokensIn, stepResult.tokensOut, stepResult.costUsd, runId);

    if (stepResult.warningMessage) {
      emitRunEvent(runId, {
        type: 'step.warning',
        step: stepIdx,
        message: stepResult.warningMessage,
      });
    }

    emitRunEvent(runId, {
      type: 'step.completed',
      step: stepIdx,
      durationMs,
      tokensIn: stepResult.tokensIn,
      tokensOut: stepResult.tokensOut,
      costUsd: stepResult.costUsd,
    });

    // Kiểm tra ngân sách USD mỗi video (Mục 9.4)
    const updatedRun = db.prepare('SELECT costUsd FROM runs WHERE id = ?').get(runId) as any;
    const budgetLimit = Number(globalSettings.budgetLimitUsdPerVideo || 1.5);
    if (updatedRun && updatedRun.costUsd > budgetLimit) {
      const msg = `Chi phí hiện tại ($${updatedRun.costUsd}) vượt ngân sách đặt trước ($${budgetLimit}).`;
      appendStepLog(runId, stepRow.id, stepIdx, 'warn', msg);
      if (globalSettings.budgetExceededAction === 'stop') {
        pausePipelineRun(runId);
        return;
      }
    }

    // Mục 6.2: Nếu bước 4 (Scorer) dưới ngưỡng điểm đặt trước -> dừng và hỏi người dùng duyệt
    if (stepIdx === 4 && stepResult.output?.verdict === 'below_threshold') {
      db.prepare('UPDATE step_runs SET requiresApproval = 1, approved = 0, status = ? WHERE id = ?').run(
        'warning',
        stepRow.id
      );
      db.prepare('UPDATE runs SET status = ? WHERE id = ?').run('paused', runId);
      emitRunEvent(runId, { type: 'approval.needed', step: stepIdx, reason: stepResult.warningMessage });
      return;
    }

    // Mục 6.1: Bước 16 (QA Agent) thất bại -> tự động quay lại bước 12 tối đa 2 lần, sau đó đánh dấu warning
    if (stepIdx === 16 && stepResult.output && !stepResult.output.pass) {
      if (state.qaRetryCount < 2) {
        state.qaRetryCount++;
        appendStepLog(
          runId,
          stepRow.id,
          stepIdx,
          'warn',
          `QA phát hiện lỗi trên cảnh (${stepResult.output.failedSceneIds.join(', ')}) -> Tự động quay lại Bước 12 (Scene Builder) lần ${state.qaRetryCount}/2 để sửa lỗi.`
        );
        stepIdx = 12;
        continue;
      } else {
        db.prepare('UPDATE step_runs SET status = ? WHERE id = ?').run('warning', stepRow.id);
        emitRunEvent(runId, {
          type: 'step.warning',
          step: stepIdx,
          message: 'Đã thử tự sửa lỗi QA 2 lần, đánh dấu warning để người dùng quyết định.',
        });
      }
    }

    // Kiểm tra bước có yêu cầu duyệt thủ công (requiresApproval) hay không
    const freshStep = db.prepare('SELECT requiresApproval, approved FROM step_runs WHERE id = ?').get(stepRow.id) as any;
    if (freshStep?.requiresApproval && !freshStep?.approved) {
      db.prepare('UPDATE runs SET status = ? WHERE id = ?').run('paused', runId);
      db.prepare('UPDATE projects SET status = ? WHERE id = ?').run('paused', project.id);
      appendStepLog(
        runId,
        stepRow.id,
        stepIdx,
        'info',
        `Đang chờ người dùng xem trước và bấm "Duyệt & tiếp tục" ở bước ${stepIdx} (${stepDef.agent}).`
      );
      emitRunEvent(runId, { type: 'approval.needed', step: stepIdx });
      return;
    }

    stepIdx++;
  }

  // Hoàn tất toàn bộ 17 bước
  const finishedAt = new Date().toISOString();
  db.prepare('UPDATE runs SET status = ?, finishedAt = ? WHERE id = ?').run('completed', finishedAt, runId);
  db.prepare('UPDATE projects SET status = ?, updatedAt = ? WHERE id = ?').run(
    'completed',
    finishedAt,
    project.id
  );
  activeRunState.delete(runId);
  emitRunEvent(runId, { type: 'run.completed', runId });
}

function buildStepInputSummary(runId: string, stepIdx: number, project: any): Record<string, any> {
  switch (stepIdx) {
    case 1:
      return { sourceType: project.sourceType, sourceRef: project.sourceRef, title: project.title };
    case 2:
      return { rawArticle: getStepOutput(runId, 1) };
    case 3:
    case 4:
    case 5:
      return { cleanArticle: getStepOutput(runId, 2), analysis: getStepOutput(runId, 3), score: getStepOutput(runId, 4) };
    case 6:
      return { strategy: getStepOutput(runId, 5), cleanArticle: getStepOutput(runId, 2) };
    case 7:
      return { script: getStepOutput(runId, 6), cleanArticle: getStepOutput(runId, 2) };
    case 8:
      return { script: getStepOutput(runId, 7)?.fixedScript || getStepOutput(runId, 6), strategy: getStepOutput(runId, 5) };
    case 9:
      return { storyboard: getStepOutput(runId, 8) };
    case 10:
      return { script: getStepOutput(runId, 7)?.fixedScript || getStepOutput(runId, 6) };
    case 11:
      return { voiceAudioPath: getStepOutput(runId, 10)?.audioPath };
    case 12:
      return { storyboard: getStepOutput(runId, 8), captionsCount: getStepOutput(runId, 11)?.words?.length || 0 };
    case 13:
    case 14:
      return { scenesCount: getStepOutput(runId, 12)?.scenes?.length || 0 };
    case 15:
      return { clipsCount: getStepOutput(runId, 14)?.clips?.length || 0 };
    case 16:
      return { finalVideos: getStepOutput(runId, 15) };
    case 17:
      return { finalVideos: getStepOutput(runId, 15), qaReport: getStepOutput(runId, 16) };
    default:
      return {};
  }
}

async function executeSingleAgentStep(
  stepIdx: number,
  ctx: AgentExecutionContext,
  runId: string
): Promise<AgentStepResult> {
  const rawArticle = getStepOutput(runId, 1) || {
    title: ctx.title,
    text: ctx.sourceRef,
    images: [],
    url: ctx.sourceRef,
  };
  const cleanArticle = getStepOutput(runId, 2) || {
    title: rawArticle.title,
    body: rawArticle.text,
    keyFacts: [rawArticle.title, rawArticle.text.slice(0, 150)],
    images: [],
  };
  const analysis = getStepOutput(runId, 3) || {
    topic: cleanArticle.title,
    audience: 'Người xem đại chúng',
    tone: 'Năng động, trực diện',
    hookAngles: [cleanArticle.title],
    risks: [],
  };
  const score = getStepOutput(runId, 4) || {
    total: 8.2,
    hook: 8.5,
    novelty: 8.0,
    clarity: 8.2,
    controversy: 7.0,
    visualizability: 8.5,
    verdict: 'pass' as const,
    reasons: ['Đạt tiêu chuẩn'],
  };
  const strategy = getStepOutput(runId, 5) || {
    format: 'news_brief' as const,
    durationSec: 20,
    style: ctx.stylePreset,
    pacing: 'snappy' as const,
    aspect: ctx.aspect,
    castMode: ctx.castMode,
  };
  const scriptFrom6 = getStepOutput(runId, 6);
  const factCheckFrom7 = getStepOutput(runId, 7);
  const activeScript = factCheckFrom7?.fixedScript || scriptFrom6;
  const storyboard = getStepOutput(runId, 8);
  const assetsOut = getStepOutput(runId, 9);
  const voiceOut = getStepOutput(runId, 10);
  const captionsOut = getStepOutput(runId, 11) || {
    words: voiceOut?.wordTimings || [],
    srtPath: path.join(ctx.projectDir, 'captions', 'captions.srt'),
    methodUsed: 'ffprobe_character_estimate' as const,
    style: {
      leadColor: ctx.leadCaptionColor,
      accentColor: ctx.accentCaptionColor,
      fontFamily: 'Plus Jakarta Sans',
      fontSize9x16: 54,
      fontSize16x9: 42,
    },
  };
  const sceneBuilderOut = getStepOutput(runId, 12);
  const previewOut = getStepOutput(runId, 13);
  const rendererOut = getStepOutput(runId, 14);
  const assemblerOut = getStepOutput(runId, 15);

  switch (stepIdx) {
    case 1:
      return runCollectorAgent(ctx);
    case 2:
      return runCleanerAgent(ctx, rawArticle);
    case 3:
      return runAnalyzerAgent(ctx, cleanArticle);
    case 4:
      return runScorerAgent(ctx, analysis, cleanArticle);
    case 5:
      return runStrategistAgent(ctx, analysis, score);
    case 6:
      return runScriptwriterAgent(ctx, strategy, cleanArticle, analysis);
    case 7:
      return runFactCheckerAgent(ctx, scriptFrom6, cleanArticle);
    case 8:
      return runDirectorAgent(ctx, activeScript, strategy);
    case 9:
      return runAssetAgent(ctx, storyboard, strategy.durationSec, activeScript, cleanArticle);
    case 10:
      return runVoiceStudioAgent(ctx, activeScript);
    case 11:
      return runCaptionAgent(ctx, voiceOut);
    case 12:
      return runSceneBuilderAgent(ctx, activeScript, storyboard, voiceOut, captionsOut, assetsOut);
    case 13:
      return runLintPreviewAgent(ctx, sceneBuilderOut, activeScript, storyboard);
    case 14:
      return runRendererAgent(ctx, sceneBuilderOut, activeScript, storyboard, voiceOut, assetsOut);
    case 15:
      return runAssemblerAgent(ctx, rendererOut, voiceOut, assetsOut);
    case 16:
      return runQAAgent(ctx, assemblerOut, activeScript, previewOut);
    case 17:
      return runPublisherAgent(ctx, cleanArticle, activeScript, assemblerOut, rawArticle.url);
    default:
      throw new Error(`Bước không hợp lệ: ${stepIdx}`);
  }
}

/**
 * Đổi thiết kế & Render lại duy nhất 1 cảnh (sceneId) rồi ghép nhanh lại file MP4 tổng (Hạng mục 5.2)
 */
export async function rerollSingleScene(
  projectId: string,
  sceneId: string,
  overrides?: {
    visualConcept?: string;
    brollQuery?: string;
    onScreenText?: string;
    visualCues?: any[];
    palette?: { primary: string; secondary: string; accent: string; bg: string; text: string };
  }
) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
  if (!project) throw new Error('Không tìm thấy Project');

  const run = db
    .prepare('SELECT * FROM runs WHERE projectId = ? ORDER BY startedAt DESC LIMIT 1')
    .get(projectId) as any;
  if (!run) throw new Error('Dự án chưa có phiên chạy nào để reroll cảnh');

  const runId: string = run.id;
  const projectDir = path.join(getDataDir(), 'projects', project.id, runId);
  const globalSettings = getGlobalSettings();

  const { candidates, temperature } = getAgentModelAndFallbacks('SceneBuilder');
  const chosenCandidate = candidates[0]!;
  const providerRecord =
    getProviderRaw(chosenCandidate.providerId) ||
    getProviderRaw('provider_builtin') || {
      id: 'provider_builtin',
      name: 'Built-in',
      type: 'openai_compatible' as const,
      baseUrl: 'builtin://videoforge',
      models: ['gpt-4o-mini'],
      enabled: true,
    };

  const step14Row = db
    .prepare('SELECT id FROM step_runs WHERE runId = ? AND stepIndex = 14')
    .get(runId) as any;
  const stepRunId = step14Row?.id || `sr_${runId}_14`;

  const ctx: AgentExecutionContext = {
    projectId: project.id,
    runId,
    projectDir,
    sourceType: project.sourceType,
    sourceRef: project.sourceRef,
    title: project.title,
    aspect: project.aspect,
    stylePreset: project.stylePreset,
    scoreThreshold: Number(project.scoreThreshold ?? 5.0),
    castMode: project.castMode || 'lead_accent',
    castSelectionMode: project.castSelectionMode || 'auto_rotate',
    avoidLastNVideos: 3,
    voiceCastSeed: Number(run.voiceCastSeed || 12345),
    voiceStudioUrl: globalSettings.voiceStudioUrl || 'http://localhost:3900',
    voicePool: getVoicePoolFromDb(),
    voiceHistory: getVoiceHistoryFromDb(),
    leadCaptionColor: globalSettings.leadCaptionColor || '#38BDF8',
    accentCaptionColor: globalSettings.accentCaptionColor || '#F472B6',
    maxParallelScenes: 2,
    blenderEnabled: false,
    enableAutoBroll: globalSettings.enableAutoBroll !== false,
    pexelsApiKey: globalSettings.pexelsApiKey || '',
    pixabayApiKey: globalSettings.pixabayApiKey || '',
    provider: providerRecord,
    model: chosenCandidate.model,
    temperature,
    log: (level, message, meta) => appendStepLog(runId, stepRunId, 14, level, `[Reroll ${sceneId}] ${message}`, meta),
    onProgress: (percent) => emitRunEvent(runId, { type: 'step.progress', step: 14, percent }),
    onAssetCreated: (asset) => {
      const assetId = createAssetRecord({
        projectId: project.id,
        runId,
        stepRunId,
        ...asset,
      });
      emitRunEvent(runId, { type: 'asset.created', assetId, kind: asset.kind, step: 14 });
      return assetId;
    },
  };

  const scriptFrom6 = getStepOutput(runId, 6);
  const factCheckFrom7 = getStepOutput(runId, 7);
  const activeScript = factCheckFrom7?.fixedScript || scriptFrom6;
  const storyboard = getStepOutput(runId, 8);
  const assetsOut = getStepOutput(runId, 9);
  const voiceOut = getStepOutput(runId, 10);
  const captionsOut = getStepOutput(runId, 11);
  const sceneBuilderOut = getStepOutput(runId, 12);
  const previewOut = getStepOutput(runId, 13);
  const rendererOut = getStepOutput(runId, 14);
  const strategy = getStepOutput(runId, 5) || {
    format: 'explainer' as const,
    durationSec: 25,
    style: project.stylePreset,
    pacing: 'snappy' as const,
    aspect: project.aspect,
    castMode: project.castMode,
  };

  if (!activeScript || !storyboard || !voiceOut || !sceneBuilderOut || !rendererOut) {
    throw new Error('Cần chạy xong tối thiểu tới bước 14 trước khi Reroll cảnh lẻ');
  }

  const targetSceneIdx = activeScript.scenes.findIndex((s: any) => s.id === sceneId);
  if (targetSceneIdx === -1) {
    throw new Error(`Không tìm thấy cảnh ${sceneId} trong kịch bản`);
  }

  // 1. Cập nhật Script của cảnh nếu có brollQuery / onScreenText / visualCues mới
  const targetScriptScene = {
    ...activeScript.scenes[targetSceneIdx],
    ...(overrides?.brollQuery ? { brollQuery: overrides.brollQuery } : {}),
    ...(overrides?.onScreenText ? { onScreenText: overrides.onScreenText } : {}),
    ...(overrides?.visualCues ? { visualCues: overrides.visualCues } : {}),
  };
  activeScript.scenes[targetSceneIdx] = targetScriptScene;

  // 2. Đạo diễn lại phong cách / bảng màu mới cho riêng cảnh này
  const singleScript = { ...activeScript, scenes: [targetScriptScene] };
  const dirRes = await runDirectorAgent(ctx, singleScript, strategy);
  const altConcepts = [
    'editorial_news',
    'bloomberg_data',
    'cyber_hud',
    'cinematic_broll',
    'minimal_bold',
    'paper_cutout',
  ];
  const altPalettes = [
    { primary: '#F59E0B', secondary: '#10B981', accent: '#FACC15', bg: '#070B14', text: '#F8FAFC' },
    { primary: '#DC2626', secondary: '#0F172A', accent: '#EA580C', bg: '#F8FAFC', text: '#0F172A' },
    { primary: '#06B6D4', secondary: '#8B5CF6', accent: '#38BDF8', bg: '#050816', text: '#F8FAFC' },
    { primary: '#EC4899', secondary: '#6366F1', accent: '#FDE047', bg: '#11091D', text: '#FDF2F8' },
  ];

  const prevSbScene = storyboard.scenes.find((s: any) => s.id === sceneId) || storyboard.scenes[0];
  let newSbScene = dirRes.output.scenes[0]!;
  if (overrides?.visualConcept) {
    newSbScene = { ...newSbScene, visualConcept: overrides.visualConcept };
  } else if (newSbScene.visualConcept === prevSbScene?.visualConcept) {
    const nextIdx = (altConcepts.indexOf(prevSbScene.visualConcept) + 1) % altConcepts.length;
    newSbScene = {
      ...newSbScene,
      visualConcept: altConcepts[nextIdx]!,
      palette: overrides?.palette || altPalettes[nextIdx % altPalettes.length]!,
    };
  }
  if (overrides?.palette) {
    newSbScene = { ...newSbScene, palette: overrides.palette };
  }

  storyboard.scenes = storyboard.scenes.map((s: any) => (s.id === sceneId ? newSbScene : s));

  // 3. Tải lại B-Roll riêng cho cảnh này (xóa ảnh cũ của cảnh để buộc tải mới nếu đổi brollQuery)
  const oldImgPath = path.join(projectDir, 'assets', `broll_${sceneId}.jpg`);
  if (overrides?.brollQuery && fs.existsSync(oldImgPath)) {
    try {
      fs.unlinkSync(oldImgPath);
    } catch {
      // ignore
    }
  }
  const singleSb = { ...storyboard, scenes: [newSbScene] };
  const singleAssetRes = await runAssetAgent(ctx, singleSb, targetScriptScene.durationSec, singleScript);
  if (assetsOut && singleAssetRes.output.images[0]) {
    const updatedImg = singleAssetRes.output.images[0];
    const existIdx = assetsOut.images.findIndex((x: any) => x.sceneId === sceneId);
    if (existIdx >= 0) assetsOut.images[existIdx] = updatedImg;
    else assetsOut.images.push(updatedImg);
  }

  // 4. Sinh lại HTML/CSS & Chụp lại Snapshot & Render 30fps + Mux 1:1 riêng cho sceneId
  const singleBuildRes = await runSceneBuilderAgent(
    ctx,
    singleScript,
    singleSb,
    voiceOut,
    captionsOut || {
      words: voiceOut.wordTimings || [],
      srtPath: path.join(projectDir, 'captions', 'captions.srt'),
      methodUsed: 'ffprobe_character_estimate',
      style: {
        leadColor: ctx.leadCaptionColor,
        accentColor: ctx.accentCaptionColor,
        fontFamily: 'Be Vietnam Pro',
        fontSize9x16: 54,
        fontSize16x9: 42,
      },
    },
    assetsOut || singleAssetRes.output
  );
  const newSceneCode = singleBuildRes.output.scenes[0]!;
  sceneBuilderOut.scenes = sceneBuilderOut.scenes.map((s: any) =>
    s.id === sceneId || s.sceneId === sceneId ? newSceneCode : s
  );

  const singlePreviewRes = await runLintPreviewAgent(ctx, singleBuildRes.output, singleScript, singleSb);
  if (previewOut) {
    previewOut.snapshots = [
      ...previewOut.snapshots.filter((sn: any) => sn.sceneId !== sceneId),
      ...singlePreviewRes.output.snapshots,
    ];
  }

  const singleRenderRes = await runRendererAgent(
    ctx,
    singleBuildRes.output,
    singleScript,
    singleSb,
    voiceOut,
    assetsOut || singleAssetRes.output
  );
  rendererOut.clips = [
    ...rendererOut.clips.filter((c: any) => c.sceneId !== sceneId),
    ...singleRenderRes.output.clips,
  ];

  // 5. Ghép nhanh lại toàn bộ file final_16x9.mp4 & final_9x16.mp4
  const asmRes = await runAssemblerAgent(ctx, rendererOut, voiceOut, assetsOut || singleAssetRes.output);

  // Cập nhật các step_runs trong SQLite
  const updateStepOut = db.prepare(
    'UPDATE step_runs SET outputJson = ?, finishedAt = ? WHERE runId = ? AND stepIndex = ?'
  );
  const nowIso = new Date().toISOString();
  updateStepOut.run(JSON.stringify(activeScript), nowIso, runId, 6);
  if (factCheckFrom7) {
    updateStepOut.run(JSON.stringify({ ...factCheckFrom7, fixedScript: activeScript }), nowIso, runId, 7);
  }
  updateStepOut.run(JSON.stringify(storyboard), nowIso, runId, 8);
  if (assetsOut) updateStepOut.run(JSON.stringify(assetsOut), nowIso, runId, 9);
  updateStepOut.run(JSON.stringify(sceneBuilderOut), nowIso, runId, 12);
  if (previewOut) updateStepOut.run(JSON.stringify(previewOut), nowIso, runId, 13);
  updateStepOut.run(JSON.stringify(rendererOut), nowIso, runId, 14);
  updateStepOut.run(JSON.stringify(asmRes.output), nowIso, runId, 15);

  emitRunEvent(runId, { type: 'run.completed', runId, rerolledSceneId: sceneId });

  return {
    ok: true,
    runId,
    sceneId,
    storyboardScene: newSbScene,
    snapshots: singlePreviewRes.output.snapshots,
    assemblerOutput: asmRes.output,
  };
}
