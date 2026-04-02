'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';

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

        // Expose directly to window
        (window as any).CompilerBridge = bridge;

        // Create tools namespace
        (window as any).holoscriptTools = {
          checkStatus: () => {
            logger.debug(
              '🔍 Status: CompilerBridge =',
              !!(window as any).CompilerBridge ? '✅' : '❌'
            );
            return { ready: !!(window as any).CompilerBridge };
          },
          test: async () => {
            if (!(window as any).CompilerBridge) {
              logger.error('❌ CompilerBridge not ready');
              return;
            }
            try {
              const code = `composition "T" { object "O" { geometry: "sphere" } }`;
              const start = performance.now();
              const result = await (window as any).CompilerBridge.parse(code);
              const time = performance.now() - start;
              logger.debug(`✅ Parse: ${time.toFixed(2)}ms`);
              return { success: true, time };
            } catch (e: any) {
              logger.error('❌ Parse failed:', e.message);
              return { success: false, error: e.message };
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
