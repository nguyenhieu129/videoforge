'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  PlusCircle,
  Activity,
  Mic,
  Film,
  Share2,
  Settings,
  Sun,
  Moon,
  Sparkles,
  Play,
  ExternalLink,
  CheckCircle2,
  Send,
  Calendar,
} from 'lucide-react';
import { useAppStore, type NavTab } from '../store/useAppStore';
import { PipelineLiveView } from '../components/PipelineLiveView';
import { VoiceStudioPanel } from '../components/VoiceStudioPanel';
import { SettingsPanel } from '../components/SettingsPanel';

export default function VideoForgeAppPage() {
  const { activeTab, setActiveTab, theme, toggleTheme, openPipelineRun } = useAppStore();
  const [projects, setProjects] = useState<any[]>([]);
  const [pipelineMeta, setPipelineMeta] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [publishJobs, setPublishJobs] = useState<any[]>([]);

  // Form Tạo Video (Mục 9.1.2)
  const [title, setTitle] = useState(
    'Đột phá AI Agent 2026: Tự động hóa sản xuất Video đa nền tảng với HyperFrames & OmniVoice'
  );
  const [sourceType, setSourceType] = useState<'url' | 'text' | 'pdf' | 'rss'>('text');
  const [sourceRef, setSourceRef] = useState(
    'Công nghệ sản xuất video tự động bằng chuỗi 17 AI Agent đang thay đổi hoàn toàn cách các nhà sáng tạo nội dung làm việc. Hệ thống kết hợp HyperFrames và GSAP để tạo đồ họa chuyển động sắc nét ở cả hai tỉ lệ 16:9 và 9:16 với tốc độ 30 khung hình/giây. Đặc biệt, cơ chế phối hợp hai giọng đọc Nam và Nữ (Lead và Accent) qua Voice Studio giúp tăng tỷ lệ giữ chân người xem trong 3 giây đầu lên hơn 68%. Cuối cùng, FFmpeg tự động trộn nhạc nền với hiệu ứng sidechain ducking và chuẩn hóa âm lượng đạt chuẩn -14 LUFS cho YouTube Shorts, Reels và TikTok.'
  );
  const [aspect, setAspect] = useState<'16:9' | '9:16' | 'both'>('both');
  const [stylePreset, setStylePreset] = useState('neon_cyber');
  const [scoreThreshold, setScoreThreshold] = useState(5.0);
  const [castMode, setCastMode] = useState<'lead_accent' | 'dialogue' | 'alternating'>('lead_accent');
  const [castSelectionMode, setCastSelectionMode] = useState<
    'auto_rotate' | 'lock_one' | 'fixed_pair' | 'advanced_scene'
  >('auto_rotate');
  const [disabledSteps, setDisabledSteps] = useState<number[]>([]);
  const [approvalSteps, setApprovalSteps] = useState<number[]>([]); // Mặc định tắt dừng chờ duyệt khi tạo nhanh hoặc bật tùy ý
  const [creating, setCreating] = useState(false);

  const loadOverview = async () => {
    try {
      const [pRes, mRes, aRes, pubRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/meta/pipeline-steps'),
        fetch('/api/assets'),
        fetch('/api/publish'),
      ]);
      if (pRes.ok) setProjects((await pRes.json()).projects || []);
      if (mRes.ok) setPipelineMeta(await mRes.json());
      if (aRes.ok) setAssets((await aRes.json()).assets || []);
      if (pubRes.ok) setPublishJobs((await pubRes.json()).jobs || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadOverview();
  }, [activeTab]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const handleCreateAndRun = async () => {
    if (!title.trim() || !sourceRef.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          sourceType,
          sourceRef,
          aspect,
          stylePreset,
          scoreThreshold,
          castMode,
          castSelectionMode,
          disabledSteps,
          approvalSteps,
          autoStart: true,
        }),
      });
      const data = await res.json();
      if (data.runId) {
        openPipelineRun(data.runId, 1);
      }
    } finally {
      setCreating(false);
    }
  };

  const toggleDisabledStep = (idx: number) => {
    setDisabledSteps((prev) =>
      prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx]
    );
  };

  const toggleApprovalStep = (idx: number) => {
    setApprovalSteps((prev) =>
      prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx]
    );
  };

  const handleConfirmPublish = async (jobId: string) => {
    await fetch(`/api/publish/${jobId}/confirm`, { method: 'POST' });
    loadOverview();
  };

  const handleCreatePublishFromAsset = async (asset: any, platform: string) => {
    await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: asset.projectId,
        assetId: asset.id,
        platform,
        title: `${asset.projectTitle || 'VideoForge'} ${platform === 'youtube_shorts' ? '#Shorts' : ''}`,
        description: `Được sản xuất tự động bằng VideoForge 17-Agent Pipeline.`,
        hashtags: ['#VideoForge', '#AI', '#Shorts'],
        method: 'api',
      }),
    });
    setActiveTab('publish_queue');
    loadOverview();
  };

  const navItems: Array<{ id: NavTab; label: string; icon: any }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'create', label: 'Tạo video', icon: PlusCircle },
    { id: 'pipeline', label: 'Pipeline Live View', icon: Activity },
    { id: 'voice_studio', label: 'Voice Studio', icon: Mic },
    { id: 'library', label: 'Thư viện', icon: Film },
    { id: 'publish_queue', label: 'Hàng đợi đăng', icon: Share2 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div
      className={`min-h-screen transition-colors ${
        theme === 'dark'
          ? 'bg-[#070A12] text-slate-100'
          : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* Hiệu ứng nền Gradient Tím - Xanh - Hồng (Mục 9.3) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-purple-600/20 blur-[130px]" />
        <div className="absolute top-1/3 right-0 h-96 w-96 rounded-full bg-cyan-500/15 blur-[130px]" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-pink-600/15 blur-[130px]" />
      </div>

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 via-cyan-500 to-pink-500 shadow-lg shadow-purple-500/25">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold tracking-tight text-white">
                  VideoForge
                </span>
                <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-purple-300 border border-purple-500/30">
                  17-Agent Pipeline
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                HyperFrames · GSAP · three.js · Remotion · Manim · Voice Studio · FFmpeg
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-bold transition-all ${
                    active
                      ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 text-white shadow-lg shadow-purple-500/25'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}

            <button
              onClick={toggleTheme}
              title="Đổi chế độ Sáng / Tối"
              className="ml-2 rounded-2xl border border-white/10 bg-white/5 p-2 text-slate-300 hover:text-white"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-7xl px-6 py-8">
        {/* 1. DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-gradient-to-r from-purple-950/60 via-slate-900/80 to-pink-950/50 p-6 backdrop-blur-xl">
              <div>
                <h1 className="text-2xl font-extrabold text-white">
                  Bảng Điều Khiển Sản Xuất Video Tự Động
                </h1>
                <p className="mt-1 text-xs text-slate-300">
                  Biến bất kỳ bài viết (URL, Văn bản, PDF, RSS) thành video 16:9 và 9:16 chất lượng cao với lồng tiếng 2 vai Lead/Accent và phụ đề động.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('create')}
                className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 via-cyan-500 to-pink-500 px-5 py-3 text-xs font-extrabold text-white shadow-xl hover:opacity-95 transition"
              >
                <PlusCircle className="h-4 w-4" /> + Tạo Video Mới Ngay
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-12 text-center">
                <p className="text-sm text-slate-300">
                  Chưa có dự án nào. Hãy bấm <strong>&ldquo;Tạo Video Mới Ngay&rdquo;</strong> để chạy thử toàn bộ 17 bước!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((p) => (
                  <motion.div
                    key={p.id}
                    whileHover={{ y: -3 }}
                    className="rounded-3xl border border-white/10 bg-slate-900/75 p-5 flex flex-col justify-between gap-4 backdrop-blur-xl"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full bg-purple-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-purple-300">
                          {p.aspect === 'both' ? '16:9 + 9:16' : p.aspect}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                            p.status === 'completed' || p.status === 'published'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : p.status === 'running'
                              ? 'bg-cyan-500/20 text-cyan-300'
                              : p.status === 'paused'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {p.status}
                        </span>
                      </div>
                      <h3 className="mt-3 text-base font-extrabold text-white line-clamp-2">
                        {p.title}
                      </h3>
                      <p className="mt-1 text-xs text-slate-400 line-clamp-2">{p.sourceRef}</p>
                    </div>

                    <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                      <div className="text-slate-400">
                        Chi phí:{' '}
                        <strong className="text-pink-400">
                          ${Number(p.latestRun?.costUsd || 0).toFixed(4)}
                        </strong>
                      </div>
                      {p.latestRun && (
                        <button
                          onClick={() => openPipelineRun(p.latestRun.id, p.latestRun.currentStep || 1)}
                          className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 font-bold text-cyan-300 hover:bg-white/20"
                        >
                          <Activity className="h-3.5 w-3.5" /> Mở Live View
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. TẠO VIDEO (Mục 9.1.2) */}
        {activeTab === 'create' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-8 rounded-3xl border border-white/10 bg-slate-900/75 p-6 backdrop-blur-xl space-y-5">
              <h2 className="text-xl font-extrabold text-white">
                Khởi tạo Dự án Video Mới (Pipeline 17 AI Agent)
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Tiêu đề dự án video
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-2xl border border-white/15 bg-slate-950 px-4 py-2.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Loại nguồn đầu vào
                  </label>
                  <select
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value as any)}
                    className="w-full rounded-2xl border border-white/15 bg-slate-950 px-4 py-2.5 text-xs text-white"
                  >
                    <option value="text">Văn bản (Text)</option>
                    <option value="url">Đường dẫn bài viết (URL)</option>
                    <option value="pdf">Tài liệu PDF</option>
                    <option value="rss">Nguồn RSS</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  {sourceType === 'url' ? 'URL Bài viết' : 'Nội dung bài viết / Nguồn dữ kiện'}
                </label>
                <textarea
                  value={sourceRef}
                  onChange={(e) => setSourceRef(e.target.value)}
                  rows={5}
                  className="w-full rounded-2xl border border-white/15 bg-slate-950 p-4 text-xs text-white leading-relaxed"
                  placeholder="Nhập URL hoặc dán toàn bộ văn bản bài viết vào đây..."
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Tỉ lệ xuất video (`aspect`)
                  </label>
                  <select
                    value={aspect}
                    onChange={(e) => setAspect(e.target.value as any)}
                    className="w-full rounded-2xl border border-white/15 bg-slate-950 px-3 py-2.5 text-xs text-white"
                  >
                    <option value="both">Cả hai (16:9 Ngang & 9:16 Dọc)</option>
                    <option value="9:16">Chỉ 9:16 (Shorts / Reels / TikTok)</option>
                    <option value="16:9">Chỉ 16:9 (YouTube Video)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Phong cách thị giác (`Style Preset`)
                  </label>
                  <select
                    value={stylePreset}
                    onChange={(e) => setStylePreset(e.target.value)}
                    className="w-full rounded-2xl border border-white/15 bg-slate-950 px-3 py-2.5 text-xs text-white"
                  >
                    {(pipelineMeta?.stylePresets || []).map((sp: any) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Ngưỡng điểm Scorer (0–10)
                  </label>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    max={9.5}
                    value={scoreThreshold}
                    onChange={(e) => setScoreThreshold(Number(e.target.value))}
                    className="w-full rounded-2xl border border-white/15 bg-slate-950 px-3 py-2.5 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Chế độ phối hợp 2 giọng (`Voice Cast Mode` - Mục 8.3)
                  </label>
                  <select
                    value={castMode}
                    onChange={(e) => setCastMode(e.target.value as any)}
                    className="w-full rounded-2xl border border-white/15 bg-slate-950 px-3 py-2.5 text-xs text-white"
                  >
                    <option value="lead_accent">1. Dẫn chuyện (Lead) + Điểm nhấn (Accent)</option>
                    <option value="dialogue">2. Đối thoại Hỏi – Đáp</option>
                    <option value="alternating">3. Luân phiên đổi giọng theo cảnh</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Thuật toán chọn giọng từ Voice Pool (Mục 8.3.1)
                  </label>
                  <select
                    value={castSelectionMode}
                    onChange={(e) => setCastSelectionMode(e.target.value as any)}
                    className="w-full rounded-2xl border border-white/15 bg-slate-950 px-3 py-2.5 text-xs text-white"
                  >
                    <option value="auto_rotate">Tự động xoay cặp Nam + Nữ (Tránh lặp N video)</option>
                    <option value="lock_one">Khóa một vai, xoay vai còn lại</option>
                    <option value="fixed_pair">Cố định cả cặp</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleCreateAndRun}
                disabled={creating}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 via-cyan-500 to-pink-600 py-3.5 text-sm font-extrabold text-white shadow-xl hover:opacity-95 transition"
              >
                <Play className="h-4 w-4" />
                {creating ? 'Đang khởi tạo Pipeline...' : '🚀 Bắt đầu Chạy Pipeline 17 Agent'}
              </button>
            </div>

            {/* Cột phải: Bật/tắt bước & Cấu hình duyệt thủ công (Mục 6.1: chỉ bước 3, 4, 5, 7, 9, 11, 13, 16 được phép tắt) */}
            <div className="lg:col-span-4 rounded-3xl border border-white/10 bg-slate-900/75 p-6 backdrop-blur-xl space-y-4">
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  Tùy chỉnh 17 Bước Pipeline & Duyệt thủ công
                </h3>
                <p className="mt-1 text-[11px] text-slate-400">
                  Theo Mục 6.1, chỉ các bước <strong>3, 4, 5, 7, 9, 11, 13, 16</strong> được phép tắt. Bạn cũng có thể bật cờ &ldquo;Dừng duyệt&rdquo; ở bước 6 (Script), 8 (Director), 17 (Publisher).
                </p>
              </div>

              <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
                {(pipelineMeta?.steps || []).map((st: any) => {
                  const isDisabled = disabledSteps.includes(st.stepIndex);
                  const isApproval = approvalSteps.includes(st.stepIndex);
                  return (
                    <div
                      key={st.stepIndex}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">{st.displayName}</div>
                        <div className="text-[10px] text-slate-400">
                          {st.canDisable ? 'Cho phép tắt' : 'Bước lõi bắt buộc'}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {st.canDisable && (
                          <button
                            onClick={() => toggleDisabledStep(st.stepIndex)}
                            className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
                              isDisabled
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : 'bg-emerald-500/15 text-emerald-300'
                            }`}
                          >
                            {isDisabled ? 'Đã tắt' : 'Đang bật'}
                          </button>
                        )}
                        {(st.stepIndex === 6 || st.stepIndex === 8 || st.stepIndex === 17) && (
                          <button
                            onClick={() => toggleApprovalStep(st.stepIndex)}
                            className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
                              isApproval
                                ? 'bg-amber-500/25 text-amber-300 border border-amber-400/50'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {isApproval ? 'Dừng duyệt: BẬT' : 'Chạy thẳng'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 3. PIPELINE LIVE VIEW */}
        {activeTab === 'pipeline' && <PipelineLiveView />}

        {/* 4. VOICE STUDIO */}
        {activeTab === 'voice_studio' && <VoiceStudioPanel />}

        {/* 5. THƯ VIỆN VIDEO (Mục 9.1.6) */}
        {activeTab === 'library' && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-slate-900/75 p-6">
              <h2 className="text-xl font-extrabold text-white">
                Thư viện Video & Tài nguyên Đã Xuất ({assets.filter((a) => a.kind === 'final_video').length} video hoàn chỉnh)
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Xem trực tiếp, tải xuống MP4 chuẩn H.264 (`yuv420p`, 30fps, `-14 LUFS`) hoặc đẩy vào Hàng đợi đăng bài.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {assets
                .filter((a) => a.kind === 'final_video')
                .map((vid) => (
                  <div
                    key={vid.id}
                    className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 space-y-4 backdrop-blur-xl"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="rounded-full bg-purple-500/20 px-2.5 py-0.5 text-xs font-bold text-purple-300">
                          {vid.meta?.aspect || 'Video'} ({vid.width}×{vid.height})
                        </span>
                        <h3 className="mt-1 text-sm font-bold text-white">
                          {vid.projectTitle || vid.projectId}
                        </h3>
                      </div>
                      <a
                        href={`/api/assets/${vid.id}`}
                        download
                        className="rounded-xl bg-cyan-500/20 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/30"
                      >
                        ⬇ Tải MP4
                      </a>
                    </div>

                    <video
                      controls
                      className="w-full max-h-80 rounded-2xl bg-black border border-white/10"
                      src={`/api/assets/${vid.id}`}
                    />

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                      <span className="text-xs text-slate-400">Đăng nhanh lên:</span>
                      {(
                        [
                          { id: 'youtube_shorts', label: 'YouTube Shorts' },
                          { id: 'youtube_video', label: 'YouTube 16:9' },
                          { id: 'facebook_reels', label: 'FB Reels' },
                          { id: 'tiktok', label: 'TikTok' },
                        ] as const
                      ).map((pf) => (
                        <button
                          key={pf.id}
                          onClick={() => handleCreatePublishFromAsset(vid, pf.id)}
                          className="rounded-xl border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-bold text-slate-200 hover:bg-purple-600 hover:text-white transition"
                        >
                          + {pf.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 6. HÀNG ĐỢI ĐĂNG BÀI (Mục 9.1.7 & Mục 10) */}
        {activeTab === 'publish_queue' && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-slate-900/75 p-6">
              <h2 className="text-xl font-extrabold text-white">
                Hàng Đợi Đăng Video & Xem Trước Xác Nhận (YouTube · Shorts · Facebook Reels · TikTok)
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Ưu tiên gọi API chính thức (YouTube Data API v3, TikTok Content Posting API, Meta Graph API), dự phòng Playwright Browser Automation. Tự động đính kèm nguồn bài gốc và nhãn nội dung AI.
              </p>
            </div>

            {publishJobs.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-10 text-center text-xs text-slate-400">
                Chưa có lệnh đăng bài nào trong hàng đợi. Bạn có thể tạo từ bước 17 (Publisher) hoặc từ mục Thư viện.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {publishJobs.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 px-3 py-1 text-xs font-bold uppercase text-purple-300 border border-purple-500/30">
                        {job.platform} ({job.method.toUpperCase()})
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                          job.status === 'published'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {job.status}
                      </span>
                    </div>

                    <h3 className="text-sm font-extrabold text-white">{job.title}</h3>
                    <p className="text-xs text-slate-300 whitespace-pre-line line-clamp-4">
                      {job.description}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(job.hashtags || []).map((tag: string, idx: number) => (
                        <span
                          key={idx}
                          className="rounded-lg bg-cyan-500/15 px-2 py-0.5 text-[11px] text-cyan-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {job.remoteUrl ? (
                      <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                          <CheckCircle2 className="h-4 w-4" /> Đã xuất bản thành công
                        </span>
                        <a
                          href={job.remoteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-cyan-300 underline"
                        >
                          {job.remoteUrl} <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    ) : (
                      <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Calendar className="h-3.5 w-3.5" />
                          {job.scheduledAt || 'Đăng ngay sau khi xác nhận'}
                        </span>
                        <button
                          onClick={() => handleConfirmPublish(job.id)}
                          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-xs font-extrabold text-slate-950"
                        >
                          <Send className="h-3.5 w-3.5" /> Xác nhận & Đăng ngay
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 7. SETTINGS */}
        {activeTab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
}
