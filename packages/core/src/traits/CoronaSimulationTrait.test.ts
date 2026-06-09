import { describe, it, expect, beforeEach } from 'vitest';
import { coronaSimulationHandler } from './CoronaSimulationTrait';
import type { CoronaSimulationConfig } from './CoronaSimulationTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './__tests__/traitTestHelpers';

describe('CoronaSimulationTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  const defaultOverrides: Partial<CoronaSimulationConfig> = {};

  beforeEach(() => {
    node = createMockNode('sun-node');
    ctx = createMockContext();
  });

  // -- Lifecycle ---------------------------------------------------------------

  describe('Lifecycle', () => {
    it('emits corona_simulation_create on attach', () => {
      attachTrait(coronaSimulationHandler, node, defaultOverrides, ctx);
      expect(getEventCount(ctx, 'corona_simulation_create')).toBe(1);

      const data = getLastEvent(ctx, 'corona_simulation_create') as Record<string, unknown>;
      expect(data.nodeId).toBe('sun-node');
      expect(data.loopCount).toBe(24);
      expect(data.streamerBelt).toBe(true);
      expect(data.coronalHoles).toEqual(['north', 'south']);
      expect(data.cmeEnabled).toBe(false);
    });

    it('stores state in WeakMap not directly on node', () => {
      attachTrait(coronaSimulationHandler, node, defaultOverrides, ctx);
      expect(Object.keys(node).filter((k) => k.startsWith('__corona'))).toHaveLength(0);
    });

    it('emits corona_simulation_destroy on detach', () => {
      attachTrait(coronaSimulationHandler, node, defaultOverrides, ctx);
      const fullConfig = {
        ...coronaSimulationHandler.defaultConfig,
        ...defaultOverrides,
      } as CoronaSimulationConfig;
      coronaSimulationHandler.onDetach!(
        node as Parameters<typeof coronaSimulationHandler.onDetach>[0],
        fullConfig,
        ctx as Parameters<typeof coronaSimulationHandler.onDetach>[2]
      );
      expect(getEventCount(ctx, 'corona_simulation_destroy')).toBe(1);
      const data = getLastEvent(ctx, 'corona_simulation_destroy') as Record<string, unknown>;
      expect(data.nodeId).toBe('sun-node');
    });

    it('no destroy event if detach called without prior attach', () => {
      const fullConfig = { ...coronaSimulationHandler.defaultConfig } as CoronaSimulationConfig;
      coronaSimulationHandler.onDetach!(
        node as Parameters<typeof coronaSimulationHandler.onDetach>[0],
        fullConfig,
        ctx as Parameters<typeof coronaSimulationHandler.onDetach>[2]
      );
      expect(getEventCount(ctx, 'corona_simulation_destroy')).toBe(0);
    });
  });

  // -- Default config ----------------------------------------------------------

  describe('Default config', () => {
    it('uses A-009 suggested defaults', () => {
      const d = coronaSimulationHandler.defaultConfig!;
      expect(d.base_temperature_mk).toBe(1.5);
      expect(d.loop_count).toBe(24);
      expect(d.prominence_seed).toBe(42);
      expect(d.streamer_belt).toBe(true);
      expect(d.coronal_holes).toEqual(['north', 'south']);
      expect(d.cme_enabled).toBe(false);
      expect(d.halo_scale).toBe(2.5);
      expect(d.halo_opacity).toBe(0.35);
    });
  });

  // -- Update loop -------------------------------------------------------------

  describe('onUpdate', () => {
    it('emits corona_simulation_update each tick', () => {
      attachTrait(coronaSimulationHandler, node, defaultOverrides, ctx);
      ctx.clearEvents();
      updateTrait(coronaSimulationHandler, node, defaultOverrides, ctx, 0.016);
      expect(getEventCount(ctx, 'corona_simulation_update')).toBe(1);
      const data = getLastEvent(ctx, 'corona_simulation_update') as Record<string, unknown>;
      expect(data.nodeId).toBe('sun-node');
      expect(typeof data.time).toBe('number');
    });

    it('accumulates time across ticks', () => {
      attachTrait(coronaSimulationHandler, node, defaultOverrides, ctx);
      ctx.clearEvents();
      updateTrait(coronaSimulationHandler, node, defaultOverrides, ctx, 0.1);
      updateTrait(coronaSimulationHandler, node, defaultOverrides, ctx, 0.2);
      const data = getLastEvent(ctx, 'corona_simulation_update') as Record<string, unknown>;
      expect(data.time as number).toBeCloseTo(0.3, 5);
    });

    it('includes empty activeCmes when cme_enabled:false', () => {
      attachTrait(coronaSimulationHandler, node, defaultOverrides, ctx);
      ctx.clearEvents();
      updateTrait(coronaSimulationHandler, node, defaultOverrides, ctx, 0.016);
      const data = getLastEvent(ctx, 'corona_simulation_update') as Record<string, unknown>;
      expect(data.activeCmes).toEqual([]);
    });
  });

  // -- Pause / Resume ----------------------------------------------------------

  describe('pause / resume', () => {
    it('stops update events when paused', () => {
      attachTrait(coronaSimulationHandler, node, defaultOverrides, ctx);
      ctx.clearEvents();
      sendEvent(coronaSimulationHandler, node, defaultOverrides, ctx, { type: 'corona_pause' });
      updateTrait(coronaSimulationHandler, node, defaultOverrides, ctx, 0.016);
      expect(getEventCount(ctx, 'corona_simulation_update')).toBe(0);
    });

    it('resumes update events after resume', () => {
      attachTrait(coronaSimulationHandler, node, defaultOverrides, ctx);
      ctx.clearEvents();
      sendEvent(coronaSimulationHandler, node, defaultOverrides, ctx, { type: 'corona_pause' });
      sendEvent(coronaSimulationHandler, node, defaultOverrides, ctx, { type: 'corona_resume' });
      updateTrait(coronaSimulationHandler, node, defaultOverrides, ctx, 0.016);
      expect(getEventCount(ctx, 'corona_simulation_update')).toBe(1);
    });
  });

  // -- CME events --------------------------------------------------------------

  describe('CME event API', () => {
    const cmeConfig: Partial<CoronaSimulationConfig> = { cme_enabled: true };

    it('ignores corona_cme_trigger when cme_enabled:false', () => {
      attachTrait(coronaSimulationHandler, node, defaultOverrides, ctx);
      ctx.clearEvents();
      sendEvent(coronaSimulationHandler, node, defaultOverrides, ctx, {
        type: 'corona_cme_trigger',
        longitude: 45,
        latitude: 10,
      });
      expect(getEventCount(ctx, 'corona_cme_launched')).toBe(0);
    });

    it('fires corona_cme_launched when cme_enabled:true', () => {
      attachTrait(coronaSimulationHandler, node, cmeConfig, ctx);
      ctx.clearEvents();
      sendEvent(coronaSimulationHandler, node, cmeConfig, ctx, {
        type: 'corona_cme_trigger',
        longitude: 45,
        latitude: 10,
      });
      expect(getEventCount(ctx, 'corona_cme_launched')).toBe(1);
      const data = getLastEvent(ctx, 'corona_cme_launched') as Record<string, unknown>;
      expect(data.longitude).toBe(45);
      expect(data.latitude).toBe(10);
      expect(data.activeCmeCount).toBe(1);
    });

    it('tracks multiple simultaneous CMEs', () => {
      attachTrait(coronaSimulationHandler, node, cmeConfig, ctx);
      ctx.clearEvents();
      sendEvent(coronaSimulationHandler, node, cmeConfig, ctx, {
        type: 'corona_cme_trigger',
        longitude: 0,
        latitude: 0,
      });
      sendEvent(coronaSimulationHandler, node, cmeConfig, ctx, {
        type: 'corona_cme_trigger',
        longitude: 90,
        latitude: 20,
      });
      const data = getLastEvent(ctx, 'corona_cme_launched') as Record<string, unknown>;
      expect(data.activeCmeCount).toBe(2);
    });

    it('ages out CMEs beyond 30s lifetime', () => {
      attachTrait(coronaSimulationHandler, node, cmeConfig, ctx);
      sendEvent(coronaSimulationHandler, node, cmeConfig, ctx, {
        type: 'corona_cme_trigger',
        longitude: 0,
        latitude: 0,
      });
      ctx.clearEvents();

      updateTrait(coronaSimulationHandler, node, cmeConfig, ctx, 29);
      let update = getLastEvent(ctx, 'corona_simulation_update') as Record<string, unknown>;
      expect((update.activeCmes as unknown[]).length).toBe(1);
      ctx.clearEvents();

      updateTrait(coronaSimulationHandler, node, cmeConfig, ctx, 2);
      update = getLastEvent(ctx, 'corona_simulation_update') as Record<string, unknown>;
      expect((update.activeCmes as unknown[]).length).toBe(0);
    });
  });

  // -- Config update events ----------------------------------------------------

  describe('config update events', () => {
    it('emits config_update on corona_set_temperature with valid value', () => {
      attachTrait(coronaSimulationHandler, node, defaultOverrides, ctx);
      ctx.clearEvents();
      sendEvent(coronaSimulationHandler, node, defaultOverrides, ctx, {
        type: 'corona_set_temperature',
        base_temperature_mk: 3.0,
      });
      expect(getEventCount(ctx, 'corona_simulation_config_update')).toBe(1);
      const data = getLastEvent(ctx, 'corona_simulation_config_update') as Record<string, unknown>;
      expect(data.baseTemperatureMk).toBe(3.0);
    });

    it('ignores corona_set_temperature with non-positive value', () => {
      attachTrait(coronaSimulationHandler, node, defaultOverrides, ctx);
      ctx.clearEvents();
      sendEvent(coronaSimulationHandler, node, defaultOverrides, ctx, {
        type: 'corona_set_temperature',
        base_temperature_mk: -1,
      });
      expect(getEventCount(ctx, 'corona_simulation_config_update')).toBe(0);
    });

    it('emits config_update on corona_set_loop_count', () => {
      attachTrait(coronaSimulationHandler, node, defaultOverrides, ctx);
      ctx.clearEvents();
      sendEvent(coronaSimulationHandler, node, defaultOverrides, ctx, {
        type: 'corona_set_loop_count',
        loop_count: 48,
      });
      expect(getEventCount(ctx, 'corona_simulation_config_update')).toBe(1);
      const data = getLastEvent(ctx, 'corona_simulation_config_update') as Record<string, unknown>;
      expect(data.loopCount).toBe(48);
    });
  });

  // -- Query interface ---------------------------------------------------------

  describe('corona_query', () => {
    it('responds with full state snapshot', () => {
      attachTrait(coronaSimulationHandler, node, defaultOverrides, ctx);
      ctx.clearEvents();
      updateTrait(coronaSimulationHandler, node, defaultOverrides, ctx, 1.0);
      ctx.clearEvents();
      sendEvent(coronaSimulationHandler, node, defaultOverrides, ctx, {
        type: 'corona_query',
        queryId: 'q-1',
      });
      expect(getEventCount(ctx, 'corona_simulation_info')).toBe(1);
      const data = getLastEvent(ctx, 'corona_simulation_info') as Record<string, unknown>;
      expect(data.queryId).toBe('q-1');
      expect(data.nodeId).toBe('sun-node');
      expect(data.active).toBe(true);
      expect(data.time as number).toBeCloseTo(1.0, 5);
      expect(data.activeCmeCount).toBe(0);
    });
  });

  // -- Trait name --------------------------------------------------------------

  describe('metadata', () => {
    it('has correct trait name', () => {
      expect(coronaSimulationHandler.name).toBe('corona_simulation');
    });
  });
});
