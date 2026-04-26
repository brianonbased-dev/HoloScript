/**
 * Browser-side providers for the HoloGram pipeline.
 *
 * Pair with {@link createHologram} from `..` — the orchestrator stays
 * runtime-agnostic, and these provider impls plug it into the browser's
 * WebGPU + Three.js stack.
 *
 * @see Sprint 0a.2 board task task_1776678094345_h13z
 */

export {
  BrowserDepthProvider,
  defaultBrowserImageDecoder,
  type BrowserDepthProviderConfig,
  type DecodedImage,
  type ImageDecoder,
} from './BrowserDepthProvider';

export {
  BrowserQuiltRenderer,
  type BrowserQuiltRendererConfig,
} from './BrowserQuiltRenderer';

export { encodePngRgba } from './pngEncoder';

import { BrowserDepthProvider, type BrowserDepthProviderConfig } from './BrowserDepthProvider';
import { BrowserQuiltRenderer, type BrowserQuiltRendererConfig } from './BrowserQuiltRenderer';
import type { HologramProviders } from '../createHologram';

export interface CreateBrowserProvidersConfig {
  /** Forwarded to BrowserDepthProvider */
  depth?: BrowserDepthProviderConfig;
  /** Forwarded to BrowserQuiltRenderer */
  quilt?: BrowserQuiltRendererConfig;
}

/**
 * Bundle browser-native providers (depth + quilt) for a Studio drop-zone
 * style call:
 *
 * ```ts
 * const bundle = await createHologram(media, 'image', createBrowserProviders());
 * // bundle.quiltPng now contains the rendered quilt PNG bytes
 * ```
 *
 * Sprint 0a.2 ships depth + quilt only. MVHEVCEncoder + ParallaxEncoder
 * land in Sprint 0b (browser MV-HEVC needs a real WebCodecs path; parallax
 * WebM needs frame composition).
 */
export function createBrowserProviders(
  config: CreateBrowserProvidersConfig = {}
): HologramProviders {
  return {
    depth: new BrowserDepthProvider(config.depth),
    quilt: new BrowserQuiltRenderer(config.quilt),
  };
}
