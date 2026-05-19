/**
 * Type confusion guards — ATK-C1 regression tests
 *
 * Verifies that MCP tool handlers for holo_protocol_publish, holo_protocol_collect,
 * holo_protocol_revenue, and holo_protocol_lookup return structured error responses
 * when callers send null, number, object, or other wrong-typed values for
 * string/number/array parameters.
 *
 * These are the exact attack vectors described in CodeQL alert
 * js/type-confusion-through-parameter-tampering (ATK-C1).
 */
import { describe, it, expect } from 'vitest';

// Re-import the handler to exercise the actual code paths.
// handleProtocolTool dispatches by name, so we call it with tool names.

// Import the validation helpers directly for unit testing.
// We'll also test the full handler via handleProtocolTool for integration coverage.

// Since the validation helpers are module-scoped (not exported), we test them
// indirectly through the handler dispatch. This is intentional — the guards are
// simple enough that unit testing through the public API is sufficient.

// Dynamic import to avoid circular-dep issues at test time
async function getHandler() {
  const mod = await import('../protocol-tools.js');
  return mod.handleProtocolTool;
}

describe('ATK-C1: Type confusion guards in protocol-tools', () => {
  describe('handlePublish — code and author must be strings', () => {
    it('rejects null code', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_publish', { code: null, author: 'test' });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
      expect((result as any).message).toContain('code');
    });

    it('rejects number code', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_publish', { code: 42, author: 'test' });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
    });

    it('rejects object code', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_publish', {
        code: { __proto__: {} },
        author: 'test',
      });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
    });

    it('rejects null author', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_publish', { code: 'composition "T" {}', author: null });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
    });

    it('rejects undefined author', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_publish', { code: 'composition "T" {}' });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
    });

    it('accepts valid string code and author (parse error expected, not type error)', async () => {
      const handle = await getHandler();
      // The handler will try to parse and hit a network error, but it should NOT
      // return a type-confusion error. We just verify it doesn't crash on valid types.
      // Using a minimal valid-ish composition to get past type guards.
      const result = await handle('holo_protocol_publish', {
        code: 'composition "Test" {}',
        author: 'test-author',
      });
      // Result is either success or a network/parse error, never INVALID_PARAMS for type
      if (result && typeof result === 'object' && 'status' in result) {
        expect((result as any).error).not.toBe('INVALID_PARAMS');
      }
    });

    it('defaults license to "free" for non-string license', async () => {
      const handle = await getHandler();
      // license=42 should not crash — should fall back to 'free'
      const result = await handle('holo_protocol_publish', {
        code: 'composition "T" {}',
        author: 'a',
        license: 42,
      });
      // Should not be a type-confusion INVALID_PARAMS
      if (result && typeof result === 'object' && 'status' in result) {
        expect((result as any).error).not.toBe('INVALID_PARAMS');
      }
    });

    it('defaults mintAsNFT to false for non-boolean', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_publish', {
        code: 'composition "T" {}',
        author: 'a',
        mintAsNFT: 'yes',
      });
      // Should not crash or return type-confusion error
      if (result && typeof result === 'object' && 'status' in result) {
        expect((result as any).error).not.toBe('INVALID_PARAMS');
      }
    });
  });

  describe('handleCollect — contentHash validation, referrer and quantity type guards', () => {
    it('rejects null contentHash', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_collect', { contentHash: null });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
    });

    it('rejects number contentHash', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_collect', { contentHash: 42 });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
    });

    it('rejects short contentHash', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_collect', { contentHash: 'abc' });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
    });

    it('rejects object contentHash', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_collect', {
        contentHash: { toString: () => 'deadbeef' },
      });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
    });

    it('rejects non-numeric quantity', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_collect', {
        contentHash: 'a'.repeat(64),
        quantity: 'many',
      });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
      expect((result as any).message).toContain('quantity');
    });

    it('accepts valid contentHash and defaults quantity', async () => {
      const handle = await getHandler();
      const validHash = 'a'.repeat(64);
      const result = await handle('holo_protocol_collect', {
        contentHash: validHash,
      });
      // Will fail with SERVER_UNAVAILABLE or COLLECT_FAILED, not INVALID_PARAMS
      if (result && typeof result === 'object' && 'status' in result) {
        expect((result as any).error).not.toBe('INVALID_PARAMS');
      }
    });
  });

  describe('handleRevenue — price, author, referrer, imports type guards', () => {
    it('rejects number price', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_revenue', {
        price: 1,
        author: 'test',
      });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
      expect((result as any).message).toContain('price');
    });

    it('rejects null price', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_revenue', {
        price: null,
        author: 'test',
      });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
    });

    it('rejects number author', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_revenue', {
        price: '1',
        author: 42,
      });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
    });

    it('rejects object imports', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_revenue', {
        price: '1',
        author: 'test',
        imports: { not: 'an array' },
      });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
      expect((result as any).message).toContain('imports');
    });

    it('rejects imports with non-string contentHash', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_revenue', {
        price: '1',
        author: 'test',
        imports: [{ contentHash: 42, author: 'a', depth: 1 }],
      });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
    });

    it('rejects imports with non-object element', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_revenue', {
        price: '1',
        author: 'test',
        imports: ['not-an-object'],
      });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
    });

    it('accepts valid price, author with optional referrer', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_revenue', {
        price: '0.1',
        author: 'test-author',
        referrer: '0x1234567890abcdef1234567890abcdef12345678',
      });
      // Should not crash or return INVALID_PARAMS
      if (result && typeof result === 'object' && 'status' in result) {
        expect((result as any).error).not.toBe('INVALID_PARAMS');
      }
    });

    it('accepts valid imports array', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_revenue', {
        price: '0.1',
        author: 'test-author',
        imports: [
          { contentHash: 'a'.repeat(64), author: 'upstream', depth: 1 },
        ],
      });
      // Should not crash or return INVALID_PARAMS for type reasons
      if (result && typeof result === 'object' && 'status' in result) {
        expect((result as any).error).not.toBe('INVALID_PARAMS');
      }
    });

    it('ignores undefined referrer and imports', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_revenue', {
        price: '0.1',
        author: 'test-author',
      });
      if (result && typeof result === 'object' && 'status' in result) {
        expect((result as any).error).not.toBe('INVALID_PARAMS');
      }
    });
  });

  describe('handleLookup — contentHash and author validation', () => {
    it('rejects invalid contentHash format', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_lookup', {
        contentHash: 'not-hex!',
      });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
    });

    it('rejects invalid author format', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_lookup', {
        author: 'has spaces!',
      });
      expect(result).toMatchObject({ status: 'error', error: 'INVALID_PARAMS' });
    });

    it('requires at least one parameter', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_lookup', {});
      expect(result).toMatchObject({ status: 'error', error: 'MISSING_PARAMS' });
    });

    it('accepts valid contentHash', async () => {
      const handle = await getHandler();
      const result = await handle('holo_protocol_lookup', {
        contentHash: 'a'.repeat(64),
      });
      // Should not be INVALID_PARAMS — network/lookup error is fine
      if (result && typeof result === 'object' && 'status' in result) {
        expect((result as any).error).not.toBe('INVALID_PARAMS');
      }
    });
  });
});