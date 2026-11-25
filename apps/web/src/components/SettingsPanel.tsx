'use client';

import React, { useEffect, useState } from 'react';
import {
  Bot,
  Mic,
  Image as ImageIcon,
  Wifi,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Play,
  Save,
  RefreshCw,
  Trash2,
  Music,
} from 'lucide-react';

type SettingsTabId = 'ai' | 'voice' | 'broll_system';

export function SettingsPanel({ onConfigSaved }: { onConfigSaved?: () => void }) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('ai');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Tab 1: Kết nối AI 1 chạm
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('prov_primary_ai');
  const [connType, setConnType] = useState<'openai_compatible' | 'gemini' | 'anthropic' | 'ollama'>(
    'openai_compatible'
  );
  const [provName, setProvName] = useState('9Router Gateway');
  const [baseUrl, setBaseUrl] = useState('http://localhost:20128/v1');
  const [apiKey, setApiKey] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([
    'AllCombo',
    'ag/gemini-3.8-flash-high',
    'gpt-4o',
  ]);
  const [chosenModel, setChosenModel] = useState('AllCombo');
  const [testingAi, setTestingAi] = useState(false);
  const [applyingQuickSetup, setApplyingQuickSetup] = useState(false);

  // Cài đặt nâng cao 17 Agent (mặc định thu gọn)
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [agentModels, setAgentModels] = useState<any[]>([]);

  // Tab 2: Giọng đọc, Phụ đề & Nhạc nền
  const [voiceStudioUrl, setVoiceStudioUrl] = useState('http://localhost:3900');
  const [voices, setVoices] = useState<any[]>([]);
  const [testingVoice, setTestingVoice] = useState(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [leadCaptionColor, setLeadCaptionColor] = useState('#38BDF8');
  const [accentCaptionColor, setAccentCaptionColor] = useState('#F472B6');
  const [enableBackgroundMusic, setEnableBackgroundMusic] = useState(true);
  const [selectedMusicTrackId, setSelectedMusicTrackId] = useState('auto');
  const [musicTracks, setMusicTracks] = useState<any[]>([]);
  const [previewMusicUrl, setPreviewMusicUrl] = useState<string | null>(null);
  const [previewingMusicId, setPreviewingMusicId] = useState<string | null>(null);

  // Tab 3: Kho Ảnh B-Roll & Hệ thống
  const [enableAutoBroll, setEnableAutoBroll] = useState(true);
  const [pexelsApiKey, setPexelsApiKey] = useState('');
  const [pixabayApiKey, setPixabayApiKey] = useState('');
  const [maxParallelScenes, setMaxParallelScenes] = useState(2);
  const [autoRunAllSteps, setAutoRunAllSteps] = useState(true);

  const showToast = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    setTimeout(() => setNotice(null), 4000);
  };

  const loadAll = async () => {
    const [pRes, amRes, sRes, vRes, mRes] = await Promise.all([
      fetch('/api/providers'),
      fetch('/api/agent-models'),
      fetch('/api/settings'),
      fetch('/api/voices'),
      fetch('/api/music/tracks'),
    ]);

    let loadedProvs: any[] = [];
    if (pRes.ok) {
      loadedProvs = (await pRes.json()).providers || [];
      setProviders(loadedProvs);
    }

    if (amRes.ok) {
      const am = (await amRes.json()).agentModels || [];
      setAgentModels(am);
      const llmRow = am.find((r: any) => r.usesLlm && r.providerId !== 'provider_builtin') || am.find((r: any) => r.usesLlm);
      const preferredProv =
        loadedProvs.find((p) => p.id === llmRow?.providerId && p.id !== 'provider_builtin') ||
        loadedProvs.find((p) => p.name?.toLowerCase().includes('9router')) ||
        loadedProvs.find((p) => p.id !== 'provider_builtin');

      if (preferredProv) {
        setSelectedProviderId(preferredProv.id);
        setProvName(preferredProv.name || '9Router');
        setConnType(
          preferredProv.type === 'gemini' || preferredProv.type === 'anthropic' || preferredProv.type === 'ollama'
            ? preferredProv.type
            : 'openai_compatible'
        );
        setBaseUrl(preferredProv.baseUrl || 'http://localhost:20128/v1');
        if (Array.isArray(preferredProv.models) && preferredProv.models.length > 0) {
          setAvailableModels(preferredProv.models);
          setChosenModel(
            llmRow?.providerId === preferredProv.id && llmRow?.model
              ? llmRow.model
              : preferredProv.models[0]
          );
        }
      }
    }

    if (sRes.ok) {
      const s = (await sRes.json()).settings || {};
      setVoiceStudioUrl(s.voiceStudioUrl || 'http://localhost:3900');
      setLeadCaptionColor(s.leadCaptionColor || '#38BDF8');
      setAccentCaptionColor(s.accentCaptionColor || '#F472B6');
      setEnableBackgroundMusic(s.enableBackgroundMusic !== false);
      setSelectedMusicTrackId(s.selectedMusicTrackId || 'auto');
      setEnableAutoBroll(s.enableAutoBroll !== false);
      setPexelsApiKey(s.pexelsApiKey || '');
      setPixabayApiKey(s.pixabayApiKey || '');
      setMaxParallelScenes(Number(s.maxParallelScenes || 2));
      const approvals = Array.isArray(s.approvalSteps) ? s.approvalSteps : [];
      setAutoRunAllSteps(approvals.length === 0);
    }

    if (vRes.ok) {
      const vd = await vRes.json();
      setVoices(vd.voices || []);
    }

    if (mRes.ok) {
      const md = await mRes.json();
      setMusicTracks(md.tracks || []);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSelectConnectionPreset = (
    presetType: 'openai_compatible' | 'gemini' | 'anthropic' | 'ollama'
  ) => {
    setConnType(presetType);
    if (presetType === 'openai_compatible') {
      const saved9r = providers.find((p) => p.name?.toLowerCase().includes('9router'));
      if (saved9r) {
        setSelectedProviderId(saved9r.id);
        setProvName(saved9r.name);
        setBaseUrl(saved9r.baseUrl);
        if (saved9r.models?.length) setAvailableModels(saved9r.models);
      } else {
        setSelectedProviderId('prov_9router');
        setProvName('9router / OpenAI-Compatible');
        setBaseUrl('http://localhost:20128/v1');
      }
    } else if (presetType === 'gemini') {
      setSelectedProviderId('provider_gemini');
      setProvName('Google Gemini');
      setBaseUrl('https://generativelanguage.googleapis.com/v1beta');
      setChosenModel('gemini-2.5-flash');
    } else if (presetType === 'anthropic') {
      setSelectedProviderId('provider_anthropic');
      setProvName('Anthropic Claude');
      setBaseUrl('https://api.anthropic.com/v1');
      setChosenModel('claude-3-7-sonnet-latest');
    } else {
      setSelectedProviderId('prov_ollama');
      setProvName('Ollama Local');
      setBaseUrl('http://localhost:11434/v1');
      setChosenModel('qwen2.5:14b');
    }
  };

  const handleTestAndFetchModels = async () => {
    setTestingAi(true);
    try {
      const res = await fetch('/api/settings/quick-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: selectedProviderId,
          name: provName,
          type: connType,
          baseUrl,
          apiKey,
          model: chosenModel,
        }),
      });
      const data = await res.json();
      const ct = data.connectionTest;
      if (ct?.models?.length) {
        setAvailableModels(ct.models);
        if (!ct.models.includes(chosenModel)) {
          setChosenModel(ct.models[0]);
        }
      }
      showToast(Boolean(ct?.ok), ct?.message || 'Đã kiểm tra kết nối Provider');
      await loadAll();
    } catch (err: any) {
      showToast(false, err?.message || 'Không thể kết nối tới API');
    } finally {
      setTestingAi(false);
    }
  };

  const handleQuickSetupSave = async () => {
    setApplyingQuickSetup(true);
    try {
      const res = await fetch('/api/settings/quick-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: selectedProviderId,
          name: provName,
          type: connType,
          baseUrl,
          apiKey,
          model: chosenModel,
          models: availableModels,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(
          true,
          `Đã lưu & áp dụng model "${chosenModel}" (${provName}) cho toàn bộ hệ thống AI Agents!`
        );
        await loadAll();
        onConfigSaved?.();
      }
    } finally {
      setApplyingQuickSetup(false);
    }
  };

  const handleSaveAdvancedAgentModels = async () => {
    await fetch('/api/agent-models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentModels }),
    });
    showToast(true, 'Đã lưu bảng phân chia Model nâng cao cho 17 bước!');
    onConfigSaved?.();
  };

  const handleTestVoice = async () => {
    setTestingVoice(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceStudioUrl }),
      });
      const res = await fetch('/api/voices/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceStudioUrl }),
      });
      const data = await res.json();
      showToast(Boolean(data.ok), data.message || 'Đã kiểm tra kết nối Voice Studio');
      const vRefresh = await fetch('/api/voices?refresh=true');
      if (vRefresh.ok) setVoices((await vRefresh.json()).voices || []);
      onConfigSaved?.();
    } finally {
      setTestingVoice(false);
    }
  };

  const handleToggleVoice = async (voice: any) => {
    await fetch(`/api/voices/${encodeURIComponent(voice.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...voice, enabled: !voice.enabled }),
    });
    const vRes = await fetch('/api/voices');
    if (vRes.ok) setVoices((await vRes.json()).voices || []);
  };

  const handlePreviewVoice = async (voiceId: string) => {
    setPreviewingVoiceId(voiceId);
    try {
      const res = await fetch('/api/voices/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId }),
      });
      const d = await res.json();
      if (d.audioUrl) setPreviewAudioUrl(d.audioUrl);
    } finally {
      setPreviewingVoiceId(null);
    }
  };

  const handleDeleteVoice = async (voice: any) => {
    if (!window.confirm(`Xóa giọng "${voice.name}" khỏi danh sách?`)) return;
    const res = await fetch(`/api/voices/${encodeURIComponent(voice.voiceId || voice.id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      const data = await res.json();
      setVoices(data.voices || []);
      showToast(true, `Đã xóa giọng "${voice.name}" khỏi danh sách!`);
    }
  };

  const handlePreviewMusic = async (trackId: string) => {
    setPreviewingMusicId(trackId);
    try {
      const res = await fetch('/api/music/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId }),
      });
      const d = await res.json();
      if (d.audioUrl) setPreviewMusicUrl(`${d.audioUrl}?t=${Date.now()}`);
    } finally {
      setPreviewingMusicId(null);
    }
  };

  const handleSaveVoiceAndCaptions = async () => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voiceStudioUrl,
        leadCaptionColor,
        accentCaptionColor,
        enableBackgroundMusic,
        selectedMusicTrackId,
      }),
    });
    showToast(true, 'Đã lưu cấu hình Giọng đọc, Phụ đề & Nhạc nền!');
    onConfigSaved?.();
  };

  const handleSaveBrollAndSystem = async () => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enableAutoBroll,
        pexelsApiKey: pexelsApiKey.trim(),
        pixabayApiKey: pixabayApiKey.trim(),
        maxParallelScenes: Number(maxParallelScenes),
        approvalSteps: autoRunAllSteps ? [] : [6, 8, 17],
        autoApproveAll: autoRunAllSteps,
      }),
    });
    showToast(true, 'Đã lưu cấu hình Kho B-Roll & Tùy chọn chạy tự động!');
    onConfigSaved?.();
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-slate-950 px-6 py-4">
      <div className="mx-auto w-full max-w-5xl flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
        {/* Thanh 3 Tab Cài Đặt + Thông báo */}
        <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-slate-900/90 p-1">
            {[
              { id: 'ai' as const, label: '🤖 Kết nối AI (Thiết lập 1 Chạm)', icon: Bot },
              { id: 'voice' as const, label: '🎙️ Giọng đọc & Nhạc nền', icon: Mic },
              { id: 'broll_system' as const, label: '🖼️ Kho Ảnh B-Roll & Hệ thống', icon: ImageIcon },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                  activeTab === t.id
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {notice && (
            <div
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold ${
                notice.ok
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
              }`}
            >
              {notice.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <span>{notice.text}</span>
            </div>
          )}
        </div>

        {/* Nội dung từng Tab cuộn gọn bên trong thẻ */}
        <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-slate-900/75 p-5">
          {/* TAB 1: KẾT NỐI AI 1 CHẠM */}
          {activeTab === 'ai' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Thiết lập AI 1 Chạm (Hỗ trợ 9router / AllCombo / Gemini / Claude / Ollama)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Chỉ cần điền thông tin cổng AI bạn đang dùng, lấy danh sách Model và bấm 1 nút để áp dụng cho toàn bộ 17 bước.
                </p>
              </div>

              {/* Bước 1: Chọn loại kết nối hoặc Provider đã lưu */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-cyan-300">
                  Bước 1. Chọn dịch vụ kết nối AI
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { id: 'openai_compatible' as const, title: '9router / OpenAI-Compatible', desc: 'AllCombo, vLLM, OpenRouter...' },
                    { id: 'gemini' as const, title: 'Google Gemini', desc: 'Gemini 2.5 Pro / Flash' },
                    { id: 'anthropic' as const, title: 'Anthropic Claude', desc: 'Claude 3.7 Sonnet' },
                    { id: 'ollama' as const, title: 'Ollama Local', desc: 'Chạy nội bộ miễn phí' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectConnectionPreset(item.id)}
                      className={`rounded-xl border p-3 text-left transition ${
                        connType === item.id
                          ? 'border-purple-500 bg-purple-500/15 text-white'
                          : 'border-white/10 bg-slate-950/70 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="text-xs font-extrabold">{item.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{item.desc}</div>
                    </button>
                  ))}
                </div>

                {providers.filter((p) => p.id !== 'provider_builtin').length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[11px] text-slate-400">Đã lưu trên máy:</span>
                    {providers
                      .filter((p) => p.id !== 'provider_builtin')
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedProviderId(p.id);
                            setProvName(p.name);
                            setBaseUrl(p.baseUrl || '');
                            if (p.models?.length) {
                              setAvailableModels(p.models);
                              setChosenModel(p.models[0]);
                            }
                          }}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                            selectedProviderId === p.id
                              ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                              : 'border-white/10 bg-slate-950 text-slate-400 hover:text-white'
                          }`}
                        >
                          {p.name} ({p.baseUrl})
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {/* Bước 2: Điền Base URL + API Key */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-cyan-300">
                  Bước 2. Nhập địa chỉ API Base URL & API Key
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] text-slate-400 mb-1">Tên gợi nhớ</label>
                    <input
                      type="text"
                      value={provName}
                      onChange={(e) => setProvName(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] text-slate-400 mb-1">API Base URL</label>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      placeholder="http://localhost:20128/v1"
                      className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs font-mono text-white"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] text-slate-400 mb-1">
                      API Key (để trống nếu giữ nguyên)
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={handleTestAndFetchModels}
                      disabled={testingAi}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/25"
                    >
                      <Wifi className="h-3.5 w-3.5" />
                      {testingAi ? 'Đang lấy...' : 'Kiểm tra & Lấy Model'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Bước 3: Chọn Model & Áp dụng 1 chạm */}
              <div className="rounded-2xl border border-purple-500/30 bg-slate-950/80 p-4 space-y-3">
                <div className="text-xs font-bold text-cyan-300">
                  Bước 3. Chọn Model (hoặc gõ trực tiếp tên như `AllCombo` / `ag/gemini-3.8-flash-high`)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <div className="sm:col-span-4">
                    <select
                      value={availableModels.includes(chosenModel) ? chosenModel : ''}
                      onChange={(e) => e.target.value && setChosenModel(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-xs text-white"
                    >
                      <option value="" disabled>
                        -- Chọn từ danh sách ({availableModels.length} models) --
                      </option>
                      {availableModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <input
                      type="text"
                      value={chosenModel}
                      onChange={(e) => setChosenModel(e.target.value)}
                      placeholder="Nhập tên model (VD: AllCombo)"
                      className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-xs font-mono text-amber-300"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <button
                      type="button"
                      onClick={handleQuickSetupSave}
                      disabled={applyingQuickSetup}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 px-4 py-2.5 text-xs font-extrabold text-white shadow-lg hover:opacity-95"
                    >
                      <Sparkles className="h-4 w-4" />
                      {applyingQuickSetup
                        ? 'Đang áp dụng...'
                        : '✨ Lưu & Dùng Model này cho toàn bộ hệ thống'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Thanh thu gọn Cài đặt nâng cao 17 Agent */}
              <div className="rounded-xl border border-white/10 bg-slate-950/60">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-slate-300 hover:text-white"
                >
                  <span>🔧 Cài đặt nâng cao: Phân chia Model riêng cho từng Agent (17 bước)</span>
                  {advancedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>

                {advancedOpen && (
                  <div className="border-t border-white/10 p-4 space-y-3">
                    <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                      {agentModels.map((row) => (
                        <div
                          key={row.agent}
                          className="grid grid-cols-12 gap-2 items-center rounded-lg bg-slate-900/90 px-3 py-1.5 text-xs"
                        >
                          <div className="col-span-5 font-bold text-slate-200 truncate">
                            {row.displayName}
                          </div>
                          <div className="col-span-3">
                            <select
                              disabled={!row.usesLlm}
                              value={row.providerId}
                              onChange={(e) =>
                                setAgentModels((prev) =>
                                  prev.map((r) =>
                                    r.agent === row.agent ? { ...r, providerId: e.target.value } : r
                                  )
                                )
                              }
                              className="w-full rounded border border-white/10 bg-slate-950 px-2 py-1 text-[11px] text-white disabled:opacity-40"
                            >
                              {providers.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-4">
                            <input
                              disabled={!row.usesLlm}
                              type="text"
                              value={row.model}
                              onChange={(e) =>
                                setAgentModels((prev) =>
                                  prev.map((r) =>
                                    r.agent === row.agent ? { ...r, model: e.target.value } : r
                                  )
                                )
                              }
                              className="w-full rounded border border-white/10 bg-slate-950 px-2 py-1 text-[11px] font-mono text-cyan-300 disabled:opacity-40"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveAdvancedAgentModels}
                        className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white"
                      >
                        <Save className="h-3.5 w-3.5" /> Lưu bảng phân chia nâng cao
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: GIỌNG ĐỌC & PHỤ ĐỀ */}
          {activeTab === 'voice' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-6">
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Địa chỉ máy chủ Voice Studio (OpenAI TTS/ASR Compatible)
                  </label>
                  <input
                    type="text"
                    value={voiceStudioUrl}
                    onChange={(e) => setVoiceStudioUrl(e.target.value)}
                    placeholder="http://192.168.5.18:3900 hoặc http://localhost:3900"
                    className="w-full rounded-xl border border-white/15 bg-slate-950 px-3.5 py-2 text-xs font-mono text-white"
                  />
                </div>
                <div className="sm:col-span-3">
                  <button
                    type="button"
                    onClick={handleTestVoice}
                    disabled={testingVoice}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-300"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${testingVoice ? 'animate-spin' : ''}`} />
                    {testingVoice ? 'Đang kiểm tra...' : 'Kiểm tra & Đồng bộ giọng'}
                  </button>
                </div>
                <div className="sm:col-span-3">
                  <button
                    type="button"
                    onClick={handleSaveVoiceAndCaptions}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-3 py-2 text-xs font-extrabold text-white"
                  >
                    <Save className="h-3.5 w-3.5" /> Lưu cấu hình Giọng
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-xl border border-white/10 bg-slate-950/70 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">Màu phụ đề vai Dẫn chính (Lead)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={leadCaptionColor}
                      onChange={(e) => setLeadCaptionColor(e.target.value)}
                      className="h-7 w-10 cursor-pointer bg-transparent"
                    />
                    <span className="text-xs font-mono text-cyan-300">{leadCaptionColor}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">Màu phụ đề vai Điểm nhấn (Accent)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accentCaptionColor}
                      onChange={(e) => setAccentCaptionColor(e.target.value)}
                      className="h-7 w-10 cursor-pointer bg-transparent"
                    />
                    <span className="text-xs font-mono text-pink-300">{accentCaptionColor}</span>
                  </div>
                </div>
              </div>

              {previewAudioUrl && (
                <div className="flex items-center gap-3 rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-4 py-2">
                  <span className="text-xs font-bold text-cyan-300">Nghe thử:</span>
                  <audio controls autoPlay src={previewAudioUrl} className="h-8 flex-1" />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {voices.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/80 px-3.5 py-2.5"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-white">{v.name}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            v.gender === 'nu'
                              ? 'bg-pink-500/20 text-pink-300'
                              : 'bg-sky-500/20 text-sky-300'
                          }`}
                        >
                          {v.gender === 'nu' ? 'Nữ' : v.gender === 'nam' ? 'Nam' : 'Auto'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">ID: {v.voiceId}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePreviewVoice(v.voiceId || v.id)}
                        disabled={previewingVoiceId === (v.voiceId || v.id)}
                        className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:bg-white/10"
                      >
                        <Play className="h-3 w-3" />
                        {previewingVoiceId === (v.voiceId || v.id) ? '...' : 'Nghe thử'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteVoice(v)}
                        title="Xóa giọng đọc này"
                        className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-1.5 text-rose-300 hover:bg-rose-500/25"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="checkbox"
                        checked={Boolean(v.enabled)}
                        onChange={() => handleToggleVoice(v)}
                        className="h-4 w-4 accent-emerald-500 cursor-pointer"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Kho Nhạc Nền Miễn Phí (Bật/Tắt + Nghe thử + Chọn bản nhạc) */}
              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Music className="h-4 w-4 text-purple-400" />
                    <div>
                      <div className="text-xs font-extrabold text-white">
                        Kho Nhạc Nền Miễn Phí (Tự động giảm âm lượng khi có giọng đọc)
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Tích chọn có dùng nhạc nền hay không, hoặc nghe thử và chọn cố định bản nhạc yêu thích
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableBackgroundMusic}
                      onChange={(e) => setEnableBackgroundMusic(e.target.checked)}
                      className="h-4 w-4 accent-emerald-500"
                    />
                    <span className="text-xs font-bold text-white">
                      {enableBackgroundMusic ? 'Đang bật nhạc nền' : 'Đã tắt nhạc nền'}
                    </span>
                  </label>
                </div>

                {previewMusicUrl && (
                  <div className="flex items-center gap-3 rounded-xl border border-purple-500/30 bg-purple-950/30 px-4 py-2">
                    <span className="text-xs font-bold text-purple-300">Nghe thử nhạc:</span>
                    <audio controls autoPlay src={previewMusicUrl} className="h-8 flex-1" />
                  </div>
                )}

                {enableBackgroundMusic && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label
                      className={`sm:col-span-2 flex items-center justify-between rounded-xl border px-3.5 py-2 cursor-pointer ${
                        selectedMusicTrackId === 'auto'
                          ? 'border-purple-500 bg-purple-500/15'
                          : 'border-white/10 bg-slate-900/70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="musicTrack"
                          checked={selectedMusicTrackId === 'auto'}
                          onChange={() => setSelectedMusicTrackId('auto')}
                          className="accent-purple-500"
                        />
                        <div>
                          <div className="text-xs font-extrabold text-white">
                            ✨ Tự động chọn nhạc theo chủ đề video
                          </div>
                          <div className="text-[11px] text-slate-400">
                            AI tự phối nhạc công nghệ, tin nóng, tài chính hay kể chuyện phù hợp từng bài
                          </div>
                        </div>
                      </div>
                    </label>

                    {musicTracks.map((tr) => (
                      <div
                        key={tr.id}
                        className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                          selectedMusicTrackId === tr.id
                            ? 'border-cyan-400 bg-cyan-500/15'
                            : 'border-white/10 bg-slate-900/70'
                        }`}
                      >
                        <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                          <input
                            type="radio"
                            name="musicTrack"
                            checked={selectedMusicTrackId === tr.id}
                            onChange={() => setSelectedMusicTrackId(tr.id)}
                            className="accent-cyan-400 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold text-white truncate">
                              {tr.title}{' '}
                              <span className="text-[10px] font-mono text-cyan-300">({tr.bpm} BPM)</span>
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">{tr.description}</div>
                          </div>
                        </label>
                        <button
                          type="button"
                          onClick={() => handlePreviewMusic(tr.id)}
                          disabled={previewingMusicId === tr.id}
                          className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:bg-white/10 shrink-0"
                        >
                          <Play className="h-3 w-3" />
                          {previewingMusicId === tr.id ? '...' : 'Nghe thử'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: KHO ẢNH B-ROLL & HỆ THỐNG */}
          {activeTab === 'broll_system' && (
            <div className="space-y-4">
              <label className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/80 p-4 cursor-pointer">
                <div>
                  <div className="text-xs font-extrabold text-white">
                    Tự động lấy ảnh thật từ bài báo & Kho ảnh Wikimedia Commons miễn phí
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Quét toàn bộ thẻ &lt;img&gt; trong bài báo gốc và tìm ảnh chất lượng cao theo từ khóa cảnh mà không cần API Key
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={enableAutoBroll}
                  onChange={(e) => setEnableAutoBroll(e.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Pexels API Key (Tùy chọn — không bắt buộc)
                  </label>
                  <input
                    type="password"
                    value={pexelsApiKey}
                    onChange={(e) => setPexelsApiKey(e.target.value)}
                    placeholder="Nhập nếu muốn ưu tiên ảnh/video từ Pexels..."
                    className="w-full rounded-xl border border-white/15 bg-slate-950 px-3.5 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Pixabay API Key (Tùy chọn — không bắt buộc)
                  </label>
                  <input
                    type="password"
                    value={pixabayApiKey}
                    onChange={(e) => setPixabayApiKey(e.target.value)}
                    placeholder="Nhập nếu muốn bổ sung nguồn Pixabay..."
                    className="w-full rounded-xl border border-white/15 bg-slate-950 px-3.5 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-slate-950/80 p-3.5 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Số luồng kết xuất cảnh song song</div>
                    <div className="text-[11px] text-slate-400">Khuyến nghị 2 luồng trên máy cá nhân</div>
                  </div>
                  <select
                    value={maxParallelScenes}
                    onChange={(e) => setMaxParallelScenes(Number(e.target.value))}
                    className="rounded-lg border border-white/15 bg-slate-900 px-3 py-1.5 text-xs text-white"
                  >
                    <option value={1}>1 luồng (Tiết kiệm RAM)</option>
                    <option value={2}>2 luồng (Cân bằng)</option>
                    <option value={3}>3 luồng (Nhanh)</option>
                    <option value={4}>4 luồng (Tối đa)</option>
                  </select>
                </div>

                <label className="rounded-xl border border-white/10 bg-slate-950/80 p-3.5 flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-white">Chạy tự động 1 mạch (Bước 1 → 17)</div>
                    <div className="text-[11px] text-slate-400">Không dừng chờ bấm duyệt thủ công giữa chừng</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoRunAllSteps}
                    onChange={(e) => setAutoRunAllSteps(e.target.checked)}
                    className="h-4 w-4 accent-purple-500"
                  />
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveBrollAndSystem}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-5 py-2.5 text-xs font-extrabold text-white shadow"
                >
                  <Save className="h-4 w-4" /> Lưu cấu hình B-Roll & Hệ thống
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
