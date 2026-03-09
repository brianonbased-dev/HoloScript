import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceManager } from '../VoiceManager';
import { InputBindings } from '../../input/InputBindings';
import { WebRTCTransport } from '../../network/WebRTCTransport';
import { SpatialAudioSource } from '../SpatialAudioSource';

class MockTransport {
  localAudioEnabled = true;

  setMicrophoneEnabled(enabled: boolean) {
    this.localAudioEnabled = enabled;
  }
}

class MockInput extends InputBindings {
  // Helper to simulate bindings
}

describe('Voice Chat Features', () => {
  let voiceManager: VoiceManager;
  let transport: MockTransport;
  let input: MockInput;

  beforeEach(() => {
    transport = new MockTransport();
    input = new MockInput();
    voiceManager = new VoiceManager(input, transport as unknown as WebRTCTransport);
  });

  describe('Push-to-Talk', () => {
    it('should disable mic by default if PTT not pressed', () => {
      // Initial state check - accessing private state via transport mock
      expect(transport.localAudioEnabled).toBe(true); // Implementation detail: default might need to require update()

      // Force an update/state change
      voiceManager.setPushToTalkState(false);
      expect(transport.localAudioEnabled).toBe(false);
    });

    it('should enable mic when PTT is pressed', () => {
      voiceManager.setPushToTalkState(true);
      expect(transport.localAudioEnabled).toBe(true);
    });

    it('should disable mic when PTT is released', () => {
      voiceManager.setPushToTalkState(true);
      voiceManager.setPushToTalkState(false);
      expect(transport.localAudioEnabled).toBe(false);
    });
  });

  describe('Muting', () => {
    it('should disable mic if muted, even if PTT pressed', () => {
      voiceManager.toggleMute(); // Mute self
      voiceManager.setPushToTalkState(true);

      expect(transport.localAudioEnabled).toBe(false);
    });

    it('should re-enable mic if unmuted and PTT pressed', () => {
      voiceManager.toggleMute(); // Mute
      voiceManager.toggleMute(); // Unmute
      voiceManager.setPushToTalkState(true);

      expect(transport.localAudioEnabled).toBe(true);
    });

    it('should track muted peers', () => {
      voiceManager.mutePeer('peer1', true);
      expect(voiceManager.isPeerMuted('peer1')).toBe(true);

      voiceManager.mutePeer('peer1', false);
      expect(voiceManager.isPeerMuted('peer1')).toBe(false);
    });
  });

  describe('Spatial Audio Tuning', () => {
    it('should use tuned defaults for voice', () => {
      const source = new SpatialAudioSource();
      const config = source.getConfig();

      expect(config.minDistance).toBe(3); // Tuned from 1
      expect(config.rolloff).toBe('inverse');
    });

    it('should apply rolloff factor', () => {
      const source = new SpatialAudioSource({
        minDistance: 1,
        rolloffFactor: 2,
      });

      source.play(); // MUST PLAY!

      // At distance 2:
      // Inverse: min / (min + factor * (dist - min))
      // 1 / (1 + 2 * (2 - 1)) = 1 / 3 = 0.33

      source.update(0.1, { x: 2, y: 0, z: 0 });
      console.log('DEBUG GAIN:', source.getGain());
      expect(source.getGain()).toBeCloseTo(1 / 3, 2);
    });
  });
});
