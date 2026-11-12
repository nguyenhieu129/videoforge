#!/usr/bin/env tsx
/**
 * VideoForge Environment Doctor (Phase 0 DoD)
 * Kiểm tra môi trường: Node >= 22, FFmpeg, ffprobe, Python 3, thư mục data, cấu hình .env
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
}

const results: CheckResult[] = [];

function checkCommand(name: string, cmd: string, required = true, validator?: (out: string) => boolean) {
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n')[0];
    const ok = validator ? validator(out) : true;
    results.push({ name, ok, detail: out, required });
  } catch (err: any) {
    results.push({ name, ok: false, detail: err?.message?.split('\n')[0] || 'Not found', required });
  }
}

// 1. Check Node.js >= 22
checkCommand('Node.js (>= 22)', 'node -v', true, (out) => {
  const major = parseInt(out.replace(/^v/, '').split('.')[0], 10);
  return major >= 22;
});

// 2. Check pnpm
checkCommand('pnpm', 'pnpm -v', true);

// 3. Check FFmpeg
checkCommand('FFmpeg', 'ffmpeg -version', true);

// 4. Check ffprobe
checkCommand('ffprobe', 'ffprobe -version', true);

// 5. Check Python 3 (for Manim worker)
checkCommand('Python 3 (Manim Worker)', 'python3 --version', false);

// 6. Check Redis (Optional because SQLite + In-memory/SQLite Queue fallback is supported)
checkCommand('Redis (Optional - Queue Fallback Ready)', 'redis-cli ping', false);

// 7. Check Data Directory
const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR || './data');
try {
  fs.mkdirSync(path.join(dataDir, 'projects'), { recursive: true });
  results.push({ name: 'Data Directory', ok: true, detail: dataDir, required: true });
} catch (err: any) {
  results.push({ name: 'Data Directory', ok: false, detail: err.message, required: true });
}

console.log('\n======================================================');
console.log('   VideoForge — Kiểm tra môi trường (pnpm doctor)');
console.log('======================================================\n');

let hasFatal = false;
for (const r of results) {
  const badge = r.ok ? '✅ [OK]' : r.required ? '❌ [MISSING]' : '⚠️  [OPTIONAL]';
  console.log(`${badge.padEnd(15)} ${r.name.padEnd(36)} -> ${r.detail}`);
  if (!r.ok && r.required) hasFatal = true;
}

console.log('\n======================================================');
if (hasFatal) {
  console.error('❌ Môi trường còn thiếu thành phần bắt buộc!');
  process.exit(1);
} else {
  console.log('✅ Môi trường hoàn tất! Sẵn sàng khởi chạy VideoForge.');
  process.exit(0);
}
