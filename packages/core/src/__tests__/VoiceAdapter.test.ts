import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ElevenLabsAdapter,
  AzureVoiceAdapter,
  VoiceManager,
} from '@holoscript/engine/runtime/NeuralVoiceAdapter';

describe('NeuralVoiceAdapters', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should format ElevenLabs request correctly', async () => {
    const adapter = new ElevenLabsAdapter('test-api-key');
    const mockBuffer = new ArrayBuffer(8);

    (fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    });

    const result = await adapter.synthesize('Hello', { voiceId: 'voice-id-1' });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('elevenlabs.io/v1/text-to-speech/voice-id-1/stream'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'xi-api-key': 'test-api-key',
        }),
      })
    );
    expect(result).toBe(mockBuffer);
  });

  it('should format Azure request correctly', async () => {
    const adapter = new AzureVoiceAdapter('test-key', 'eastus');
    const mockBuffer = new ArrayBuffer(8);

    (fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBuffer),
    });

    const result = await adapter.synthesize('Hello', { voiceId: 'en-US-JennyNeural' });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('eastus.tts.speech.microsoft.com'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Ocp-Apim-Subscription-Key': 'test-key',
        }),
      })
    );
    expect(result).toBe(mockBuffer);
  });

  it('should manage multiple providers in VoiceManager', async () => {
    const manager = new VoiceManager();
    const mockEleven = new ElevenLabsAdapter('key1');
    const mockAzure = new AzureVoiceAdapter('key2', 'region');

    vi.spyOn(mockEleven, 'synthesize').mockResolvedValue(new ArrayBuffer(0));
    vi.spyOn(mockAzure, 'synthesize').mockResolvedValue(new ArrayBuffer(0));

    manager.registerProvider('eleven', mockEleven);
    manager.registerProvider('azure', mockAzure);

    await manager.speak('Hello', 'eleven');
    expect(mockEleven.synthesize).toHaveBeenCalled();

    await manager.speak('World', 'azure');
    expect(mockAzure.synthesize).toHaveBeenCalled();
  });
});
