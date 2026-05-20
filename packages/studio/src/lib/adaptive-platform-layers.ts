import type { PlatformCapabilities } from './platform-detect';

export type AdaptivePlatformTier = 'web' | 'desktop' | 'mobile' | 'worker' | 'server';
export type AdaptivePlatformShell =
  | 'web-studio'
  | 'tauri-desktop'
  | 'mobile-ar-companion'
  | 'worker-runtime'
  | 'server-runtime';
export type AdaptiveEngineDelivery =
  | 'native-rust-wit'
  | 'wasm-component-wit'
  | 'wasm-legacy'
  | 'typescript-fallback';

export interface AdaptivePlatformLayerReceipt {
  tier: AdaptivePlatformTier;
  shell: AdaptivePlatformShell;
  engineDelivery: AdaptiveEngineDelivery;
  witWorld: PlatformCapabilities['recommendedWorld'];
  compilerBackend: PlatformCapabilities['recommendedBackend'];
  renderer: 'webxr' | 'webgpu' | 'webgl' | 'native-gpu' | 'headless';
  shareableViewerReady: boolean;
  parityStory: {
    web: string;
    desktop: string;
    mobile: string;
  };
  evidence: string[];
}

function userAgentLooksMobile(userAgent: string): boolean {
  return /\b(Android|iPhone|iPad|iPod|Mobile|Quest|Meta Quest|OculusBrowser)\b/i.test(userAgent);
}

export function inferAdaptivePlatformTier(
  caps: Pick<PlatformCapabilities, 'runtime' | 'isTauri'>,
  userAgent = ''
): AdaptivePlatformTier {
  if (caps.isTauri || caps.runtime === 'tauri') return 'desktop';
  if (caps.runtime === 'worker') return 'worker';
  if (caps.runtime === 'node') return 'server';
  if (userAgentLooksMobile(userAgent)) return 'mobile';
  return 'web';
}

function shellForTier(tier: AdaptivePlatformTier): AdaptivePlatformShell {
  switch (tier) {
    case 'desktop':
      return 'tauri-desktop';
    case 'mobile':
      return 'mobile-ar-companion';
    case 'worker':
      return 'worker-runtime';
    case 'server':
      return 'server-runtime';
    case 'web':
    default:
      return 'web-studio';
  }
}

function engineDeliveryFor(
  caps: Pick<PlatformCapabilities, 'isTauri' | 'recommendedBackend'>
): AdaptiveEngineDelivery {
  if (caps.isTauri) return 'native-rust-wit';
  if (caps.recommendedBackend === 'wasm-component') return 'wasm-component-wit';
  if (caps.recommendedBackend === 'wasm-legacy') return 'wasm-legacy';
  return 'typescript-fallback';
}

function rendererFor(caps: PlatformCapabilities): AdaptivePlatformLayerReceipt['renderer'] {
  if (caps.isTauri) return 'native-gpu';
  if (caps.hasWebXRImmersive || caps.hasWebXRAR) return 'webxr';
  if (caps.hasWebGPU) return 'webgpu';
  if (caps.hasWebGL2 || caps.hasWebGL1) return 'webgl';
  return 'headless';
}

export function buildAdaptivePlatformLayerReceipt(
  caps: PlatformCapabilities,
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
): AdaptivePlatformLayerReceipt {
  const tier = inferAdaptivePlatformTier(caps, userAgent);
  const engineDelivery = engineDeliveryFor(caps);
  const renderer = rendererFor(caps);
  const shareableViewerReady = renderer !== 'headless' && caps.recommendedWorld !== 'holoscript-spatial';
  const evidence = [
    `tier=${tier}`,
    `shell=${shellForTier(tier)}`,
    `engine=${engineDelivery}`,
    `wit=${caps.recommendedWorld}`,
    `backend=${caps.recommendedBackend}`,
    `renderer=${renderer}`,
  ];

  return {
    tier,
    shell: shellForTier(tier),
    engineDelivery,
    witWorld: caps.recommendedWorld,
    compilerBackend: caps.recommendedBackend,
    renderer,
    shareableViewerReady,
    parityStory: {
      web: 'Web Studio uses the shared WIT world through the WASM compiler bridge.',
      desktop: 'Tauri desktop keeps the same WIT surface and can swap to native Rust delivery.',
      mobile: 'Mobile companion keeps parser/spatial WIT worlds small for AR-oriented shells.',
    },
    evidence,
  };
}
