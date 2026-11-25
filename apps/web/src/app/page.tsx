'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles, Plus } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { StudioWorkspace } from '../components/StudioWorkspace';
import { VoiceStudioPanel } from '../components/VoiceStudioPanel';
import { SettingsPanel } from '../components/SettingsPanel';
import { CreateProjectModal } from '../components/CreateProjectModal';

export default function VideoForgeAppPage() {
  const {
    activeSection,
    setActiveSection,
    createModalOpen,
    setCreateModalOpen,
    selectProjectAndRun,
  } = useAppStore();

  const [projects, setProjects] = useState<any[]>([]);
  const [aiStatusLabel, setAiStatusLabel] = useState('AI Ready');
  const [voiceConnected, setVoiceConnected] = useState(true);

  const loadProjectsAndStatus = async () => {
    try {
      const [pRes, amRes, pListRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/agent-models'),
        fetch('/api/providers'),
      ]);

      if (pRes.ok) {
        const pData = await pRes.json();
        setProjects(pData.projects || []);
      }

      if (amRes.ok && pListRes.ok) {
        const am = (await amRes.json()).agentModels || [];
        const provs = (await pListRes.json()).providers || [];
        const scriptRow = am.find((x: any) => x.agent === 'Scriptwriter') || am[1];
        const prov = provs.find((p: any) => p.id === scriptRow?.providerId);
        if (prov && scriptRow) {
          setAiStatusLabel(`${prov.name}: ${scriptRow.model}`);
        }
      }

      setVoiceConnected(true);
    } catch {
      // ignore transient error
    }
  };

  useEffect(() => {
    loadProjectsAndStatus();
  }, [activeSection]);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-950 text-slate-100">
      {/* =====================================================================
          TOP HEADER CỐ ĐỊNH CAO 52PX (Hạng mục 6.1)
         ===================================================================== */}
      <header className="h-[52px] shrink-0 border-b border-white/10 bg-slate-950/95 px-4 flex items-center justify-between gap-4 z-30">
        {/* Logo VideoForge 2.0 */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 via-cyan-500 to-pink-500 shadow">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold tracking-tight text-white">
              VideoForge 2.0
            </span>
            <span className="hidden sm:inline-block rounded-md bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-bold text-purple-300 border border-purple-500/30">
              Generative 30fps
            </span>
          </div>
        </div>

        {/* 3 Nút Chuyển Trang Gọn */}
        <nav className="flex items-center gap-1 rounded-xl border border-white/10 bg-slate-900/90 p-1">
          {[
            { id: 'studio' as const, label: '🎬 Bàn dựng Video' },
            { id: 'voices_assets' as const, label: '🎙️ Giọng đọc & Tài nguyên' },
            { id: 'settings' as const, label: '⚙️ Cài đặt' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`rounded-lg px-3 py-1 text-xs font-extrabold transition ${
                activeSection === item.id
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Đèn báo trạng thái AI / Voice + Nút + Tạo Video Mới */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-1 text-[11px]">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="font-semibold text-slate-300 max-w-[220px] truncate">
              {aiStatusLabel}
            </span>
            <span className="text-slate-600">|</span>
            <span
              className={`h-2 w-2 rounded-full ${
                voiceConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span className="text-slate-400">Voice Ready</span>
          </div>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-lg hover:opacity-95 transition"
          >
            <Plus className="h-3.5 w-3.5" /> + Tạo Video Mới
          </button>
        </div>
      </header>

      {/* =====================================================================
          MAIN WORKSPACE (calc(100vh - 52px), KHÔNG CUỘN NGOÀI TRANG)
         ===================================================================== */}
      <main className="h-[calc(100vh-52px)] w-full overflow-hidden">
        {activeSection === 'studio' && (
          <StudioWorkspace
            projects={projects}
            onRefreshProjects={loadProjectsAndStatus}
          />
        )}

        {activeSection === 'voices_assets' && (
          <div className="h-full w-full overflow-y-auto px-6 py-5">
            <div className="mx-auto max-w-6xl">
              <VoiceStudioPanel />
            </div>
          </div>
        )}

        {activeSection === 'settings' && (
          <SettingsPanel onConfigSaved={loadProjectsAndStatus} />
        )}
      </main>

      {/* Modal + Tạo Video Mới */}
      <CreateProjectModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={async (projectId, runId) => {
          await loadProjectsAndStatus();
          selectProjectAndRun(projectId, runId, 'pipeline');
        }}
      />
    </div>
  );
}
