'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Search,
  Sparkles,
  FileJson,
  Eye,
  Volume2,
  Shuffle,
  Check,
  Film,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface StepData {
  id: string;
  stepIndex: number;
  agent: string;
  displayName: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'warning' | 'failed' | 'skipped';
  input: any;
  output: any;
  modelUsed?: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  attempt: number;
  requiresApproval: boolean;
  approved?: boolean;
}

interface LogItem {
  id: number;
  stepIndex: number;
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  meta?: any;
}

export function PipelineLiveView() {
  const { activeRunId, selectedStepIndex, setSelectedStepIndex } = useAppStore();
  const [runData, setRunData] = useState<any>(null);
  const [projectData, setProjectData] = useState<any>(null);
  const [steps, setSteps] = useState<StepData[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewAspect, setPreviewAspect] = useState<'16:9' | '9:16'>('9:16');
  const [editedOutputJson, setEditedOutputJson] = useState<string>('');
  const [isEditingOutput, setIsEditingOutput] = useState(false);
  const [stepProgress, setStepProgress] = useState<Record<number, number>>({});
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const lastEventIdRef = useRef<number>(0);

  const fetchRunDetails = async (runId: string) => {
    try {
      const [runRes, logsRes] = await Promise.all([
        fetch(`/api/runs/${runId}`),
        fetch(`/api/runs/${runId}/logs`),
      ]);
      if (runRes.ok) {
        const d = await runRes.json();
        setRunData(d.run);
        setProjectData(d.project);
        setSteps(d.steps || []);
        setAssets(d.assets || []);
      }
      if (logsRes.ok) {
        const l = await logsRes.json();
        setLogs(l.logs || []);
      }
    } catch {
      // ignore transient error
    }
  };

  useEffect(() => {
    if (!activeRunId) return;
    fetchRunDetails(activeRunId);

    // Kết nối SSE realtime kèm tự động truyền Last-Event-ID khi kết nối lại (Mục 11.2)
    let es: EventSource | null = null;
    let reconnectTimer: any = null;

    const connectSse = () => {
      const url = `/api/runs/${activeRunId}/events?lastEventId=${lastEventIdRef.current}`;
      es = new EventSource(url);

      es.onmessage = (ev) => {
        if (ev.lastEventId) {
          lastEventIdRef.current = Number(ev.lastEventId);
        }
        try {
          const payload = JSON.parse(ev.data);
          if (payload.type === 'step.started') {
            setSelectedStepIndex(payload.step);
            fetchRunDetails(activeRunId);
          } else if (payload.type === 'step.log') {
            setLogs((prev) => [
              ...prev,
              {
                id: Date.now() + Math.random(),
                stepIndex: payload.step,
                ts: payload.ts || new Date().toISOString(),
                level: payload.level || 'info',
                message: payload.message,
                meta: payload.meta,
              },
            ]);
          } else if (payload.type === 'step.progress') {
            setStepProgress((prev) => ({ ...prev, [payload.step]: payload.percent }));
          } else if (
            payload.type === 'step.completed' ||
            payload.type === 'step.warning' ||
            payload.type === 'step.failed' ||
            payload.type === 'approval.needed' ||
            payload.type === 'asset.created' ||
            payload.type === 'run.completed' ||
            payload.type === 'run.paused' ||
            payload.type === 'run.canceled'
          ) {
            fetchRunDetails(activeRunId);
          }
        } catch {
          // ignore parse error
        }
      };

      es.onerror = () => {
        es?.close();
        reconnectTimer = setTimeout(connectSse, 2000);
      };
    };

    connectSse();
    return () => {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [activeRunId]);

  // Tự cuộn khung log xuống cuối khi có log mới
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, selectedStepIndex]);

  const activeStep = steps.find((s) => s.stepIndex === selectedStepIndex) || steps[0];

  useEffect(() => {
    if (activeStep) {
      setEditedOutputJson(JSON.stringify(activeStep.output || {}, null, 2));
      setIsEditingOutput(false);
    }
  }, [activeStep?.stepIndex, activeStep?.status]);

  if (!activeRunId || !runData) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-12 text-center backdrop-blur-xl">
        <Film className="mx-auto mb-4 h-12 w-12 text-purple-400" />
        <h3 className="text-xl font-bold">Chưa chọn phiên chạy Pipeline</h3>
        <p className="mt-2 text-sm text-slate-400">
          Hãy chọn một dự án từ Dashboard hoặc bấm &ldquo;Tạo video&rdquo; để bắt đầu theo dõi trực tiếp 17 AI Agent.
        </p>
      </div>
    );
  }

  const completedCount = steps.filter((s) => s.status === 'done' || s.status === 'warning' || s.status === 'skipped').length;
  const progressPercent = Math.round((completedCount / 17) * 100);
  const elapsedSec = runData.startedAt
    ? Math.max(
        1,
        Math.round(
          ((runData.finishedAt ? new Date(runData.finishedAt).getTime() : Date.now()) -
            new Date(runData.startedAt).getTime()) /
            1000
        )
      )
    : 0;
  const remainingEstSec = Math.max(0, (17 - completedCount) * 3);

  const filteredLogs = logs.filter((l) => {
    if (l.stepIndex !== selectedStepIndex) return false;
    if (levelFilter !== 'all' && l.level !== levelFilter) return false;
    if (searchQuery && !l.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleControl = async (action: 'pause' | 'resume' | 'cancel') => {
    await fetch(`/api/runs/${activeRunId}/${action}`, { method: 'POST' });
    fetchRunDetails(activeRunId);
  };

  const handleRetryFromStep = async (stepIdx: number, reseedVoiceCast = false) => {
    await fetch(`/api/runs/${activeRunId}/steps/${stepIdx}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reseedVoiceCast }),
    });
    fetchRunDetails(activeRunId);
  };

  const handleApproveStep = async (stepIdx: number) => {
    let customOutput = undefined;
    try {
      customOutput = JSON.parse(editedOutputJson);
    } catch {
      alert('JSON đầu ra không hợp lệ! Vui lòng kiểm tra cú pháp JSON trước khi duyệt.');
      return;
    }
    await fetch(`/api/runs/${activeRunId}/steps/${stepIdx}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ output: customOutput }),
    });
    fetchRunDetails(activeRunId);
  };

  const finalVideos = assets.filter((a) => a.kind === 'final_video');
  const snapshots = assets.filter((a) => a.kind === 'image' && a.meta?.snapshot);
  const activeVideoAsset =
    finalVideos.find((v) => v.meta?.aspect === previewAspect) || finalVideos[0];

  return (
    <div className="space-y-6">
      {/* Thanh trên: Tiến độ tổng (%), thời gian đã chạy, ước lượng còn lại, tổng chi phí, nút Dừng / Tạm dừng / Tiếp tục (Mục 9.2) */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/75 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-purple-300 border border-purple-500/30">
                Run #{activeRunId.slice(0, 10)}
              </span>
              <h2 className="text-lg font-extrabold text-white">
                {projectData?.title || 'Pipeline Live View'}
              </h2>
              <span
                className={`rounded-full px-3 py-0.5 text-xs font-bold uppercase ${
                  runData.status === 'running'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : runData.status === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : runData.status === 'paused'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                {runData.status}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-6 text-xs text-slate-300">
              <span>
                Tiến độ: <strong className="text-white">{progressPercent}%</strong> ({completedCount}/17 bước)
              </span>
              <span>
                Đã chạy: <strong className="text-white">{elapsedSec}s</strong>
              </span>
              <span>
                Ước tính còn lại: <strong className="text-white">~{remainingEstSec}s</strong>
              </span>
              <span>
                Tokens: <strong className="text-cyan-300">{runData.tokensIn} in / {runData.tokensOut} out</strong>
              </span>
              <span>
                Tổng chi phí: <strong className="text-pink-400">${Number(runData.costUsd || 0).toFixed(4)}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {runData.status === 'running' && (
              <button
                onClick={() => handleControl('pause')}
                className="flex items-center gap-1.5 rounded-2xl border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/25 transition"
              >
                <Pause className="h-4 w-4" /> Tạm dừng
              </button>
            )}
            {runData.status === 'paused' && (
              <button
                onClick={() => handleControl('resume')}
                className="flex items-center gap-1.5 rounded-2xl border border-emerald-500/40 bg-emerald-500/20 px-4 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30 transition"
              >
                <Play className="h-4 w-4" /> Tiếp tục
              </button>
            )}
            {(runData.status === 'running' || runData.status === 'paused') && (
              <button
                onClick={() => handleControl('cancel')}
                className="flex items-center gap-1.5 rounded-2xl border border-rose-500/40 bg-rose-500/15 px-4 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/25 transition"
              >
                <Square className="h-4 w-4" /> Dừng hẳn
              </button>
            )}
          </div>
        </div>

        {/* Thanh progress bar gradient tím - xanh - hồng */}
        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
          <motion.div
            className="h-full bg-gradient-to-r from-purple-500 via-cyan-400 to-pink-500"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>

      {/* Bố cục 2 cột chính: Cột trái Timeline dọc 17 bước | Cột phải Chi tiết, Hộp duyệt, Preview & Log (Mục 9.2) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* CỘT TRÁI: TIMELINE DỌC 17 BƯỚC */}
        <div className="lg:col-span-5 space-y-2.5 max-h-[820px] overflow-y-auto pr-1">
          {steps.map((step) => {
            const isSelected = step.stepIndex === selectedStepIndex;
            const isRunning = step.status === 'running';
            const isWaitingApproval =
              step.requiresApproval && !step.approved && (step.status === 'done' || step.status === 'warning') && runData.status === 'paused' && runData.currentStep === step.stepIndex;

            const stepDurationSec =
              step.startedAt && step.finishedAt
                ? ((new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime()) / 1000).toFixed(1) + 's'
                : isRunning
                ? 'Đang chạy...'
                : '';

            return (
              <motion.div
                key={step.id}
                onClick={() => setSelectedStepIndex(step.stepIndex)}
                animate={
                  isRunning
                    ? {
                        boxShadow: [
                          '0 0 0px rgba(139,92,246,0.2)',
                          '0 0 22px rgba(6,182,212,0.55)',
                          '0 0 0px rgba(236,72,153,0.2)',
                        ],
                        scale: [1, 1.01, 1],
                      }
                    : {}
                }
                transition={isRunning ? { duration: 2, repeat: Infinity } : {}}
                className={`cursor-pointer rounded-2xl border p-3.5 transition-all ${
                  isRunning
                    ? 'border-cyan-400/80 bg-gradient-to-r from-purple-900/50 via-slate-900/90 to-pink-900/40'
                    : isWaitingApproval
                    ? 'border-amber-400/80 bg-amber-950/30'
                    : isSelected
                    ? 'border-purple-500/70 bg-slate-800/90'
                    : 'border-white/10 bg-slate-900/60 hover:border-white/25'
                } ${step.status === 'skipped' ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* Biểu tượng trạng thái chuẩn Mục 9.2 */}
                    {isRunning && (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-purple-500 via-cyan-400 to-pink-500 p-0.5"
                      >
                        <div className="h-full w-full rounded-full bg-slate-950 flex items-center justify-center">
                          <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                        </div>
                      </motion.div>
                    )}
                    {!isRunning && step.status === 'done' && (
                      <motion.div
                        initial={{ scale: 0.5 }}
                        animate={{ scale: 1 }}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </motion.div>
                    )}
                    {!isRunning && step.status === 'warning' && (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                    )}
                    {!isRunning && step.status === 'failed' && (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40">
                        <XCircle className="h-4 w-4" />
                      </div>
                    )}
                    {!isRunning && step.status === 'pending' && (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-slate-400 border border-white/10">
                        <Clock className="h-3.5 w-3.5" />
                      </div>
                    )}
                    {!isRunning && step.status === 'skipped' && (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800/50 text-slate-500">
                        —
                      </div>
                    )}

                    <div>
                      <div
                        className={`text-sm font-bold ${
                          step.status === 'skipped' ? 'line-through text-slate-500' : 'text-white'
                        }`}
                      >
                        {step.displayName}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        {step.modelUsed && (
                          <span className="rounded bg-white/5 px-1.5 py-0.5 text-cyan-300">
                            {step.modelUsed}
                          </span>
                        )}
                        {stepDurationSec && <span>⏱ {stepDurationSec}</span>}
                        {step.costUsd > 0 && <span>💲{step.costUsd.toFixed(4)}</span>}
                        {isWaitingApproval && (
                          <span className="rounded bg-amber-500/20 px-2 py-0.5 font-bold text-amber-300">
                            Chờ duyệt thủ công
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {step.status === 'failed' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRetryFromStep(step.stepIndex);
                      }}
                      className="rounded-xl bg-rose-500/20 px-2.5 py-1 text-xs font-bold text-rose-300 hover:bg-rose-500/30"
                    >
                      Thử lại
                    </button>
                  )}
                </div>

                {isRunning && stepProgress[step.stepIndex] !== undefined && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-cyan-400 transition-all"
                      style={{ width: `${stepProgress[step.stepIndex]}%` }}
                    />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* CỘT PHẢI: HỘP DUYỆT, VOICE CAST INFO, KHUNG XEM TRƯỚC, LOG REALTIME & JSON INSPECTOR */}
        <div className="lg:col-span-7 space-y-6">
          {/* Hộp duyệt thủ công (Mục 9.2: ở bước có requiresApproval, hiện kịch bản/storyboard để sửa và bấm "Duyệt & tiếp tục") */}
          {activeStep &&
            activeStep.requiresApproval &&
            !activeStep.approved &&
            runData.status === 'paused' &&
            runData.currentStep === activeStep.stepIndex && (
              <div className="rounded-3xl border-2 border-amber-400/70 bg-gradient-to-br from-amber-950/40 via-slate-900/90 to-purple-950/40 p-6 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-300 border border-amber-400/40">
                      Cần phê duyệt thủ công — Bước {activeStep.stepIndex} ({activeStep.agent})
                    </span>
                    <h3 className="mt-2 text-lg font-extrabold text-white">
                      Kiểm tra & Chỉnh sửa đầu ra trước khi chạy tiếp
                    </h3>
                    <p className="text-xs text-slate-300">
                      Bạn có thể chỉnh sửa trực tiếp JSON kịch bản / Storyboard / Bản nháp đăng bài bên dưới rồi bấm &ldquo;Duyệt & Tiếp tục&rdquo;.
                    </p>
                  </div>
                  <button
                    onClick={() => handleApproveStep(activeStep.stepIndex)}
                    className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-3 text-sm font-extrabold text-slate-950 shadow-lg hover:opacity-95 transition"
                  >
                    <Check className="h-4 w-4" /> Duyệt & Tiếp tục
                  </button>
                </div>

                <textarea
                  value={editedOutputJson}
                  onChange={(e) => setEditedOutputJson(e.target.value)}
                  rows={10}
                  className="mt-4 w-full rounded-2xl border border-white/15 bg-slate-950/90 p-4 font-mono text-xs text-emerald-300 focus:border-cyan-400 focus:outline-none"
                />
              </div>
            )}

          {/* Hiển thị thông tin cặp giọng ở Bước 10 (Mục 8.3.1: hiển thị rõ cặp giọng đã chọn, lý do, nút nghe thử và nút Đổi cặp khác) */}
          {activeStep?.stepIndex === 10 && activeStep.output?.castUsed && (
            <div className="rounded-3xl border border-cyan-500/30 bg-slate-900/80 p-5 backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-400">
                    <Volume2 className="h-4 w-4" /> Voice Cast Đã Chọn (Bước 10)
                  </div>
                  <p className="mt-1 text-sm font-bold text-white">
                    {activeStep.output.castUsed.reason}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <span className="rounded-xl bg-sky-500/20 px-3 py-1 text-sky-300 border border-sky-500/30">
                      Lead (Dẫn chính): <strong>{activeStep.output.castUsed.leadVoiceName}</strong>
                    </span>
                    <span className="rounded-xl bg-pink-500/20 px-3 py-1 text-pink-300 border border-pink-500/30">
                      Accent (Điểm nhấn): <strong>{activeStep.output.castUsed.accentVoiceName}</strong>
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleRetryFromStep(10, true)}
                  className="flex items-center gap-1.5 rounded-2xl border border-purple-500/40 bg-purple-500/20 px-4 py-2 text-xs font-bold text-purple-200 hover:bg-purple-500/30 transition"
                >
                  <Shuffle className="h-4 w-4" /> Đổi cặp khác
                </button>
              </div>
            </div>
          )}

          {/* Khung xem trước Video / Snapshot (Mục 9.2: khi có snapshot bước 13 hoặc clip bước 14, 15 thì hiển thị ngay, có chuyển đổi 16:9 / 9:16) */}
          {(finalVideos.length > 0 || snapshots.length > 0) && (
            <div className="rounded-3xl border border-white/10 bg-slate-900/75 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-pink-400" />
                  <h3 className="text-sm font-bold text-white">
                    Khung xem trước trực tiếp ({previewAspect})
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewAspect('16:9')}
                    className={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                      previewAspect === '16:9'
                        ? 'bg-gradient-to-r from-purple-600 to-cyan-500 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    16:9 Ngang (1920×1080)
                  </button>
                  <button
                    onClick={() => setPreviewAspect('9:16')}
                    className={`rounded-xl px-3 py-1 text-xs font-bold transition ${
                      previewAspect === '9:16'
                        ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    9:16 Dọc (1080×1920)
                  </button>
                </div>
              </div>

              {activeVideoAsset ? (
                <div className="flex flex-col items-center">
                  <video
                    key={activeVideoAsset.id}
                    controls
                    className={`rounded-2xl border border-white/15 bg-black shadow-2xl ${
                      previewAspect === '9:16' ? 'max-h-[420px] aspect-[9/16]' : 'w-full aspect-video'
                    }`}
                    src={`/api/assets/${activeVideoAsset.id}`}
                  />
                  <div className="mt-3 flex items-center gap-4 text-xs text-slate-300">
                    <span>
                      Độ phân giải: <strong>{activeVideoAsset.width}×{activeVideoAsset.height}</strong>
                    </span>
                    <span>
                      Thời lượng: <strong>{activeVideoAsset.durationSec}s</strong>
                    </span>
                    <a
                      href={`/api/assets/${activeVideoAsset.id}`}
                      download={`final_${previewAspect.replace(':', 'x')}.mp4`}
                      className="rounded-xl bg-white/10 px-3 py-1 font-bold text-cyan-300 hover:bg-white/20"
                    >
                      ⬇ Tải xuống MP4
                    </a>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {snapshots
                    .filter((s) => !s.meta?.aspect || s.meta.aspect === previewAspect)
                    .map((snap) => (
                      <div key={snap.id} className="overflow-hidden rounded-xl border border-white/10 bg-slate-950">
                        <img
                          src={`/api/assets/${snap.id}`}
                          alt={snap.meta?.sceneId || 'Snapshot'}
                          className="h-32 w-full object-cover"
                        />
                        <div className="p-2 text-[11px] text-slate-400">
                          Cảnh: <strong className="text-white">{snap.meta?.sceneId}</strong> ({snap.meta?.aspect})
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Khung Log chi tiết của bước đang chọn (Mục 9.2: tự cuộn, lọc theo mức info/warn/error, tìm kiếm, hiển thị token & chi phí) */}
          <div className="rounded-3xl border border-white/10 bg-slate-900/75 p-5 backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/10">
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  Log chi tiết — {activeStep?.displayName}
                </h3>
                <p className="text-xs text-slate-400">
                  Tokens bước này: <strong className="text-cyan-300">{activeStep?.tokensIn || 0} in / {activeStep?.tokensOut || 0} out</strong> · Chi phí: <strong className="text-pink-400">${Number(activeStep?.costUsd || 0).toFixed(4)}</strong>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'info', 'warn', 'error'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setLevelFilter(lvl)}
                    className={`rounded-xl px-2.5 py-1 text-xs font-bold uppercase ${
                      levelFilter === lvl
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}

                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm trong log..."
                    className="rounded-xl border border-white/10 bg-slate-950 pl-8 pr-3 py-1 text-xs text-white focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div
              ref={logContainerRef}
              className="mt-3 h-56 overflow-y-auto rounded-2xl bg-slate-950/90 p-4 font-mono text-xs space-y-1.5 border border-white/5"
            >
              {filteredLogs.length === 0 ? (
                <div className="text-slate-500 italic">Chưa có bản ghi log nào khớp bộ lọc ở bước này.</div>
              ) : (
                filteredLogs.map((l) => (
                  <div key={l.id} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-slate-500 shrink-0">
                      [{new Date(l.ts).toLocaleTimeString('vi-VN')}]
                    </span>
                    <span
                      className={`shrink-0 font-bold uppercase ${
                        l.level === 'error'
                          ? 'text-rose-400'
                          : l.level === 'warn'
                          ? 'text-amber-400'
                          : 'text-cyan-400'
                      }`}
                    >
                      [{l.level}]
                    </span>
                    <span className="text-slate-200 break-words">{l.message}</span>
                  </div>
                ))
              )}
            </div>

            {/* Hành động từng bước (Mục 9.2: xem đầu vào/đầu ra JSON, sửa đầu ra rồi chạy tiếp, chạy lại từ bước này) */}
            {activeStep && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                    <FileJson className="h-4 w-4 text-purple-400" />
                    Dữ liệu JSON Đầu vào / Đầu ra (Schema Validated)
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsEditingOutput(!isEditingOutput)}
                      className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/10"
                    >
                      {isEditingOutput ? 'Đóng trình sửa JSON' : '✏️ Sửa đầu ra & Chạy tiếp'}
                    </button>
                    <button
                      onClick={() => handleRetryFromStep(activeStep.stepIndex)}
                      className="flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/25"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Chạy lại từ bước {activeStep.stepIndex}
                    </button>
                  </div>
                </div>

                {isEditingOutput ? (
                  <div className="space-y-2">
                    <textarea
                      value={editedOutputJson}
                      onChange={(e) => setEditedOutputJson(e.target.value)}
                      rows={8}
                      className="w-full rounded-2xl border border-purple-500/40 bg-slate-950 p-3 font-mono text-xs text-emerald-300"
                    />
                    <button
                      onClick={() => handleApproveStep(activeStep.stepIndex)}
                      className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 text-xs font-bold text-white"
                    >
                      Lưu đầu ra mới & Chạy tiếp từ bước {activeStep.stepIndex + 1}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-1 text-[11px] font-bold uppercase text-slate-400">Input JSON</div>
                      <pre className="max-h-40 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] text-slate-300 border border-white/5">
                        {JSON.stringify(activeStep.input || {}, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] font-bold uppercase text-slate-400">Output JSON</div>
                      <pre className="max-h-40 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] text-emerald-300 border border-white/5">
                        {JSON.stringify(activeStep.output || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
