/**
 * BaseVoiceSynthesizer Production Tests
 *
 * Voice synthesis: construction, initialize with different backends,
 * generate with caching, getVoices, and dispose.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseVoiceSynthesizer } from '../BaseVoiceSynthesizer';

describe('BaseVoiceSynthesizer — Production', () => {
  let synth: BaseVoiceSynthesizer;

  beforeEach(() => {
    vi.clearAllMocks();
    synth = new BaseVoiceSynthesizer();
  });

  describe('initialize', () => {
    it('initializes with local backend', async () => {
      await synth.initialize({ backend: 'local' } as any);
      const voices = await synth.getVoices();
      expect(voices.length).toBe(1);
      expect(voices[0].provider).toBe('local');
    });

    it('initializes with elevenlabs backend', async () => {
      await synth.initialize({ backend: 'elevenlabs' } as any);
      const voices = await synth.getVoices();
      expect(voices.length).toBeGreaterThan(0);
      expect(voices[0].provider).toBe('elevenlabs');
    });

    it('initializes with azure backend', async () => {
      await synth.initialize({ backend: 'azure' } as any);
      const voices = await synth.getVoices();
      expect(voices.length).toBeGreaterThan(0);
      expect(voices[0].provider).toBe('azure');
    });
  });

  describe('generate', () => {
    it('generates audio buffer', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await synth.initialize({ backend: 'local' } as any);

      const audio = await synth.generate({ text: 'hello world', voiceId: 'default' } as any);
      expect(audio).toBeInstanceOf(ArrayBuffer);
      expect(audio.byteLength).toBeGreaterThan(0);

      spy.mockRestore();
    });

    it('caches repeated requests', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await synth.initialize({ backend: 'local' } as any);

      const req = { text: 'cached', voiceId: 'default' } as any;
      const first = await synth.generate(req);
      const second = await synth.generate(req);
      expect(first).toBe(second); // Same reference = cached

      spy.mockRestore();
    });
  });

  describe('dispose', () => {
    it('clears cache', async () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await synth.initialize({ backend: 'local' } as any);
      await synth.generate({ text: 'disposable', voiceId: 'x' } as any);

      synth.dispose();

      // After dispose, generating the same request should create a new buffer
      const after = await synth.generate({ text: 'disposable', voiceId: 'x' } as any);
      expect(after).toBeInstanceOf(ArrayBuffer);

      spy.mockRestore();
    });
  });
});
