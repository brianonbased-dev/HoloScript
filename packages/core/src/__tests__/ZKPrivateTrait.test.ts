import { describe, it, expect, vi, beforeEach } from 'vitest';
import { zkPrivateHandler } from '../traits/ZKPrivateTrait';

describe('ZKPrivateTrait (v4.3 spatial predicate API)', () => {
  let mockContext: any;
  let mockNode: any;

  beforeEach(() => {
    mockContext = {
      emit: vi.fn(),
    };
    mockNode = {
      id: 'secure_node_01',
    };
  });

  it('should initialize state and emit initialization event onAttach', () => {
    const config = zkPrivateHandler.defaultConfig;
    zkPrivateHandler.onAttach!(mockNode, config, mockContext);

    expect((mockNode as any).__zkPrivateState).toBeDefined();
    expect((mockNode as any).__zkPrivateState.isVerified).toBe(false);
    expect(mockContext.emit).toHaveBeenCalledWith(
      'zk_privacy_initialized',
      expect.objectContaining({
        predicate: config.predicate,
      })
    );
  });

  it('should cleanup state onDetach', () => {
    (mockNode as any).__zkPrivateState = {};
    zkPrivateHandler.onDetach!(mockNode, {} as any, mockContext);
    expect((mockNode as any).__zkPrivateState).toBeUndefined();
  });

  it('should emit proof request on zk_verify_proximity event', () => {
    const config = { ...zkPrivateHandler.defaultConfig, radius: 10 };
    zkPrivateHandler.onAttach!(mockNode, config, mockContext);

    const event = { type: 'zk_verify_proximity' };
    zkPrivateHandler.onEvent!(mockNode, config, mockContext, event as any);

    expect(mockContext.emit).toHaveBeenCalledWith(
      'zk_proof_request',
      expect.objectContaining({
        predicate: 'proximity',
        params: { radius: 10 },
      })
    );
  });

  it('should unlock privacy on valid proof submission', () => {
    const config = zkPrivateHandler.defaultConfig;
    zkPrivateHandler.onAttach!(mockNode, config, mockContext);

    const event = {
      type: 'zk_proof_submitted',
      payload: { proofValid: true },
    };
    zkPrivateHandler.onEvent!(mockNode, config, mockContext, event as any);

    expect((mockNode as any).__zkPrivateState.isVerified).toBe(true);
    expect(mockContext.emit).toHaveBeenCalledWith('zk_privacy_unlocked', expect.anything());
  });

  it('should emit failure on invalid proof submission', () => {
    const config = zkPrivateHandler.defaultConfig;
    zkPrivateHandler.onAttach!(mockNode, config, mockContext);

    const event = {
      type: 'zk_proof_submitted',
      payload: { proofValid: false },
    };
    zkPrivateHandler.onEvent!(mockNode, config, mockContext, event as any);

    expect((mockNode as any).__zkPrivateState.isVerified).toBe(false);
    expect(mockContext.emit).toHaveBeenCalledWith(
      'zk_privacy_failed',
      expect.objectContaining({
        reason: 'invalid_proof',
      })
    );
  });
});
