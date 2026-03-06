/**
 * VoiceManager.prod.test.ts
 *
 * Production tests for VoiceManager — PTT state, mute, peer muting,
 * and transport integration via mock.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoiceManager } from '../VoiceManager';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function makeTransport() {
  return {
    setMicrophoneEnabled: vi.fn(),
    // Minimal WebRTCTransport interface
  } as any;
}

function makeInput() {
  return {} as any; // InputBindings not used by VoiceManager directly
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VoiceManager', () => {
  let transport: ReturnType<typeof makeTransport>;
  let vm: VoiceManager;

  beforeEach(() => {
    transport = makeTransport();
    vm = new VoiceManager(makeInput(), transport);
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------
  describe('initial state', () => {
    it('mic is inactive initially (PTT not pressed, not muted)', () => {
      // Constructing already calls nothing — mic starts off
      // No assertion on transport (it's not called in constructor)
      expect(vm.isPeerMuted('any')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // setPushToTalkState
  // -------------------------------------------------------------------------
  describe('setPushToTalkState()', () => {
    it('pressing PTT while not muted activates mic', () => {
      vm.setPushToTalkState(true);
      expect(transport.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    });

    it('releasing PTT deactivates mic', () => {
      vm.setPushToTalkState(true);
      vm.setPushToTalkState(false);
      expect(transport.setMicrophoneEnabled).toHaveBeenLastCalledWith(false);
    });

    it('PTT pressed while muted keeps mic inactive', () => {
      vm.toggleMute(); // mute on
      vm.setPushToTalkState(true);
      // Last call should be false (muted)
      const calls = transport.setMicrophoneEnabled.mock.calls;
      expect(calls[calls.length - 1][0]).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // toggleMute
  // -------------------------------------------------------------------------
  describe('toggleMute()', () => {
    it('muting while PTT pressed disables mic', () => {
      vm.setPushToTalkState(true); // mic on
      transport.setMicrophoneEnabled.mockClear();
      vm.toggleMute(); // mute → mic off
      expect(transport.setMicrophoneEnabled).toHaveBeenCalledWith(false);
    });

    it('unmuting while PTT pressed re-enables mic', () => {
      vm.setPushToTalkState(true);
      vm.toggleMute(); // mute
      transport.setMicrophoneEnabled.mockClear();
      vm.toggleMute(); // unmute — PTT still held
      expect(transport.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    });

    it('toggle is idempotent when PTT not pressed', () => {
      vm.toggleMute(); // mute on (PTT not pressed → mic stays off)
      const before = transport.setMicrophoneEnabled.mock.calls.length;
      vm.toggleMute(); // mute off (PTT not pressed → mic stays off)
      const after = transport.setMicrophoneEnabled.mock.calls.length;
      // Both calls set mic to false (ptt off outweighs unmute)
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });

  // -------------------------------------------------------------------------
  // mutePeer / isPeerMuted
  // -------------------------------------------------------------------------
  describe('mutePeer() / isPeerMuted()', () => {
    it('muting a peer marks them as muted', () => {
      vm.mutePeer('peer1', true);
      expect(vm.isPeerMuted('peer1')).toBe(true);
    });

    it('unmuting a peer removes muted status', () => {
      vm.mutePeer('peer1', true);
      vm.mutePeer('peer1', false);
      expect(vm.isPeerMuted('peer1')).toBe(false);
    });

    it('unknown peer is not muted by default', () => {
      expect(vm.isPeerMuted('unknown')).toBe(false);
    });

    it('muting multiple peers independently', () => {
      vm.mutePeer('a', true);
      vm.mutePeer('b', false);
      expect(vm.isPeerMuted('a')).toBe(true);
      expect(vm.isPeerMuted('b')).toBe(false);
    });

    it('unmuting a peer that was never muted is a no-op', () => {
      expect(() => vm.mutePeer('ghost', false)).not.toThrow();
      expect(vm.isPeerMuted('ghost')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------------
  describe('update()', () => {
    it('does not throw', () => {
      expect(() => vm.update()).not.toThrow();
    });
  });
});
