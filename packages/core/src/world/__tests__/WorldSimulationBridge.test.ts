import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorldSimulationBridge } from '../WorldSimulationBridge';
import { worldGeneratorService, type WorldEventEmitter } from '../WorldGeneratorService';

describe('WorldSimulationBridge', () => {
  let bridge: WorldSimulationBridge;
  let mockEmitter: WorldEventEmitter;

  beforeEach(() => {
    bridge = new WorldSimulationBridge();
    mockEmitter = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
  });

  it('should bind correctly to worldGeneratorService and the emitter', () => {
    bridge.bind(mockEmitter);
    expect(mockEmitter.on).toHaveBeenCalledWith('world:generate', expect.any(Function));
    expect(mockEmitter.on).toHaveBeenCalledWith('world:generation_complete', expect.any(Function));
  });

  it('should trigger splat_set_source for 3dgs format', () => {
    bridge.bind(mockEmitter);
    
    // Find the 'world:generation_complete' listener which was registered via mockEmitter.on
    const onComplete = (mockEmitter.on as any).mock.calls.find(
      (call: any) => call[0] === 'world:generation_complete'
    )[1];

    onComplete({
      nodeId: 'test-node',
      assetUrl: 'https://test.splat',
      generationId: 'gen-123',
      metadata: { format: '3dgs', bounds: [0,0,0,1,1,1] }
    });

    expect(mockEmitter.emit).toHaveBeenCalledWith('splat_set_source', expect.objectContaining({
      nodeId: 'test-node',
      source: 'https://test.splat'
    }));
    
    expect(mockEmitter.emit).toHaveBeenCalledWith('world:bounds_updated', expect.objectContaining({
      bounds: [0,0,0,1,1,1]
    }));
  });

  it('should trigger world:stream_ready for neural_field format', () => {
    bridge.bind(mockEmitter);
    const onComplete = (mockEmitter.on as any).mock.calls.find(
      (call: any) => call[0] === 'world:generation_complete'
    )[1];

    onComplete({
      nodeId: 'test-node',
      assetUrl: 'https://test.neural',
      generationId: 'gen-456',
      metadata: { format: 'neural_field' }
    });

    expect(mockEmitter.emit).toHaveBeenCalledWith('world:stream_ready', expect.objectContaining({
      streamUrl: 'https://test.neural',
      provider: 'sovereign-3d'
    }));
  });
});
