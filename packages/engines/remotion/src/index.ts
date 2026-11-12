import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { renderHyperFramesScene } from '@videoforge/engine-hyperframes';

export type RemotionTemplateName = 'BarChartRace' | 'Counter' | 'Leaderboard';

export interface RemotionTemplateProps {
  template: RemotionTemplateName;
  title: string;
  items: Array<{ label: string; value: number; unit?: string }>;
  palette: { primary: string; secondary: string; accent: string; bg: string; text: string };
}

/**
 * Sinh code TSX cho composition Remotion (BarChartRace, Counter, Leaderboard) trong thư mục compositions/
 */
export function generateRemotionCompositionTsx(props: RemotionTemplateProps): string {
  return `import React from 'react';

export const ${props.template}Composition: React.FC<${ JSON.stringify(props) }> = () => {
  const items = ${JSON.stringify(props.items)};
  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: '${props.palette.bg}',
      color: '${props.palette.text}',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: 80,
      fontFamily: 'Plus Jakarta Sans, sans-serif'
    }}>
      <h1 style={{ fontSize: 64, color: '${props.palette.primary}', marginBottom: 40 }}>
        ${props.title.replace(/'/g, "\\'")}
      </h1>
      {items.map((item, idx) => (
        <div key={idx} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 36, fontWeight: 700 }}>
            <span>{item.label}</span>
            <span style={{ color: '${props.palette.accent}' }}>{item.value}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
`;
}

/**
 * Render cảnh bằng npx remotion render (Mục 7.2)
 */
export function renderRemotionScene(opts: {
  sceneDir: string;
  template: RemotionTemplateName;
  props: RemotionTemplateProps;
  aspect: '16:9' | '9:16';
  durationSec: number;
  outputMp4Path: string;
}): { clipPath: string; usedCli: boolean } {
  fs.mkdirSync(opts.sceneDir, { recursive: true });
  const propsPath = path.join(opts.sceneDir, `remotion_props_${opts.aspect.replace(':', 'x')}.json`);
  fs.writeFileSync(propsPath, JSON.stringify(opts.props, null, 2), 'utf8');

  try {
    execFileSync(
      'npx',
      [
        '--no-install',
        'remotion',
        'render',
        opts.template,
        opts.outputMp4Path,
        `--props=${propsPath}`,
      ],
      { cwd: opts.sceneDir, timeout: 120000, stdio: 'ignore' }
    );
    if (fs.existsSync(opts.outputMp4Path)) {
      return { clipPath: opts.outputMp4Path, usedCli: true };
    }
  } catch {
    // Fallback deterministic chart video
  }

  const summary = opts.props.items.map((i) => `${i.label}: ${i.value}`).join(' | ');
  renderHyperFramesScene({
    sceneDir: opts.sceneDir,
    htmlPath: propsPath,
    outputMp4Path: opts.outputMp4Path,
    aspect: opts.aspect,
    durationSec: opts.durationSec,
    headline: `[${opts.template}] ${opts.props.title}`,
    subline: summary || 'Biểu đồ dữ liệu trực quan',
    palette: opts.props.palette,
  });

  return { clipPath: opts.outputMp4Path, usedCli: false };
}
