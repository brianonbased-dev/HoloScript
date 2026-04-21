import { pathToFileURL } from 'node:url';

import { MVHEVCCompiler, QuiltCompiler } from '@holoscript/engine/hologram';
import { chromium, type Browser } from 'playwright';

import { buildComposition } from './build-composition.js';
import { buildWorkerRenderHtml } from './worker-html.js';

let browserSingleton: Browser | null = null;

export async function getWorkerBrowser(): Promise<Browser> {
  if (!browserSingleton) {
    browserSingleton = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--allow-file-access-from-files',
      ],
    });
  }
  return browserSingleton;
}

export async function closeWorkerBrowser(): Promise<void> {
  if (browserSingleton) {
    await browserSingleton.close().catch(() => {});
    browserSingleton = null;
  }
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('Invalid data URL payload');
  return Buffer.from(m[2], 'base64');
}

export interface BrowserRenderPayload {
  pngPath: string;
  depthMap: Float32Array;
  width: number;
  height: number;
  depthBackendLabel: string;
}

export interface BrowserRenderResult {
  quilt: Uint8Array;
  left: Buffer;
  right: Buffer;
  preview: Buffer;
}

export async function runQuiltBrowserRender(payload: BrowserRenderPayload): Promise<BrowserRenderResult> {
  const fileUrl = pathToFileURL(payload.pngPath).href;
  const comp = buildComposition('image', fileUrl);
  const quiltPlan = new QuiltCompiler().compileQuilt(comp);
  const mvPlan = new MVHEVCCompiler().compileMVHEVC(comp);

  const browser = await getWorkerBrowser();
  const tileWidth = quiltPlan.metadata.tileWidth;
  const tileHeight = quiltPlan.metadata.tileHeight;
  const page = await browser.newPage({ viewport: { width: tileWidth, height: tileHeight } });

  try {
    const mapArray = Array.from(payload.depthMap);
    await page.addInitScript(
      ({ map, depthBackend }) => {
        (window as unknown as Record<string, unknown>).__INJECTED_DEPTH_MAP = new Float32Array(map);
        (window as unknown as Record<string, unknown>).__INJECTED_DEPTH_BACKEND = depthBackend;
      },
      { map: mapArray, depthBackend: payload.depthBackendLabel },
    );

    await page.setContent(buildWorkerRenderHtml(fileUrl, 'image', payload.width, payload.height), {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForFunction(
      () => {
        const w = window as unknown as {
          __HOLOGRAM_READY?: boolean;
          __HOLOGRAM_RENDER_ERROR?: string;
        };
        if (w.__HOLOGRAM_RENDER_ERROR) throw new Error(w.__HOLOGRAM_RENDER_ERROR);
        return w.__HOLOGRAM_READY === true;
      },
      { timeout: 120_000 },
    );

    const maxAbsOffset = quiltPlan.tiles.reduce((m, t) => Math.max(m, Math.abs(t.cameraOffset)), 0.0001);
    const stereoMax = mvPlan.views.reduce((m, v) => Math.max(m, Math.abs(v.cameraOffset)), 0.0001);

    const evaluated = await page.evaluate(
      ({
        quiltWidth,
        quiltHeight,
        tileWidth: tw,
        tileHeight: th,
        tiles,
        stereoViews,
      }: {
        quiltWidth: number;
        quiltHeight: number;
        tileWidth: number;
        tileHeight: number;
        tiles: Array<{ column: number; row: number; normalizedOffset: number; viewShear: number }>;
        stereoViews: {
          left: { offset: number; shear: number };
          right: { offset: number; shear: number };
        };
      }) => {
        const runtime = (
          window as unknown as {
            __HOLOGRAM_RT: {
              renderViewDataUrl(offset?: number, shear?: number): string;
              renderQuiltDataUrl(
                tileSpecs: Array<{
                  column: number;
                  row: number;
                  normalizedOffset: number;
                  viewShear: number;
                }>,
                quiltWidth: number,
                quiltHeight: number,
                tileWidth: number,
                tileHeight: number,
              ): string;
            };
          }
        ).__HOLOGRAM_RT;

        return {
          previewPngDataUrl: runtime.renderViewDataUrl(0, 0),
          quiltPngDataUrl: runtime.renderQuiltDataUrl(tiles, quiltWidth, quiltHeight, tw, th),
          leftPngDataUrl: runtime.renderViewDataUrl(stereoViews.left.offset, stereoViews.left.shear),
          rightPngDataUrl: runtime.renderViewDataUrl(stereoViews.right.offset, stereoViews.right.shear),
        };
      },
      {
        quiltWidth: quiltPlan.config.resolution[0],
        quiltHeight: quiltPlan.config.resolution[1],
        tileWidth,
        tileHeight,
        tiles: quiltPlan.tiles.map((tile) => ({
          column: tile.column,
          row: tile.row,
          normalizedOffset: tile.cameraOffset / maxAbsOffset,
          viewShear: tile.viewShear,
        })),
        stereoViews: {
          left: {
            offset: (mvPlan.views.find((v) => v.eye === 'left')?.cameraOffset ?? -0.5) / stereoMax,
            shear: mvPlan.views.find((v) => v.eye === 'left')?.viewShear ?? 0,
          },
          right: {
            offset: (mvPlan.views.find((v) => v.eye === 'right')?.cameraOffset ?? 0.5) / stereoMax,
            shear: mvPlan.views.find((v) => v.eye === 'right')?.viewShear ?? 0,
          },
        },
      },
    );

    return {
      quilt: new Uint8Array(dataUrlToBuffer(evaluated.quiltPngDataUrl)),
      left: dataUrlToBuffer(evaluated.leftPngDataUrl),
      right: dataUrlToBuffer(evaluated.rightPngDataUrl),
      preview: dataUrlToBuffer(evaluated.previewPngDataUrl),
    };
  } finally {
    await page.close();
  }
}
