'use client';

import React, { useState } from 'react';
import { X, Play, Sparkles, Link as LinkIcon, FileText } from 'lucide-react';

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (projectId: string, runId: string | null) => void;
}

export function CreateProjectModal({ open, onClose, onCreated }: CreateProjectModalProps) {
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<'url' | 'text'>('text');
  const [sourceRef, setSourceRef] = useState('');
  const [aspect, setAspect] = useState<'9:16' | '16:9' | 'both'>('both');
  const [castMode, setCastMode] = useState<'lead_accent' | 'dialogue' | 'alternating'>('lead_accent');
  const [autoApprove, setAutoApprove] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSource = sourceRef.trim();
    if (!cleanSource) return;
    const finalTitle =
      title.trim() ||
      (sourceType === 'url' ? 'Video phân tích từ bài báo' : cleanSource.slice(0, 68));

    setSubmitting(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: finalTitle,
          sourceType,
          sourceRef: cleanSource,
          aspect,
          castMode,
          approvalSteps: autoApprove ? [] : [6, 8, 17],
          autoStart: true,
        }),
      });
      const data = await res.json();
      if (data.project?.id) {
        onCreated(data.project.id, data.runId || null);
        setTitle('');
        setSourceRef('');
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 bg-slate-950/80 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-extrabold text-white">Tạo Dự Án Video Mới (VideoForge 2.0)</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSourceType('text')}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold border transition ${
                sourceType === 'text'
                  ? 'border-purple-500 bg-purple-500/20 text-purple-200'
                  : 'border-white/10 bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="h-3.5 w-3.5" /> Dán Văn bản / Bài viết
            </button>
            <button
              type="button"
              onClick={() => setSourceType('url')}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold border transition ${
                sourceType === 'url'
                  ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                  : 'border-white/10 bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              <LinkIcon className="h-3.5 w-3.5" /> Nhập URL Bài báo (Tự lấy ảnh)
            </button>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">
              Tiêu đề dự án (để trống sẽ tự lấy từ bài viết)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Đột phá Chip bán dẫn 2nm & Cuộc đua hạ tầng AI..."
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3.5 py-2 text-xs text-white focus:border-purple-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">
              {sourceType === 'url' ? 'Đường dẫn URL bài báo' : 'Nội dung bài viết / Các dữ kiện chính'}
            </label>
            {sourceType === 'url' ? (
              <input
                type="url"
                required
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
                placeholder="https://vnexpress.net/..."
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-3.5 py-2.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
              />
            ) : (
              <textarea
                required
                rows={5}
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
                placeholder="Dán nội dung bài báo, tin tức tài chính, công nghệ hoặc ghi chú sự kiện vào đây..."
                className="w-full rounded-xl border border-white/15 bg-slate-950 p-3 text-xs text-white leading-relaxed focus:border-purple-400 focus:outline-none"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">Khung hình xuất bản</label>
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value as any)}
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
              >
                <option value="both">Cả hai (9:16 Dọc + 16:9 Ngang)</option>
                <option value="9:16">Chỉ 9:16 Dọc (TikTok / Shorts / Reels)</option>
                <option value="16:9">Chỉ 16:9 Ngang (YouTube)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">Phối giọng đọc</label>
              <select
                value={castMode}
                onChange={(e) => setCastMode(e.target.value as any)}
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
              >
                <option value="lead_accent">Dẫn chuyện (Lead) + Điểm nhấn (Accent)</option>
                <option value="dialogue">Đối thoại Hỏi – Đáp 2 giọng</option>
                <option value="alternating">Luân phiên theo từng cảnh</option>
              </select>
            </div>
          </div>

          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2.5 cursor-pointer">
            <div>
              <div className="text-xs font-bold text-white">Chạy tự động 1 mạch (Auto-run 1 → 17)</div>
              <div className="text-[11px] text-slate-400">
                Tắt dừng chờ duyệt tay ở bước Kịch bản & Đạo diễn để xuất thẳng video MP4
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(e) => setAutoApprove(e.target.checked)}
              className="h-4 w-4 accent-purple-500"
            />
          </label>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-white/5"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg hover:opacity-95 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              {submitting ? 'Đang khởi chạy...' : 'Chạy Ngay (17 AI Agents)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
