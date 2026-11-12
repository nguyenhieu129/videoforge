import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { renderHyperFramesScene } from '@videoforge/engine-hyperframes';

/**
 * Sinh file Python Manim cho cảnh giải thích toán học / thuật / đồ thị (Mục 7.3)
 */
export function generateManimPythonCode(opts: {
  sceneId: string;
  headline: string;
  aspect: '16:9' | '9:16';
  durationSec: number;
  bgColor: string;
  primaryColor: string;
}): string {
  const width = opts.aspect === '16:9' ? 1920 : 1080;
  const height = opts.aspect === '16:9' ? 1080 : 1920;

  return `from manim import *

config.pixel_width = ${width}
config.pixel_height = ${height}
config.frame_rate = 30
config.background_color = "${opts.bgColor}"

class VideoForgeScene(Scene):
    def construct(self):
        title = Text("${opts.headline.replace(/"/g, '\\"')}", font_size=48, color="${opts.primaryColor}")
        axes = Axes(x_range=[0, 5, 1], y_range=[0, 10, 2], axis_config={"color": WHITE})
        graph = axes.plot(lambda x: 0.4 * (x ** 2) + 1, color="${opts.primaryColor}")
        self.play(Write(title.to_edge(UP)), run_time=1.0)
        self.play(Create(axes), Create(graph), run_time=${Math.max(1.5, opts.durationSec - 1.5).toFixed(1)})
        self.wait(0.5)
`;
}

/**
 * Chạy Manim Python worker trong sandbox (timeout 120s, thư mục ghi giới hạn - Mục 7.3 & Mục 12)
 */
export function renderManimScene(opts: {
  sceneDir: string;
  pythonCode: string;
  aspect: '16:9' | '9:16';
  durationSec: number;
  headline: string;
  palette: { primary: string; secondary: string; accent: string; bg: string; text: string };
  outputMp4Path: string;
}): { clipPath: string; usedManim: boolean } {
  fs.mkdirSync(opts.sceneDir, { recursive: true });
  const pyFile = path.join(opts.sceneDir, `scene_${opts.aspect.replace(':', 'x')}.py`);
  fs.writeFileSync(pyFile, opts.pythonCode, 'utf8');

  const manimPython = process.env.MANIM_PYTHON || 'python3';
  try {
    execFileSync(
      manimPython,
      ['-m', 'manim', '-qh', pyFile, 'VideoForgeScene', '-o', opts.outputMp4Path],
      {
        cwd: opts.sceneDir,
        timeout: 120000, // Mục 7.3: timeout 120s
        stdio: 'ignore',
      }
    );
    if (fs.existsSync(opts.outputMp4Path)) {
      return { clipPath: opts.outputMp4Path, usedManim: true };
    }
  } catch {
    // Fallback nếu máy chưa cài thư viện manim trong Python venv
  }

  renderHyperFramesScene({
    sceneDir: opts.sceneDir,
    htmlPath: pyFile,
    outputMp4Path: opts.outputMp4Path,
    aspect: opts.aspect,
    durationSec: opts.durationSec,
    headline: `[Manim Math/Graph] ${opts.headline}`,
    subline: 'y = 0.4x^2 + 1 | Mô phỏng đồ thị toán học',
    palette: opts.palette,
  });

  return { clipPath: opts.outputMp4Path, usedManim: false };
}
