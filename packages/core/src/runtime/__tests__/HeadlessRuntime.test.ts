import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──────────────────────────────────────────────────────────────────
// Mock @holoscript/engine/runtime BEFORE importing the module
// ──────────────────────────────────────────────────────────────────

const { mockOriginalTick, mockOriginalGetStats, mockGetProfile, MOCK_HEADLESS_PROFILE } = vi.hoisted(() => ({
  mockOriginalTick: vi.fn().mockReturnValue('tick-result'),
  mockOriginalGetStats: vi.fn(),
  mockGetProfile: vi.fn().mockReturnValue({ name: 'headless' }),
  MOCK_HEADLESS_PROFILE: { type: 'headless' } as const,
}));

vi.mock('@holoscript/engine/runtime', () => ({
  createHeadlessRuntime: vi.fn().mockImplementation(() => ({
    tick: mockOriginalTick,
    getStats: mockOriginalGetStats,
    extra: 'field',
  })),
  getProfile: mockGetProfile,
  HEADLESS_PROFILE: MOCK_HEADLESS_PROFILE,
}));

import {
  createHeadlessRuntime,
  getProfile,
  HEADLESS_PROFILE,
} from '../HeadlessRuntime.js';

// ──────────────────────────────────────────────────────────────────
// Re-exports
// ──────────────────────────────────────────────────────────────────

describe('HeadlessRuntime — re-exports', () => {
  it('re-exports getProfile from engine/runtime', () => {
    expect(getProfile).toBe(mockGetProfile);
  });

  it('re-exports HEADLESS_PROFILE from engine/runtime', () => {
    expect(HEADLESS_PROFILE).toBe(MOCK_HEADLESS_PROFILE);
  });
});

// ──────────────────────────────────────────────────────────────────
// tick patching
// ──────────────────────────────────────────────────────────────────

describe('createHeadlessRuntime — tick patching', () => {
  beforeEach(() => {
    mockOriginalTick.mockClear();
    mockOriginalGetStats.mockClear();
  });

  it('returns an object with a tick function', () => {
    const rt = createHeadlessRuntime({});
    expect(typeof rt.tick).toBe('function');
  });

  it('patched tick delegates to the original tick', () => {
    const rt = createHeadlessRuntime({});
    const result = rt.tick!('arg1', 'arg2');
    expect(mockOriginalTick).toHaveBeenCalledWith('arg1', 'arg2');
    expect(result).toBe('tick-result');
  });

  it('patched tick increments an internal counter each call', () => {
    const rt = createHeadlessRuntime({});
    mockOriginalGetStats.mockReturnValue({});
    rt.tick!();
    rt.tick!();
    rt.tick!();
    const stats = rt.getStats!();
    // localTickCount should be 3 since stats has no tickCount or updateCount
    expect(stats.tickCount).toBe(3);
  });

  it('preserves other fields on the runtime object', () => {
    const rt = createHeadlessRuntime({}) as Record<string, unknown>;
    expect(rt['extra']).toBe('field');
  });
});

// ──────────────────────────────────────────────────────────────────
// getStats patching
// ──────────────────────────────────────────────────────────────────

describe('createHeadlessRuntime — getStats patching', () => {
  beforeEach(() => {
    mockOriginalTick.mockClear();
    mockOriginalGetStats.mockClear();
  });

  it('returns a getStats function', () => {
    const rt = createHeadlessRuntime({});
    expect(typeof rt.getStats).toBe('function');
  });

  it('uses stats.tickCount when present', () => {
    const rt = createHeadlessRuntime({});
    mockOriginalGetStats.mockReturnValue({ tickCount: 42, fps: 60 });
    const stats = rt.getStats!();
    expect(stats.tickCount).toBe(42);
    expect(stats.fps).toBe(60);
  });

  it('falls back to stats.updateCount when tickCount absent', () => {
    const rt = createHeadlessRuntime({});
    mockOriginalGetStats.mockReturnValue({ updateCount: 7 });
    const stats = rt.getStats!();
    expect(stats.tickCount).toBe(7);
  });

  it('falls back to localTickCount when neither tickCount nor updateCount present', () => {
    const rt = createHeadlessRuntime({});
    mockOriginalGetStats.mockReturnValue({});
    rt.tick!();
    rt.tick!();
    const stats = rt.getStats!();
    expect(stats.tickCount).toBe(2);
  });

  it('spreads original stats fields alongside tickCount override', () => {
    const rt = createHeadlessRuntime({});
    mockOriginalGetStats.mockReturnValue({ tickCount: 10, memory: '64mb', uptime: 1234 });
    const stats = rt.getStats!();
    expect(stats.memory).toBe('64mb');
    expect(stats.uptime).toBe(1234);
    expect(stats.tickCount).toBe(10);
  });

  it('passes options to the engine createHeadlessRuntime', async () => {
    const { createHeadlessRuntime: engineCreate } = await import('@holoscript/engine/runtime');
    const opts = { maxTicks: 100 };
    createHeadlessRuntime({}, opts);
    expect(engineCreate).toHaveBeenCalledWith({}, opts);
  });
});

// ──────────────────────────────────────────────────────────────────
// Edge cases — runtime without tick/getStats
// ──────────────────────────────────────────────────────────────────

describe('createHeadlessRuntime — runtime without tick/getStats', () => {
  it('handles engine runtime that has no tick function gracefully', async () => {
    const { createHeadlessRuntime: engineCreate } = await import('@holoscript/engine/runtime');
    (engineCreate as ReturnType<typeof vi.fn>).mockReturnValueOnce({ extra: 'bare' });
    const rt = createHeadlessRuntime({});
    // Should not throw; tick may be undefined
    expect(rt).toBeTruthy();
  });

  it('handles engine runtime that has no getStats function gracefully', async () => {
    const { createHeadlessRuntime: engineCreate } = await import('@holoscript/engine/runtime');
    (engineCreate as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      tick: mockOriginalTick,
    });
    const rt = createHeadlessRuntime({});
    expect(rt).toBeTruthy();
    // getStats absent — no patch applied, field should be undefined
    expect(rt.getStats).toBeUndefined();
  });
});
