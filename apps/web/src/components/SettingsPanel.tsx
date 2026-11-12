'use client';

import React, { useEffect, useState } from 'react';
import {
  Cpu,
  Plus,
  Wifi,
  Save,
  DollarSign,
  Palette,
  Box,
  CheckCircle2,
  AlertTriangle,
  Trash2,
} from 'lucide-react';

export function SettingsPanel() {
  const [providers, setProviders] = useState<any[]>([]);
  const [agentModels, setAgentModels] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [brandKits, setBrandKits] = useState<any[]>([]);
  const [testResult, setTestResult] = useState<Record<string, any>>({});
  const [saveNotice, setSaveNotice] = useState('');

  // Form thêm provider mới
  const [newProvName, setNewProvName] = useState('');
  const [newProvType, setNewProvType] = useState('openai_compatible');
  const [newProvBaseUrl, setNewProvBaseUrl] = useState('https://api.openai.com/v1');
  const [newProvApiKey, setNewProvApiKey] = useState('');
  const [newProvModels, setNewProvModels] = useState('gpt-4o,gpt-4o-mini');

  const loadAll = async () => {
    const [pRes, amRes, sRes] = await Promise.all([
      fetch('/api/providers'),
      fetch('/api/agent-models'),
      fetch('/api/settings'),
    ]);
    if (pRes.ok) setProviders((await pRes.json()).providers || []);
    if (amRes.ok) setAgentModels((await amRes.json()).agentModels || []);
    if (sRes.ok) {
      const d = await sRes.json();
      setSettings(d.settings || {});
      setBrandKits(d.brandKits || []);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleAddProvider = async () => {
    if (!newProvName.trim()) return;
    await fetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newProvName.trim(),
        type: newProvType,
        baseUrl: newProvBaseUrl.trim(),
        apiKey: newProvApiKey.trim(),
        models: newProvModels
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean),
      }),
    });
    setNewProvName('');
    setNewProvApiKey('');
    loadAll();
  };

  const handleTestProvider = async (id: string) => {
    setTestResult((prev) => ({ ...prev, [id]: { loading: true } }));
    const res = await fetch(`/api/providers/${id}/test`, { method: 'POST' });
    const data = await res.json();
    setTestResult((prev) => ({ ...prev, [id]: data }));
    loadAll();
  };

  const handleDeleteProvider = async (id: string) => {
    await fetch(`/api/providers/${id}`, { method: 'DELETE' });
    loadAll();
  };

  const handleApplyPreset = async (preset: 'economy' | 'balanced' | 'quality') => {
    await fetch('/api/agent-models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset, providerId: providers[0]?.id || 'provider_builtin' }),
    });
    await loadAll();
    setSaveNotice(`Đã áp dụng Preset "${preset.toUpperCase()}" cho toàn bộ 17 Agent!`);
    setTimeout(() => setSaveNotice(''), 3500);
  };

  const handleUpdateAgentModelField = (agent: string, field: string, value: any) => {
    setAgentModels((prev) =>
      prev.map((row) => (row.agent === agent ? { ...row, [field]: value } : row))
    );
  };

  const handleSaveAllAgentModels = async () => {
    await fetch('/api/agent-models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentModels }),
    });
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaveNotice('Đã lưu bảng gán Model 17 Agent và cấu hình Ngân sách!');
    setTimeout(() => setSaveNotice(''), 3500);
  };

  return (
    <div className="space-y-6">
      {saveNotice && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/20 p-4 text-xs font-bold text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          {saveNotice}
        </div>
      )}

      {/* 1. Danh sách Provider & Thêm Provider (Mục 9.4) */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/75 p-6 backdrop-blur-xl space-y-5">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <Cpu className="h-5 w-5 text-purple-400" />
            Quản lý AI Providers (Mã hóa API Key chuẩn AES-256-GCM)
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Hỗ trợ OpenAI, Anthropic, Google Gemini, OpenRouter, Ollama và mọi dịch vụ OpenAI-Compatible. API Key được mã hóa bằng `APP_SECRET` và không bao giờ trả về ở dạng rõ.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {providers.map((prov) => {
            const tr = testResult[prov.id];
            return (
              <div
                key={prov.id}
                className="rounded-2xl border border-white/10 bg-slate-950/80 p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{prov.name}</span>
                      <span className="rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-purple-300">
                        {prov.type}
                      </span>
                    </div>
                    <div className="mt-1 text-xs font-mono text-slate-400">{prov.baseUrl}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      API Key: <span className="font-mono text-cyan-300">{prov.apiKeyMasked || 'Chưa đặt'}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      Models ({prov.models?.length || 0}): {(prov.models || []).slice(0, 4).join(', ')}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleTestProvider(prov.id)}
                      className="flex items-center gap-1 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/25"
                    >
                      <Wifi className="h-3.5 w-3.5" />
                      {tr?.loading ? 'Đang test...' : 'Test kết nối'}
                    </button>
                    {prov.id !== 'provider_builtin' && (
                      <button
                        onClick={() => handleDeleteProvider(prov.id)}
                        className="rounded-xl bg-rose-500/15 p-1.5 text-rose-300 hover:bg-rose-500/25"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {tr && !tr.loading && (
                  <div
                    className={`rounded-xl p-2 text-xs flex items-center gap-1.5 ${
                      tr.ok
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {tr.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    <span>{tr.message}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Form thêm Provider */}
        <div className="pt-4 border-t border-white/10 grid grid-cols-1 gap-3 sm:grid-cols-6 items-end">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Tên hiển thị</label>
            <input
              type="text"
              value={newProvName}
              onChange={(e) => setNewProvName(e.target.value)}
              placeholder="VD: Local Ollama / vLLM"
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Loại Provider</label>
            <select
              value={newProvType}
              onChange={(e) => setNewProvType(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
            >
              <option value="openai">openai</option>
              <option value="anthropic">anthropic</option>
              <option value="gemini">gemini</option>
              <option value="openrouter">openrouter</option>
              <option value="ollama">ollama</option>
              <option value="openai_compatible">openai_compatible</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Base URL</label>
            <input
              type="text"
              value={newProvBaseUrl}
              onChange={(e) => setNewProvBaseUrl(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">API Key (Sẽ mã hóa)</label>
            <input
              type="password"
              value={newProvApiKey}
              onChange={(e) => setNewProvApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Models (cách dấu phẩy)</label>
            <input
              type="text"
              value={newProvModels}
              onChange={(e) => setNewProvModels(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </div>
          <button
            onClick={handleAddProvider}
            className="flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 text-xs font-bold text-white"
          >
            <Plus className="h-4 w-4" /> Thêm Provider
          </button>
        </div>
      </div>

      {/* 2. Bảng gán Model theo 17 Agent & Preset (Mục 9.4) */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/75 p-6 backdrop-blur-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-extrabold text-white">
              Bảng Gán Model Theo Vai Trò Từng Agent (17 Dòng)
            </h3>
            <p className="text-xs text-slate-400">
              Chọn nhanh Preset hoặc gán riêng Provider, Model, Nhiệt độ (`temperature`) và Fallback cho từng Agent.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400">Preset tự điền:</span>
            <button
              onClick={() => handleApplyPreset('economy')}
              className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
            >
              🌱 Tiết kiệm
            </button>
            <button
              onClick={() => handleApplyPreset('balanced')}
              className="rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/25"
            >
              ⚖️ Cân bằng (Khuyến nghị)
            </button>
            <button
              onClick={() => handleApplyPreset('quality')}
              className="rounded-xl border border-purple-500/40 bg-purple-500/15 px-3 py-1.5 text-xs font-bold text-purple-300 hover:bg-purple-500/25"
            >
              💎 Chất lượng cao
            </button>
            <button
              onClick={handleSaveAllAgentModels}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 px-4 py-1.5 text-xs font-extrabold text-white shadow"
            >
              <Save className="h-3.5 w-3.5" /> Lưu cấu hình
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Agent</th>
                <th className="py-2.5 px-3">Đề xuất</th>
                <th className="py-2.5 px-3">Provider</th>
                <th className="py-2.5 px-3">Model</th>
                <th className="py-2.5 px-3">Temperature</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {agentModels.map((row) => (
                <tr key={row.agent} className="hover:bg-white/5">
                  <td className="py-2 px-3 font-mono text-slate-400">{row.stepIndex}</td>
                  <td className="py-2 px-3 font-bold text-white">{row.displayName}</td>
                  <td className="py-2 px-3">
                    <span className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-cyan-300">
                      {row.recommendedTier}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <select
                      value={row.providerId}
                      onChange={(e) =>
                        handleUpdateAgentModelField(row.agent, 'providerId', e.target.value)
                      }
                      className="rounded-xl border border-white/15 bg-slate-950 px-2.5 py-1 text-xs text-white"
                    >
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="text"
                      value={row.model}
                      onChange={(e) =>
                        handleUpdateAgentModelField(row.agent, 'model', e.target.value)
                      }
                      className="w-52 rounded-xl border border-white/15 bg-slate-950 px-2.5 py-1 text-xs text-emerald-300 font-mono"
                    />
                  </td>
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      step={0.05}
                      min={0}
                      max={1.5}
                      value={row.temperature}
                      onChange={(e) =>
                        handleUpdateAgentModelField(row.agent, 'temperature', Number(e.target.value))
                      }
                      className="w-20 rounded-xl border border-white/15 bg-slate-950 px-2 py-1 text-xs text-white"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Ngân sách USD mỗi video, Blender MCP & Brand Kits (Mục 7.4, 9.4, 13.1) */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-slate-900/75 p-5 space-y-3">
          <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            Ngân sách & Giới hạn Chi phí (Mục 9.4)
          </h4>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Giới hạn USD mỗi video</label>
            <input
              type="number"
              step={0.1}
              value={settings.budgetLimitUsdPerVideo ?? 1.5}
              onChange={(e) =>
                setSettings({ ...settings, budgetLimitUsdPerVideo: Number(e.target.value) })
              }
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Hành động khi vượt ngân sách</label>
            <select
              value={settings.budgetExceededAction || 'warn'}
              onChange={(e) =>
                setSettings({ ...settings, budgetExceededAction: e.target.value })
              }
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
            >
              <option value="warn">Cảnh báo trong Log và chạy tiếp</option>
              <option value="stop">Tạm dừng Pipeline ngay lập tức</option>
            </select>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/75 p-5 space-y-3">
          <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Box className="h-4 w-4 text-cyan-400" />
            Engine Nâng cao & Blender MCP (Mục 7.4)
          </h4>
          <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(settings.blenderEnabled)}
              onChange={(e) =>
                setSettings({ ...settings, blenderEnabled: e.target.checked })
              }
            />
            Bật Blender MCP cho cảnh 3D điện ảnh (Mặc định tắt)
          </label>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Blender MCP Server URL</label>
            <input
              type="text"
              value={settings.blenderMcpUrl || ''}
              onChange={(e) => setSettings({ ...settings, blenderMcpUrl: e.target.value })}
              placeholder="http://localhost:8765"
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Số cảnh render song song (`MAX_PARALLEL_SCENES`)
            </label>
            <input
              type="number"
              min={1}
              max={8}
              value={settings.maxParallelScenes ?? 2}
              onChange={(e) =>
                setSettings({ ...settings, maxParallelScenes: Number(e.target.value) })
              }
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
            />
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/75 p-5 space-y-3">
          <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Palette className="h-4 w-4 text-pink-400" />
            Brand Kits Đã Lưu ({brandKits.length})
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {brandKits.map((bk) => (
              <div
                key={bk.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950 p-2.5 text-xs"
              >
                <span className="font-bold text-white">{bk.name}</span>
                <div className="flex items-center gap-1">
                  {Object.values(bk.palette || {}).map((hex: any, i) => (
                    <span
                      key={i}
                      className="h-4 w-4 rounded-full border border-white/20"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
