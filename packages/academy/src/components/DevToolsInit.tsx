'use client';

import { useEffect } from 'react';

/** Extended window interface for HoloScript dev tooling. */
interface CompilerBridge {
  parse(code: string): Promise<unknown>;
}

interface HoloScriptDevToolsWindow extends Window {
  CompilerBridge?: CompilerBridge;
  holoscriptTools?: unknown;
}

function getDevWindow(): HoloScriptDevToolsWindow {
  return window as unknown as HoloScriptDevToolsWindow;
}

/**
 * DevTools initializer - runs on app startup to expose CompilerBridge to window
 */
export function DevToolsInit() {
  useEffect(() => {
    const initDevTools = async () => {
      try {
        const win = getDevWindow();
        // Dynamic import to avoid build issues
        const { getCompilerBridge } = await import('../lib/wasm-compiler-bridge');
        const bridge = getCompilerBridge();

        // Expose directly to window
        win.CompilerBridge = bridge;

        // Create tools namespace
        win.holoscriptTools = {
          checkStatus: () => {
            console.log(
              '🔍 Status: CompilerBridge =',
              !!win.CompilerBridge ? '✅' : '❌'
            );
            return { ready: !!win.CompilerBridge };
          },
          test: async () => {
            if (!win.CompilerBridge) {
              console.error('❌ CompilerBridge not ready');
              return;
            }
            try {
              const code = `composition "T" { object "O" { geometry: "sphere" } }`;
              const start = performance.now();
              await win.CompilerBridge.parse(code);
              const time = performance.now() - start;
              console.log(`✅ Parse: ${time.toFixed(2)}ms`);
              return { success: true, time };
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              console.error('❌ Parse failed:', msg);
              return { success: false, error: msg };
            }
          },
        };

        console.log('%c✅ DevTools Ready', 'color: #0a0; font-weight: bold');
      } catch (e) {
        console.error('Failed to init DevTools:', e);
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
