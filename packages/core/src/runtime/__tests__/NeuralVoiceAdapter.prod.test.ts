/**
 * NeuralVoiceAdapter Production Tests
 *
 * VoiceManager: provider registration, speak routing, default provider,
 * and error handling. ElevenLabs and Azure adapter construction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VoiceManager,
  ElevenLabsAdapter,
  AzureVoiceAdapter,
  type VoiceProvider,
} from '../NeuralVoiceAdapter';

function mockProvider(name: string): VoiceProvider {
  return {
    synthesize: vi.fn(async () => new ArrayBuffer(128)),
  };
}

describe('NeuralVoiceAdapter — Production', () => {
  describe('VoiceManager', () => {
    let mgr: VoiceManager;

    beforeEach(() => {
      mgr = new VoiceManager();
    });

    it('registers provider', () => {
      const p = mockProvider('local');
      mgr.registerProvider('local', p);
      // No error = success
    });

    it('first registered provider becomes default', async () => {
      const p = mockProvider('first');
      mgr.registerProvider('first', p);

      await mgr.speak('hello');
      expect(p.synthesize).toHaveBeenCalledWith('hello', { voiceId: 'default' });
    });

    it('speaks with named provider', async () => {
      const p1 = mockProvider('a');
      const p2 = mockProvider('b');
      mgr.registerProvider('a', p1);
      mgr.registerProvider('b', p2);

      await mgr.speak('test', 'b', { voiceId: 'v1' });
      expect(p2.synthesize).toHaveBeenCalledWith('test', { voiceId: 'v1' });
      expect(p1.synthesize).not.toHaveBeenCalled();
    });

    it('setAsDefault overrides default', async () => {
      const p1 = mockProvider('a');
      const p2 = mockProvider('b');
      mgr.registerProvider('a', p1);
      mgr.registerProvider('b', p2, true); // setAsDefault

      await mgr.speak('hi');
      expect(p2.synthesize).toHaveBeenCalled();
      expect(p1.synthesize).not.toHaveBeenCalled();
    });

    it('throws for unknown provider', async () => {
      await expect(mgr.speak('x', 'nope')).rejects.toThrow('not found');
    });

    it('throws for no providers', async () => {
      await expect(mgr.speak('x')).rejects.toThrow();
    });

    it('returns ArrayBuffer', async () => {
      mgr.registerProvider('test', mockProvider('test'));
      const result = await mgr.speak('hello');
      expect(result).toBeInstanceOf(ArrayBuffer);
    });
  });

  describe('ElevenLabsAdapter', () => {
    it('constructs with API key', () => {
      const adapter = new ElevenLabsAdapter('test-key');
      expect(adapter).toBeDefined();
    });
  });

  describe('AzureVoiceAdapter', () => {
    it('constructs with subscription key and region', () => {
      const adapter = new AzureVoiceAdapter('sub-key', 'eastus');
      expect(adapter).toBeDefined();
    });
  });
});
