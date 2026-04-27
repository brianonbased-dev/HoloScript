/**
 * BiofeedbackTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { biofeedbackHandler } from '../BiofeedbackTrait';
import type { BiofeedbackState } from '../BiofeedbackTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __biofeedbackState: undefined as unknown,
});

const defaultConfig = {
  sources: ['heart_rate' as const],
  sample_rate_hz: 10,
  normalize: true,
  emit_on_threshold: true,
  thresholds: {},
  ranges: {},
};

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('BiofeedbackTrait — metadata', () => {
  it('has name "biofeedback"', () => {
    expect(biofeedbackHandler.name).toBe('biofeedback');
  });

  it('defaultConfig has expected keys', () => {
    const c = biofeedbackHandler.defaultConfig!;
    expect(c.sources).toContain('heart_rate');
    expect(c.sample_rate_hz).toBe(10);
    expect(c.normalize).toBe(true);
    expect(c.emit_on_threshold).toBe(true);
  });
});

describe('BiofeedbackTrait — onAttach / onDetach', () => {
  it('onAttach initializes state and emits biofeedback_connect', () => {
    const node = makeNode();
    biofeedbackHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__biofeedbackState as BiofeedbackState;
    expect(state.isConnected).toBe(false);
    expect(state.samples).toBeInstanceOf(Map);
    expect(node.emit).toHaveBeenCalledWith('biofeedback_connect', expect.objectContaining({
      sources: ['heart_rate'],
      sampleRateHz: 10,
    }));
  });

  it('onDetach removes state (no disconnect emit when not connected)', () => {
    const node = makeNode();
    biofeedbackHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    biofeedbackHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__biofeedbackState).toBeUndefined();
    // Not connected → no disconnect event
    expect(node.emit).not.toHaveBeenCalledWith('biofeedback_disconnect', expect.anything());
  });

  it('onDetach emits biofeedback_disconnect when connected', () => {
    const node = makeNode();
    biofeedbackHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    // Connect the device
    biofeedbackHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'biofeedback_device_connected',
    } as never);
    node.emit.mockClear();
    biofeedbackHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('biofeedback_disconnect', expect.anything());
  });
});

describe('BiofeedbackTrait — onEvent', () => {
  it('biofeedback_device_connected sets isConnected=true and emits on_biofeedback_ready', () => {
    const node = makeNode();
    biofeedbackHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    biofeedbackHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'biofeedback_device_connected',
    } as never);
    const state = node.__biofeedbackState as BiofeedbackState;
    expect(state.isConnected).toBe(true);
    expect(node.emit).toHaveBeenCalledWith('on_biofeedback_ready', expect.anything());
  });

  it('biofeedback_device_disconnected sets isConnected=false', () => {
    const node = makeNode();
    biofeedbackHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    biofeedbackHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'biofeedback_device_connected',
    } as never);
    biofeedbackHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'biofeedback_device_disconnected',
    } as never);
    const state = node.__biofeedbackState as BiofeedbackState;
    expect(state.isConnected).toBe(false);
  });

  it('biofeedback_sample stores sample with normalized value', () => {
    const node = makeNode();
    biofeedbackHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    // heart_rate range 40-200, value 120 → normalized = (120-40)/(200-40) = 80/160 = 0.5
    biofeedbackHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'biofeedback_sample', source: 'heart_rate', value: 120,
    } as never);
    const state = node.__biofeedbackState as BiofeedbackState;
    const sample = state.samples.get('heart_rate')!;
    expect(sample.raw).toBe(120);
    expect(sample.normalized).toBeCloseTo(0.5, 3);
    expect(node.emit).toHaveBeenCalledWith('biofeedback_reading', expect.objectContaining({
      source: 'heart_rate', raw: 120,
    }));
  });

  it('biofeedback_sample ignores sources not in config', () => {
    const node = makeNode();
    biofeedbackHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    biofeedbackHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'biofeedback_sample', source: 'gsr', value: 5,
    } as never);
    expect(node.emit).not.toHaveBeenCalledWith('biofeedback_reading', expect.anything());
  });

  it('biofeedback_sample emits threshold_crossed on edge change', () => {
    const node = makeNode();
    const cfg = {
      ...defaultConfig,
      emit_on_threshold: true,
      thresholds: { heart_rate: { low: 60, high: 180 } } as typeof defaultConfig.thresholds,
    };
    biofeedbackHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    node.emit.mockClear();
    // Send low reading (< 60)
    biofeedbackHandler.onEvent!(node as never, cfg, makeCtx(node) as never, {
      type: 'biofeedback_sample', source: 'heart_rate', value: 50,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('biofeedback_threshold_crossed', expect.objectContaining({
      source: 'heart_rate', direction: 'low',
    }));
  });

  it('biofeedback_threshold_crossed not emitted when edge unchanged', () => {
    const node = makeNode();
    const cfg = {
      ...defaultConfig,
      emit_on_threshold: true,
      thresholds: { heart_rate: { low: 60, high: 180 } } as typeof defaultConfig.thresholds,
    };
    biofeedbackHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    // First reading — normal range
    biofeedbackHandler.onEvent!(node as never, cfg, makeCtx(node) as never, {
      type: 'biofeedback_sample', source: 'heart_rate', value: 100,
    } as never);
    node.emit.mockClear();
    // Second reading — still normal
    biofeedbackHandler.onEvent!(node as never, cfg, makeCtx(node) as never, {
      type: 'biofeedback_sample', source: 'heart_rate', value: 110,
    } as never);
    expect(node.emit).not.toHaveBeenCalledWith('biofeedback_threshold_crossed', expect.anything());
  });

  it('biofeedback_query returns specific sample', () => {
    const node = makeNode();
    biofeedbackHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    biofeedbackHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'biofeedback_sample', source: 'heart_rate', value: 75,
    } as never);
    node.emit.mockClear();
    biofeedbackHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'biofeedback_query', source: 'heart_rate', queryId: 'q1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('biofeedback_response', expect.objectContaining({
      queryId: 'q1', source: 'heart_rate',
    }));
  });

  it('biofeedback_calibrate clears samples and thresholdEdge', () => {
    const node = makeNode();
    biofeedbackHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    biofeedbackHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'biofeedback_sample', source: 'heart_rate', value: 90,
    } as never);
    const state = node.__biofeedbackState as BiofeedbackState;
    expect(state.samples.size).toBeGreaterThan(0);
    biofeedbackHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'biofeedback_calibrate',
    } as never);
    expect(state.samples.size).toBe(0);
    expect(state.thresholdEdge.size).toBe(0);
  });
});
