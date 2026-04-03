'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

/** Augment window with HoloScript dev tools */
interface HoloScriptDevWindow extends Window {
  CompilerBridge?: { parse: (code: string) => Promise<unknown> };
  holoscriptTools?: {
    checkStatus: () => { ready: boolean };
    test: () => Promise<{ success: boolean; time?: number; error?: string } | undefined>;
  };
}

function getDevWindow(): HoloScriptDevWindow {
  return window as unknown as HoloScriptDevWindow;
}

/**
 * DevTools initializer - runs on app startup to expose CompilerBridge to window
 */
export function DevToolsInit() {
  useEffect(() => {
    const initDevTools = async () => {
      try {
        // Dynamic import to avoid build issues
        const { getCompilerBridge } = await import('../lib/wasm-compiler-bridge');
        const bridge = getCompilerBridge();
        const devWin = getDevWindow();

        // Expose directly to window
        devWin.CompilerBridge = bridge;

        // Create tools namespace
        devWin.holoscriptTools = {
          checkStatus: () => {
            logger.debug(
              '🔍 Status: CompilerBridge =',
              !!getDevWindow().CompilerBridge ? '✅' : '❌'
            );
            return { ready: !!getDevWindow().CompilerBridge };
          },
          test: async () => {
            if (!getDevWindow().CompilerBridge) {
              logger.error('❌ CompilerBridge not ready');
              return;
            }
            try {
              const code = `composition "T" { object "O" { geometry: "sphere" } }`;
              const start = performance.now();
              await getDevWindow().CompilerBridge!.parse(code);
              const time = performance.now() - start;
              logger.debug(`✅ Parse: ${time.toFixed(2)}ms`);
              return { success: true, time };
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              logger.error('❌ Parse failed:', msg);
              return { success: false, error: msg };
            }
          },
        };

        logger.debug('%c✅ DevTools Ready', 'color: #0a0; font-weight: bold');
      } catch (e) {
        logger.error('[DevToolsInit] Failed to init DevTools:', e);
      }
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => initDevTools(), { timeout: 2000 });
    } else {
      setTimeout(initDevTools, 100);
    }
  }, []);

  return null;
}
