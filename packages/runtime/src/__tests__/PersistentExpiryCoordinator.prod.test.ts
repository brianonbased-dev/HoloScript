/**
 * PersistentExpiryCoordinator — Production Test Suite
 *
 * Integration: drive the REAL PersistentTrait with a short TTL, advance past
 * expiry, tick, and assert a consumer observed `persistent_expired` for the key.
 * Fails against the emit-only stub (0 listeners → expiry goes unhandled).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { EventBus } from '../events';
import {
  PersistentExpiryCoordinator,
  createPersistentExpiryCoordinator,
} from '../PersistentExpiryCoordinator';
import { persistentHandler } from '../../../core/src/traits/PersistentTrait';

function makeTraitContext(bus: EventBus) {
  const spy = vi.fn((event: string, payload?: unknown) => bus.emit(event, payload));
  return { emit: spy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Remove a key's file-backend artifact so tests stay hermetic. */
function cleanupFileKey(key: string) {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fp = path.join(process.cwd(), '.holo-persist', `${safe}.json`);
  if (fs.existsSync(fp)) fs.rmSync(fp);
}

describe('PersistentExpiryCoordinator — Pattern E wiring', () => {
  it('registers a listener for persistent_expired (0 before this code)', () => {
    const bus = new EventBus();
    expect(bus.listenerCount('persistent_expired')).toBe(0);
    const coord = new PersistentExpiryCoordinator({ bus });
    coord.start();
    expect(bus.listenerCount('persistent_expired')).toBeGreaterThan(0);
  });

  it('observes persistent_expired for a file-backed key past its TTL (the done-when)', () => {
    const key = `expiry_test_${Math.random().toString(36).slice(2)}`;
    try {
      const t0 = 1_000_000_000;
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(t0);

      const bus = new EventBus();
      const coord = createPersistentExpiryCoordinator({ bus });

      const node: any = { id: 'persist_node_1' };
      const ctx = makeTraitContext(bus);
      const cfg = { key, ttlMs: 100, backend: 'file' as const, defaultValue: 'cached-data' };
      persistentHandler.onAttach!(node, cfg, ctx as any);

      // Before expiry: a tick should NOT report expiry.
      persistentHandler.onUpdate!(node, cfg, ctx as any, 0.016);
      expect(coord.isInvalidated(key)).toBe(false);

      // Advance well past the TTL, then tick.
      nowSpy.mockReturnValue(t0 + 500);
      persistentHandler.onUpdate!(node, cfg, ctx as any, 0.016);

      expect(ctx.emit).toHaveBeenCalledWith('persistent_expired', expect.objectContaining({ key }));
      expect(coord.isInvalidated(key)).toBe(true);
      const rec = coord.getInvalidation(key)!;
      expect(rec.key).toBe(key);
      expect(rec.nodeId).toBe('persist_node_1');
      // lastValue captured from the attach event.
      expect(rec.lastValue).toBe('cached-data');
    } finally {
      cleanupFileKey(key);
    }
  });

  it('recovers a fresh value on expiry when a recovery provider is registered', () => {
    const key = `recover_test_${Math.random().toString(36).slice(2)}`;
    try {
      const t0 = 2_000_000_000;
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(t0);
      const bus = new EventBus();
      const coord = createPersistentExpiryCoordinator({ bus });

      const recovered = vi.fn();
      bus.on('persistent_recovered', recovered);
      coord.registerRecovery(key, () => 'fresh-value');

      const node: any = { id: 'persist_node_1' };
      const ctx = makeTraitContext(bus);
      const cfg = { key, ttlMs: 50, backend: 'memory' as const, defaultValue: 'stale' };
      persistentHandler.onAttach!(node, cfg, ctx as any);

      nowSpy.mockReturnValue(t0 + 200);
      persistentHandler.onUpdate!(node, cfg, ctx as any, 0.016);

      const rec = coord.getInvalidation(key)!;
      expect(rec.recovered).toBe(true);
      expect(rec.recoveredValue).toBe('fresh-value');
      expect(recovered).toHaveBeenCalledWith(
        expect.objectContaining({ key, value: 'fresh-value' })
      );
    } finally {
      cleanupFileKey(key);
    }
  });

  it('a fresh write after expiry clears the invalidation', () => {
    const key = `rewrite_test_${Math.random().toString(36).slice(2)}`;
    const t0 = 3_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(t0);
    const bus = new EventBus();
    const coord = createPersistentExpiryCoordinator({ bus });
    const node: any = { id: 'n' };
    const ctx = makeTraitContext(bus);
    const cfg = { key, ttlMs: 50, backend: 'memory' as const, defaultValue: 'v' };
    persistentHandler.onAttach!(node, cfg, ctx as any);

    nowSpy.mockReturnValue(t0 + 200);
    persistentHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(coord.isInvalidated(key)).toBe(true);

    // A new write for the key (persistent_set) re-validates it.
    persistentHandler.onEvent!(node, cfg, ctx as any, {
      type: 'persistent_set',
      key,
      value: 'new',
    });
    expect(coord.isInvalidated(key)).toBe(false);
  });

  it('non-expiring entry (no TTL) is never invalidated', () => {
    const key = `noexp_test_${Math.random().toString(36).slice(2)}`;
    const bus = new EventBus();
    const coord = createPersistentExpiryCoordinator({ bus });
    const node: any = { id: 'n' };
    const ctx = makeTraitContext(bus);
    const cfg = { key, ttlMs: 0, backend: 'memory' as const, defaultValue: 'v' };
    persistentHandler.onAttach!(node, cfg, ctx as any);
    for (let i = 0; i < 5; i++) persistentHandler.onUpdate!(node, cfg, ctx as any, 1);
    expect(coord.isInvalidated(key)).toBe(false);
  });
});
