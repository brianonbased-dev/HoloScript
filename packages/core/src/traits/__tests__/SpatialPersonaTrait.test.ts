/**
 * SpatialPersonaTrait Tests
 *
 * Tests the visionOS spatial persona handler: init, activate/deactivate,
 * position updates, expression changes, participant visibility, and detach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spatialPersonaHandler } from '../SpatialPersonaTrait';
import type { SpatialPersonaConfig } from '../SpatialPersonaTrait';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id = 'sp-node') {
  return { id } as any;
}

function makeConfig(overrides: Partial<SpatialPersonaConfig> = {}) {
  return { ...spatialPersonaHandler.defaultConfig, ...overrides };
}

function makeContext() {
  const store: Record<string, any> = {};
  return {
    emit: vi.fn(),
    setState: (s: Record<string, any>) => Object.assign(store, s),
    getState: () => store,
  };
}

function getState(ctx: ReturnType<typeof makeContext>) {
  return ctx.getState().spatialPersona;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpatialPersonaTrait', () => {
  let node: any;
  let config: SpatialPersonaConfig;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    spatialPersonaHandler.onAttach!(node, config, ctx as any);
  });

  describe('initialization', () => {
    it('sets initial inactive state', () => {
      const s = getState(ctx);
      expect(s.isActive).toBe(false);
      expect(s.personaId).toBeNull();
      expect(s.position).toBeNull();
      expect(s.orientation).toBeNull();
      expect(s.expressionState).toBe('neutral');
      expect(s.isSpeaking).toBe(false);
      expect(s.visibleTo.size).toBe(0);
    });

    it('emits persona:init with style and visibility', () => {
      expect(ctx.emit).toHaveBeenCalledWith('persona:init', {
        style: 'realistic',
        visibility: 'always',
      });
    });

    it('has correct default config values', () => {
      const d = spatialPersonaHandler.defaultConfig;
      expect(d.persona_style).toBe('realistic');
      expect(d.visibility).toBe('always');
      expect(d.spatial_audio).toBe(true);
      expect(d.gesture_mirroring).toBe(true);
      expect(d.expression_sync).toBe(true);
      expect(d.proximity_radius).toBe(3.0);
      expect(d.render_quality).toBe('high');
    });
  });

  describe('activate/deactivate lifecycle', () => {
    it('persona:activate sets active with generated personaId', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx as any, { type: 'persona:activate' });
      const s = getState(ctx);
      expect(s.isActive).toBe(true);
      expect(s.personaId).toBe('persona_sp-node');
      expect(ctx.emit).toHaveBeenCalledWith('persona:activated', { personaId: 'persona_sp-node' });
    });

    it('persona:activate uses custom personaId from payload', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx as any, {
        type: 'persona:activate',
        payload: { personaId: 'custom-persona-42' },
      });
      expect(getState(ctx).personaId).toBe('custom-persona-42');
    });

    it('persona:deactivate sets inactive', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx as any, { type: 'persona:activate' });
      ctx.emit.mockClear();
      spatialPersonaHandler.onEvent!(node, config, ctx as any, { type: 'persona:deactivate' });

      const s = getState(ctx);
      expect(s.isActive).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('persona:deactivated', {
        personaId: 'persona_sp-node',
      });
    });
  });

  describe('position updates', () => {
    it('updates position and orientation from payload', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx as any, { type: 'persona:activate' });
      spatialPersonaHandler.onEvent!(node, config, ctx as any, {
        type: 'persona:position_update',
        payload: {
          position: [1, 2, 3],
          orientation: [0, 0, 0, 1],
        },
      });

      const s = getState(ctx);
      expect(s.position).toEqual([1, 2, 3]);
      expect(s.orientation).toEqual([0, 0, 0, 1]);
      expect(ctx.emit).toHaveBeenCalledWith('persona:moved', {
        personaId: 'persona_sp-node',
        position: [1, 2, 3],
      });
    });
  });

  describe('expression changes', () => {
    it('updates expression state and isSpeaking', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx as any, { type: 'persona:activate' });

      spatialPersonaHandler.onEvent!(node, config, ctx as any, {
        type: 'persona:expression',
        payload: { expression: 'talking' },
      });

      const s = getState(ctx);
      expect(s.expressionState).toBe('talking');
      expect(s.isSpeaking).toBe(true);
      expect(ctx.emit).toHaveBeenCalledWith('persona:expression_changed', {
        personaId: 'persona_sp-node',
        expression: 'talking',
      });
    });

    it('sets isSpeaking false for non-talking expressions', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx as any, { type: 'persona:activate' });
      spatialPersonaHandler.onEvent!(node, config, ctx as any, {
        type: 'persona:expression',
        payload: { expression: 'listening' },
      });

      expect(getState(ctx).isSpeaking).toBe(false);
      expect(getState(ctx).expressionState).toBe('listening');
    });

    it('ignores invalid expression payload', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx as any, { type: 'persona:activate' });
      spatialPersonaHandler.onEvent!(node, config, ctx as any, {
        type: 'persona:expression',
        payload: {},
      });

      expect(getState(ctx).expressionState).toBe('neutral');
    });
  });

  describe('participant visibility', () => {
    it('adds participant to visibleTo set', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx as any, {
        type: 'persona:participant_visible',
        payload: { participantId: 'user-1' },
      });

      expect(getState(ctx).visibleTo.has('user-1')).toBe(true);
    });

    it('removes participant from visibleTo set', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx as any, {
        type: 'persona:participant_visible',
        payload: { participantId: 'user-1' },
      });
      spatialPersonaHandler.onEvent!(node, config, ctx as any, {
        type: 'persona:participant_hidden',
        payload: { participantId: 'user-1' },
      });

      expect(getState(ctx).visibleTo.has('user-1')).toBe(false);
    });

    it('handles multiple participants', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx as any, {
        type: 'persona:participant_visible',
        payload: { participantId: 'user-1' },
      });
      spatialPersonaHandler.onEvent!(node, config, ctx as any, {
        type: 'persona:participant_visible',
        payload: { participantId: 'user-2' },
      });

      expect(getState(ctx).visibleTo.size).toBe(2);
    });
  });

  describe('onDetach', () => {
    it('emits persona:deactivated if active', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx as any, { type: 'persona:activate' });
      ctx.emit.mockClear();
      spatialPersonaHandler.onDetach!(node, config, ctx as any);
      expect(ctx.emit).toHaveBeenCalledWith('persona:deactivated', {
        personaId: 'persona_sp-node',
      });
    });

    it('does not emit if not active', () => {
      ctx.emit.mockClear();
      spatialPersonaHandler.onDetach!(node, config, ctx as any);
      expect(ctx.emit).not.toHaveBeenCalledWith('persona:deactivated', expect.anything());
    });
  });
});
