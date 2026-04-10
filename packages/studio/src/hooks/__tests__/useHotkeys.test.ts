// @vitest-environment jsdom
/**
 * useHotkeys.test.ts
 * Tests for keyboard shortcut management hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHotkeys, formatHotkeyDisplay, type HotkeyConfig } from '../useHotkeys';
import { useCharacterStore } from '../../lib/store';
import { logger } from '../../lib/logger';

describe('useHotkeys', () => {
  let mockCharacterStore: any;

  beforeEach(() => {
    // Mock character store
    mockCharacterStore = {
      isRecording: false,
      activeClipId: null,
      recordedClips: [],
      setIsRecording: vi.fn(),
      setActiveClipId: vi.fn(),
      removeRecordedClip: vi.fn(),
    };

    useCharacterStore.setState(mockCharacterStore);

    // Clear all event listeners
    document.body.innerHTML = '';
  });

  describe('Hotkey Prevention', () => {
    it('should prevent hotkeys in input fields', () => {
      const onHotkeyPress = vi.fn();
      renderHook(() => useHotkeys({ onHotkeyPress }));

      const input = document.createElement('input');
      document.body.appendChild(input);

      const event = new KeyboardEvent('keydown', { key: 'r' });
      Object.defineProperty(event, 'target', { value: input, writable: false });

      act(() => {
        input.dispatchEvent(event);
      });

      expect(onHotkeyPress).not.toHaveBeenCalled();
    });

    it('should prevent hotkeys in textarea', () => {
      const onHotkeyPress = vi.fn();
      renderHook(() => useHotkeys({ onHotkeyPress }));

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      const event = new KeyboardEvent('keydown', { key: 'r' });
      Object.defineProperty(event, 'target', { value: textarea, writable: false });

      act(() => {
        textarea.dispatchEvent(event);
      });

      expect(onHotkeyPress).not.toHaveBeenCalled();
    });

    it('should prevent hotkeys in select elements', () => {
      const onHotkeyPress = vi.fn();
      renderHook(() => useHotkeys({ onHotkeyPress }));

      const select = document.createElement('select');
      document.body.appendChild(select);

      const event = new KeyboardEvent('keydown', { key: 'r' });
      Object.defineProperty(event, 'target', { value: select, writable: false });

      act(() => {
        select.dispatchEvent(event);
      });

      expect(onHotkeyPress).not.toHaveBeenCalled();
    });

    it('should prevent hotkeys in contenteditable elements', () => {
      const onHotkeyPress = vi.fn();
      renderHook(() => useHotkeys({ onHotkeyPress }));

      const div = document.createElement('div');
      div.contentEditable = 'true';
      document.body.appendChild(div);

      const event = new KeyboardEvent('keydown', { key: 'r' });
      Object.defineProperty(event, 'target', { value: div, writable: false });

      act(() => {
        div.dispatchEvent(event);
      });

      expect(onHotkeyPress).not.toHaveBeenCalled();
    });

    it('should prevent hotkeys when modal is present', () => {
      const onHotkeyPress = vi.fn();
      renderHook(() => useHotkeys({ onHotkeyPress }));

      const modal = document.createElement('div');
      modal.setAttribute('role', 'dialog');
      document.body.appendChild(modal);

      const event = new KeyboardEvent('keydown', { key: 'r', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(onHotkeyPress).not.toHaveBeenCalled();
    });

    it('should allow hotkeys when preventInInputs is false', () => {
      const onHotkeyPress = vi.fn();
      renderHook(() => useHotkeys({ preventInInputs: false, onHotkeyPress }));

      const input = document.createElement('input');
      document.body.appendChild(input);

      const event = new KeyboardEvent('keydown', { key: 'r', bubbles: true });
      Object.defineProperty(event, 'target', { value: input, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(onHotkeyPress).toHaveBeenCalledWith('r');
    });

    it('should allow hotkeys when preventInModals is false', () => {
      const onHotkeyPress = vi.fn();
      renderHook(() => useHotkeys({ preventInModals: false, onHotkeyPress }));

      const modal = document.createElement('div');
      modal.setAttribute('role', 'dialog');
      document.body.appendChild(modal);

      const event = new KeyboardEvent('keydown', { key: 'r', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(onHotkeyPress).toHaveBeenCalledWith('r');
    });
  });

  describe('Recording Hotkeys', () => {
    it('should start recording on R key', () => {
      const onHotkeyPress = vi.fn();
      renderHook(() => useHotkeys({ onHotkeyPress }));

      const event = new KeyboardEvent('keydown', { key: 'r', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockCharacterStore.setIsRecording).toHaveBeenCalledWith(true);
      expect(onHotkeyPress).toHaveBeenCalledWith('r');
    });

    it('should not start recording if already recording', () => {
      useCharacterStore.setState({ isRecording: true });
      mockCharacterStore.setIsRecording.mockClear();

      renderHook(() => useHotkeys());

      const event = new KeyboardEvent('keydown', { key: 'r', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      // R key should be disabled when recording
      expect(mockCharacterStore.setIsRecording).not.toHaveBeenCalled();
    });

    it('should stop recording on S key', () => {
      useCharacterStore.setState({ isRecording: true });
      const onHotkeyPress = vi.fn();

      renderHook(() => useHotkeys({ onHotkeyPress }));

      const event = new KeyboardEvent('keydown', { key: 's', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockCharacterStore.setIsRecording).toHaveBeenCalledWith(false);
      expect(onHotkeyPress).toHaveBeenCalledWith('s');
    });
  });

  describe('Playback Hotkeys', () => {
    it('should toggle playback on Space key', () => {
      useCharacterStore.setState({
        activeClipId: 'clip-1',
        recordedClips: [{ id: 'clip-1', name: 'Clip 1' } as any],
      });

      const onHotkeyPress = vi.fn();
      renderHook(() => useHotkeys({ onHotkeyPress }));

      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockCharacterStore.setActiveClipId).toHaveBeenCalled();
      expect(onHotkeyPress).toHaveBeenCalledWith(' ');
    });

    it('should not toggle playback if no clips available', () => {
      useCharacterStore.setState({
        recordedClips: [],
        activeClipId: null,
      });

      renderHook(() => useHotkeys());

      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      // Space should be disabled with no clips
      expect(mockCharacterStore.setActiveClipId).not.toHaveBeenCalled();
    });
  });

  describe('Export Hotkey', () => {
    it('should export on E key when clip is active', () => {
      useCharacterStore.setState({
        activeClipId: 'clip-1',
        recordedClips: [{ id: 'clip-1', name: 'Test Clip' } as any],
      });

      const consoleSpy = vi.spyOn(logger, 'debug');
      renderHook(() => useHotkeys());

      const event = new KeyboardEvent('keydown', { key: 'e', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Hotkey] Export clip'),
        'Test Clip'
      );

      consoleSpy.mockRestore();
    });

    it('should not export if no active clip', () => {
      useCharacterStore.setState({
        activeClipId: null,
        recordedClips: [],
      });

      const consoleSpy = vi.spyOn(logger, 'debug');
      renderHook(() => useHotkeys());

      const event = new KeyboardEvent('keydown', { key: 'e', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Export'));

      consoleSpy.mockRestore();
    });
  });

  describe('Delete Hotkeys', () => {
    it('should delete clip on Delete key', () => {
      useCharacterStore.setState({
        activeClipId: 'clip-1',
        recordedClips: [{ id: 'clip-1', name: 'Clip 1' } as any],
      });

      renderHook(() => useHotkeys());

      const event = new KeyboardEvent('keydown', { key: 'delete', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockCharacterStore.removeRecordedClip).toHaveBeenCalledWith('clip-1');
      expect(mockCharacterStore.setActiveClipId).toHaveBeenCalledWith(null);
    });

    it('should delete clip on Backspace key', () => {
      useCharacterStore.setState({
        activeClipId: 'clip-1',
        recordedClips: [{ id: 'clip-1', name: 'Clip 1' } as any],
      });

      renderHook(() => useHotkeys());

      const event = new KeyboardEvent('keydown', { key: 'backspace', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockCharacterStore.removeRecordedClip).toHaveBeenCalledWith('clip-1');
      expect(mockCharacterStore.setActiveClipId).toHaveBeenCalledWith(null);
    });

    it('should not delete if no active clip', () => {
      useCharacterStore.setState({
        activeClipId: null,
      });

      renderHook(() => useHotkeys());

      const event = new KeyboardEvent('keydown', { key: 'delete', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockCharacterStore.removeRecordedClip).not.toHaveBeenCalled();
    });
  });

  describe('Preset Pose Hotkeys', () => {
    it('should trigger preset poses 1-9', () => {
      const consoleSpy = vi.spyOn(logger, 'debug');
      renderHook(() => useHotkeys());

      for (let i = 1; i <= 9; i++) {
        const event = new KeyboardEvent('keydown', { key: i.toString(), bubbles: true });
        Object.defineProperty(event, 'target', { value: document.body, writable: false });

        act(() => {
          window.dispatchEvent(event);
        });

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining(`Applied preset pose ${i}`)
        );
      }

      consoleSpy.mockRestore();
    });
  });

  describe('Undo/Redo Hotkeys', () => {
    it('should trigger undo on Ctrl+Z', () => {
      const consoleSpy = vi.spyOn(logger, 'debug');
      renderHook(() => useHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Undo'));

      consoleSpy.mockRestore();
    });

    it('should trigger redo on Ctrl+Shift+Z', () => {
      const consoleSpy = vi.spyOn(logger, 'debug');
      renderHook(() => useHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Redo'));

      consoleSpy.mockRestore();
    });

    it('should support Cmd+Z on Mac', () => {
      const consoleSpy = vi.spyOn(logger, 'debug');
      renderHook(() => useHotkeys());

      const event = new KeyboardEvent('keydown', {
        key: 'z',
        metaKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Undo'));

      consoleSpy.mockRestore();
    });
  });

  describe('Custom Hotkeys', () => {
    it('should register custom hotkeys', () => {
      const customAction = vi.fn();
      const customHotkeys: HotkeyConfig[] = [
        {
          key: 'c',
          description: 'Custom action',
          action: customAction,
        },
      ];

      renderHook(() => useHotkeys({ customHotkeys }));

      const event = new KeyboardEvent('keydown', { key: 'c', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(customAction).toHaveBeenCalled();
    });

    it('should not register disabled custom hotkeys', () => {
      const customAction = vi.fn();
      const customHotkeys: HotkeyConfig[] = [
        {
          key: 'c',
          description: 'Disabled action',
          action: customAction,
          enabled: false,
        },
      ];

      renderHook(() => useHotkeys({ customHotkeys }));

      const event = new KeyboardEvent('keydown', { key: 'c', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(customAction).not.toHaveBeenCalled();
    });

    it('should support custom hotkeys with modifiers', () => {
      const customAction = vi.fn();
      const customHotkeys: HotkeyConfig[] = [
        {
          key: 'ctrl+k',
          ctrl: true,
          description: 'Custom Ctrl+K',
          action: customAction,
        },
      ];

      renderHook(() => useHotkeys({ customHotkeys }));

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(customAction).toHaveBeenCalled();
    });
  });

  describe('Hook Options', () => {
    it('should disable all hotkeys when enabled is false', () => {
      const onHotkeyPress = vi.fn();
      renderHook(() => useHotkeys({ enabled: false, onHotkeyPress }));

      const event = new KeyboardEvent('keydown', { key: 'r', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(onHotkeyPress).not.toHaveBeenCalled();
      expect(mockCharacterStore.setIsRecording).not.toHaveBeenCalled();
    });

    it('should call onHotkeyPress callback', () => {
      const onHotkeyPress = vi.fn();
      renderHook(() => useHotkeys({ onHotkeyPress }));

      const event = new KeyboardEvent('keydown', { key: 'r', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(onHotkeyPress).toHaveBeenCalledWith('r');
    });
  });

  describe('getActiveHotkeys', () => {
    it('should return all active hotkeys', () => {
      const { result } = renderHook(() => useHotkeys());

      const activeHotkeys = result.current.getActiveHotkeys();

      expect(activeHotkeys.length).toBeGreaterThan(0);
      expect(activeHotkeys.every((h) => h.key && h.description && h.action)).toBe(true);
    });

    it('should not include disabled hotkeys', () => {
      useCharacterStore.setState({ isRecording: true });

      const { result } = renderHook(() => useHotkeys());

      const activeHotkeys = result.current.getActiveHotkeys();
      const hasRecordHotkey = activeHotkeys.some((h) => h.key === 'r');

      // 'r' key should be disabled when recording
      expect(hasRecordHotkey).toBe(false);
    });

    it('should include custom hotkeys', () => {
      const customHotkeys: HotkeyConfig[] = [
        {
          key: 'c',
          description: 'Custom',
          action: () => {},
        },
      ];

      const { result } = renderHook(() => useHotkeys({ customHotkeys }));

      const activeHotkeys = result.current.getActiveHotkeys();
      const hasCustom = activeHotkeys.some((h) => h.key === 'c');

      expect(hasCustom).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should remove event listener on unmount', () => {
      const onHotkeyPress = vi.fn();
      const { unmount } = renderHook(() => useHotkeys({ onHotkeyPress }));

      unmount();

      const event = new KeyboardEvent('keydown', { key: 'r', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(onHotkeyPress).not.toHaveBeenCalled();
    });

    it('should update hotkeys when store changes', () => {
      const { rerender } = renderHook(() => useHotkeys());

      // Change store state
      useCharacterStore.setState({ isRecording: true });

      rerender();

      const event = new KeyboardEvent('keydown', { key: 's', bubbles: true });
      Object.defineProperty(event, 'target', { value: document.body, writable: false });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(mockCharacterStore.setIsRecording).toHaveBeenCalledWith(false);
    });
  });
});

describe('formatHotkeyDisplay', () => {
  it('should format simple key', () => {
    expect(formatHotkeyDisplay('r')).toBe('R');
  });

  it('should format Ctrl key', () => {
    expect(formatHotkeyDisplay('ctrl+z')).toBe('⌘ + Z');
  });

  it('should format Shift key', () => {
    expect(formatHotkeyDisplay('shift+r')).toBe('⇧ + R');
  });

  it('should format Alt key', () => {
    expect(formatHotkeyDisplay('alt+f4')).toBe('⌥ + F4');
  });

  it('should format multiple modifiers', () => {
    expect(formatHotkeyDisplay('ctrl+shift+z')).toBe('⌘ + ⇧ + Z');
  });

  it('should format space key', () => {
    expect(formatHotkeyDisplay(' ')).toBe('Space');
  });

  it('should format complex combination', () => {
    expect(formatHotkeyDisplay('ctrl+alt+delete')).toBe('⌘ + ⌥ + DELETE');
  });
});
