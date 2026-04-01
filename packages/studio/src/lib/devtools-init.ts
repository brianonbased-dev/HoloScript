import { logger } from '@/lib/logger';
/**
 * Browser DevTools Initialization
 *
 * Exposes development utilities to window for browser testing
 */

export function initializeDevTools() {
  if (typeof window === 'undefined') return;

  // Define simple diagnostic tools
  const tools = {
    checkStatus: () => {
      logger.debug('🔍 HoloScript Studio Status Check\n');

      // Check for CompilerBridge
      const hasBridge = !!(window as any).CompilerBridge;
      logger.debug(`  CompilerBridge available: ${hasBridge ? '✅' : '❌'}`);

      // Check for @holoscript packages
      const hasCore = !!(window as any).__HOLOSCRIPT_CORE__;
      logger.debug(`  @holoscript/core available: ${hasCore ? '✅' : '❌'}`);

      // Check for other tools
      const hasTools =
        Object.keys(window as any).filter((k) => k.includes('compiler') || k.includes('holoscript'))
          .length > 0;
      logger.debug(`  Other HoloScript tools: ${hasTools ? '✅' : '⚠️'}`);

      return { hasBridge, hasCore, hasTools };
    },

    // Test if we can access any compiler
    testCompile: async (code: string = 'composition "T" { object "O" { geometry: "sphere" } }') => {
      logger.debug('🧪 Testing compilation...\n');

      // Try CompilerBridge
      if ((window as any).CompilerBridge) {
        try {
          logger.debug('  Attempting parse via CompilerBridge...');
          const start = performance.now();
          const result = await (window as any).CompilerBridge.parse(code);
          const time = performance.now() - start;
          logger.debug(`  ✅ Parse successful: ${time.toFixed(2)}ms`);
          return { success: true, backend: 'WASM', time, result };
        } catch (e) {
          logger.error(`  ❌ CompilerBridge failed:`, (e as any).message);
        }
      }

      logger.debug('  ℹ️  No compiler available - try loading Studio components first');
      return { success: false, backend: 'none' };
    },

    // Show available commands
    help: () => {
      const commands = [
        'window.holoscriptTools.checkStatus()',
        'window.holoscriptTools.testCompile()',
        'window.holoscriptTools.help()',
      ];
      logger.debug(
        '📚 HoloScript DevTools Commands:\n' + commands.map((c) => `  • ${c}`).join('\n') + '\n'
      );
    },
  };

  // Attach to window
  (window as any).holoscriptTools = tools;

  logger.debug('%c✅ HoloScript DevTools Ready', 'color: #0a0; font-weight: bold; font-size: 13px');
  logger.debug('%cRun: window.holoscriptTools.help()', 'color: #0a0; font-size: 12px');
}
