import { renderHyperFramesScene } from '@videoforge/engine-hyperframes';

/**
 * Kết nối tới Blender MCP Server (Mục 7.4)
 * Mặc định tắt, bật trong Settings. Timeout 10 phút/cảnh.
 */
export async function renderBlenderMcpScene(opts: {
  blenderMcpUrl?: string;
  enabled: boolean;
  sceneDir: string;
  aspect: '16:9' | '9:16';
  durationSec: number;
  headline: string;
  palette: { primary: string; secondary: string; accent: string; bg: string; text: string };
  outputMp4Path: string;
  signal?: AbortSignal;
}): Promise<{ clipPath: string; usedBlenderMcp: boolean }> {
  const mcpUrl = opts.blenderMcpUrl || process.env.BLENDER_MCP_URL;
  if (opts.enabled && mcpUrl) {
    try {
      const res = await fetch(`${mcpUrl.replace(/\/+$/, '')}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: opts.headline,
          aspect: opts.aspect,
          durationSec: opts.durationSec,
          palette: opts.palette,
          outputPath: opts.outputMp4Path,
        }),
        signal: opts.signal ?? AbortSignal.timeout(600000), // 10 phút
      });
      if (res.ok) {
        return { clipPath: opts.outputMp4Path, usedBlenderMcp: true };
      }
    } catch {
      // Fallback sang HyperFrames 3D
    }
  }

  renderHyperFramesScene({
    sceneDir: opts.sceneDir,
    htmlPath: opts.outputMp4Path,
    outputMp4Path: opts.outputMp4Path,
    aspect: opts.aspect,
    durationSec: opts.durationSec,
    headline: `[3D Cinematic] ${opts.headline}`,
    subline: 'Blender 3D / Three.js Frame Adapter',
    palette: opts.palette,
  });

  return { clipPath: opts.outputMp4Path, usedBlenderMcp: false };
}
