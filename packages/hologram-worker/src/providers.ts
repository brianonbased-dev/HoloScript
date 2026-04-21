import type {
  HologramProviders,
  HologramSourceKind,
  MvhevcEncoder,
  ParallaxEncoder,
  QuiltRenderer,
} from '@holoscript/engine/hologram';

import { inferDepthForRaster } from './depth-infer.js';
import { encodeParallaxWebm, encodeStereoMp4 } from './ffmpeg-encode.js';
import { runQuiltBrowserRender, type BrowserRenderResult } from './playwright-pipeline.js';
import { prepareRasterPng, type PreparedRaster } from './rasterize.js';

/**
 * Per-request coordinator: rasterizes media once, shares one Playwright pass across
 * quilt / mvhevc / parallax when {@link createHologram} uses `sequentialRender: true`.
 */
export class WorkerHologramCoordinator {
  private raster: (PreparedRaster & { dispose: () => Promise<void> }) | null = null;
  private browserPayload: {
    depthMap: Float32Array;
    depthBackendLabel: string;
  } | null = null;
  private browserArtifacts: BrowserRenderResult | null = null;

  readonly providers: HologramProviders;

  constructor() {
    this.providers = {
      depth: { infer: (m, k) => this.depthInfer(m, k) },
      quilt: { render: (i) => this.quiltRender(i) },
      mvhevc: { encode: (i) => this.mvhevcEncode(i) },
      parallax: { encode: (i) => this.parallaxEncode(i) },
    };
  }

  private async depthInfer(media: Uint8Array, sourceKind: HologramSourceKind) {
    if (this.raster) await this.raster.dispose();
    this.raster = await prepareRasterPng(media, sourceKind);
    const inf = await inferDepthForRaster(
      this.raster.pngPath,
      this.raster.width,
      this.raster.height,
      sourceKind,
    );
    const backendLabel =
      inf.backend === 'onnxruntime-node' ? 'onnxruntime-node' : 'luminance-proxy';
    this.browserPayload = {
      depthMap: inf.depthMap,
      depthBackendLabel: backendLabel,
    };
    this.browserArtifacts = null;
    return inf;
  }

  private ensurePngPath(): string {
    if (!this.raster) throw new Error('WorkerHologramCoordinator: depth must run before render');
    return this.raster.pngPath;
  }

  private async ensureBrowserArtifacts(input: {
    depthMap: Float32Array;
    width: number;
    height: number;
  }): Promise<BrowserRenderResult> {
    if (
      this.browserArtifacts &&
      this.browserPayload &&
      this.browserPayload.depthMap === input.depthMap
    ) {
      return this.browserArtifacts;
    }
    if (!this.browserPayload) throw new Error('WorkerHologramCoordinator: missing depth payload');
    this.browserArtifacts = await runQuiltBrowserRender({
      pngPath: this.ensurePngPath(),
      depthMap: input.depthMap,
      width: input.width,
      height: input.height,
      depthBackendLabel: this.browserPayload.depthBackendLabel,
    });
    return this.browserArtifacts;
  }

  private async quiltRender(input: Parameters<QuiltRenderer['render']>[0]): Promise<Uint8Array> {
    const art = await this.ensureBrowserArtifacts({
      depthMap: input.depthMap,
      width: input.width,
      height: input.height,
    });
    return new Uint8Array(art.quilt);
  }

  private async mvhevcEncode(input: Parameters<MvhevcEncoder['encode']>[0]): Promise<Uint8Array> {
    const art = await this.ensureBrowserArtifacts({
      depthMap: input.depthMap,
      width: input.width,
      height: input.height,
    });
    return encodeStereoMp4(art.left, art.right, 30);
  }

  private async parallaxEncode(
    input: Parameters<ParallaxEncoder['encode']>[0],
  ): Promise<Uint8Array> {
    const art = await this.ensureBrowserArtifacts({
      depthMap: input.depthMap,
      width: input.width,
      height: input.height,
    });
    return encodeParallaxWebm(art.preview);
  }

  async dispose(): Promise<void> {
    if (this.raster) {
      await this.raster.dispose();
      this.raster = null;
    }
    this.browserPayload = null;
    this.browserArtifacts = null;
  }
}
