import { describe, it, expect } from 'vitest';
import { HoloMCPCompiler } from '../HoloMCPCompiler';
import { DialectRegistry } from '../DialectRegistry';
import { registerBuiltinDialects } from '../registerBuiltinDialects';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

/**
 * P0 smoke test for HoloMCPCompiler — proves the dialect is registered and the
 * skeleton compiles a minimal composition to a structurally valid MCP server
 * manifest without throwing. Tool[] emission is P1 (tested separately when built).
 */
describe('HoloMCPCompiler (P0 skeleton)', () => {
  it('is registered as the mcp-server dialect with the .mcp-server.json extension', () => {
    // Boot builtin dialects via a static import (vitest's ESM context breaks the
    // dynamic require() inside ensureDialectsBooted, which is swallowed silently).
    if (!DialectRegistry.has('mcp-server')) {
      try {
        registerBuiltinDialects();
      } catch {
        /* dialects already (partially) booted in this process */
      }
    }
    const info = DialectRegistry.get('mcp-server');
    expect(info).toBeDefined();
    expect(info?.domain).toBe('ai');
    expect(info?.outputExtensions).toContain('.mcp-server.json');
  });

  it('compiles a minimal composition to a structured MCP server manifest (no throw)', () => {
    const compiler = new HoloMCPCompiler({ serverName: 'test-server' });
    const composition = { objects: [] } as unknown as HoloComposition;

    const out = compiler.compile(composition, '');
    const parsed = JSON.parse(out);

    expect(parsed._generated).toBe('HoloMCPCompiler');
    expect(parsed._configKind).toBe('mcp-server');
    expect(parsed.server.name).toBe('test-server');
    expect(parsed.server.version).toBe('1.0.0');
    expect(Array.isArray(parsed.tools)).toBe(true);
    expect(parsed.tools).toHaveLength(0); // P0 skeleton emits no tools yet
    expect(parsed.sourceObjectCount).toBe(0);
  });

  it('defaults the server name when none is supplied', () => {
    const compiler = new HoloMCPCompiler();
    const composition = { objects: [] } as unknown as HoloComposition;
    const parsed = JSON.parse(compiler.compile(composition, ''));
    expect(parsed.server.name).toBe('holoscript-mcp-server');
  });
});
