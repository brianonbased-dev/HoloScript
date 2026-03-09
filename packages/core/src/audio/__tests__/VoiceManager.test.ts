import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceManager } from '../VoiceManager';

// Mock dependencies
const mockInput = {} as any;
const mockTransport = {
  setMicrophoneEnabled: vi.fn(),
} as any;

describe('VoiceManager', () => {
  let vm: VoiceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vm = new VoiceManager(mockInput, mockTransport);
  });

  it('mic starts disabled (PTT not pressed)', () => {
    // Freshly created, PTT is not pressed
    vm.setPushToTalkState(false);
    expect(mockTransport.setMicrophoneEnabled).toHaveBeenCalledWith(false);
  });

  it('PTT pressed enables mic', () => {
    vm.setPushToTalkState(true);
    expect(mockTransport.setMicrophoneEnabled).toHaveBeenCalledWith(true);
  });

  it('PTT released disables mic', () => {
    vm.setPushToTalkState(true);
    vm.setPushToTalkState(false);
    expect(mockTransport.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
  });

  it('toggleMute disables mic even with PTT', () => {
    vm.setPushToTalkState(true);
    vm.toggleMute(); // muted
    expect(mockTransport.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
  });

  it('toggleMute twice unmutes', () => {
    vm.toggleMute(); // muted
    vm.toggleMute(); // unmuted
    vm.setPushToTalkState(true);
    expect(mockTransport.setMicrophoneEnabled).toHaveBeenLastCalledWith(true);
  });

  it('mutePeer tracks peer mute state', () => {
    vm.mutePeer('peer1', true);
    expect(vm.isPeerMuted('peer1')).toBe(true);
    vm.mutePeer('peer1', false);
    expect(vm.isPeerMuted('peer1')).toBe(false);
  });

  it('isPeerMuted returns false for unknown peer', () => {
    expect(vm.isPeerMuted('unknown')).toBe(false);
  });

  it('update does not throw', () => {
    expect(() => vm.update()).not.toThrow();
  });
});
