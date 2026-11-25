import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Tự động dò trình duyệt Chromium (Edge / Chrome) sẵn có trên máy Windows / Linux / macOS
 */
export function detectLocalChromiumExecutable(): string | null {
  if (process.env.VIDEOFORGE_SKIP_CHROMIUM === '1') {
    return null;
  }
  if (process.env.BROWSER_EXECUTABLE && fs.existsSync(process.env.BROWSER_EXECUTABLE)) {
    return process.env.BROWSER_EXECUTABLE;
  }

  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

class MinimalCdpSession {
  private ws: WebSocket;
  private seq = 0;
  private pending = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: Error) => void }
  >();
  private eventWaiters = new Map<string, Array<(params: any) => void>>();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (typeof msg.id === 'number') {
          const waiter = this.pending.get(msg.id);
          if (waiter) {
            this.pending.delete(msg.id);
            if (msg.error) {
              waiter.reject(new Error(msg.error.message || 'CDP error'));
            } else {
              waiter.resolve(msg.result);
            }
          }
        } else if (msg.method) {
          const list = this.eventWaiters.get(msg.method);
          if (list && list.length > 0) {
            const copy = [...list];
            this.eventWaiters.delete(msg.method);
            for (const fn of copy) fn(msg.params);
          }
        }
      } catch {
        // ignore malformed message
      }
    });

    ws.addEventListener('close', () => {
      for (const [, waiter] of this.pending) {
        waiter.reject(new Error('CDP WebSocket closed'));
      }
      this.pending.clear();
    });
  }

  static async connect(wsUrl: string, timeoutMs = 12000): Promise<MinimalCdpSession> {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP connect timeout')), timeoutMs);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('CDP WebSocket connection failed'));
      });
    });
    return new MinimalCdpSession(ws);
  }

  send<T = any>(method: string, params: Record<string, any> = {}): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  waitForEvent(method: string, timeoutMs = 8000): Promise<any> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      const list = this.eventWaiters.get(method) || [];
      list.push((params) => {
        clearTimeout(timer);
        resolve(params);
      });
      this.eventWaiters.set(method, list);
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

async function launchHeadlessCdpPage(executablePath: string): Promise<{
  session: MinimalCdpSession;
  cleanup: () => void;
}> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-cdp-'));
  const proc: ChildProcess = spawn(
    executablePath,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-gpu-vsync',
      '--hide-scrollbars',
      '--mute-audio',
      '--allow-file-access-from-files',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );

  const cleanup = () => {
    try {
      proc.kill();
    } catch {
      // ignore
    }
    setTimeout(() => {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch {
        // ignore locked files briefly on Windows
      }
    }, 600);
  };

  try {
    const browserWsUrl = await new Promise<string>((resolve, reject) => {
      let stderrBuf = '';
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for DevTools listening port'));
      }, 12000);

      proc.stderr?.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString('utf8');
        const match = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s\r\n]+)/i);
        if (match?.[1]) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });

      proc.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Browser exited early with code ${code}`));
      });
    });

    const parsed = new URL(browserWsUrl);
    const listUrl = `http://${parsed.host}/json/list`;
    let pageWsUrl = '';
    for (let attempt = 0; attempt < 15; attempt++) {
      try {
        const res = await fetch(listUrl, { signal: AbortSignal.timeout(2500) });
        if (res.ok) {
          const targets = (await res.json()) as Array<{ type: string; webSocketDebuggerUrl?: string }>;
          const pageTarget = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
          if (pageTarget?.webSocketDebuggerUrl) {
            pageWsUrl = pageTarget.webSocketDebuggerUrl;
            break;
          }
        }
      } catch {
        // retry shortly
      }
      await new Promise((r) => setTimeout(r, 120));
    }

    if (!pageWsUrl) {
      const newRes = await fetch(`http://${parsed.host}/json/new?about:blank`, {
        method: 'PUT',
        signal: AbortSignal.timeout(3000),
      });
      const created = (await newRes.json()) as { webSocketDebuggerUrl?: string };
      if (!created.webSocketDebuggerUrl) {
        throw new Error('Could not acquire CDP page target');
      }
      pageWsUrl = created.webSocketDebuggerUrl;
    }

    const session = await MinimalCdpSession.connect(pageWsUrl);
    return {
      session,
      cleanup: () => {
        session.close();
        cleanup();
      },
    };
  } catch (err) {
    cleanup();
    throw err;
  }
}

/**
 * Chụp nhanh 1 ảnh Snapshot JPEG từ file HTML bằng CDP (dùng cho Bước 13 LintPreview)
 */
export async function captureHtmlSnapshotWithCdp(opts: {
  htmlPath: string;
  width: number;
  height: number;
  seekSec?: number;
  outputJpgPath: string;
}): Promise<boolean> {
  const exe = detectLocalChromiumExecutable();
  if (!exe || !fs.existsSync(opts.htmlPath)) return false;

  fs.mkdirSync(path.dirname(opts.outputJpgPath), { recursive: true });
  const { session, cleanup } = await launchHeadlessCdpPage(exe);

  try {
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: opts.width,
      height: opts.height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const loadPromise = session.waitForEvent('Page.loadEventFired', 8000);
    await session.send('Page.navigate', { url: pathToFileURL(opts.htmlPath).href });
    await loadPromise;

    await session.send('Runtime.evaluate', {
      expression: `(async () => {
        if (document.fonts && document.fonts.ready) {
          await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
        }
        const imgs = Array.from(document.images || []);
        await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(r => {
          img.onload = r; img.onerror = r; setTimeout(r, 1200);
        })));
        if (typeof window.seekFrame === 'function') {
          await window.seekFrame(${Number((opts.seekSec ?? 0.6).toFixed(3))});
        }
      })()`,
      awaitPromise: true,
    });

    const shot = await session.send<{ data: string }>('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 90,
    });
    fs.writeFileSync(opts.outputJpgPath, Buffer.from(shot.data, 'base64'));
    return fs.existsSync(opts.outputJpgPath);
  } finally {
    cleanup();
  }
}

/**
 * Kết xuất HTML5 + CSS3 + GSAP ở đúng 30fps qua Edge/Chrome CDP -> đẩy thẳng qua image2pipe vào FFmpeg
 */
export async function renderHtmlWithCdp30Fps(opts: {
  htmlPath: string;
  outputMp4Path: string;
  snapshotPath?: string;
  width: number;
  height: number;
  durationSec: number;
  fps?: number;
  onProgress?: (percent: number) => void;
}): Promise<boolean> {
  const exe = detectLocalChromiumExecutable();
  if (!exe || !fs.existsSync(opts.htmlPath)) return false;

  const fps = opts.fps || 30;
  const totalFrames = Math.max(fps, Math.round(opts.durationSec * fps));
  const snapshotFrame = Math.min(totalFrames - 1, Math.round(fps * 0.6));

  fs.mkdirSync(path.dirname(opts.outputMp4Path), { recursive: true });
  if (opts.snapshotPath) {
    fs.mkdirSync(path.dirname(opts.snapshotPath), { recursive: true });
  }

  const { session, cleanup } = await launchHeadlessCdpPage(exe);

  try {
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: opts.width,
      height: opts.height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const loadPromise = session.waitForEvent('Page.loadEventFired', 10000);
    await session.send('Page.navigate', { url: pathToFileURL(opts.htmlPath).href });
    await loadPromise;

    // Chờ font tiếng Việt & hình ảnh B-Roll nạp xong trước khi quay frame 0
    await session.send('Runtime.evaluate', {
      expression: `(async () => {
        if (document.fonts && document.fonts.ready) {
          await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2000))]);
        }
        const imgs = Array.from(document.images || []);
        await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(r => {
          img.onload = r; img.onerror = r; setTimeout(r, 1500);
        })));
      })()`,
      awaitPromise: true,
    });

    const ffmpegProc = spawn(
      'ffmpeg',
      [
        '-y',
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        '-framerate',
        String(fps),
        '-i',
        '-',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-r',
        String(fps),
        '-an',
        opts.outputMp4Path,
      ],
      { stdio: ['pipe', 'ignore', 'ignore'] }
    );

    const ffmpegDone = new Promise<void>((resolve, reject) => {
      ffmpegProc.once('error', reject);
      ffmpegProc.once('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg image2pipe exited with code ${code}`));
      });
    });

    for (let f = 0; f < totalFrames; f++) {
      const tSec = f / fps;
      await session.send('Runtime.evaluate', {
        expression: `window.seekFrame && window.seekFrame(${tSec.toFixed(4)})`,
        awaitPromise: true,
      });

      const shot = await session.send<{ data: string }>('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 90,
      });
      const buf = Buffer.from(shot.data, 'base64');

      if (opts.snapshotPath && f === snapshotFrame) {
        fs.writeFileSync(opts.snapshotPath, buf);
      }

      if (ffmpegProc.stdin) {
        const ok = ffmpegProc.stdin.write(buf);
        if (!ok) {
          await new Promise<void>((r) => ffmpegProc.stdin!.once('drain', r));
        }
      }

      if (opts.onProgress && (f % 10 === 0 || f === totalFrames - 1)) {
        opts.onProgress(Math.round(((f + 1) / totalFrames) * 100));
      }
    }

    ffmpegProc.stdin?.end();
    await ffmpegDone;

    return fs.existsSync(opts.outputMp4Path);
  } finally {
    cleanup();
  }
}
