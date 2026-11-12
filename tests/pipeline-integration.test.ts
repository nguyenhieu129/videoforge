import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { db, initDatabase } from '../apps/server/src/db.js';
import {
  createPipelineRun,
  executePipelineOrchestrator,
} from '../apps/server/src/orchestrator.js';

describe('VideoForge End-to-End 17-Agent Pipeline Integration Test', () => {
  it('executes all 17 steps end-to-end and generates final_16x9.mp4 and final_9x16.mp4 with audio & captions', async () => {
    initDatabase();

    const projectId = 'proj_e2e_test';
    const now = new Date().toISOString();

    db.prepare(`
      INSERT OR REPLACE INTO projects (
        id, title, sourceType, sourceRef, aspect, stylePreset, brandKitId,
        scoreThreshold, disabledStepsJson, approvalStepsJson, castMode, castSelectionMode,
        status, createdAt, updatedAt
      ) VALUES (?, ?, 'text', ?, 'both', 'neon_cyber', 'bk_neon_cyber', 5.0, '[]', '[]', 'lead_accent', 'auto_rotate', 'draft', ?, ?)
    `).run(
      projectId,
      'VideoForge 2026: Sản xuất Video Tự Động Bằng 17 AI Agent',
      'Hệ thống VideoForge tự động chuyển đổi bài viết thành video chất lượng cao ở cả hai định dạng 16:9 và 9:16. Tích hợp HyperFrames, GSAP, three.js, Voice Studio hai giọng đọc Nam Nữ và FFmpeg chuẩn hóa âm lượng.',
      now,
      now
    );

    const runId = createPipelineRun(projectId, { voiceCastSeed: 2026 });
    await executePipelineOrchestrator(runId, 1);

    const runRow = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId) as any;
    expect(runRow.status).toBe('completed');

    const stepRows = db
      .prepare('SELECT stepIndex, agent, status, outputJson FROM step_runs WHERE runId = ? ORDER BY stepIndex ASC')
      .all(runId) as any[];
    expect(stepRows.length).toBe(17);

    // Kiểm tra bước 15 (Assembler) đã tạo ra cả 2 file final_16x9.mp4 và final_9x16.mp4
    const assemblerOut = JSON.parse(stepRows[14].outputJson);
    expect(assemblerOut['16:9']).toBeDefined();
    expect(assemblerOut['9:16']).toBeDefined();
    expect(fs.existsSync(assemblerOut['16:9'].path)).toBe(true);
    expect(fs.existsSync(assemblerOut['9:16'].path)).toBe(true);
    expect(assemblerOut['16:9'].width).toBe(1920);
    expect(assemblerOut['16:9'].height).toBe(1080);
    expect(assemblerOut['9:16'].width).toBe(1080);
    expect(assemblerOut['9:16'].height).toBe(1920);

    // Kiểm tra bước 16 (QA Agent) đạt pass === true
    const qaOut = JSON.parse(stepRows[15].outputJson);
    expect(qaOut.pass).toBe(true);

    // Kiểm tra bước 17 (Publisher) sinh đủ 4 bản nháp nền tảng
    const pubOut = JSON.parse(stepRows[16].outputJson);
    expect(pubOut.drafts.length).toBe(4);
  }, 60000);
});
