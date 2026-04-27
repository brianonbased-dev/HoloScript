/**
 * URDFRobotTrait — comprehensive test suite
 */
import { describe, it, expect, vi } from 'vitest';
import {
  URDFRobotTrait,
  urdfRobotHandler,
  createURDFRobotTrait,
  type URDFRobotConfig,
  type URDFRobotEvent,
} from '../URDFRobotTrait';
import type { HSPlusNode, TraitContext } from '../TraitTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(): HSPlusNode {
  return {} as HSPlusNode;
}

function makeContext() {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const context: TraitContext = {
    emit: (type: string, payload?: unknown) => emitted.push({ type, payload }),
  };
  return { context, emitted };
}

const BASE_CONFIG = urdfRobotHandler.defaultConfig as URDFRobotConfig;

function setupHandler(partial: Partial<URDFRobotConfig> = {}) {
  const node = makeNode();
  const { context, emitted } = makeContext();
  const config: URDFRobotConfig = { ...BASE_CONFIG, ...partial };
  urdfRobotHandler.onAttach(node, config, context);
  emitted.length = 0;
  return { node, context, emitted, config };
}

function getTrait(node: HSPlusNode): URDFRobotTrait {
  return (node as any).__urdfRobotTrait as URDFRobotTrait;
}

// ---------------------------------------------------------------------------
// Constructor / defaults
// ---------------------------------------------------------------------------

describe('URDFRobotTrait constructor', () => {
  it('should create instance with empty urdf_source', () => {
    const t = new URDFRobotTrait();
    expect(t.getConfig().urdf_source).toBe('');
  });

  it('should default preview_format to usdz', () => {
    const t = new URDFRobotTrait();
    expect(t.getConfig().preview_format).toBe('usdz');
  });

  it('should default interactive_joints to true', () => {
    const t = new URDFRobotTrait();
    expect(t.getConfig().interactive_joints).toBe(true);
  });

  it('should default up_axis to Y', () => {
    const t = new URDFRobotTrait();
    expect(t.getConfig().up_axis).toBe('Y');
  });

  it('should default scale to 1.0', () => {
    const t = new URDFRobotTrait();
    expect(t.getConfig().scale).toBe(1.0);
  });

  it('should default include_visual to true', () => {
    const t = new URDFRobotTrait();
    expect(t.getConfig().include_visual).toBe(true);
  });

  it('should default include_collision to false', () => {
    const t = new URDFRobotTrait();
    expect(t.getConfig().include_collision).toBe(false);
  });

  it('should default include_physics to false', () => {
    const t = new URDFRobotTrait();
    expect(t.getConfig().include_physics).toBe(false);
  });

  it('should default joint_visualization to none', () => {
    const t = new URDFRobotTrait();
    expect(t.getConfig().joint_visualization).toBe('none');
  });

  it('should default default_color to [0.8, 0.8, 0.8]', () => {
    const t = new URDFRobotTrait();
    expect(t.getConfig().default_color).toEqual([0.8, 0.8, 0.8]);
  });

  it('should default apply_coordinate_transform to true', () => {
    const t = new URDFRobotTrait();
    expect(t.getConfig().apply_coordinate_transform).toBe(true);
  });

  it('should default visionos_model_element to true', () => {
    const t = new URDFRobotTrait();
    expect(t.getConfig().visionos_model_element).toBe(true);
  });

  it('should apply partial config overrides', () => {
    const t = new URDFRobotTrait({ urdf_source: 'robot.urdf', scale: 2.0 });
    expect(t.getConfig().urdf_source).toBe('robot.urdf');
    expect(t.getConfig().scale).toBe(2.0);
  });

  it('should initialise isLoaded to false', () => {
    const t = new URDFRobotTrait();
    expect(t.isLoaded()).toBe(false);
  });

  it('should initialise linkCount to 0', () => {
    const t = new URDFRobotTrait();
    expect(t.getLinkCount()).toBe(0);
  });

  it('should initialise jointCount to 0', () => {
    const t = new URDFRobotTrait();
    expect(t.getJointCount()).toBe(0);
  });

  it('should initialise robotName to empty string', () => {
    const t = new URDFRobotTrait();
    expect(t.getRobotName()).toBe('');
  });

  it('getState should include empty errors array', () => {
    const t = new URDFRobotTrait();
    expect(t.getState().errors).toEqual([]);
  });

  it('getCachedUSDA should return null initially', () => {
    const t = new URDFRobotTrait();
    expect(t.getCachedUSDA()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setLoadedState
// ---------------------------------------------------------------------------

describe('setLoadedState', () => {
  it('should mark isLoaded true', () => {
    const t = new URDFRobotTrait();
    t.setLoadedState('MyRobot', 5, 3, ['j1', 'j2', 'j3']);
    expect(t.isLoaded()).toBe(true);
  });

  it('should set robotName', () => {
    const t = new URDFRobotTrait();
    t.setLoadedState('PR2', 10, 7, []);
    expect(t.getRobotName()).toBe('PR2');
  });

  it('should set linkCount', () => {
    const t = new URDFRobotTrait();
    t.setLoadedState('R', 12, 8, []);
    expect(t.getLinkCount()).toBe(12);
  });

  it('should set jointCount', () => {
    const t = new URDFRobotTrait();
    t.setLoadedState('R', 12, 8, []);
    expect(t.getJointCount()).toBe(8);
  });

  it('should initialise joint positions to 0 for each joint name', () => {
    const t = new URDFRobotTrait();
    t.setLoadedState('R', 3, 2, ['shoulder', 'elbow']);
    expect(t.getJointPosition('shoulder')).toBe(0);
    expect(t.getJointPosition('elbow')).toBe(0);
  });

  it('should not overwrite existing joint position', () => {
    const t = new URDFRobotTrait();
    t.setJointPosition('shoulder', 1.57);
    t.setLoadedState('R', 3, 1, ['shoulder']);
    expect(t.getJointPosition('shoulder')).toBe(1.57);
  });

  it('should emit urdf_loaded event', () => {
    const t = new URDFRobotTrait();
    const events: URDFRobotEvent[] = [];
    t.on('urdf_loaded', e => events.push(e));
    t.setLoadedState('Bot', 4, 2, []);
    expect(events.length).toBe(1);
    expect((events[0] as any).robotName).toBe('Bot');
    expect((events[0] as any).linkCount).toBe(4);
    expect((events[0] as any).jointCount).toBe(2);
  });

  it('should clear errors on successful load', () => {
    const t = new URDFRobotTrait();
    t.setError('parse error');
    t.setLoadedState('R', 1, 0, []);
    expect(t.getState().errors.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// setJointPosition / getJointPosition / getJointPositionsObject
// ---------------------------------------------------------------------------

describe('joint positions', () => {
  it('setJointPosition should store the value', () => {
    const t = new URDFRobotTrait();
    t.setJointPosition('elbow', 0.5);
    expect(t.getJointPosition('elbow')).toBe(0.5);
  });

  it('setJointPosition should invalidate USDA cache', () => {
    const t = new URDFRobotTrait();
    t.setCachedUSDA('#usda 1.0\n...');
    t.setJointPosition('elbow', 0.5);
    expect(t.getCachedUSDA()).toBeNull();
  });

  it('setJointPosition should emit joint_change event', () => {
    const t = new URDFRobotTrait();
    const events: URDFRobotEvent[] = [];
    t.on('joint_change', e => events.push(e));
    t.setJointPosition('wrist', 1.2);
    expect(events.length).toBe(1);
    expect((events[0] as any).jointName).toBe('wrist');
    expect((events[0] as any).position).toBe(1.2);
  });

  it('joint_change event should include timestamp', () => {
    const t = new URDFRobotTrait();
    const events: URDFRobotEvent[] = [];
    t.on('joint_change', e => events.push(e));
    t.setJointPosition('wrist', 0);
    expect(typeof (events[0] as any).timestamp).toBe('number');
  });

  it('getJointPosition returns undefined for unknown joint', () => {
    const t = new URDFRobotTrait();
    expect(t.getJointPosition('ghost')).toBeUndefined();
  });

  it('getJointPositionsObject returns all joints as plain object', () => {
    const t = new URDFRobotTrait();
    t.setJointPosition('a', 1);
    t.setJointPosition('b', 2);
    const obj = t.getJointPositionsObject();
    expect(obj).toEqual({ a: 1, b: 2 });
  });
});

// ---------------------------------------------------------------------------
// setError
// ---------------------------------------------------------------------------

describe('setError', () => {
  it('should add error to errors array', () => {
    const t = new URDFRobotTrait();
    t.setError('bad xml');
    expect(t.getState().errors).toContain('bad xml');
  });

  it('should accumulate multiple errors', () => {
    const t = new URDFRobotTrait();
    t.setError('e1');
    t.setError('e2');
    expect(t.getState().errors.length).toBe(2);
  });

  it('should emit urdf_error event', () => {
    const t = new URDFRobotTrait();
    const events: URDFRobotEvent[] = [];
    t.on('urdf_error', e => events.push(e));
    t.setError('parse failed');
    expect(events.length).toBe(1);
    expect((events[0] as any).error).toBe('parse failed');
  });
});

// ---------------------------------------------------------------------------
// setCachedUSDA / getCachedUSDA
// ---------------------------------------------------------------------------

describe('USDA cache', () => {
  it('should cache USDA content', () => {
    const t = new URDFRobotTrait();
    t.setCachedUSDA('#usda 1.0\nstage content');
    expect(t.getCachedUSDA()).toBe('#usda 1.0\nstage content');
  });

  it('should emit usdz_generated with correct size', () => {
    const t = new URDFRobotTrait();
    const events: URDFRobotEvent[] = [];
    t.on('usdz_generated', e => events.push(e));
    t.setCachedUSDA('hello');
    expect((events[0] as any).size).toBe(5);
  });

  it('getCachedUSDA returns null before any cache', () => {
    const t = new URDFRobotTrait();
    expect(t.getCachedUSDA()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getState — immutability
// ---------------------------------------------------------------------------

describe('getState immutability', () => {
  it('getState jointPositions should be a copy', () => {
    const t = new URDFRobotTrait();
    t.setJointPosition('x', 1);
    const s = t.getState();
    s.jointPositions.set('x', 99);
    expect(t.getJointPosition('x')).toBe(1);
  });

  it('getState errors should be a copy', () => {
    const t = new URDFRobotTrait();
    t.setError('oops');
    const s = t.getState();
    s.errors.push('injected');
    expect(t.getState().errors.length).toBe(1);
  });

  it('getConfig returns a copy', () => {
    const t = new URDFRobotTrait({ scale: 1.5 });
    const cfg = t.getConfig();
    cfg.scale = 99;
    expect(t.getConfig().scale).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// on / off / wildcard
// ---------------------------------------------------------------------------

describe('event listeners', () => {
  it('on() should register a listener', () => {
    const t = new URDFRobotTrait();
    const cb = vi.fn();
    t.on('urdf_loaded', cb);
    t.setLoadedState('Bot', 1, 0, []);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('off() should remove a listener', () => {
    const t = new URDFRobotTrait();
    const cb = vi.fn();
    t.on('urdf_error', cb);
    t.off('urdf_error', cb);
    t.setError('oops');
    expect(cb).not.toHaveBeenCalled();
  });

  it('wildcard * listener should receive all events', () => {
    const t = new URDFRobotTrait();
    const cb = vi.fn();
    t.on('*', cb);
    t.setError('e');
    t.setLoadedState('R', 1, 0, []);
    expect(cb.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('off() for unknown listener should not throw', () => {
    const t = new URDFRobotTrait();
    const cb = vi.fn();
    expect(() => t.off('urdf_loaded', cb)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// serialize
// ---------------------------------------------------------------------------

describe('serialize', () => {
  it('should include urdf_source', () => {
    const t = new URDFRobotTrait({ urdf_source: 'r.urdf' });
    expect(t.serialize().urdf_source).toBe('r.urdf');
  });

  it('should include preview_format', () => {
    const t = new URDFRobotTrait({ preview_format: 'gltf' });
    expect(t.serialize().preview_format).toBe('gltf');
  });

  it('should include up_axis', () => {
    const t = new URDFRobotTrait({ up_axis: 'Z' });
    expect(t.serialize().up_axis).toBe('Z');
  });

  it('should include scale', () => {
    const t = new URDFRobotTrait({ scale: 2.5 });
    expect(t.serialize().scale).toBe(2.5);
  });

  it('should include visionos_model_element', () => {
    const t = new URDFRobotTrait({ visionos_model_element: false });
    expect(t.serialize().visionos_model_element).toBe(false);
  });

  it('should not include joint positions (runtime state)', () => {
    const t = new URDFRobotTrait();
    t.setJointPosition('a', 1);
    const s = t.serialize();
    expect(s).not.toHaveProperty('jointPositions');
  });
});

// ---------------------------------------------------------------------------
// urdfRobotHandler — onAttach
// ---------------------------------------------------------------------------

describe('urdfRobotHandler.onAttach', () => {
  it('should store URDFRobotTrait on node.__urdfRobotTrait', () => {
    const { node } = setupHandler();
    expect(getTrait(node)).toBeInstanceOf(URDFRobotTrait);
  });

  it('should emit urdf_robot:attached', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    urdfRobotHandler.onAttach(node, BASE_CONFIG, context);
    expect(emitted.some(e => e.type === 'urdf_robot:attached')).toBe(true);
  });

  it('attached payload should include source and format', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    urdfRobotHandler.onAttach(node, { ...BASE_CONFIG, urdf_source: 'r.urdf' }, context);
    const ev = emitted.find(e => e.type === 'urdf_robot:attached');
    expect((ev!.payload as any).source).toBe('r.urdf');
    expect((ev!.payload as any).format).toBe('usdz');
  });
});

// ---------------------------------------------------------------------------
// urdfRobotHandler — onDetach
// ---------------------------------------------------------------------------

describe('urdfRobotHandler.onDetach', () => {
  it('should remove node.__urdfRobotTrait', () => {
    const { node, config } = setupHandler();
    const { context } = makeContext();
    urdfRobotHandler.onDetach(node, config, context);
    expect((node as any).__urdfRobotTrait).toBeUndefined();
  });

  it('should emit urdf_robot:detached', () => {
    const { node, config } = setupHandler();
    const { context, emitted } = makeContext();
    urdfRobotHandler.onDetach(node, config, context);
    expect(emitted.some(e => e.type === 'urdf_robot:detached')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// urdfRobotHandler — onUpdate
// ---------------------------------------------------------------------------

describe('urdfRobotHandler.onUpdate', () => {
  it('should not throw', () => {
    const { node, config, context } = setupHandler();
    expect(() => urdfRobotHandler.onUpdate(node, config, context, 0.016)).not.toThrow();
  });

  it('should not throw when node has no trait', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() => urdfRobotHandler.onUpdate(node, BASE_CONFIG, context, 0.016)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createURDFRobotTrait factory
// ---------------------------------------------------------------------------

describe('createURDFRobotTrait', () => {
  it('should return a URDFRobotTrait instance', () => {
    expect(createURDFRobotTrait()).toBeInstanceOf(URDFRobotTrait);
  });

  it('should apply config to the created instance', () => {
    const t = createURDFRobotTrait({ urdf_source: 'arm.urdf', scale: 0.5 });
    expect(t.getConfig().urdf_source).toBe('arm.urdf');
    expect(t.getConfig().scale).toBe(0.5);
  });

  it('should use defaults when no config passed', () => {
    const t = createURDFRobotTrait();
    expect(t.getConfig().preview_format).toBe('usdz');
    expect(t.isLoaded()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// urdfRobotHandler defaultConfig
// ---------------------------------------------------------------------------

describe('urdfRobotHandler defaultConfig', () => {
  it('should have name urdf_robot', () => {
    expect(urdfRobotHandler.name).toBe('urdf_robot');
  });

  it('defaultConfig preview_format is usdz', () => {
    expect(BASE_CONFIG.preview_format).toBe('usdz');
  });

  it('defaultConfig include_collision is false', () => {
    expect(BASE_CONFIG.include_collision).toBe(false);
  });
});
