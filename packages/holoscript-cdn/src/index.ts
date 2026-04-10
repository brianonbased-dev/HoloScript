/**
 * @holoscript/cdn — Browser CDN distribution
 *
 * Exposes <holo-scene> custom element for embedding HoloScript scenes
 * in any webpage via a CDN script tag.
 *
 * Usage:
 *   <script src="https://cdn.holoscript.net/v4.min.js"></script>
 *   <holo-scene src="./my-world.hs" target="webxr" fallback="threejs"></holo-scene>
 *
 * @version 1.0.0
 */

export { HoloSceneElement, registerHoloScene } from './HoloSceneElement.js';
export { HoloSceneRenderer } from './HoloSceneRenderer.js';
export { HoloCDNConfig, defaultCDNConfig } from './config.js';
export type { HoloSceneAttributes, HoloSceneTarget, HoloSceneFallback } from './types.js';
