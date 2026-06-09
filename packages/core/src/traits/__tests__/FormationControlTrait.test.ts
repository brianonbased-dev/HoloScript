import { describe, it, expect, beforeEach } from 'vitest';
import { formationControlHandler } from '../FormationControlTrait';
import type { FormationControlConfig } from '../FormationControlTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('FormationControlTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const baseCfg: FormationControlConfig = {
    shape: 'triangle',
    spacing: 3.0,
    anchor: 'Commander',
    sync_rate_hz: 10,
    rotation_offset_rad: 0,
    y_offset: 0,
  };

  beforeEach(() => {
    node = createMockNode('formation-node');
    ctx = createMockContext();
    attachTrait(formationControlHandler, node, baseCfg, ctx);
  });

  // -- Lifecycle ---------------------------------------------------------------

  it('attaches and emits formation_control_attached', () => {
    expect(getEventCount(ctx, 'formation_control_attached')).toBe(1);
    const ev = getLastEvent(ctx, 'formation_control_attached') as Record<string, unknown>;
    expect(ev).toBeDefined();
    expect(ev.shape).toBe('triangle');
    expect(ev.anchor).toBe('Commander');
  });

  it('removes state on detach', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    formationControlHandler.onDetach?.(node as any, baseCfg, ctx as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((node as any).__formationControlState).toBeUndefined();
  });

  // -- Agent add/remove --------------------------------------------------------

  it('formation:add_agent grows slots and assigns the agent', () => {
    sendEvent(formationControlHandler, node, baseCfg, ctx, {
      type: 'formation:add_agent',
      agentId: 'miner-0',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = (node as any).__formationControlState;
    expect(state.slots.length).toBe(1);
    expect(state.slots[0].agentId).toBe('miner-0');
    expect(state.agentSlotMap.get('miner-0')).toBe(0);
    expect(getEventCount(ctx, 'formation_control_agent_added')).toBe(1);
  });

  it('duplicate add_agent is ignored', () => {
    sendEvent(formationControlHandler, node, baseCfg, ctx, { type: 'formation:add_agent', agentId: 'miner-0' });
    ctx.clearEvents();
    sendEvent(formationControlHandler, node, baseCfg, ctx, { type: 'formation:add_agent', agentId: 'miner-0' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = (node as any).__formationControlState;
    expect(state.slots.length).toBe(1);
    expect(getEventCount(ctx, 'formation_control_agent_added')).toBe(0);
  });

  it('formation:remove_agent clears the slot', () => {
    sendEvent(formationControlHandler, node, baseCfg, ctx, { type: 'formation:add_agent', agentId: 'miner-0' });
    ctx.clearEvents();
    sendEvent(formationControlHandler, node, baseCfg, ctx, { type: 'formation:remove_agent', agentId: 'miner-0' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = (node as any).__formationControlState;
    expect(state.slots[0].agentId).toBeNull();
    expect(state.agentSlotMap.has('miner-0')).toBe(false);
    expect(getEventCount(ctx, 'formation_control_agent_removed')).toBe(1);
  });

  it('remove_agent for unknown agent is a no-op', () => {
    sendEvent(formationControlHandler, node, baseCfg, ctx, { type: 'formation:remove_agent', agentId: 'ghost' });
    expect(getEventCount(ctx, 'formation_control_agent_removed')).toBe(0);
  });

  // -- Multiple agents ---------------------------------------------------------

  it('three agents fill triangle slots', () => {
    for (const id of ['miner-0', 'miner-1', 'miner-2']) {
      sendEvent(formationControlHandler, node, baseCfg, ctx, { type: 'formation:add_agent', agentId: id });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = (node as any).__formationControlState;
    expect(state.slots.length).toBe(3);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agents = state.slots.map((s: any) => s.agentId);
    expect(agents).toContain('miner-0');
    expect(agents).toContain('miner-1');
    expect(agents).toContain('miner-2');
  });

  // -- Sync / target positions -------------------------------------------------

  it('formation:sync emits formation_control_updated with targets', () => {
    sendEvent(formationControlHandler, node, baseCfg, ctx, { type: 'formation:add_agent', agentId: 'miner-0' });
    ctx.clearEvents();
    sendEvent(formationControlHandler, node, baseCfg, ctx, { type: 'formation:sync' });
    expect(getEventCount(ctx, 'formation_control_updated')).toBe(1);
    const ev = getLastEvent(ctx, 'formation_control_updated') as Record<string, unknown>;
    expect(ev.anchor).toBe('Commander');
    const targets = ev.targets as Array<{ agentId: string }>;
    expect(targets.some((t) => t.agentId === 'miner-0')).toBe(true);
  });

  it('onUpdate triggers sync at the configured rate', () => {
    sendEvent(formationControlHandler, node, baseCfg, ctx, { type: 'formation:add_agent', agentId: 'miner-0' });
    ctx.clearEvents();
    // 10 Hz -> period = 0.1 s; pass 0.11 s to fire one tick
    updateTrait(formationControlHandler, node, baseCfg, ctx, 0.11);
    expect(getEventCount(ctx, 'formation_control_updated')).toBe(1);
  });

  it('onUpdate does not fire when sync_rate_hz is 0', () => {
    const cfg = { ...baseCfg, sync_rate_hz: 0 };
    const node2 = createMockNode('no-sync');
    const ctx2 = createMockContext();
    attachTrait(formationControlHandler, node2, cfg, ctx2);
    sendEvent(formationControlHandler, node2, cfg, ctx2, { type: 'formation:add_agent', agentId: 'miner-0' });
    ctx2.clearEvents();
    updateTrait(formationControlHandler, node2, cfg, ctx2, 1.0);
    expect(getEventCount(ctx2, 'formation_control_updated')).toBe(0);
  });

  // -- Geometry correctness ----------------------------------------------------

  it('circle shape produces offsets at correct distance from anchor', () => {
    const cfg: FormationControlConfig = { ...baseCfg, shape: 'circle', spacing: 4.0 };
    const node2 = createMockNode('circle-node');
    const ctx2 = createMockContext();
    attachTrait(formationControlHandler, node2, cfg, ctx2);
    for (let i = 0; i < 4; i++) {
      sendEvent(formationControlHandler, node2, cfg, ctx2, { type: 'formation:add_agent', agentId: `agent-${i}` });
    }
    ctx2.clearEvents();
    sendEvent(formationControlHandler, node2, cfg, ctx2, { type: 'formation:sync' });
    const ev = getLastEvent(ctx2, 'formation_control_updated') as Record<string, unknown>;
    const targets = ev.targets as Array<{ localOffset: [number, number, number] }>;
    for (const t of targets) {
      const [x, _y, z] = t.localOffset;
      const dist = Math.sqrt(x * x + z * z);
      expect(dist).toBeCloseTo(4.0, 3);
    }
  });

  it('column shape produces agents directly behind anchor', () => {
    const cfg: FormationControlConfig = { ...baseCfg, shape: 'column', spacing: 2.0 };
    const node2 = createMockNode('col-node');
    const ctx2 = createMockContext();
    attachTrait(formationControlHandler, node2, cfg, ctx2);
    sendEvent(formationControlHandler, node2, cfg, ctx2, { type: 'formation:add_agent', agentId: 'a0' });
    ctx2.clearEvents();
    sendEvent(formationControlHandler, node2, cfg, ctx2, { type: 'formation:sync' });
    const ev = getLastEvent(ctx2, 'formation_control_updated') as Record<string, unknown>;
    const targets = ev.targets as Array<{ localOffset: [number, number, number] }>;
    expect(targets[0].localOffset[0]).toBeCloseTo(0, 5);
    expect(targets[0].localOffset[2]).toBeCloseTo(2.0, 3);
  });

  // -- Reconfigure -------------------------------------------------------------

  it('formation:reconfigure changes shape and emits formation_control_shape_changed', () => {
    sendEvent(formationControlHandler, node, baseCfg, ctx, { type: 'formation:add_agent', agentId: 'miner-0' });
    ctx.clearEvents();
    sendEvent(formationControlHandler, node, baseCfg, ctx, {
      type: 'formation:reconfigure',
      shape: 'circle',
      spacing: 5.0,
    });
    expect(getEventCount(ctx, 'formation_control_shape_changed')).toBe(1);
    const ev = getLastEvent(ctx, 'formation_control_shape_changed') as Record<string, unknown>;
    expect(ev.shape).toBe('circle');
    expect(ev.spacing).toBe(5.0);
  });

  // -- y_offset ----------------------------------------------------------------

  it('y_offset is applied to all target positions', () => {
    const cfg: FormationControlConfig = { ...baseCfg, y_offset: 1.5 };
    const node2 = createMockNode('y-off-node');
    const ctx2 = createMockContext();
    attachTrait(formationControlHandler, node2, cfg, ctx2);
    sendEvent(formationControlHandler, node2, cfg, ctx2, { type: 'formation:add_agent', agentId: 'hovering-drone' });
    ctx2.clearEvents();
    sendEvent(formationControlHandler, node2, cfg, ctx2, { type: 'formation:sync' });
    const ev = getLastEvent(ctx2, 'formation_control_updated') as Record<string, unknown>;
    const targets = ev.targets as Array<{ localOffset: [number, number, number] }>;
    expect(targets[0].localOffset[1]).toBeCloseTo(1.5, 5);
  });

  // -- Rotation offset ---------------------------------------------------------

  it('rotation_offset_rad rotates slot positions', () => {
    const cfg: FormationControlConfig = {
      ...baseCfg,
      shape: 'column',
      spacing: 3.0,
      rotation_offset_rad: Math.PI / 2,
    };
    const node2 = createMockNode('rot-node');
    const ctx2 = createMockContext();
    attachTrait(formationControlHandler, node2, cfg, ctx2);
    sendEvent(formationControlHandler, node2, cfg, ctx2, { type: 'formation:add_agent', agentId: 'a0' });
    ctx2.clearEvents();
    sendEvent(formationControlHandler, node2, cfg, ctx2, { type: 'formation:sync' });
    const ev = getLastEvent(ctx2, 'formation_control_updated') as Record<string, unknown>;
    const targets = ev.targets as Array<{ localOffset: [number, number, number] }>;
    // After 90 deg rotation a column-behind (0, z) becomes (~z, 0) in x
    expect(Math.abs(targets[0].localOffset[0])).toBeCloseTo(3.0, 3);
    expect(Math.abs(targets[0].localOffset[2])).toBeCloseTo(0.0, 3);
  });

  // -- slotHint ----------------------------------------------------------------

  it('slotHint assigns agent to preferred empty slot', () => {
    sendEvent(formationControlHandler, node, baseCfg, ctx, { type: 'formation:add_agent', agentId: 'a0' });
    sendEvent(formationControlHandler, node, baseCfg, ctx, { type: 'formation:add_agent', agentId: 'a1' });
    sendEvent(formationControlHandler, node, baseCfg, ctx, { type: 'formation:add_agent', agentId: 'a2', slotHint: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = (node as any).__formationControlState;
    expect(state.agentSlotMap.get('a2')).toBe(2);
  });
});
