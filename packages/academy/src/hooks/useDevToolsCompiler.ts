import { useEffect } from 'react';
import { getCompilerBridge } from '../lib/wasm-compiler-bridge';
import { initializeDevTools } from '../lib/devtools-init';

/** Extended window for devtools bridge exposure. */
interface DevToolsWindow extends Window {
  CompilerBridge?: ReturnType<typeof getCompilerBridge>;
  getCompilerBridge?: typeof getCompilerBridge;
}

function getDevWindow(): DevToolsWindow {
  return window as unknown as DevToolsWindow;
}

/**
 * Hook that exposes CompilerBridge and DevTools to window for browser testing
 * Use this in a layout or root component to enable console testing
 */
export function useDevToolsCompiler() {
  useEffect(() => {
    try {
      // Initialize devtools first (creates holoscriptTools namespace)
      initializeDevTools();

      const win = getDevWindow();
      // Also expose bridge directly
      const bridge = getCompilerBridge();
      win.CompilerBridge = bridge;
      win.getCompilerBridge = getCompilerBridge;

      console.log('%c✅ CompilerBridge available in window', 'color: #0a0; font-weight: bold;');

      return () => {
        // Cleanup (optional)
      };
    } catch (error) {
      console.error('Failed to initialize DevTools compiler:', error);
    }
  }, []);

  return {
    checkAvailable: () => !!getDevWindow().CompilerBridge,
    getCompilerBridge: () => getDevWindow().CompilerBridge,
  };
}
