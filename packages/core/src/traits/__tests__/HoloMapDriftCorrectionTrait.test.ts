/**
 * HoloMapDriftCorrectionTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { holomapDriftCorrectionHandler } from '../HoloMapDriftCorrectionTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn() });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = { maxDriftMeters: 1.0, loopClosureThreshold: 0.92, rewriteHistory: false };

describe('HoloMapDriftCorrectionTrait', () => {
  it('has name "holomap_drift_correction"', () => {
    expect(holomapDriftCorrectionHandler.name).toBe('holomap_drift_correction');
  });

  it('defaultConfig maxDriftMeters is 1.0', () => {
    expect(holomapDriftCorrectionHandler.defaultConfig?.maxDriftMeters).toBe(1.0);
  });

  it('onAttach emits holomap:drift_monitor_start', () => {
    const node = makeNode();
    holomapDriftCorrectionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('holomap:drift_monitor_start', {});
  });

  it('holomap:drift_update requests correction when drift >= maxDriftMeters', () => {
    const node = makeNode();
    holomapDriftCorrectionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    holomapDriftCorrectionHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'holomap:drift_update',
      payload: { estimatedDriftMeters: 1.2 },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('holomap:drift_correction_requested', expect.objectContaining({
      estimatedDriftMeters: 1.2,
      loopClosureThreshold: 0.92,
    }));
  });

  it('holomap:drift_update does NOT request correction when drift < maxDriftMeters', () => {
    const node = makeNode();
    holomapDriftCorrectionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    holomapDriftCorrectionHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'holomap:drift_update',
      payload: { estimatedDriftMeters: 0.5 },
    } as never);
    expect(node.emit).not.toHaveBeenCalled();
  });

  it('unrelated events are ignored', () => {
    const node = makeNode();
    holomapDriftCorrectionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    holomapDriftCorrectionHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'some:other_event',
      payload: {},
    } as never);
    expect(node.emit).not.toHaveBeenCalled();
  });
});
