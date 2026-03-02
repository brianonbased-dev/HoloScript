/**
 * tree-sitter-holoscript Node.js bindings
 *
 * Loading strategy (automatic fallback):
 *   1. Try native C++ binding via node-gyp-build (fastest, requires prebuild)
 *   2. Fall back to web-tree-sitter WASM runtime (portable, ~10x slower parse)
 *   3. Export null if neither is available (LSP/consumers degrade gracefully)
 *
 * The exported object shape matches tree-sitter conventions:
 *   - Native: { name: 'holoscript', language: External<void*> }
 *   - WASM:   null synchronously, but provides initWasm() for async loading
 *
 * For WASM fallback, consumers should call:
 *   const mod = require('tree-sitter-holoscript');
 *   if (!mod) {
 *     // Try WASM fallback
 *     const { initHoloScript } = require('tree-sitter-holoscript/wasm');
 *     const { parser, language } = await initHoloScript();
 *   }
 *
 * Or use the unified async loader:
 *   const { loadHoloScript } = require('tree-sitter-holoscript');
 *   const result = await loadHoloScript(); // tries native, then WASM
 */

'use strict';

const path = require('path');

let nativeBinding = null;
let loadError = null;

try {
  // Attempt 1: Native C++ binding (fastest path)
  nativeBinding = require('node-gyp-build')(path.join(__dirname, '..', '..'));
} catch (e) {
  loadError = e;
}

/**
 * Attempt to load the WASM fallback.
 * Returns a Promise that resolves to { parser, language, isWasm: true }
 * or rejects if WASM is also unavailable.
 *
 * @param {object} [options]
 * @param {string} [options.wasmPath] - Custom path to the .wasm file
 * @returns {Promise<{parser: object, language: object, isWasm: boolean}>}
 */
async function initWasm(options) {
  try {
    const webBinding = require('../web/index.js');
    return await webBinding.initHoloScript(options);
  } catch (wasmErr) {
    const msg = [
      '[tree-sitter-holoscript] Neither native nor WASM binding available.',
      `  Native error: ${loadError ? loadError.message : 'N/A'}`,
      `  WASM error: ${wasmErr.message}`,
      '',
      'To fix, either:',
      '  1. Rebuild native: npm rebuild tree-sitter-holoscript',
      '  2. Install WASM deps: npm install web-tree-sitter && npm run build:wasm',
    ].join('\n');
    throw new Error(msg);
  }
}

/**
 * Unified async loader that tries native binding first, then WASM fallback.
 * Use this when you want transparent native-or-WASM loading.
 *
 * @param {object} [options]
 * @param {string} [options.wasmPath] - Custom path to the .wasm file
 * @returns {Promise<{binding: object|null, parser?: object, language?: object, isWasm: boolean}>}
 */
async function loadHoloScript(options) {
  if (nativeBinding) {
    return { binding: nativeBinding, isWasm: false };
  }

  // Native failed, try WASM
  try {
    const result = await initWasm(options);
    return { binding: null, ...result };
  } catch (_e) {
    // Both failed
    return { binding: null, isWasm: false };
  }
}

if (nativeBinding) {
  // Native binding loaded successfully -- export it directly
  // (compatible with tree-sitter Parser.setLanguage())
  module.exports = nativeBinding;
} else {
  // Native binding unavailable -- export null for synchronous consumers.
  // Async consumers should use loadHoloScript() or initWasm().
  console.warn(
    '[tree-sitter-holoscript] Native binding not found. ' +
    'WASM fallback available via: require("tree-sitter-holoscript").initWasm() ' +
    'or require("tree-sitter-holoscript/wasm")'
  );
  module.exports = null;
}

// Attach async helpers to the export regardless of native/WASM mode.
// This allows: const mod = require('tree-sitter-holoscript');
//              const { parser } = await mod.loadHoloScript();
if (module.exports !== null) {
  module.exports.initWasm = initWasm;
  module.exports.loadHoloScript = loadHoloScript;
  module.exports.isWasm = false;
} else {
  // When null, we can't attach properties. Export an object with helpers instead.
  module.exports = {
    initWasm,
    loadHoloScript,
    isWasm: null,  // null = not yet determined (native failed, WASM not tried)
    language: null,
    name: 'holoscript',
  };
}
