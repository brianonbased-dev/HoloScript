/**
 * SpatialPersonaTrait Production Tests
 *
 * VisionOS spatial persona: activate/deactivate, position updates,
 * expression sync, participant visibility, and detach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spatialPersonaHandler } from '../SpatialPersonaTrait';

function makeNode(id = 'sp-node') { return { id } as any; }
function makeConfig(o: any = {}) { return { ...spatialPersonaHandler.defaultConfig, ...o }; }
function makeContext() {
  const store: Record<string, any> = {};
  return {
    emit: vi.fn(),
    setState: (s: Record<string, any>) => Object.assign(store, s),
    getState: () => store,
  };
}
function getState(ctx: ReturnType<typeof makeContext>) { return ctx.getState().spatialPersona; }

describe('SpatialPersonaTrait — Production', () => {
  let node: any, config: any, ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    spatialPersonaHandler.onAttach(node, config, ctx);
  });

  describe('construction', () => {
    it('initializes inactive state', () => {
      const s = getState(ctx);
      expect(s.isActive).toBe(false);
      expect(s.personaId).toBeNull();
      expect(s.expressionState).toBe('neutral');
      expect(s.isSpeaking).toBe(false);
      expect(s.visibleTo.size).toBe(0);
    });

    it('emits persona:init', () => {
      expect(ctx.emit).toHaveBeenCalledWith('persona:init', { style: 'realistic', visibility: 'always' });
    });

    it('has correct defaults', () => {
      expect(spatialPersonaHandler.defaultConfig.proximity_radius).toBe(3.0);
      expect(spatialPersonaHandler.defaultConfig.render_quality).toBe('high');
    });
  });

  describe('activate/deactivate', () => {
    it('activates persona', () => {
      ctx.emit.mockClear();
      spatialPersonaHandler.onEvent!(node, config, ctx, {
        type: 'persona:activate',
        payload: { personaId: 'user_42' },
      });

      const s = getState(ctx);
      expect(s.isActive).toBe(true);
      expect(s.personaId).toBe('user_42');
      expect(ctx.emit).toHaveBeenCalledWith('persona:activated', { personaId: 'user_42' });
    });

    it('deactivates persona', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx, { type: 'persona:activate', payload: {} });
      ctx.emit.mockClear();

      spatialPersonaHandler.onEvent!(node, config, ctx, { type: 'persona:deactivate' });

      expect(getState(ctx).isActive).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('persona:deactivated', expect.anything());
    });
  });

  describe('position and expression', () => {
    it('updates position and orientation', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx, { type: 'persona:activate', payload: {} });
      ctx.emit.mockClear();

      spatialPersonaHandler.onEvent!(node, config, ctx, {
        type: 'persona:position_update',
        payload: { position: [1, 2, 3], orientation: [0, 0, 0, 1] },
      });

      expect(getState(ctx).position).toEqual([1, 2, 3]);
      expect(getState(ctx).orientation).toEqual([0, 0, 0, 1]);
      expect(ctx.emit).toHaveBeenCalledWith('persona:moved', expect.objectContaining({ position: [1, 2, 3] }));
    });

    it('updates expression and sets isSpeaking', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx, { type: 'persona:activate', payload: {} });
      ctx.emit.mockClear();

      spatialPersonaHandler.onEvent!(node, config, ctx, {
        type: 'persona:expression',
        payload: { expression: 'talking' },
      });

      expect(getState(ctx).expressionState).toBe('talking');
      expect(getState(ctx).isSpeaking).toBe(true);
      expect(ctx.emit).toHaveBeenCalledWith('persona:expression_changed', expect.objectContaining({ expression: 'talking' }));
    });

    it('sets isSpeaking to false for non-talking expressions', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx, { type: 'persona:activate', payload: {} });
      spatialPersonaHandler.onEvent!(node, config, ctx, { type: 'persona:expression', payload: { expression: 'talking' } });

      spatialPersonaHandler.onEvent!(node, config, ctx, { type: 'persona:expression', payload: { expression: 'listening' } });

      expect(getState(ctx).isSpeaking).toBe(false);
    });
  });

  describe('participant visibility', () => {
    it('adds visible participant', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx, {
        type: 'persona:participant_visible',
        payload: { participantId: 'p1' },
      });

      expect(getState(ctx).visibleTo.has('p1')).toBe(true);
    });

    it('removes hidden participant', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx, { type: 'persona:participant_visible', payload: { participantId: 'p1' } });

      spatialPersonaHandler.onEvent!(node, config, ctx, { type: 'persona:participant_hidden', payload: { participantId: 'p1' } });

      expect(getState(ctx).visibleTo.has('p1')).toBe(false);
    });
  });

  describe('detach', () => {
    it('emits deactivated when active', () => {
      spatialPersonaHandler.onEvent!(node, config, ctx, { type: 'persona:activate', payload: { personaId: 'x' } });
      ctx.emit.mockClear();

      spatialPersonaHandler.onDetach!(node, config, ctx);
      expect(ctx.emit).toHaveBeenCalledWith('persona:deactivated', { personaId: 'x' });
    });

    it('no-op detach when inactive', () => {
      ctx.emit.mockClear();
      spatialPersonaHandler.onDetach!(node, config, ctx);
      expect(ctx.emit).not.toHaveBeenCalledWith('persona:deactivated', expect.anything());
    });
  });

  describe('edge cases', () => {
    it('event with no state is a no-op', () => {
      const noCtx = { emit: vi.fn(), setState: vi.fn(), getState: () => ({}) };
      spatialPersonaHandler.onEvent!(node, config, noCtx, { type: 'persona:activate', payload: {} });
      expect(noCtx.emit).not.toHaveBeenCalled();
    });
  });
});
