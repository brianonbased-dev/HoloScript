import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { chromium } from 'playwright';

import { ffmpegAvailableSync, resolveFfmpegBinary } from './holo-video-ingest';
import { estimateDepthFromUrl } from './hologram-depth-estimator';

export interface RenderArtifact {
  path: string;
  byteLength: number;
  sha256: string;
  mimeType: string;
  base64?: string;
}

export interface RenderBundleOptions {
  mediaType: 'image' | 'gif' | 'video';
  source: string;
  name: string;
  holoCode: string;
  quilt: {
    config: {
      views: number;
      columns: number;
      rows: number;
      resolution: [number, number];
      baseline: number;
      device: string;
    };
    tiles: Array<{ column: number; row: number; cameraOffset: number; viewShear: number }>;
    metadata: { tileWidth: number; tileHeight: number; numViews: number };
  };
  mvhevc: {
    config: { fps: number; container: 'mov' | 'mp4' };
    views: Array<{ eye: 'left' | 'right'; cameraOffset: number; viewShear: number }>;
    metadata: { stereoMode: string };
  };
  includeBase64?: boolean;
  durationSeconds?: number;
}

export interface RenderBundleResult {
  hash: string;
  bundleDir: string;
  manifest: RenderArtifact;
  previewPng: RenderArtifact;
  quiltPng: RenderArtifact;
  stereoLeftPng: RenderArtifact;
  stereoRightPng: RenderArtifact;
  stereoVideo?: RenderArtifact & { codec: string; stereoMode: string };
  depthBackend: string;
  holoCodePath: string;
}

interface BrowserRenderResult {
  previewPngDataUrl: string;
  quiltPngDataUrl: string;
  leftPngDataUrl: string;
  rightPngDataUrl: string;
  width: number;
  height: number;
  depthBackend: string;
}

function normalizeSourceUrl(source: string): string {
  if (/^(https?:|data:|file:)/i.test(source)) return source;
  const fullPath = isAbsolute(source) ? source : resolve(process.cwd(), source);
  const normalized = fullPath.replace(/\\/g, '/');
  return `file:///${normalized.replace(/^([A-Za-z]):/, '$1:')}`;
}

function bufferSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function encodeBundleHash(options: RenderBundleOptions): string {
  const payload = JSON.stringify({
    mediaType: options.mediaType,
    source: options.source,
    name: options.name,
    holoCode: options.holoCode,
    quiltConfig: options.quilt.config,
    mvhevcConfig: options.mvhevc.config,
    durationSeconds: options.durationSeconds ?? 2,
    version: 1,
  });
  return createHash('sha256').update(payload).digest('hex');
}

export function resolveStoreRoot(): string {
  const explicit = process.env.HOLOGRAM_STORE_DIR?.trim();
  if (explicit) return explicit;

  const volumeCandidates = [
    process.env.RAILWAY_VOLUME_MOUNT_PATH,
    process.env.RAILWAY_VOLUME_PATH,
    process.env.RAILWAY_STATIC_VOLUME_PATH,
    process.env.RAILWAY_VOLUME_MOUNT,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  if (volumeCandidates.length > 0) {
    return join(volumeCandidates[0], 'holograms');
  }

  return join(tmpdir(), 'holoscript-holograms');
}

function buildRenderHtml(sourceUrl: string, mediaType: 'image' | 'gif' | 'video') {
  const escapedSource = JSON.stringify(sourceUrl);
  const escapedMediaType = JSON.stringify(mediaType);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; background: black; overflow: hidden; }
    canvas { display: block; }
  </style>
</head>
<body>
  <canvas id="render"></canvas>
  <script>
    window.__HOLOGRAM_READY = false;
    window.__HOLOGRAM_RENDER_ERROR = null;
  </script>
  <script>
    (async () => {
      const sourceUrl = ${escapedSource};
      const mediaType = ${escapedMediaType};
      const canvas = document.getElementById('render');
      const ctx = canvas.getContext('2d');

      const internalWidth = 420;
      const internalHeight = 560;
      canvas.width = internalWidth;
      canvas.height = internalHeight;

      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = internalWidth;
      sourceCanvas.height = internalHeight;
      const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });

      const depthCanvas = document.createElement('canvas');
      depthCanvas.width = internalWidth;
      depthCanvas.height = internalHeight;
      const depthCtx = depthCanvas.getContext('2d', { willReadFrequently: true });

      async function loadMedia() {
        if (mediaType === 'video') {
          const video = document.createElement('video');
          video.src = sourceUrl;
          video.crossOrigin = 'anonymous';
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.autoplay = true;
          await new Promise((resolve, reject) => {
            video.onloadeddata = () => resolve();
            video.onerror = () => reject(new Error('Failed to load video source'));
          });
          try { await video.play(); } catch {}
          sourceCtx.drawImage(video, 0, 0, internalWidth, internalHeight);
          return { kind: 'video', element: video };
        }

        const img = new Image();
        img.src = sourceUrl;
        img.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load image source'));
        });
        sourceCtx.drawImage(img, 0, 0, internalWidth, internalHeight);
        return { kind: 'image', element: img };
      }

      function computeDepthMap() {
        // Use pre-computed depth map injected by the Node.js depth estimator.
        const injected = window.__INJECTED_DEPTH_MAP;
        if (injected && injected.length === internalWidth * internalHeight) {
          const depthImage = depthCtx.createImageData(internalWidth, internalHeight);
          for (let i = 0; i < injected.length; i++) {
            const value = Math.max(0, Math.min(255, Math.round(injected[i] * 255)));
            depthImage.data[i * 4] = value;
            depthImage.data[i * 4 + 1] = value;
            depthImage.data[i * 4 + 2] = value;
            depthImage.data[i * 4 + 3] = 255;
          }
          depthCtx.putImageData(depthImage, 0, 0);
          return injected;
        }

        // Luminance-proxy fallback.
        const imageData = sourceCtx.getImageData(0, 0, internalWidth, internalHeight);
        const depthImage = depthCtx.createImageData(internalWidth, internalHeight);
        const depthMap = new Float32Array(internalWidth * internalHeight);

        for (let i = 0; i < depthMap.length; i++) {
          const px = i * 4;
          const r = imageData.data[px] / 255;
          const g = imageData.data[px + 1] / 255;
          const b = imageData.data[px + 2] / 255;
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          const depth = 1.0 - luminance;
          depthMap[i] = depth;
          const value = Math.max(0, Math.min(255, Math.round(depth * 255)));
          depthImage.data[px] = value;
          depthImage.data[px + 1] = value;
          depthImage.data[px + 2] = value;
          depthImage.data[px + 3] = 255;
        }

        depthCtx.putImageData(depthImage, 0, 0);
        return depthMap;
      }

      function renderWarpedView(depthMap, normalizedOffset, shear = 0) {
        const src = sourceCtx.getImageData(0, 0, internalWidth, internalHeight);
        const dst = ctx.createImageData(internalWidth, internalHeight);
        const maxShift = 28;

        for (let y = 0; y < internalHeight; y++) {
          for (let x = 0; x < internalWidth; x++) {
            const dstIndex = (y * internalWidth + x) * 4;
            const depth = depthMap[y * internalWidth + x];
            const shift = Math.round(normalizedOffset * maxShift * (depth - 0.5) + shear * 8);
            const srcX = Math.max(0, Math.min(internalWidth - 1, x - shift));
            const srcIndex = (y * internalWidth + srcX) * 4;
            dst.data[dstIndex] = src.data[srcIndex];
            dst.data[dstIndex + 1] = src.data[srcIndex + 1];
            dst.data[dstIndex + 2] = src.data[srcIndex + 2];
            dst.data[dstIndex + 3] = src.data[srcIndex + 3];
          }
        }

        return dst;
      }

      try {
        const media = await loadMedia();
        const depthMap = computeDepthMap();

        window.__HOLOGRAM_RT = {
          width: internalWidth,
          height: internalHeight,
          depthBackend: window.__INJECTED_DEPTH_BACKEND ?? 'luminance-proxy',
          mediaKind: media.kind,
          renderViewDataUrl(offset = 0, shear = 0) {
            const imageData = renderWarpedView(depthMap, offset, shear);
            ctx.putImageData(imageData, 0, 0);
            return canvas.toDataURL('image/png');
          },
          renderQuiltDataUrl(tileSpecs, quiltWidth, quiltHeight, tileWidth, tileHeight) {
            const quiltCanvas = document.createElement('canvas');
            quiltCanvas.width = quiltWidth;
            quiltCanvas.height = quiltHeight;
            const quiltCtx = quiltCanvas.getContext('2d');

            for (const tile of tileSpecs) {
              const imageData = renderWarpedView(depthMap, tile.normalizedOffset, tile.viewShear || 0);
              ctx.putImageData(imageData, 0, 0);
              quiltCtx.drawImage(canvas, tile.column * tileWidth, tile.row * tileHeight, tileWidth, tileHeight);
            }

            return quiltCanvas.toDataURL('image/png');
          }
        };

        window.__HOLOGRAM_READY = true;
      } catch (error) {
        window.__HOLOGRAM_RENDER_ERROR = error instanceof Error ? error.message : String(error);
      }
    })();
  </script>
</body>
</html>`;
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid data URL payload');
  return Buffer.from(match[2], 'base64');
}

async function writeArtifact(bundleDir: string, filename: string, buffer: Buffer, mimeType: string, includeBase64 = false): Promise<RenderArtifact> {
  const filePath = join(bundleDir, filename);
  await fs.writeFile(filePath, buffer);
  return {
    path: filePath,
    byteLength: buffer.byteLength,
    sha256: bufferSha256(buffer),
    mimeType,
    ...(includeBase64 ? { base64: buffer.toString('base64') } : {}),
  };
}

async function renderBrowserArtifacts(options: RenderBundleOptions, injectedDepth?: { data: Float32Array; backend: string }): Promise<BrowserRenderResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
  });

  try {
    const tileWidth = options.quilt.metadata.tileWidth;
    const tileHeight = options.quilt.metadata.tileHeight;
    const page = await browser.newPage({ viewport: { width: tileWidth, height: tileHeight } });
    // Inject pre-computed depth map before page scripts execute.
    if (injectedDepth) {
      const mapArray = Array.from(injectedDepth.data);
      const backend = injectedDepth.backend;
      await page.addInitScript(({ map, depthBackend }) => {
        (window as unknown as Record<string, unknown>).__INJECTED_DEPTH_MAP = new Float32Array(map);
        (window as unknown as Record<string, unknown>).__INJECTED_DEPTH_BACKEND = depthBackend;
      }, { map: mapArray, depthBackend: backend });
    }

    await page.setContent(buildRenderHtml(normalizeSourceUrl(options.source), options.mediaType), {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForFunction(() => {
      const ready = (window as unknown as { __HOLOGRAM_READY?: boolean; __HOLOGRAM_RENDER_ERROR?: string }).__HOLOGRAM_READY;
      const error = (window as unknown as { __HOLOGRAM_RENDER_ERROR?: string }).__HOLOGRAM_RENDER_ERROR;
      if (error) throw new Error(error);
      return ready === true;
    }, { timeout: 30_000 });

    const maxAbsOffset = options.quilt.tiles.reduce((max, tile) => Math.max(max, Math.abs(tile.cameraOffset)), 0.0001);
    const stereoMax = options.mvhevc.views.reduce((max, view) => Math.max(max, Math.abs(view.cameraOffset)), 0.0001);

    return await page.evaluate(
      ({ quiltWidth, quiltHeight, tileWidth, tileHeight, tiles, stereoViews }) => {
        const runtime = (window as unknown as {
          __HOLOGRAM_RT: {
            width: number;
            height: number;
            depthBackend: string;
            renderViewDataUrl(offset?: number, shear?: number): string;
            renderQuiltDataUrl(tileSpecs: Array<{ column: number; row: number; normalizedOffset: number; viewShear: number }>, quiltWidth: number, quiltHeight: number, tileWidth: number, tileHeight: number): string;
          };
        }).__HOLOGRAM_RT;

        return {
          previewPngDataUrl: runtime.renderViewDataUrl(0, 0),
          quiltPngDataUrl: runtime.renderQuiltDataUrl(tiles, quiltWidth, quiltHeight, tileWidth, tileHeight),
          leftPngDataUrl: runtime.renderViewDataUrl(stereoViews.left.offset, stereoViews.left.shear),
          rightPngDataUrl: runtime.renderViewDataUrl(stereoViews.right.offset, stereoViews.right.shear),
          width: runtime.width,
          height: runtime.height,
          depthBackend: runtime.depthBackend,
        };
      },
      {
        quiltWidth: options.quilt.config.resolution[0],
        quiltHeight: options.quilt.config.resolution[1],
        tileWidth,
        tileHeight,
        tiles: options.quilt.tiles.map((tile) => ({
          column: tile.column,
          row: tile.row,
          normalizedOffset: tile.cameraOffset / maxAbsOffset,
          viewShear: tile.viewShear,
        })),
        stereoViews: {
          left: {
            offset: (options.mvhevc.views.find((view) => view.eye === 'left')?.cameraOffset ?? -0.5) / stereoMax,
            shear: options.mvhevc.views.find((view) => view.eye === 'left')?.viewShear ?? 0,
          },
          right: {
            offset: (options.mvhevc.views.find((view) => view.eye === 'right')?.cameraOffset ?? 0.5) / stereoMax,
            shear: options.mvhevc.views.find((view) => view.eye === 'right')?.viewShear ?? 0,
          },
        },
      }
    );
  } finally {
    await browser.close();
  }
}

async function encodeStereoVideo(bundleDir: string, leftPath: string, rightPath: string, fps: number, durationSeconds: number): Promise<{ path: string; codec: string } | null> {
  if (!ffmpegAvailableSync()) return null;

  const ffmpegPath = resolveFfmpegBinary();
  const outPath = join(bundleDir, 'stereo-preview.mp4');

  const tryEncode = async (codec: 'libx265' | 'libx264') => {
    const args = [
      '-y',
      '-loop',
      '1',
      '-framerate',
      String(fps),
      '-t',
      String(durationSeconds),
      '-i',
      leftPath,
      '-loop',
      '1',
      '-framerate',
      String(fps),
      '-t',
      String(durationSeconds),
      '-i',
      rightPath,
      '-filter_complex',
      'hstack=inputs=2',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-c:v',
      codec,
      ...(codec === 'libx265' ? ['-tag:v', 'hvc1'] : []),
      outPath,
    ];

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      proc.on('error', rejectPromise);
      proc.on('close', (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }
        rejectPromise(new Error(stderr.slice(-600) || `ffmpeg exited with ${code}`));
      });
    });
  };

  try {
    await tryEncode('libx265');
    return { path: outPath, codec: 'libx265' };
  } catch {
    try {
      await tryEncode('libx264');
      return { path: outPath, codec: 'libx264' };
    } catch {
      return null;
    }
  }
}

export async function renderHologramBundle(options: RenderBundleOptions): Promise<RenderBundleResult> {
  const hash = encodeBundleHash(options);
  const storeRoot = resolveStoreRoot();
  const bundleDir = join(storeRoot, hash);
  await fs.mkdir(bundleDir, { recursive: true });

  // Estimate depth before Playwright launch (image sources only; videos use luminance-proxy).
  let injectedDepth: { data: Float32Array; backend: string } | undefined;
  if (options.mediaType === 'image') {
    const depthResult = await estimateDepthFromUrl(normalizeSourceUrl(options.source), 420, 560);
    if (depthResult.depthMap) {
      injectedDepth = { data: depthResult.depthMap, backend: depthResult.backend };
    }
  }

  const browserArtifacts = await renderBrowserArtifacts(options, injectedDepth);

  const previewBuffer = dataUrlToBuffer(browserArtifacts.previewPngDataUrl);
  const quiltBuffer = dataUrlToBuffer(browserArtifacts.quiltPngDataUrl);
  const leftBuffer = dataUrlToBuffer(browserArtifacts.leftPngDataUrl);
  const rightBuffer = dataUrlToBuffer(browserArtifacts.rightPngDataUrl);

  const holoCodePath = join(bundleDir, 'scene.holo');
  await fs.writeFile(holoCodePath, options.holoCode, 'utf8');

  const previewPng = await writeArtifact(bundleDir, 'preview.png', previewBuffer, 'image/png', options.includeBase64);
  const quiltPng = await writeArtifact(bundleDir, 'quilt.png', quiltBuffer, 'image/png', options.includeBase64);
  const stereoLeftPng = await writeArtifact(bundleDir, 'left-eye.png', leftBuffer, 'image/png', options.includeBase64);
  const stereoRightPng = await writeArtifact(bundleDir, 'right-eye.png', rightBuffer, 'image/png', options.includeBase64);

  const stereoVideoInfo = await encodeStereoVideo(
    bundleDir,
    stereoLeftPng.path,
    stereoRightPng.path,
    options.mvhevc.config.fps,
    options.durationSeconds ?? 2,
  );

  const stereoVideo = stereoVideoInfo
    ? ({
        ...(await writeArtifact(
          bundleDir,
          'stereo-preview.mp4',
          await fs.readFile(stereoVideoInfo.path),
          'video/mp4',
          false,
        )),
        codec: stereoVideoInfo.codec,
        stereoMode: 'side-by-side-hevc-preview',
      } satisfies RenderBundleResult['stereoVideo'])
    : undefined;

  const manifestPayload = {
    hash,
    mediaType: options.mediaType,
    source: options.source,
    name: options.name,
    depthBackend: browserArtifacts.depthBackend,
    artifacts: {
      previewPng,
      quiltPng,
      stereoLeftPng,
      stereoRightPng,
      stereoVideo,
      holoCodePath,
    },
    quilt: options.quilt,
    mvhevc: options.mvhevc,
    generatedAt: new Date().toISOString(),
  };

  const manifestBuffer = Buffer.from(JSON.stringify(manifestPayload, null, 2), 'utf8');
  const manifest = await writeArtifact(bundleDir, 'manifest.json', manifestBuffer, 'application/json', false);

  return {
    hash,
    bundleDir,
    manifest,
    previewPng,
    quiltPng,
    stereoLeftPng,
    stereoRightPng,
    stereoVideo,
    depthBackend: browserArtifacts.depthBackend,
    holoCodePath,
  };
}
