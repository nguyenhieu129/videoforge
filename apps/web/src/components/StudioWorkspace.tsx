'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Save,
  RefreshCw,
  CheckCircle2,
  Pause,
  Play,
  Square,
  Download,
  FileText,
  Copy,
  Check,
  Sparkles,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

const EFFECT_OPTIONS = [
  { value: 'slam_impact', label: '💥 Slam (Đập chữ)' },
  { value: 'marker_highlight', label: '🖍️ Highlight (Dạ quang)' },
  { value: 'counter_stat', label: '🔢 Đếm số (Counter)' },
  { value: 'split_versus', label: '⚡ Đối lập (Split VS)' },
  { value: 'glitch_focus', label: '🚨 Cảnh báo (Glitch)' },
  { value: 'cinematic_minimal', label: '🎬 Điện ảnh (Minimal)' },
  { value: 'terminal_type', label: '⌨️ Gõ chữ (Terminal)' },
];

const SFX_OPTIONS = [
  { value: 'impact', label: 'Impact' },
  { value: 'whoosh', label: 'Whoosh' },
  { value: 'pop', label: 'Pop' },
  { value: 'riser', label: 'Riser' },
  { value: 'click', label: 'Click' },
  { value: 'none', label: 'Tắt' },
];

const CONCEPT_OPTIONS = [
  { value: 'cyber_hud', label: 'Cyber HUD (Công nghệ)' },
  { value: 'bloomberg_data', label: 'Bloomberg Data (Tài chính)' },
  { value: 'editorial_news', label: 'Editorial News (Báo chí nền sáng)' },
  { value: 'cinematic_broll', label: 'Cinematic B-Roll (Phóng sự)' },
  { value: 'minimal_bold', label: 'Minimal Bold (Tối giản mạnh)' },
  { value: 'paper_cutout', label: 'Paper Cutout (Thủ công hiện đại)' },
];

interface StudioWorkspaceProps {
  projects: any[];
  onRefreshProjects: () => void;
}

export function StudioWorkspace({ projects, onRefreshProjects }: StudioWorkspaceProps) {
  const {
    studioTab,
    setStudioTab,
    sidebarCollapsed,
    toggleSidebar,
    setCreateModalOpen,
    selectedProjectId,
    activeRunId,
    selectedStepIndex,
    setSelectedStepIndex,
    selectProjectAndRun,
  } = useAppStore();

  const [projectSearch, setProjectSearch] = useState('');
  const [runData, setRunData] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [previewAspect, setPreviewAspect] = useState<'9:16' | '16:9'>('9:16');

  // State sửa kịch bản (Tab 1)
  const [editableScenes, setEditableScenes] = useState<any[]>([]);
  const [savingScript, setSavingScript] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // State Reroll cảnh lẻ (Tab 2)
  const [rerollingSceneId, setRerollingSceneId] = useState<string | null>(null);
  const [conceptOverrides, setConceptOverrides] = useState<Record<string, string>>({});
  const [brollOverrides, setBrollOverrides] = useState<Record<string, string>>({});

  // State Copy Xuất bản (Tab 4)
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const logBoxRef = useRef<HTMLDivElement | null>(null);
  const lastEventIdRef = useRef<number>(0);

  const flashToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3200);
  };

  // Tự động chọn dự án đầu tiên nếu chưa chọn
  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      const first = projects[0];
      selectProjectAndRun(first.id, first.latestRun?.id || null);
    }
  }, [projects, selectedProjectId]);

  const fetchRunAll = async (runId: string) => {
    try {
      const [rRes, lRes] = await Promise.all([
        fetch(`/api/runs/${runId}`),
        fetch(`/api/runs/${runId}/logs`),
      ]);
      if (rRes.ok) {
        const d = await rRes.json();
        setRunData(d.run);
        setSteps(d.steps || []);
        setAssets(d.assets || []);

        const step7 = (d.steps || []).find((s: any) => s.stepIndex === 7);
        const step6 = (d.steps || []).find((s: any) => s.stepIndex === 6);
        const scriptObj = step7?.output?.fixedScript?.scenes
          ? step7.output.fixedScript
          : step6?.output;
        if (Array.isArray(scriptObj?.scenes)) {
          setEditableScenes(scriptObj.scenes);
        }
      }
      if (lRes.ok) {
        setLogs((await lRes.json()).logs || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!activeRunId) {
      setRunData(null);
      setSteps([]);
      setAssets([]);
      setLogs([]);
      return;
    }
    lastEventIdRef.current = 0;
    fetchRunAll(activeRunId);

    let es: EventSource | null = null;
    let timer: any = null;

    const connect = () => {
      es = new EventSource(`/api/runs/${activeRunId}/events?lastEventId=${lastEventIdRef.current}`);
      es.onmessage = (ev) => {
        if (ev.lastEventId) lastEventIdRef.current = Number(ev.lastEventId);
        try {
          const payload = JSON.parse(ev.data);
          if (payload.type === 'step.started') {
            setSelectedStepIndex(payload.step);
            fetchRunAll(activeRunId);
          } else if (payload.type === 'step.log') {
            setLogs((prev) => [
              ...prev.slice(-250),
              {
                id: Date.now() + Math.random(),
                stepIndex: payload.step,
                ts: payload.ts || new Date().toISOString(),
                level: payload.level || 'info',
                message: payload.message,
              },
            ]);
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
            fetchRunAll(activeRunId);
            if (payload.type === 'run.completed') onRefreshProjects();
          }
        } catch {
          // ignore
        }
      };
      es.onerror = () => {
        es?.close();
        timer = setTimeout(connect, 2500);
      };
    };

    connect();
    return () => {
      es?.close();
      if (timer) clearTimeout(timer);
    };
  }, [activeRunId]);

  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [logs, studioTab]);

  const filteredProjects = projects.filter((p) =>
    p.title?.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // Tìm bước đang chờ duyệt (nếu run đang paused)
  const pendingApprovalStep =
    runData?.status === 'paused'
      ? steps.find((s) => s.requiresApproval && !s.approved && (s.status === 'done' || s.status === 'warning'))
      : null;

  // Storyboard, Snapshots, Drafts, Final Videos, SRT
  const step8 = steps.find((s) => s.stepIndex === 8);
  const storyboardScenes: any[] = step8?.output?.scenes || [];
  const step9 = steps.find((s) => s.stepIndex === 9);
  const brollImages: any[] = step9?.output?.images || [];
  const step15 = steps.find((s) => s.stepIndex === 15);
  const assemblerOut = step15?.output || {};
  const step17 = steps.find((s) => s.stepIndex === 17);
  const publishDrafts: any[] = step17?.output?.drafts || [];

  const finalVideos = assets.filter((a) => a.kind === 'final_video');
  const activeVideoAsset =
    finalVideos.filter((v) => v.meta?.aspect === previewAspect).slice(-1)[0] ||
    finalVideos.slice(-1)[0];
  const activeThumbAsset =
    assets.filter((a) => a.kind === 'thumbnail' && a.meta?.aspect === previewAspect).slice(-1)[0] ||
    assets.filter((a) => a.kind === 'thumbnail').slice(-1)[0];
  const srtAsset = assets.filter((a) => a.kind === 'subtitle').slice(-1)[0];
  const activeVideoMeta = assemblerOut[previewAspect] || assemblerOut['9:16'] || assemblerOut['16:9'];

  const handleSaveScript = async (rerender = false) => {
    if (!selectedProjectId) return;
    setSavingScript(true);
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/script`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes: editableScenes, rerender }),
      });
      if (res.ok) {
        flashToast(
          rerender
            ? 'Đã lưu kịch bản & bắt đầu kết xuất lại video!'
            : 'Đã lưu kịch bản & các từ khóa điểm nhấn!'
        );
        if (rerender) setStudioTab('pipeline');
        if (activeRunId) fetchRunAll(activeRunId);
      }
    } finally {
      setSavingScript(false);
    }
  };

  const handleRerollScene = async (sceneId: string) => {
    if (!selectedProjectId) return;
    setRerollingSceneId(sceneId);
    try {
      const scInScript = editableScenes.find((s) => s.id === sceneId);
      const res = await fetch(`/api/projects/${selectedProjectId}/scenes/${sceneId}/reroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visualConcept: conceptOverrides[sceneId] || undefined,
          brollQuery: brollOverrides[sceneId] || scInScript?.brollQuery || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        flashToast(`Đã đổi thiết kế & ghép lại video mới cho ${sceneId}!`);
        if (activeRunId) await fetchRunAll(activeRunId);
        onRefreshProjects();
      } else {
        flashToast(`Lỗi: ${data.error || 'Không thể reroll cảnh'}`);
      }
    } finally {
      setRerollingSceneId(null);
    }
  };

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string, title: string) => {
    e.stopPropagation();
    if (!window.confirm(`Xóa dự án "${title}" cùng toàn bộ video đã render?`)) return;
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
    if (res.ok) {
      const remaining = projects.filter((p) => p.id !== projectId);
      if (selectedProjectId === projectId) {
        const next = remaining[0];
        selectProjectAndRun(next?.id || null, next?.latestRun?.id || null);
      }
      flashToast('Đã xóa dự án!');
      onRefreshProjects();
    }
  };

  const handleApproveStep = async (stepIndex: number) => {
    if (!activeRunId) return;
    await fetch(`/api/runs/${activeRunId}/steps/${stepIndex}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    fetchRunAll(activeRunId);
  };

  const handleRunControl = async (action: 'pause' | 'resume' | 'cancel') => {
    if (!activeRunId) return;
    await fetch(`/api/runs/${activeRunId}/${action}`, { method: 'POST' });
    fetchRunAll(activeRunId);
  };

  const handleRetryFromStep = async (stepIdx: number) => {
    if (!activeRunId) return;
    await fetch(`/api/runs/${activeRunId}/steps/${stepIdx}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    fetchRunAll(activeRunId);
  };

  const copyText = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div className="h-[calc(100vh-52px)] w-full flex overflow-hidden bg-slate-950">
      {/* =====================================================================
          CỘT TRÁI (250px thu gọn còn 56px): DANH SÁCH DỰ ÁN
         ===================================================================== */}
      <aside
        className={`${
          sidebarCollapsed ? 'w-[56px]' : 'w-[250px]'
        } shrink-0 border-r border-white/10 bg-slate-950/90 flex flex-col overflow-hidden transition-all duration-200`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-2.5 py-2.5 shrink-0">
          {!sidebarCollapsed && (
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 pl-1">
              Dự án ({projects.length})
            </span>
          )}
          <button
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Mở rộng danh sách' : 'Thu gọn cột trái'}
            className="mx-auto rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {!sidebarCollapsed && (
          <div className="p-2.5 space-y-2 shrink-0 border-b border-white/5">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Tìm nhanh dự án..."
                className="w-full rounded-xl border border-white/10 bg-slate-900 pl-8 pr-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-purple-500 focus:outline-none"
              />
            </div>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 py-2 text-xs font-extrabold text-white shadow hover:opacity-95"
            >
              <Plus className="h-3.5 w-3.5" /> Tạo Video Mới
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
          {filteredProjects.map((p, idx) => {
            const isSelected = p.id === selectedProjectId;
            const st = p.latestRun?.status || p.status;
            const dotColor =
              st === 'completed' || st === 'published'
                ? 'bg-emerald-400'
                : st === 'running'
                  ? 'bg-cyan-400 animate-pulse'
                  : st === 'paused'
                    ? 'bg-amber-400'
                    : 'bg-slate-500';

            if (sidebarCollapsed) {
              return (
                <button
                  key={p.id}
                  onClick={() => selectProjectAndRun(p.id, p.latestRun?.id || null)}
                  title={p.title}
                  className={`w-full flex flex-col items-center justify-center rounded-xl py-2.5 text-[11px] font-extrabold border ${
                    isSelected
                      ? 'border-purple-500 bg-purple-500/20 text-white'
                      : 'border-transparent text-slate-400 hover:bg-white/5'
                  }`}
                >
                  <span>#{idx + 1}</span>
                  <span className={`mt-1 h-1.5 w-1.5 rounded-full ${dotColor}`} />
                </button>
              );
            }

            return (
              <div
                key={p.id}
                onClick={() => selectProjectAndRun(p.id, p.latestRun?.id || null)}
                role="button"
                tabIndex={0}
                className={`group w-full text-left rounded-xl p-2.5 border transition cursor-pointer ${
                  isSelected
                    ? 'border-purple-500/60 bg-purple-500/15 text-white'
                    : 'border-white/5 bg-slate-900/50 text-slate-300 hover:bg-slate-900 hover:border-white/15'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400">
                    <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                    {st}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300">
                      {p.aspect === 'both' ? '9:16+16:9' : p.aspect}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteProject(e, p.id, p.title)}
                      title="Xóa dự án"
                      className="opacity-60 group-hover:opacity-100 rounded p-0.5 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="text-xs font-bold line-clamp-2 leading-snug">{p.title}</div>
              </div>
            );
          })}

          {filteredProjects.length === 0 && !sidebarCollapsed && (
            <div className="p-4 text-center text-xs text-slate-500">
              Chưa có dự án nào. Bấm &ldquo;+ Tạo Video Mới&rdquo; để bắt đầu.
            </div>
          )}
        </div>
      </aside>

      {/* =====================================================================
          CỘT GIỮA (flex-1): 4 TAB NGANG GỌN TRONG 1 MÀN HÌNH
         ===================================================================== */}
      <section className="flex-1 min-w-0 flex flex-col overflow-hidden bg-slate-950">
        {/* Thanh 4 Tab trên đầu */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-slate-900/60 px-4 py-2 shrink-0">
          <div className="flex items-center gap-1">
            {[
              { id: 'script' as const, label: '📝 Kịch bản & Điểm nhấn' },
              { id: 'storyboard' as const, label: '🎨 Bàn dựng Cảnh (Storyboard)' },
              { id: 'pipeline' as const, label: '⚡ Tiến trình (17 Bước)' },
              { id: 'publish' as const, label: '🚀 Xuất bản' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStudioTab(tab.id)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition ${
                  studioTab === tab.id
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {toastMsg && (
            <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-[11px] font-bold text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{toastMsg}</span>
            </div>
          )}
        </div>

        {/* NỘI DUNG TỪNG TAB (Cuộn nội bộ) */}
        {!selectedProject ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <Sparkles className="h-10 w-10 text-purple-400 mb-3" />
            <h3 className="text-base font-extrabold text-white">Bàn Dựng VideoForge 2.0</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md">
              Chọn một dự án ở cột trái hoặc tạo dự án mới để AI tự động biên kịch từ khóa điểm nhấn, lấy B-Roll và dựng video 30fps.
            </p>
            <button
              onClick={() => setCreateModalOpen(true)}
              className="mt-4 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-5 py-2.5 text-xs font-extrabold text-white"
            >
              + Tạo Video Mới Ngay
            </button>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Thanh cảnh báo Duyệt nhanh nếu đang dừng ở Bước 6 / 8 / 17 */}
            {pendingApprovalStep && (
              <div className="flex items-center justify-between gap-3 bg-amber-500/20 border-b border-amber-500/40 px-4 py-2 shrink-0">
                <span className="text-xs font-bold text-amber-200">
                  ⏸ Pipeline đang tạm dừng chờ bạn xem qua tại{' '}
                  <strong>{pendingApprovalStep.displayName}</strong>
                </span>
                <button
                  onClick={() => handleApproveStep(pendingApprovalStep.stepIndex)}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-1.5 text-xs font-extrabold text-slate-950 shadow hover:bg-emerald-400"
                >
                  ✅ Duyệt & Chạy tiếp
                </button>
              </div>
            )}

            {/* TAB 1: KỊCH BẢN & ĐIỂM NHẤN */}
            {studioTab === 'script' && (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5 shrink-0">
                  <div>
                    <h3 className="text-xs font-extrabold text-white">{selectedProject.title}</h3>
                    <p className="text-[11px] text-slate-400">
                      Chỉnh sửa lời thoại 2 vai & các Từ khóa Điểm nhấn (`visualCues`) kích hoạt hiệu ứng chữ + SFX
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSaveScript(false)}
                      disabled={savingScript || editableScenes.length === 0}
                      className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-40"
                    >
                      <Save className="h-3.5 w-3.5" /> Lưu kịch bản
                    </button>
                    <button
                      onClick={() => handleSaveScript(true)}
                      disabled={savingScript || editableScenes.length === 0}
                      className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-3.5 py-1.5 text-xs font-extrabold text-white shadow disabled:opacity-40"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Lưu & Dựng lại
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                  {editableScenes.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-8 text-center text-xs text-slate-400">
                      Đang chờ Biên kịch AI (Bước 6) sinh kịch bản phân cảnh...
                    </div>
                  ) : (
                    editableScenes.map((sc, sIdx) => (
                      <div
                        key={sc.id || sIdx}
                        className="rounded-2xl border border-white/10 bg-slate-900/75 p-3.5 space-y-3"
                      >
                        <div className="grid grid-cols-12 gap-2.5 items-center">
                          <div className="col-span-2">
                            <span className="rounded-lg bg-purple-500/20 px-2.5 py-1 text-[11px] font-extrabold text-purple-300">
                              Cảnh {sIdx + 1}
                            </span>
                          </div>
                          <div className="col-span-6">
                            <input
                              type="text"
                              value={sc.onScreenText || ''}
                              onChange={(e) => {
                                const next = [...editableScenes];
                                next[sIdx] = { ...sc, onScreenText: e.target.value };
                                setEditableScenes(next);
                              }}
                              placeholder="Tiêu đề ngắn trên màn hình..."
                              className="w-full rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-white"
                            />
                          </div>
                          <div className="col-span-4">
                            <input
                              type="text"
                              value={sc.brollQuery || ''}
                              onChange={(e) => {
                                const next = [...editableScenes];
                                next[sIdx] = { ...sc, brollQuery: e.target.value };
                                setEditableScenes(next);
                              }}
                              placeholder="B-Roll query (tiếng Anh)..."
                              className="w-full rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1.5 text-[11px] font-mono text-cyan-300"
                            />
                          </div>
                        </div>

                        {/* Lời thoại từng vai */}
                        <div className="space-y-1.5">
                          {(sc.segments || []).map((seg: any, gIdx: number) => (
                            <div key={gIdx} className="flex items-start gap-2">
                              <select
                                value={seg.speaker}
                                onChange={(e) => {
                                  const next = [...editableScenes];
                                  const nextSegs = [...(sc.segments || [])];
                                  nextSegs[gIdx] = { ...seg, speaker: e.target.value };
                                  next[sIdx] = { ...sc, segments: nextSegs };
                                  setEditableScenes(next);
                                }}
                                className={`rounded-lg px-2 py-1.5 text-[11px] font-extrabold border ${
                                  seg.speaker === 'accent'
                                    ? 'border-pink-500/40 bg-pink-500/15 text-pink-300'
                                    : 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                                }`}
                              >
                                <option value="lead">LEAD</option>
                                <option value="accent">ACCENT</option>
                              </select>
                              <textarea
                                rows={2}
                                value={seg.text}
                                onChange={(e) => {
                                  const next = [...editableScenes];
                                  const nextSegs = [...(sc.segments || [])];
                                  nextSegs[gIdx] = { ...seg, text: e.target.value };
                                  next[sIdx] = { ...sc, segments: nextSegs };
                                  setEditableScenes(next);
                                }}
                                className="flex-1 rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
                              />
                            </div>
                          ))}
                        </div>

                        {/* Danh sách Visual Cues */}
                        <div className="rounded-xl bg-slate-950/70 p-2.5 space-y-2 border border-white/5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-extrabold text-amber-300">
                              ✨ Từ khóa Điểm nhấn (Visual Cues khớp giọng đọc)
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...editableScenes];
                                const nextCues = [
                                  ...(sc.visualCues || []),
                                  {
                                    triggerPhrase: 'điểm nhấn mới',
                                    displayHeadline: 'ĐIỂM NHẤN MỚI',
                                    effect: 'slam_impact',
                                    sfx: 'pop',
                                  },
                                ];
                                next[sIdx] = { ...sc, visualCues: nextCues };
                                setEditableScenes(next);
                              }}
                              className="rounded-lg bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-amber-500/25"
                            >
                              + Thêm điểm nhấn
                            </button>
                          </div>

                          {(sc.visualCues || []).map((cue: any, cIdx: number) => (
                            <div key={cIdx} className="grid grid-cols-12 gap-1.5 items-center">
                              <input
                                type="text"
                                value={cue.triggerPhrase || ''}
                                onChange={(e) => {
                                  const next = [...editableScenes];
                                  const cues = [...(sc.visualCues || [])];
                                  cues[cIdx] = { ...cue, triggerPhrase: e.target.value };
                                  next[sIdx] = { ...sc, visualCues: cues };
                                  setEditableScenes(next);
                                }}
                                placeholder="Từ kích hoạt trong thoại"
                                className="col-span-3 rounded border border-white/10 bg-slate-900 px-2 py-1 text-[11px] text-slate-200"
                              />
                              <input
                                type="text"
                                value={cue.displayHeadline || ''}
                                onChange={(e) => {
                                  const next = [...editableScenes];
                                  const cues = [...(sc.visualCues || [])];
                                  cues[cIdx] = { ...cue, displayHeadline: e.target.value };
                                  next[sIdx] = { ...sc, visualCues: cues };
                                  setEditableScenes(next);
                                }}
                                placeholder="CHỮ BÙNG NỔ"
                                className="col-span-4 rounded border border-white/10 bg-slate-900 px-2 py-1 text-[11px] font-bold text-amber-300"
                              />
                              <select
                                value={cue.effect || 'slam_impact'}
                                onChange={(e) => {
                                  const next = [...editableScenes];
                                  const cues = [...(sc.visualCues || [])];
                                  cues[cIdx] = { ...cue, effect: e.target.value };
                                  next[sIdx] = { ...sc, visualCues: cues };
                                  setEditableScenes(next);
                                }}
                                className="col-span-3 rounded border border-white/10 bg-slate-900 px-1.5 py-1 text-[11px] text-white"
                              >
                                {EFFECT_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={cue.sfx || 'pop'}
                                onChange={(e) => {
                                  const next = [...editableScenes];
                                  const cues = [...(sc.visualCues || [])];
                                  cues[cIdx] = { ...cue, sfx: e.target.value };
                                  next[sIdx] = { ...sc, visualCues: cues };
                                  setEditableScenes(next);
                                }}
                                className="col-span-1 rounded border border-white/10 bg-slate-900 px-1 py-1 text-[10px] text-cyan-300"
                              >
                                {SFX_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = [...editableScenes];
                                  const cues = (sc.visualCues || []).filter((_: any, i: number) => i !== cIdx);
                                  next[sIdx] = { ...sc, visualCues: cues };
                                  setEditableScenes(next);
                                }}
                                className="col-span-1 flex justify-center text-rose-400 hover:text-rose-300"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: BÀN DỰNG CẢNH (STORYBOARD & REROLL CẢNH LẺ) */}
            {studioTab === 'storyboard' && (
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {storyboardScenes.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-8 text-center text-xs text-slate-400">
                    Đang chờ Đạo diễn AI (Bước 8) và Kết xuất Snapshot (Bước 13)...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {storyboardScenes.map((sb, idx) => {
                      const snapAsset = assets
                        .filter(
                          (a) =>
                            a.kind === 'image' &&
                            a.meta?.snapshot &&
                            a.meta?.sceneId === sb.id &&
                            a.meta?.aspect === previewAspect
                        )
                        .slice(-1)[0] ||
                        assets
                          .filter((a) => a.kind === 'image' && a.meta?.snapshot && a.meta?.sceneId === sb.id)
                          .slice(-1)[0];

                      const brollMeta = brollImages.find((b) => b.sceneId === sb.id);
                      const scScript = editableScenes.find((s) => s.id === sb.id);
                      const isRerolling = rerollingSceneId === sb.id;

                      return (
                        <div
                          key={sb.id}
                          className="rounded-2xl border border-white/10 bg-slate-900/80 p-3.5 flex flex-col justify-between gap-3"
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-extrabold text-white">
                                Cảnh {idx + 1} • {scScript?.onScreenText || sb.id}
                              </span>
                              <div className="flex items-center gap-1">
                                {[sb.palette?.bg, sb.palette?.primary, sb.palette?.accent].map(
                                  (hex, hIdx) =>
                                    hex && (
                                      <span
                                        key={hIdx}
                                        title={hex}
                                        style={{ backgroundColor: hex }}
                                        className="h-3.5 w-3.5 rounded-full border border-white/25"
                                      />
                                    )
                                )}
                              </div>
                            </div>

                            {snapAsset ? (
                              <img
                                src={`/api/assets/${snapAsset.id}?t=${encodeURIComponent(snapAsset.createdAt || '')}`}
                                alt={sb.id}
                                className="w-full h-44 object-contain rounded-xl bg-black border border-white/10"
                              />
                            ) : (
                              <div className="w-full h-44 rounded-xl bg-slate-950 border border-white/5 flex items-center justify-center text-xs text-slate-500">
                                Chưa có ảnh xem trước
                              </div>
                            )}

                            <div className="text-[11px] text-slate-400 truncate">
                              🖼️ B-Roll: <span className="text-cyan-300">{brollMeta?.source || 'Đang tải'}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <select
                                value={conceptOverrides[sb.id] ?? sb.visualConcept ?? 'cyber_hud'}
                                onChange={(e) =>
                                  setConceptOverrides((prev) => ({ ...prev, [sb.id]: e.target.value }))
                                }
                                className="rounded-lg border border-white/15 bg-slate-950 px-2 py-1.5 text-[11px] text-white"
                              >
                                {CONCEPT_OPTIONS.map((c) => (
                                  <option key={c.value} value={c.value}>
                                    {c.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={brollOverrides[sb.id] ?? scScript?.brollQuery ?? ''}
                                onChange={(e) =>
                                  setBrollOverrides((prev) => ({ ...prev, [sb.id]: e.target.value }))
                                }
                                placeholder="Từ khóa B-Roll mới..."
                                className="rounded-lg border border-white/15 bg-slate-950 px-2 py-1.5 text-[11px] font-mono text-cyan-300"
                              />
                            </div>
                          </div>

                          <button
                            onClick={() => handleRerollScene(sb.id)}
                            disabled={isRerolling}
                            className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-2 text-xs font-extrabold text-white hover:opacity-95 disabled:opacity-50"
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${isRerolling ? 'animate-spin' : ''}`} />
                            {isRerolling
                              ? 'Đang thiết kế & Render lại cảnh này...'
                              : '🔄 Đổi thiết kế & Render lại cảnh này'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: TIẾN TRÌNH 17 BƯỚC & NHẬT KÝ TRỰC TIẾP */}
            {studioTab === 'pipeline' && (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-4 gap-3">
                {/* Dãy 17 Pill ngang gọn gàng + Nút điều khiển */}
                <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-3 space-y-2.5 shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-extrabold text-white">
                        Trạng thái: <span className="uppercase text-cyan-300">{runData?.status || 'idle'}</span>
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400">
                        Chi phí: <strong className="text-pink-400">${Number(runData?.costUsd || 0).toFixed(4)}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {runData?.status === 'running' && (
                        <button
                          onClick={() => handleRunControl('pause')}
                          className="flex items-center gap-1 rounded-lg bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-300"
                        >
                          <Pause className="h-3 w-3" /> Tạm dừng
                        </button>
                      )}
                      {runData?.status === 'paused' && (
                        <button
                          onClick={() => handleRunControl('resume')}
                          className="flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-300"
                        >
                          <Play className="h-3 w-3" /> Tiếp tục
                        </button>
                      )}
                      {(runData?.status === 'running' || runData?.status === 'paused') && (
                        <button
                          onClick={() => handleRunControl('cancel')}
                          className="flex items-center gap-1 rounded-lg bg-rose-500/20 px-2.5 py-1 text-[11px] font-bold text-rose-300"
                        >
                          <Square className="h-3 w-3" /> Hủy
                        </button>
                      )}
                      {activeRunId && (
                        <button
                          onClick={() => handleRetryFromStep(selectedStepIndex)}
                          className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:bg-white/10"
                        >
                          <RotateCcw className="h-3 w-3" /> Chạy lại từ B.{selectedStepIndex}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 17 Step Pills */}
                  <div className="flex flex-wrap gap-1.5">
                    {steps.map((st) => {
                      const isSel = st.stepIndex === selectedStepIndex;
                      const colorCls =
                        st.status === 'done'
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : st.status === 'running'
                            ? 'border-cyan-400 bg-cyan-500/25 text-cyan-200 animate-pulse'
                            : st.status === 'failed'
                              ? 'border-rose-500/50 bg-rose-500/20 text-rose-300'
                              : st.status === 'warning'
                                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                                : 'border-white/10 bg-slate-950 text-slate-500';

                      return (
                        <button
                          key={st.stepIndex}
                          onClick={() => setSelectedStepIndex(st.stepIndex)}
                          title={st.displayName}
                          className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${colorCls} ${
                            isSel ? 'ring-2 ring-purple-400' : ''
                          }`}
                        >
                          {st.stepIndex}. {st.agent}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Khung Log thời gian thực tự cuộn */}
                <div
                  ref={logBoxRef}
                  className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-[#050811] p-3.5 font-mono text-xs space-y-1.5"
                >
                  {logs.length === 0 ? (
                    <div className="text-slate-500">Chưa có nhật ký cho phiên chạy này...</div>
                  ) : (
                    logs.map((l) => (
                      <div key={l.id} className="flex items-start gap-2 leading-relaxed">
                        <span className="text-slate-600 shrink-0">
                          [{new Date(l.ts).toLocaleTimeString('vi-VN')}]
                        </span>
                        <span className="rounded bg-white/5 px-1.5 text-[10px] text-purple-300 shrink-0">
                          B.{l.stepIndex}
                        </span>
                        <span
                          className={
                            l.level === 'error'
                              ? 'text-rose-400'
                              : l.level === 'warn'
                                ? 'text-amber-300'
                                : 'text-slate-200'
                          }
                        >
                          {l.message}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: XUẤT BẢN (COPY 1 CHẠM) */}
            {studioTab === 'publish' && (
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {publishDrafts.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-8 text-center text-xs text-slate-400">
                    Bản nháp Tiêu đề, Mô tả & Hashtags cho 4 nền tảng sẽ xuất hiện ngay khi hoàn tất Bước 17.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {publishDrafts.map((d, idx) => (
                      <div
                        key={idx}
                        className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="rounded-lg bg-purple-500/20 px-2.5 py-1 text-xs font-extrabold uppercase text-purple-300">
                            {d.platform.replace('_', ' ')} ({d.aspect})
                          </span>
                          <button
                            onClick={() =>
                              copyText(
                                `all_${idx}`,
                                `${d.title}\n\n${d.description}\n\n${(d.hashtags || []).join(' ')}`
                              )
                            }
                            className="flex items-center gap-1 rounded-lg bg-cyan-500/20 px-2.5 py-1 text-[11px] font-bold text-cyan-300 hover:bg-cyan-500/30"
                          >
                            {copiedKey === `all_${idx}` ? (
                              <>
                                <Check className="h-3 w-3" /> Đã chép!
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" /> Copy tất cả
                              </>
                            )}
                          </button>
                        </div>

                        <div className="text-xs font-extrabold text-white">{d.title}</div>
                        <p className="text-[11px] text-slate-300 whitespace-pre-line line-clamp-4">
                          {d.description}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(d.hashtags || []).map((tag: string, tIdx: number) => (
                            <span
                              key={tIdx}
                              className="rounded bg-white/5 px-2 py-0.5 text-[10px] text-cyan-300"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* =====================================================================
          CỘT PHẢI (360px cố định): KHUNG XEM TRƯỚC & TẢI XUẤT MP4 / SRT
         ===================================================================== */}
      <aside className="w-[360px] shrink-0 border-l border-white/10 bg-slate-950/95 p-4 flex flex-col justify-between overflow-hidden">
        <div className="space-y-3 flex-1 min-h-0 flex flex-col">
          {/* Công tắc gạt 9:16 Dọc / 16:9 Ngang */}
          <div className="flex items-center justify-between shrink-0">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
              Xem trước Kết quả
            </span>
            <div className="flex rounded-xl border border-white/10 bg-slate-900 p-0.5">
              <button
                onClick={() => setPreviewAspect('9:16')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition ${
                  previewAspect === '9:16'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                9:16 Dọc
              </button>
              <button
                onClick={() => setPreviewAspect('16:9')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold transition ${
                  previewAspect === '16:9'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                16:9 Ngang
              </button>
            </div>
          </div>

          {/* Trình phát Video */}
          <div className="flex-1 min-h-0 flex items-center justify-center rounded-2xl border border-white/10 bg-black/90 p-2 overflow-hidden">
            {activeVideoAsset ? (
              <video
                key={`${activeVideoAsset.id}_${activeVideoAsset.createdAt}`}
                controls
                poster={
                  activeThumbAsset
                    ? `/api/assets/${activeThumbAsset.id}?t=${encodeURIComponent(activeThumbAsset.createdAt || '')}`
                    : undefined
                }
                className="max-h-full max-w-full rounded-xl object-contain"
                src={`/api/assets/${activeVideoAsset.id}?t=${encodeURIComponent(activeVideoAsset.createdAt || '')}`}
              />
            ) : (
              <div className="text-center px-4 space-y-2">
                <div className="mx-auto h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center text-purple-400">
                  <Play className="h-5 w-5" />
                </div>
                <p className="text-xs font-bold text-slate-300">
                  {runData?.status === 'running'
                    ? 'Đang kết xuất Video 30fps...'
                    : 'Chưa có Video hoàn chỉnh'}
                </p>
                <p className="text-[11px] text-slate-500">
                  Video MP4 kèm giọng đọc, SFX và nhạc nền sẽ hiển thị ngay tại đây sau Bước 15.
                </p>
              </div>
            )}
          </div>

          {/* Thông số kỹ thuật ngắn gọn */}
          <div className="grid grid-cols-4 gap-1.5 shrink-0">
            <div className="rounded-xl border border-white/10 bg-slate-900/80 p-2 text-center">
              <div className="text-[10px] text-slate-400">Phân giải</div>
              <div className="text-[11px] font-extrabold text-white">
                {activeVideoMeta
                  ? `${activeVideoMeta.width}×${activeVideoMeta.height}`
                  : previewAspect === '9:16'
                    ? '1080×1920'
                    : '1920×1080'}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/80 p-2 text-center">
              <div className="text-[10px] text-slate-400">Thời lượng</div>
              <div className="text-[11px] font-extrabold text-cyan-300">
                {activeVideoMeta ? `${activeVideoMeta.durationSec}s` : '--'}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/80 p-2 text-center">
              <div className="text-[10px] text-slate-400">Khung hình</div>
              <div className="text-[11px] font-extrabold text-emerald-300">
                {activeVideoMeta?.fps || 30} FPS
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/80 p-2 text-center">
              <div className="text-[10px] text-slate-400">Âm lượng</div>
              <div className="text-[11px] font-extrabold text-amber-300">
                {activeVideoMeta?.lufs ? `${activeVideoMeta.lufs}` : '-14'} LUFS
              </div>
            </div>
          </div>
        </div>

        {/* Cụm nút cố định Tải Video MP4 & Tải Phụ đề SRT */}
        <div className="pt-3 mt-3 border-t border-white/10 grid grid-cols-2 gap-2 shrink-0">
          {activeVideoAsset ? (
            <a
              href={`/api/assets/${activeVideoAsset.id}`}
              download={`videoforge_${previewAspect.replace(':', 'x')}.mp4`}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 py-2.5 text-xs font-extrabold text-white shadow hover:opacity-95"
            >
              <Download className="h-3.5 w-3.5" /> Tải Video MP4
            </a>
          ) : (
            <button
              disabled
              className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-slate-600 border border-white/5"
            >
              <Download className="h-3.5 w-3.5" /> Tải Video MP4
            </button>
          )}

          {srtAsset ? (
            <a
              href={`/api/assets/${srtAsset.id}`}
              download="captions.srt"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-slate-900 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
            >
              <FileText className="h-3.5 w-3.5" /> Tải Phụ đề SRT
            </a>
          ) : (
            <button
              disabled
              className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-slate-600 border border-white/5"
            >
              <FileText className="h-3.5 w-3.5" /> Tải Phụ đề SRT
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
