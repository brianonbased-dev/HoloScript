/**
 * HoloMapAnchorContextTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { holomapAnchorContextHandler } from '../HoloMapAnchorContextTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn() });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = { autoReanchor: true };

describe('HoloMapAnchorContextTrait', () => {
  it('has name "holomap_anchor_context"', () => {
    expect(holomapAnchorContextHandler.name).toBe('holomap_anchor_context');
  });

  it('defaultConfig autoReanchor is true', () => {
    expect(holomapAnchorContextHandler.defaultConfig?.autoReanchor).toBe(true);
  });

  it('onAttach emits holomap:anchor_ready', () => {
    const node = makeNode();
    holomapAnchorContextHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('holomap:anchor_ready', {});
  });

  it('holomap:anchor_update emits holomap:anchor_state_changed', () => {
    const node = makeNode();
    holomapAnchorContextHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    holomapAnchorContextHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'holomap:anchor_update',
      payload: { anchorFrameIndex: 42 },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('holomap:anchor_state_changed', expect.objectContaining({
      anchorFrameIndex: 42,
      autoReanchor: true,
    }));
  });

  it('holomap:drift_update triggers reanchor when drift exceeds threshold', () => {
    const node = makeNode();
    holomapAnchorContextHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    holomapAnchorContextHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'holomap:drift_update',
      payload: { estimatedDriftMeters: 1.5, maxDriftBeforeReanchor: 1.0 },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('holomap:reanchor_requested', expect.objectContaining({
      estimatedDriftMeters: 1.5,
    }));
  });

  it('holomap:drift_update does NOT reanchor when drift is below threshold', () => {
    const node = makeNode();
    holomapAnchorContextHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    holomapAnchorContextHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'holomap:drift_update',
      payload: { estimatedDriftMeters: 0.3, maxDriftBeforeReanchor: 1.0 },
    } as never);
    expect(node.emit).not.toHaveBeenCalledWith('holomap:reanchor_requested', expect.anything());
  });
});
