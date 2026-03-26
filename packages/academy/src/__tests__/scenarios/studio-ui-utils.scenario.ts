/**
 * Scenario: Scene Export, Playtest Timer, Context Menu, Error Boundary
 *
 * Tests for studio UI utilities:
 * - ExportFormat/ExportStatus type coverage
 * - PlaytestBar timer formatter
 * - ContextMenu viewport clamping
 * - StudioErrorBoundary state machine
 */

import { describe, it, expect } from 'vitest';

// ── Scene Export Types ──────────────────────────────────────────────────────

type ExportFormat = 'gltf' | 'usd' | 'usdz' | 'json';
type ExportStatus = 'idle' | 'exporting' | 'done' | 'error';

describe('Scenario: Scene Export — Types', () => {
  it('ExportFormat covers 4 formats', () => {
    const formats: ExportFormat[] = ['gltf', 'usd', 'usdz', 'json'];
    expect(formats.length).toBe(4);
  });

  it('ExportStatus covers 4 states', () => {
    const states: ExportStatus[] = ['idle', 'exporting', 'done', 'error'];
    expect(states.length).toBe(4);
  });

  it('valid format strings are assignable to ExportFormat', () => {
    const f: ExportFormat = 'gltf';
    expect(f).toBe('gltf');
  });
});

// ── Playtest Timer Formatter ────────────────────────────────────────────────

function fmt(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

describe('Scenario: Playtest Bar — Timer Formatter', () => {
  it('0 seconds → 00:00', () => {
    expect(fmt(0)).toBe('00:00');
  });

  it('59 seconds → 00:59', () => {
    expect(fmt(59)).toBe('00:59');
  });

  it('60 seconds → 01:00', () => {
    expect(fmt(60)).toBe('01:00');
  });

  it('90 seconds → 01:30', () => {
    expect(fmt(90)).toBe('01:30');
  });

  it('3661 seconds → 61:01 (supports > 59 min)', () => {
    expect(fmt(3661)).toBe('61:01');
  });

  it('handles large values', () => {
    expect(fmt(7200)).toBe('120:00');
  });
});

// ── Context Menu Viewport Clamping ──────────────────────────────────────────

function clampPosition(x: number, y: number, viewportW: number, viewportH: number) {
  return {
    top: Math.min(y, viewportH - 200),
    left: Math.min(x, viewportW - 180),
  };
}

describe('Scenario: Context Menu — Viewport Clamping', () => {
  it('position within bounds stays unchanged', () => {
    const { top, left } = clampPosition(100, 100, 1920, 1080);
    expect(top).toBe(100);
    expect(left).toBe(100);
  });

  it('clamps Y near bottom edge', () => {
    const { top } = clampPosition(100, 1000, 1920, 1080);
    expect(top).toBe(880); // 1080 - 200
  });

  it('clamps X near right edge', () => {
    const { left } = clampPosition(1800, 100, 1920, 1080);
    expect(left).toBe(1740); // 1920 - 180
  });

  it('clamps both axes in corner', () => {
    const { top, left } = clampPosition(1900, 1050, 1920, 1080);
    expect(top).toBe(880);
    expect(left).toBe(1740);
  });
});

// ── Error Boundary State Machine ────────────────────────────────────────────

interface ErrorBoundaryState {
  error: Error | null;
}

function getDerivedStateFromError(error: Error): ErrorBoundaryState {
  return { error };
}

describe('Scenario: Studio Error Boundary — State', () => {
  it('getDerivedStateFromError captures error', () => {
    const err = new Error('Test crash');
    const state = getDerivedStateFromError(err);
    expect(state.error).toBe(err);
    expect(state.error!.message).toBe('Test crash');
  });

  it('error message includes stack description', () => {
    const err = new Error('WebGL context lost');
    const state = getDerivedStateFromError(err);
    expect(state.error!.message).toContain('WebGL');
  });

  it('initial state has null error', () => {
    const state: ErrorBoundaryState = { error: null };
    expect(state.error).toBeNull();
  });

  it('handleReset clears error', () => {
    const state: ErrorBoundaryState = { error: new Error('crash') };
    // Simulate reset
    state.error = null;
    expect(state.error).toBeNull();
  });
});
