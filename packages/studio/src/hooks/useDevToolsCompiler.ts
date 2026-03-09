import { useEffect } from 'react';
import { getCompilerBridge } from '../lib/wasm-compiler-bridge';
import { initializeDevTools } from '../lib/devtools-init';

/**
 * Hook that exposes CompilerBridge and DevTools to window for browser testing
 * Use this in a layout or root component to enable console testing
 */
export function useDevToolsCompiler() {
  useEffect(() => {
    try {
      // Initialize devtools first (creates holoscriptTools namespace)
      initializeDevTools();

      // Also expose bridge directly
      const bridge = getCompilerBridge();
      (window as any).CompilerBridge = bridge;
      (window as any).getCompilerBridge = getCompilerBridge;

      console.log('%c✅ CompilerBridge available in window', 'color: #0a0; font-weight: bold;');

      return () => {
        // Cleanup (optional)
      };
    } catch (error) {
      console.error('Failed to initialize DevTools compiler:', error);
    }
  }, []);

  return {
    checkAvailable: () => !!(window as any).CompilerBridge,
    getCompilerBridge: () => (window as any).CompilerBridge,
  };
}
