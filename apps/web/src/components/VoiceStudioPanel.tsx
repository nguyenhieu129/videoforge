'use client';

import React, { useEffect, useState } from 'react';
import {
  Mic,
  RefreshCw,
  Wifi,
  Play,
  Volume2,
  Users,
  Plus,
  CheckCircle2,
  AlertCircle,
  Sliders,
} from 'lucide-react';

export function VoiceStudioPanel() {
  const [voiceStudioUrl, setVoiceStudioUrl] = useState('http://192.168.5.18:3900');
  const [showAliases, setShowAliases] = useState(false);
  const [voices, setVoices] = useState<any[]>([]);
  const [engines, setEngines] = useState<any[]>([]);
  const [previewNextCast, setPreviewNextCast] = useState<any>(null);
  const [connectionStatus, setConnectionStatus] = useState<any>(null);
  const [testingConn, setTestingConn] = useState(false);

  // Form nghe thử
  const [selectedVoiceId, setSelectedVoiceId] = useState('7cc37272');
  const [selectedEngine, setSelectedEngine] = useState('omnivoice');
  const [sampleText, setSampleText] = useState(
    'Xin chào, đây là giọng đọc tự động của hệ thống VideoForge kết nối trực tiếp tới Voice Studio.'
  );
  const [speed, setSpeed] = useState(1.0);
  const [numStep, setNumStep] = useState(16);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [synthesizing, setSynthesizing] = useState(false);

  // Cấu hình Voice Cast
  const [castSelectionMode, setCastSelectionMode] = useState<
    'auto_rotate' | 'lock_one' | 'fixed_pair' | 'advanced_scene'
  >('auto_rotate');
  const [avoidLastN, setAvoidLastN] = useState(3);
  const [leadCaptionColor, setLeadCaptionColor] = useState('#38BDF8');
  const [accentCaptionColor, setAccentCaptionColor] = useState('#F472B6');

  // Thêm profile giọng mới thủ công
  const [newVoiceId, setNewVoiceId] = useState('');
  const [newVoiceName, setNewVoiceName] = useState('giong_3_nu');
  const [newVoiceConsent, setNewVoiceConsent] = useState('Đã được chủ sở hữu giọng đồng ý');

  const loadVoiceData = async (refresh = false, includeAliases = showAliases) => {
    const res = await fetch(
      `/api/voices?refresh=${refresh ? 'true' : 'false'}&includeAliases=${includeAliases ? 'true' : 'false'}`
    );
    if (res.ok) {
      const data = await res.json();
      setVoiceStudioUrl(data.voiceStudioUrl || 'http://192.168.5.18:3900');
      setVoices(data.voices || []);
      setEngines(data.engines || []);
      setPreviewNextCast(data.previewNextCast);
    }
  };

  useEffect(() => {
    loadVoiceData(false, showAliases);
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          setVoiceStudioUrl(d.settings.voiceStudioUrl || 'http://192.168.5.18:3900');
          setCastSelectionMode(d.settings.castSelectionMode || 'auto_rotate');
          setAvoidLastN(Number(d.settings.avoidLastNVideos ?? 3));
          setLeadCaptionColor(d.settings.leadCaptionColor || '#38BDF8');
          setAccentCaptionColor(d.settings.accentCaptionColor || '#F472B6');
        }
      });
  }, [showAliases]);

  const handleTestConnection = async () => {
    setTestingConn(true);
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
      setConnectionStatus(data);
    } finally {
      setTestingConn(false);
    }
  };

  const handlePreviewSingle = async (voiceIdOverride?: string) => {
    setSynthesizing(true);
    try {
      const res = await fetch('/api/voices/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceId: voiceIdOverride || selectedVoiceId,
          model: selectedEngine,
          text: sampleText,
          speed,
          numStep,
        }),
      });
      const data = await res.json();
      if (data.audioUrl) setPreviewAudioUrl(data.audioUrl);
    } finally {
      setSynthesizing(false);
    }
  };

  const handlePreviewCastPair = async () => {
    setSynthesizing(true);
    try {
      const res = await fetch('/api/voices/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pairMode: true,
          leadVoiceId: previewNextCast?.lead?.id || '7cc37272',
          accentVoiceId: previewNextCast?.accent?.id || 'giong_2_nu',
        }),
      });
      const data = await res.json();
      if (data.audioUrl) setPreviewAudioUrl(data.audioUrl);
    } finally {
      setSynthesizing(false);
    }
  };

  const handleUpdateVoiceRow = async (voice: any, patch: Record<string, any>) => {
    await fetch(`/api/voices/${encodeURIComponent(voice.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...voice, ...patch }),
    });
    loadVoiceData(false, showAliases);
  };

  const handleSaveCastSettings = async () => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voiceStudioUrl,
        castSelectionMode,
        avoidLastNVideos: avoidLastN,
        leadCaptionColor,
        accentCaptionColor,
      }),
    });
    loadVoiceData(false, showAliases);
  };

  const handleAddProfile = async () => {
    if (!newVoiceName.trim()) return;
    const id = newVoiceId.trim() || newVoiceName.trim();
    await fetch(`/api/voices/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newVoiceName.trim(),
        enabled: true,
        weight: 1.0,
        tags: ['tin tức', 'clone'],
        consentNote: newVoiceConsent,
      }),
    });
    setNewVoiceId('');
    loadVoiceData(false, showAliases);
  };

  return (
    <div className="space-y-6">
      {/* Kết nối Voice Studio (Mục 8.1 & 8.4) */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/75 p-6 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
              <Mic className="h-5 w-5 text-cyan-400" />
              Voice Studio & Quản lý Voice Pool (OpenAI Audio Compatible)
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Kết nối trực tiếp tới máy chủ mạng LAN nội bộ (`/v1/audio/voices`, `/v1/audio/speech`, `/v1/audio/transcriptions`).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={voiceStudioUrl}
              onChange={(e) => setVoiceStudioUrl(e.target.value)}
              className="w-72 rounded-2xl border border-white/15 bg-slate-950 px-4 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
              placeholder="http://192.168.5.18:3900"
            />
            <button
              onClick={handleTestConnection}
              disabled={testingConn}
              className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow hover:opacity-95"
            >
              <Wifi className="h-3.5 w-3.5" />
              {testingConn ? 'Đang kiểm tra...' : 'Test kết nối'}
            </button>
            <button
              onClick={() => loadVoiceData(true, showAliases)}
              className="flex items-center gap-1.5 rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-white/10"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Làm mới danh sách giọng
            </button>
          </div>
        </div>

        {connectionStatus && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-2xl p-3 text-xs ${
              connectionStatus.ok
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
            }`}
          >
            {connectionStatus.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{connectionStatus.message}</span>
          </div>
        )}
      </div>

      {/* Bảng Voice Cast & Nghe thử cả cặp (Mục 8.3 & 8.4) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-3xl border border-white/10 bg-slate-900/75 p-6 backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-400" />
              Cấu hình Voice Cast (Phối hợp 2 giọng Nam & Nữ)
            </h3>
            <button
              onClick={handlePreviewCastPair}
              disabled={synthesizing}
              className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 text-xs font-bold text-white shadow"
            >
              <Volume2 className="h-4 w-4" />
              Nghe thử cả cặp (Có đổi giọng & Crossfade)
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Chế độ chọn giọng (Mục 8.3.1)
              </label>
              <select
                value={castSelectionMode}
                onChange={(e) => setCastSelectionMode(e.target.value as any)}
                className="w-full rounded-2xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
              >
                <option value="auto_rotate">1. Tự động xoay (Mặc định)</option>
                <option value="lock_one">2. Khóa một vai, xoay vai còn lại</option>
                <option value="fixed_pair">3. Cố định cả cặp (Series)</option>
                <option value="advanced_scene">4. Xoay nâng cao theo cảnh</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Số video gần nhất cần tránh lặp (N)
              </label>
              <input
                type="number"
                min={0}
                max={10}
                value={avoidLastN}
                onChange={(e) => setAvoidLastN(Number(e.target.value))}
                className="w-full rounded-2xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Màu phụ đề vai Lead (Dẫn chính)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={leadCaptionColor}
                  onChange={(e) => setLeadCaptionColor(e.target.value)}
                  className="h-8 w-12 rounded cursor-pointer bg-transparent"
                />
                <span className="text-xs font-mono text-sky-300">{leadCaptionColor}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Màu phụ đề vai Accent (Điểm nhấn)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentCaptionColor}
                  onChange={(e) => setAccentCaptionColor(e.target.value)}
                  className="h-8 w-12 rounded cursor-pointer bg-transparent"
                />
                <span className="text-xs font-mono text-pink-300">{accentCaptionColor}</span>
              </div>
            </div>
          </div>

          {previewNextCast && (
            <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-3.5 text-xs">
              <div className="font-bold text-purple-300">Dự kiến cặp giọng cho Video tiếp theo:</div>
              <div className="mt-1 text-slate-200">{previewNextCast.reason}</div>
            </div>
          )}

          <button
            onClick={handleSaveCastSettings}
            className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/20"
          >
            💾 Lưu cấu hình Voice Cast
          </button>
        </div>

        {/* Phòng thu Nghe thử & Tải mẫu (Mục 8.5) */}
        <div className="lg:col-span-5 rounded-3xl border border-white/10 bg-slate-900/75 p-6 backdrop-blur-xl space-y-4">
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <Sliders className="h-4 w-4 text-pink-400" />
            Nghe thử & Tinh chỉnh thông số OmniVoice
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Chọn Giọng</label>
              <select
                value={selectedVoiceId}
                onChange={(e) => setSelectedVoiceId(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.gender})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Engine TTS (`available: true`)</label>
              <select
                value={selectedEngine}
                onChange={(e) => setSelectedEngine(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
              >
                {engines.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <textarea
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            rows={3}
            className="w-full rounded-2xl border border-white/15 bg-slate-950 p-3 text-xs text-white"
            placeholder="Nhập câu tiếng Việt cần nghe thử (tối đa 500 ký tự/segment)..."
          />

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-400">Tốc độ (`speed`: {speed}x)</label>
              <input
                type="range"
                min={0.9}
                max={1.15}
                step={0.01}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full mt-1"
              />
            </div>
            <div>
              <label className="text-slate-400">Chất lượng (`num_step`: {numStep})</label>
              <select
                value={numStep}
                onChange={(e) => setNumStep(Number(e.target.value))}
                className="w-full mt-1 rounded-xl border border-white/15 bg-slate-950 px-2 py-1 text-xs text-white"
              >
                <option value={16}>16 (Xem trước nhanh)</option>
                <option value={32}>32 (Chất lượng cao bản cuối)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handlePreviewSingle()}
              disabled={synthesizing}
              className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 px-4 py-2 text-xs font-bold text-white"
            >
              <Play className="h-3.5 w-3.5" />
              {synthesizing ? 'Đang tổng hợp...' : 'Nghe thử giọng này'}
            </button>
            {previewAudioUrl && (
              <audio controls autoPlay src={previewAudioUrl} className="h-9 flex-1" />
            )}
          </div>
        </div>
      </div>

      {/* Bảng Voice Pool (Mục 8.4: bật/tắt từng giọng, trọng số, thẻ, sửa giới tính, số lần dùng gần đây, công tắc Hiện alias OpenAI) */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/75 p-6 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-extrabold text-white">
              Bảng Voice Pool (Ưu tiên giọng Clone lên đầu)
            </h3>
            <p className="text-xs text-slate-400">
              Quy ước tự nhận diện: hậu tố <code className="text-cyan-300">_nam</code> là Nam, <code className="text-pink-300">_nu</code> là Nữ. Các giọng không theo quy ước có thể gán giới tính thủ công.
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showAliases}
              onChange={(e) => setShowAliases(e.target.checked)}
              className="rounded border-white/20 bg-slate-900"
            />
            Hiện alias OpenAI (13 giọng alloy, nova... không vào Pool tự động)
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="py-2.5 px-3">Pool</th>
                <th className="py-2.5 px-3">ID / Tên Giọng</th>
                <th className="py-2.5 px-3">Loại</th>
                <th className="py-2.5 px-3">Giới tính (`_nam`/`_nu`)</th>
                <th className="py-2.5 px-3">Trọng số (`weight`)</th>
                <th className="py-2.5 px-3">Thẻ (`tags`)</th>
                <th className="py-2.5 px-3">Dùng gần đây</th>
                <th className="py-2.5 px-3">Ghi chú đồng ý (Consent)</th>
                <th className="py-2.5 px-3">Nghe thử</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {voices.map((v) => (
                <tr key={v.id} className="hover:bg-white/5">
                  <td className="py-2.5 px-3">
                    <input
                      type="checkbox"
                      disabled={v.type === 'openai_alias'}
                      checked={Boolean(v.enabled)}
                      onChange={(e) => handleUpdateVoiceRow(v, { enabled: e.target.checked })}
                    />
                  </td>
                  <td className="py-2.5 px-3 font-bold text-white">
                    {v.name}{' '}
                    <span className="font-mono text-[11px] text-slate-400">({v.id})</span>
                  </td>
                  <td className="py-2.5 px-3">
                    {v.cloned ? (
                      <span className="rounded-full bg-purple-500/20 px-2.5 py-0.5 text-[11px] font-bold text-purple-300 border border-purple-500/30">
                        Clone Profile
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] text-slate-400">
                        {v.type}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <select
                      disabled={v.type === 'openai_alias'}
                      value={v.genderOverride || v.gender}
                      onChange={(e) =>
                        handleUpdateVoiceRow(v, {
                          genderOverride: e.target.value === 'unclassified' ? null : e.target.value,
                        })
                      }
                      className="rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs text-white"
                    >
                      <option value="nam">Nam (_nam)</option>
                      <option value="nu">Nữ (_nu)</option>
                      <option value="unclassified">Chưa phân loại</option>
                    </select>
                  </td>
                  <td className="py-2.5 px-3">
                    <input
                      type="number"
                      step={0.1}
                      min={0.1}
                      max={5}
                      disabled={v.type === 'openai_alias'}
                      value={v.weight}
                      onChange={(e) => handleUpdateVoiceRow(v, { weight: Number(e.target.value) })}
                      className="w-16 rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs text-white"
                    />
                  </td>
                  <td className="py-2.5 px-3 text-cyan-300">
                    {(v.tags || []).join(', ')}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-300">
                    {v.recentUsageCount || 0} video
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 max-w-[180px] truncate">
                    {v.consentNote || '—'}
                  </td>
                  <td className="py-2.5 px-3">
                    <button
                      onClick={() => handlePreviewSingle(v.id)}
                      className="rounded-lg bg-cyan-500/20 px-2.5 py-1 text-xs font-bold text-cyan-300 hover:bg-cyan-500/30"
                    >
                      ▶ Nghe
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Thêm nhanh Profile giọng mới (ví dụ thêm giong_2_nu hoặc lan_nu) */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Voice ID (tùy chọn)</label>
            <input
              type="text"
              value={newVoiceId}
              onChange={(e) => setNewVoiceId(e.target.value)}
              placeholder="VD: 8ab49102"
              className="rounded-xl border border-white/15 bg-slate-950 px-3 py-1.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Tên Profile (`_nam` / `_nu`)</label>
            <input
              type="text"
              value={newVoiceName}
              onChange={(e) => setNewVoiceName(e.target.value)}
              placeholder="VD: lan_nu"
              className="rounded-xl border border-white/15 bg-slate-950 px-3 py-1.5 text-xs text-white"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] text-slate-400 mb-1">Ghi nhận đồng ý chủ giọng (`consentNote`)</label>
            <input
              type="text"
              value={newVoiceConsent}
              onChange={(e) => setNewVoiceConsent(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-1.5 text-xs text-white"
            />
          </div>
          <button
            onClick={handleAddProfile}
            className="flex items-center gap-1 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-500"
          >
            <Plus className="h-3.5 w-3.5" /> Thêm Profile vào Pool
          </button>
        </div>
      </div>
    </div>
  );
}
