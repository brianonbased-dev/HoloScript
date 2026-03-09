import { test, expect } from '@playwright/test';

/**
 * WASM Integration E2E — verifies the real WASM binary loads in a browser
 * and the compiler bridge reports 'wasm-component' backend.
 */

test.describe('WASM Integration', () => {
  test('compiler bridge loads WASM component in browser', async ({ page }) => {
    // Collect console output for diagnostics
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));

    await page.goto('/create');
    await page.waitForLoadState('networkidle');

    // Evaluate in-browser: create a bridge, init it, check status
    const status = await page.evaluate(async () => {
      // Dynamic import from the studio bundle
      const { CompilerBridge } = await import('/src/lib/wasm-compiler-bridge.ts');
      const bridge = new CompilerBridge();
      try {
        const result = await bridge.init('/wasm/holoscript.component.wasm');
        return {
          backend: result.backend,
          wasmLoaded: result.wasmLoaded,
          binarySize: result.binarySize,
          version: result.version,
          world: result.world,
        };
      } catch (e) {
        return {
          error: String(e),
          backend: 'failed',
          wasmLoaded: false,
          binarySize: 0,
          version: '',
          world: '',
        };
      } finally {
        bridge.destroy();
      }
    });

    // The bridge should report wasm-component backend
    expect(status.wasmLoaded).toBe(true);
    expect(status.backend).toBe('wasm-component');
    expect(status.binarySize).toBeGreaterThan(0);
  });

  test('WASM parse produces valid AST', async ({ page }) => {
    await page.goto('/create');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { CompilerBridge } = await import('/src/lib/wasm-compiler-bridge.ts');
      const bridge = new CompilerBridge();
      try {
        await bridge.init('/wasm/holoscript.component.wasm');
        const parseResult = await bridge.parse(
          'composition "Test" { object "Cube" { geometry: "cube" } }'
        );
        return { hasAst: !!parseResult.ast, hasErrors: !!parseResult.errors };
      } catch (e) {
        return { error: String(e), hasAst: false, hasErrors: true };
      } finally {
        bridge.destroy();
      }
    });

    expect(result.hasAst).toBe(true);
    expect(result.hasErrors).toBeFalsy();
  });

  test('WASM compile produces Three.js output', async ({ page }) => {
    await page.goto('/create');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { CompilerBridge } = await import('/src/lib/wasm-compiler-bridge.ts');
      const bridge = new CompilerBridge();
      try {
        await bridge.init('/wasm/holoscript.component.wasm');
        const compileResult = await bridge.compile(
          'composition "Test" { object "Cube" { geometry: "cube" position: [0, 1, 0] } }',
          'threejs'
        );
        return {
          type: compileResult.type,
          hasData: compileResult.type === 'text' && compileResult.data.length > 0,
        };
      } catch (e) {
        return { error: String(e), type: 'error', hasData: false };
      } finally {
        bridge.destroy();
      }
    });

    expect(result.type).toBe('text');
    expect(result.hasData).toBe(true);
  });

  test('WASM serves static files correctly', async ({ page }) => {
    // Verify the WASM files are served by the dev server
    const coreWasm = await page.request.head('/wasm/holoscript.core.wasm');
    expect(coreWasm.ok()).toBe(true);
    expect(coreWasm.headers()['content-length']).toBeDefined();

    const jsWrapper = await page.request.head('/wasm/holoscript.js');
    expect(jsWrapper.ok()).toBe(true);

    const core2Wasm = await page.request.head('/wasm/holoscript.core2.wasm');
    expect(core2Wasm.ok()).toBe(true);
  });
});
