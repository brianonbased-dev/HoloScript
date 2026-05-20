import { describe, expect, it } from 'vitest';

import {
  buildAdaptivePlatformLayerReceipt,
  inferAdaptivePlatformTier,
} from '../adaptive-platform-layers';
import type { PlatformCapabilities } from '../platform-detect';

function caps(overrides: Partial<PlatformCapabilities> = {}): PlatformCapabilities {
  return {
    runtime: 'browser',
    isTauri: false,
    hasWasm: true,
    hasWasmThreads: false,
    hasWasmSIMD: true,
    hasWasmComponentModel: true,
    hasWebWorkers: true,
    hasSharedArrayBuffer: false,
    hasWebGPU: false,
    hasWebGL2: true,
    hasWebGL1: true,
    hasWebXR: true,
    hasWebXRImmersive: true,
    hasWebXRAR: false,
    hasIndexedDB: true,
    hasOPFS: true,
    hasServiceWorker: true,
    isSecureContext: true,
    hardwareConcurrency: 8,
    deviceMemoryGB: 8,
    recommendedWorld: 'holoscript-runtime',
    recommendedBackend: 'wasm-component',
    ...overrides,
  };
}

describe('adaptive-platform-layers', () => {
  it('classifies Tauri as the desktop tier', () => {
    expect(inferAdaptivePlatformTier({ runtime: 'tauri', isTauri: true })).toBe('desktop');
  });

  it('classifies Quest and phone user agents as the mobile tier', () => {
    expect(
      inferAdaptivePlatformTier(
        { runtime: 'browser', isTauri: false },
        'Mozilla/5.0 (X11; Linux x86_64) OculusBrowser/34.0 Meta Quest'
      )
    ).toBe('mobile');
    expect(
      inferAdaptivePlatformTier(
        { runtime: 'browser', isTauri: false },
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile'
      )
    ).toBe('mobile');
  });

  it('builds a WebXR viewer receipt for browser WASM component delivery', () => {
    const receipt = buildAdaptivePlatformLayerReceipt(caps(), 'desktop chrome');

    expect(receipt.tier).toBe('web');
    expect(receipt.shell).toBe('web-studio');
    expect(receipt.engineDelivery).toBe('wasm-component-wit');
    expect(receipt.witWorld).toBe('holoscript-runtime');
    expect(receipt.compilerBackend).toBe('wasm-component');
    expect(receipt.renderer).toBe('webxr');
    expect(receipt.shareableViewerReady).toBe(true);
    expect(receipt.evidence).toContain('renderer=webxr');
  });

  it('keeps the same WIT world visible when desktop swaps delivery to native Rust', () => {
    const receipt = buildAdaptivePlatformLayerReceipt(
      caps({
        runtime: 'tauri',
        isTauri: true,
        hasWebXR: false,
        hasWebXRImmersive: false,
        hasWebXRAR: false,
      })
    );

    expect(receipt.tier).toBe('desktop');
    expect(receipt.shell).toBe('tauri-desktop');
    expect(receipt.engineDelivery).toBe('native-rust-wit');
    expect(receipt.witWorld).toBe('holoscript-runtime');
    expect(receipt.renderer).toBe('native-gpu');
    expect(receipt.parityStory.desktop).toContain('same WIT surface');
  });

  it('uses parser-sized worlds for mobile companion receipts', () => {
    const receipt = buildAdaptivePlatformLayerReceipt(
      caps({
        hasWebXRImmersive: false,
        hasWebXRAR: true,
        recommendedWorld: 'holoscript-parser',
      }),
      'Mozilla/5.0 (Android 16; Mobile)'
    );

    expect(receipt.tier).toBe('mobile');
    expect(receipt.shell).toBe('mobile-ar-companion');
    expect(receipt.witWorld).toBe('holoscript-parser');
    expect(receipt.renderer).toBe('webxr');
    expect(receipt.shareableViewerReady).toBe(true);
  });
});
