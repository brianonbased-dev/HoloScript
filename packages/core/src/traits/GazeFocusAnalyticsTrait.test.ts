import { describe, it, expect, beforeEach } from 'vitest';
import { gazeFocusAnalyticsHandler } from './GazeFocusAnalyticsTrait';
import type {
  GazeFocusAnalyticsConfig,
  GazeFocusHeatmap,
  GazeFocusCell,
} from './GazeFocusAnalyticsTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './__tests__/traitTestHelpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultConfig: Partial<GazeFocusAnalyticsConfig> = {
  resolution: [4, 3], // 12-cell grid — fast and easy to assert
  decay_rate_s: 0,    // no decay by default so tests are deterministic
  export_event: 'session_end',
  export_format: 'json',
  session_id: 'test-session',
  min_confidence: 0.5,
  emit_live_updates: false,
};

function gazeHit(
  u: number,
  v: number,
  dwellDelta = 0.1,
  peerId = 'local',
  confidence = 1.0
): { type: string; uv: [number, number]; dwell_delta_s: number; peer_id: string; confidence: number } {
  return { type: 'eye_gaze_update', uv: [u, v], dwell_delta_s: dwellDelta, peer_id: peerId, confidence };
}

function peerGazeHit(
  u: number,
  v: number,
  peerId: string,
  dwellDelta = 0.1
): { type: string; uv: [number, number]; dwell_delta_s: number; peer_id: string; confidence: number } {
  return { type: 'peer_eye_gaze_update', uv: [u, v], dwell_delta_s: dwellDelta, peer_id: peerId, confidence: 1.0 };
}

interface GazeFocusState {
  cells: GazeFocusCell[];
  peerIds: Set<string>;
  attachedAt: number;
  totalGazeSeconds: number;
  hasRealGaze: boolean;
  lastDecayAt: number;
}

function getState(node: Record<string, unknown>): GazeFocusState {
  return node['__gazeFocusState'] as GazeFocusState;
}

interface GazeFocusAttachedEvent {
  nodeId: string;
  resolution: [number, number];
  sessionId: string;
}

interface GazeFocusExportEvent {
  nodeId: string;
  heatmap: GazeFocusHeatmap;
  payload: string;
  format: string;
  trigger: string;
  requestId?: string;
}

interface GazeFocusInfoEvent {
  queryId: unknown;
  nodeId: string;
  heatmap: GazeFocusHeatmap;
  hasRealGaze: boolean;
  peerCount: number;
  totalGazeSeconds: number;
  attachedAt: number;
}

interface GazeFocusCellUpdateEvent {
  nodeId: string;
  cellIndex: number;
  weight: number;
  peerId: string;
}

// ---------------------------------------------------------------------------

describe('GazeFocusAnalyticsTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('slide-panel');
    ctx = createMockContext();
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  describe('Lifecycle', () => {
    it('emits gaze_focus_analytics_attached on attach', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      expect(getEventCount(ctx, 'gaze_focus_analytics_attached')).toBe(1);
      const data = getLastEvent(ctx, 'gaze_focus_analytics_attached') as GazeFocusAttachedEvent;
      expect(data.nodeId).toBe('slide-panel');
      expect(data.sessionId).toBe('test-session');
      expect(data.resolution).toEqual([4, 3]);
    });

    it('stores __gazeFocusState on node', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      expect(getState(node)).toBeDefined();
      expect(getState(node).cells).toHaveLength(12); // 4×3
    });

    it('emits gaze_focus_analytics_export and cleans up state on detach', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      const fullConfig = {
        ...gazeFocusAnalyticsHandler.defaultConfig,
        ...defaultConfig,
      } as GazeFocusAnalyticsConfig;
      // Use the helper's sendEvent approach: fire a detach via onDetach directly
      // but via the helper pattern. onDetach is not wrapped by helpers, so we
      // call it but type-safely using the exported handler interface.
      gazeFocusAnalyticsHandler.onDetach!(
        node as unknown as Parameters<typeof gazeFocusAnalyticsHandler.onDetach>[0],
        fullConfig,
        ctx as unknown as Parameters<typeof gazeFocusAnalyticsHandler.onDetach>[2]
      );
      expect(node['__gazeFocusState']).toBeUndefined();
      expect(getEventCount(ctx, 'gaze_focus_analytics_export')).toBe(1);
      const exp = getLastEvent(ctx, 'gaze_focus_analytics_export') as GazeFocusExportEvent;
      expect(exp.trigger).toBe('detach');
    });
  });

  // ── Gaze accumulation ─────────────────────────────────────────────────────

  describe('Gaze accumulation', () => {
    it('accumulates a local eye_gaze_update event', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      // UV (0.1, 0.1) lands in cell (0,0) for a 4×3 grid (col=0, row=0, idx=0)
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.1, 0.1, 0.1));

      const state = getState(node);
      expect(state.cells[0].weight).toBeCloseTo(0.1);
      expect(state.totalGazeSeconds).toBeCloseTo(0.1);
    });

    it('accumulates multiple gaze events on the same cell', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.1, 0.1, 0.2));
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.1, 0.1, 0.3));

      const state = getState(node);
      expect(state.cells[0].weight).toBeCloseTo(0.5);
      expect(state.totalGazeSeconds).toBeCloseTo(0.5);
    });

    it('accumulates gaze on different cells', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      // Cell 0: col 0, row 0 — u in [0, 0.25), v in [0, 0.33)
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.1, 0.1, 0.1));
      // Cell 3: col 3, row 0 — u in [0.75, 1.0)
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.9, 0.1, 0.2));

      const state = getState(node);
      expect(state.cells[0].weight).toBeCloseTo(0.1);
      expect(state.cells[3].weight).toBeCloseTo(0.2);
      expect(state.totalGazeSeconds).toBeCloseTo(0.3);
    });

    it('ignores gaze events below min_confidence threshold', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      sendEvent(
        gazeFocusAnalyticsHandler, node, defaultConfig, ctx,
        { type: 'eye_gaze_update', uv: [0.1, 0.1], dwell_delta_s: 0.1, peer_id: 'local', confidence: 0.3 }
      );

      expect(getState(node).totalGazeSeconds).toBe(0);
    });

    it('ignores gaze events with missing uv', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, {
        type: 'eye_gaze_update',
        dwell_delta_s: 0.1,
        peer_id: 'local',
        confidence: 1.0,
      });

      expect(getState(node).totalGazeSeconds).toBe(0);
    });
  });

  // ── Multi-peer ────────────────────────────────────────────────────────────

  describe('Multi-peer accumulation', () => {
    it('accepts peer_eye_gaze_update events', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, peerGazeHit(0.1, 0.1, 'peer-001', 0.15));
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, peerGazeHit(0.1, 0.1, 'peer-002', 0.1));

      const state = getState(node);
      expect(state.cells[0].weight).toBeCloseTo(0.25);
      expect(state.totalGazeSeconds).toBeCloseTo(0.25);
      expect(state.peerIds.has('peer-001')).toBe(true);
      expect(state.peerIds.has('peer-002')).toBe(true);
    });

    it('tracks distinct peer IDs without duplicates', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.1, 0.1, 0.1, 'alice'));
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.1, 0.1, 0.1, 'bob'));
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.1, 0.1, 0.1, 'alice'));

      expect(getState(node).peerIds.size).toBe(2);
    });
  });

  // ── Export ────────────────────────────────────────────────────────────────

  describe('Export', () => {
    it('exports on session_end event', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.1, 0.1, 0.5));
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, { type: 'session_end' });

      expect(getEventCount(ctx, 'gaze_focus_analytics_export')).toBe(1);
      const exp = getLastEvent(ctx, 'gaze_focus_analytics_export') as GazeFocusExportEvent;
      expect(exp.nodeId).toBe('slide-panel');
      expect(exp.trigger).toBe('session_end');
      const heatmap: GazeFocusHeatmap = exp.heatmap;
      expect(heatmap.totalGazeSeconds).toBeCloseTo(0.5);
      expect(heatmap.resolution).toEqual([4, 3]);
      expect(heatmap.normalised).toHaveLength(12);
      expect(heatmap.sessionId).toBe('test-session');
    });

    it('exports on explicit gaze_focus_export_request', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.1, 0.1, 0.2));
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, {
        type: 'gaze_focus_export_request',
        requestId: 'req-42',
      });

      expect(getEventCount(ctx, 'gaze_focus_analytics_export')).toBe(1);
      const exp = getLastEvent(ctx, 'gaze_focus_analytics_export') as GazeFocusExportEvent;
      expect(exp.requestId).toBe('req-42');
    });

    it('hot cell normalises to 1.0', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.1, 0.1, 1.0));
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.6, 0.5, 0.5));
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, { type: 'session_end' });

      const exp = getLastEvent(ctx, 'gaze_focus_analytics_export') as GazeFocusExportEvent;
      const normalised: number[] = exp.heatmap.normalised;
      const maxVal = Math.max(...normalised);
      const minVal = Math.min(...normalised);
      expect(maxVal).toBeLessThanOrEqual(1.0 + 1e-9);
      expect(minVal).toBeGreaterThanOrEqual(0.0);
      expect(maxVal).toBeCloseTo(1.0);
    });

    it('serialises as valid JSON when export_format is json', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.1, 0.1, 0.3));
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, { type: 'session_end' });

      const exp = getLastEvent(ctx, 'gaze_focus_analytics_export') as GazeFocusExportEvent;
      expect(() => JSON.parse(exp.payload)).not.toThrow();
    });

    it('serialises as CSV when export_format is csv', () => {
      const csvConfig: Partial<GazeFocusAnalyticsConfig> = {
        ...defaultConfig,
        export_format: 'csv',
      };
      attachTrait(gazeFocusAnalyticsHandler, node, csvConfig, ctx);
      sendEvent(gazeFocusAnalyticsHandler, node, csvConfig, ctx, gazeHit(0.1, 0.1, 0.1));
      sendEvent(gazeFocusAnalyticsHandler, node, csvConfig, ctx, { type: 'gaze_focus_export_request' });

      const exp = getLastEvent(ctx, 'gaze_focus_analytics_export') as GazeFocusExportEvent;
      expect(typeof exp.payload).toBe('string');
      expect(exp.payload).toContain('row,col');
    });
  });

  // ── Query ─────────────────────────────────────────────────────────────────

  describe('Query', () => {
    it('responds to gaze_focus_query with current snapshot', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.1, 0.1, 0.4));
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, {
        type: 'gaze_focus_query',
        queryId: 'q-1',
      });

      expect(getEventCount(ctx, 'gaze_focus_info')).toBe(1);
      const info = getLastEvent(ctx, 'gaze_focus_info') as GazeFocusInfoEvent;
      expect(info.queryId).toBe('q-1');
      expect(info.totalGazeSeconds).toBeCloseTo(0.4);
      expect(info.heatmap).toBeDefined();
    });
  });

  // ── Reset ─────────────────────────────────────────────────────────────────

  describe('Reset', () => {
    it('clears all accumulators on gaze_focus_reset', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.1, 0.1, 1.0, 'alice'));
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, { type: 'gaze_focus_reset' });

      const state = getState(node);
      expect(state.totalGazeSeconds).toBe(0);
      expect(state.peerIds.size).toBe(0);
      expect(state.cells.every((c: GazeFocusCell) => c.weight === 0)).toBe(true);
      expect(getEventCount(ctx, 'gaze_focus_reset_done')).toBe(1);
    });
  });

  // ── Decay ─────────────────────────────────────────────────────────────────

  describe('Decay', () => {
    it('does not decay when decay_rate_s is 0', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.1, 0.1, 1.0));
      for (let i = 0; i < 10; i++) {
        updateTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, 1.0);
      }
      expect(getState(node).cells[0].weight).toBeCloseTo(1.0);
    });

    it('weight remains finite and non-negative after update with decay enabled', () => {
      const decayConfig: Partial<GazeFocusAnalyticsConfig> = {
        ...defaultConfig,
        decay_rate_s: 1.0,
      };
      attachTrait(gazeFocusAnalyticsHandler, node, decayConfig, ctx);
      sendEvent(gazeFocusAnalyticsHandler, node, decayConfig, ctx, gazeHit(0.1, 0.1, 1.0));
      updateTrait(gazeFocusAnalyticsHandler, node, decayConfig, ctx, 0.1);

      const w = getState(node).cells[0].weight;
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Live updates ──────────────────────────────────────────────────────────

  describe('Live updates', () => {
    it('emits gaze_focus_cell_update when emit_live_updates is true', () => {
      const liveConfig: Partial<GazeFocusAnalyticsConfig> = {
        ...defaultConfig,
        emit_live_updates: true,
      };
      attachTrait(gazeFocusAnalyticsHandler, node, liveConfig, ctx);
      sendEvent(gazeFocusAnalyticsHandler, node, liveConfig, ctx, gazeHit(0.1, 0.1, 0.1));

      expect(getEventCount(ctx, 'gaze_focus_cell_update')).toBe(1);
      const upd = getLastEvent(ctx, 'gaze_focus_cell_update') as GazeFocusCellUpdateEvent;
      expect(upd.cellIndex).toBeGreaterThanOrEqual(0);
      expect(upd.weight).toBeCloseTo(0.1);
    });

    it('does not emit gaze_focus_cell_update when emit_live_updates is false', () => {
      attachTrait(gazeFocusAnalyticsHandler, node, defaultConfig, ctx);
      sendEvent(gazeFocusAnalyticsHandler, node, defaultConfig, ctx, gazeHit(0.1, 0.1, 0.1));
      expect(getEventCount(ctx, 'gaze_focus_cell_update')).toBe(0);
    });
  });
});
