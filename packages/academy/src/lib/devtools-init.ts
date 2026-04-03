/**
 * Browser DevTools Initialization
 *
 * Exposes development utilities to window for browser testing
 */

/** Extended window interface for HoloScript dev tooling. */
interface CompilerBridge {
  parse(code: string): Promise<unknown>;
}

interface HoloScriptDevToolsWindow extends Window {
  CompilerBridge?: CompilerBridge;
  __HOLOSCRIPT_CORE__?: unknown;
  holoscriptTools?: unknown;
}

function getDevWindow(): HoloScriptDevToolsWindow {
  return window as unknown as HoloScriptDevToolsWindow;
}

export function initializeDevTools() {
  if (typeof window === 'undefined') return;

  const win = getDevWindow();

  // Define simple diagnostic tools
  const tools = {
    checkStatus: () => {
      console.log('🔍 HoloScript Studio Status Check\n');

      // Check for CompilerBridge
      const hasBridge = !!win.CompilerBridge;
      console.log(`  CompilerBridge available: ${hasBridge ? '✅' : '❌'}`);

      // Check for @holoscript packages
      const hasCore = !!win.__HOLOSCRIPT_CORE__;
      console.log(`  @holoscript/core available: ${hasCore ? '✅' : '❌'}`);

      // Check for other tools
      const hasTools =
        Object.keys(win).filter((k) => k.includes('compiler') || k.includes('holoscript'))
          .length > 0;
      console.log(`  Other HoloScript tools: ${hasTools ? '✅' : '⚠️'}`);

      return { hasBridge, hasCore, hasTools };
    },

    // Test if we can access any compiler
    testCompile: async (code: string = 'composition "T" { object "O" { geometry: "sphere" } }') => {
      console.log('🧪 Testing compilation...\n');

      // Try CompilerBridge
      if (win.CompilerBridge) {
        try {
          console.log('  Attempting parse via CompilerBridge...');
          const start = performance.now();
          const result = await win.CompilerBridge.parse(code);
          const time = performance.now() - start;
          console.log(`  ✅ Parse successful: ${time.toFixed(2)}ms`);
          return { success: true, backend: 'WASM', time, result };
        } catch (e) {
          console.error(`  ❌ CompilerBridge failed:`, e instanceof Error ? e.message : String(e));
        }
      }

      console.log('  ℹ️  No compiler available - try loading Studio components first');
      return { success: false, backend: 'none' };
    },

    // Show available commands
    help: () => {
      const commands = [
        'window.holoscriptTools.checkStatus()',
        'window.holoscriptTools.testCompile()',
        'window.holoscriptTools.help()',
      ];
      console.log(
        '📚 HoloScript DevTools Commands:\n' + commands.map((c) => `  • ${c}`).join('\n') + '\n'
      );
    },
  };

  // Attach to window
  win.holoscriptTools = tools;

  console.log('%c✅ HoloScript DevTools Ready', 'color: #0a0; font-weight: bold; font-size: 13px');
  console.log('%cRun: window.holoscriptTools.help()', 'color: #0a0; font-size: 12px');
}
