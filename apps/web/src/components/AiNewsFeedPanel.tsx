'use client';

import React, { useEffect, useState } from 'react';
import {
  Newspaper,
  RefreshCw,
  Search,
  ExternalLink,
  Play,
  Sparkles,
} from 'lucide-react';

interface AiNewsItem {
  id: string;
  title: string;
  url: string;
  summary: string;
  source: string;
  category: 'research' | 'industry' | 'vietnam';
  publishedAt: string;
}

interface AiNewsFeedPanelProps {
  onCreateFromTopic: (projectId: string, runId: string | null) => void;
}

export function AiNewsFeedPanel({ onCreateFromTopic }: AiNewsFeedPanelProps) {
  const [items, setItems] = useState<AiNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'research' | 'industry' | 'vietnam'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [aspect, setAspect] = useState<'9:16' | '16:9' | 'both'>('9:16');
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string>('');

  const loadFeed = async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/ai-news?refresh=${forceRefresh ? 'true' : 'false'}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setCachedAt(data.cachedAt || '');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadFeed(false);
  }, []);

  const handleCreateVideo = async (item: AiNewsItem) => {
    setCreatingId(item.id);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          sourceType: 'url',
          sourceRef: item.url,
          aspect,
          approvalSteps: [],
          autoStart: true,
        }),
      });
      const data = await res.json();
      if (data.project?.id) {
        onCreateFromTopic(data.project.id, data.runId || null);
      }
    } finally {
      setCreatingId(null);
    }
  };

  const filteredItems = items.filter((item) => {
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-slate-950 px-6 py-4">
      <div className="mx-auto w-full max-w-6xl flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
        {/* Header & Filter Bar */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
              <Newspaper className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white">
                Chủ đề & Tin tức AI Chính thống (1-Click Tạo Video)
              </h2>
              <p className="text-[11px] text-slate-400">
                Tổng hợp trực tiếp từ OpenAI, Google AI, Hugging Face, MIT Tech Review, TechCrunch &amp; VnExpress Số hóa
                {cachedAt ? ` · Cập nhật ${new Date(cachedAt).toLocaleTimeString('vi-VN')}` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Lọc chủ đề AI..."
                className="w-44 rounded-xl border border-white/15 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-white focus:border-purple-400 focus:outline-none"
              />
            </div>

            <select
              value={aspect}
              onChange={(e) => setAspect(e.target.value as any)}
              className="rounded-xl border border-white/15 bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-cyan-300"
            >
              <option value="9:16">Xuất 9:16 Dọc</option>
              <option value="16:9">Xuất 16:9 Ngang</option>
              <option value="both">Cả hai (9:16 + 16:9)</option>
            </select>

            <button
              onClick={() => loadFeed(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/25"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Đang tải...' : 'Làm mới tin AI'}
            </button>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {[
            { id: 'all' as const, label: `Tất cả (${items.length})` },
            { id: 'research' as const, label: 'OpenAI / Google AI / Hugging Face' },
            { id: 'industry' as const, label: 'MIT Tech Review / TechCrunch' },
            { id: 'vietnam' as const, label: 'VnExpress Công nghệ' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                categoryFilter === cat.id
                  ? 'border-purple-500 bg-purple-500/20 text-purple-200'
                  : 'border-white/10 bg-slate-900/60 text-slate-400 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Grid Chủ đề cuộn nội bộ */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-44 rounded-2xl border border-white/10 bg-slate-900/60 animate-pulse"
                />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-10 text-center text-xs text-slate-400">
              Không tìm thấy bài viết phù hợp bộ lọc hiện tại.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pb-2">
              {filteredItems.map((item) => {
                const isCreating = creatingId === item.id;
                const badgeColor =
                  item.category === 'research'
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                    : item.category === 'vietnam'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 flex flex-col justify-between gap-3 hover:border-purple-500/40 transition"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-extrabold ${badgeColor}`}>
                          {item.source}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(item.publishedAt).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                      <h3 className="text-xs font-extrabold text-white line-clamp-2 leading-snug">
                        {item.title}
                      </h3>
                      <p className="text-[11px] text-slate-400 line-clamp-3 leading-relaxed">
                        {item.summary}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-white/10 flex items-center justify-between gap-2">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-cyan-300"
                      >
                        <ExternalLink className="h-3 w-3" /> Đọc gốc
                      </a>
                      <button
                        onClick={() => handleCreateVideo(item)}
                        disabled={isCreating}
                        className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-3.5 py-1.5 text-[11px] font-extrabold text-white shadow hover:opacity-95 disabled:opacity-50"
                      >
                        {isCreating ? (
                          <>
                            <Sparkles className="h-3 w-3 animate-spin" /> Đang tạo...
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3" /> Tạo Video Ngay
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
