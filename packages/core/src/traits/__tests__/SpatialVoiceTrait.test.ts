/**
 * SpatialVoiceTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { spatialVoiceHandler } from '../SpatialVoiceTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn() });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = {
  range: 20, rolloff: 'inverse' as const, rolloff_factor: 1.0,
  hrtf: true, vad_threshold: -40, echo_cancellation: true,
  noise_suppression: true, max_streams: 8,
};

describe('SpatialVoiceTrait', () => {
  it('has name "spatial_voice"', () => {
    expect(spatialVoiceHandler.name).toBe('spatial_voice');
  });

  it('onAttach emits an initialization event', () => {
    const node = makeNode();
    spatialVoiceHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalled();
  });
});
