/**
 * useHotkeys.ts — Keyboard Shortcuts for Character Studio
 *
 * MEME-013: Hotkeys for viral workflow
 * Priority: High | Estimate: 3 hours
 *
 * Hotkey Map:
 * - R: Start recording animation
 * - S: Stop recording
 * - SPACE: Play/pause animation
 * - E: Export current clip
 * - 1-9: Apply preset poses
 * - L: Toggle loop
 * - DELETE: Delete selected clip
 * - CTRL+Z: Undo
 * - CTRL+SHIFT+Z: Redo
 */

import { useEffect, useCallback, useRef } from 'react';
import { useCharacterStore } from '../lib/store';

export interface HotkeyConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  action: () => void;
  enabled?: boolean;
}

export interface UseHotkeysOptions {
  /**
   * Enable hotkeys globally
   * Default: true
   */
  enabled?: boolean;

  /**
   * Disable hotkeys when typing in inputs
   * Default: true
   */
  preventInInputs?: boolean;

  /**
   * Disable hotkeys in modals/dialogs
   * Default: true
   */
  preventInModals?: boolean;

  /**
   * Custom hotkey configurations
   */
  customHotkeys?: HotkeyConfig[];

  /**
   * Callback when hotkey is pressed
   */
  onHotkeyPress?: (key: string) => void;
}

/**
 * Character Studio Hotkeys Hook
 *
 * Usage:
 * ```tsx
 * function CharacterLayout() {
 *   useHotkeys({
 *     enabled: true,
 *     onHotkeyPress: (key) => console.log(`Pressed: ${key}`)
 *   });
 *
 *   return <div>...</div>;
 * }
 * ```
 */
export function useHotkeys(options: UseHotkeysOptions = {}) {
  const {
    enabled = true,
    preventInInputs = true,
    preventInModals = true,
    customHotkeys = [],
    onHotkeyPress,
  } = options;

  const characterStore = useCharacterStore();
  const activeHotkeysRef = useRef<Map<string, HotkeyConfig>>(new Map());

  /**
   * Check if event should be prevented
   */
  const shouldPreventHotkey = useCallback(
    (event: KeyboardEvent): boolean => {
      // Prevent in input fields
      if (preventInInputs) {
        const target = event.target as HTMLElement;
        const tagName = target.tagName.toLowerCase();
        const isEditable = target.isContentEditable;
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || isEditable) {
          return true;
        }
      }

      // Prevent in modals
      if (preventInModals) {
        const hasModal = document.querySelector('[role="dialog"]');
        if (hasModal) {
          return true;
        }
      }

      return false;
    },
    [preventInInputs, preventInModals]
  );

  /**
   * Get hotkey string from event
   */
  const getHotkeyString = useCallback((event: KeyboardEvent): string => {
    const parts: string[] = [];
    if (event.ctrlKey || event.metaKey) parts.push('ctrl');
    if (event.shiftKey) parts.push('shift');
    if (event.altKey) parts.push('alt');
    parts.push(event.key.toLowerCase());
    return parts.join('+');
  }, []);

  /**
   * Core hotkey actions
   */
  const coreHotkeys = useCallback((): HotkeyConfig[] => {
    return [
      // Recording
      {
        key: 'r',
        description: 'Start recording animation',
        action: () => {
          if (!characterStore.isRecording) {
            characterStore.setIsRecording(true);
            console.log('[Hotkey] Started recording (R)');
          }
        },
        enabled: !characterStore.isRecording,
      },
      {
        key: 's',
        description: 'Stop recording',
        action: () => {
          if (characterStore.isRecording) {
            characterStore.setIsRecording(false);
            console.log('[Hotkey] Stopped recording (S)');
          }
        },
        enabled: characterStore.isRecording,
      },

      // Playback
      {
        key: ' ', // Space
        description: 'Play/pause animation',
        action: () => {
          const activeClipId = characterStore.activeClipId;
          if (activeClipId) {
            // Toggle play/pause (implementation depends on R3F useFrame)
            characterStore.setActiveClipId(activeClipId === null ? activeClipId : null);
            console.log('[Hotkey] Toggled playback (SPACE)');
          }
        },
        enabled: characterStore.recordedClips.length > 0,
      },

      // Export
      {
        key: 'e',
        description: 'Export current clip',
        action: () => {
          const activeClip = characterStore.recordedClips.find(
            (c) => c.id === characterStore.activeClipId
          );
          if (activeClip) {
            // Trigger export (will be implemented in MEME-008)
            console.log('[Hotkey] Export clip (E):', activeClip.name);
            // TODO: Call exportToMP4(activeClip)
          }
        },
        enabled: characterStore.activeClipId !== null,
      },

      // Loop toggle
      {
        key: 'l',
        description: 'Toggle loop',
        action: () => {
          // Toggle loop state (stored in local state or store)
          console.log('[Hotkey] Toggled loop (L)');
          // TODO: Implement loop state
        },
      },

      // Delete
      {
        key: 'delete',
        description: 'Delete selected clip',
        action: () => {
          if (characterStore.activeClipId) {
            characterStore.removeRecordedClip(characterStore.activeClipId);
            characterStore.setActiveClipId(null);
            console.log('[Hotkey] Deleted clip (DELETE)');
          }
        },
        enabled: characterStore.activeClipId !== null,
      },
      {
        key: 'backspace',
        description: 'Delete selected clip',
        action: () => {
          if (characterStore.activeClipId) {
            characterStore.removeRecordedClip(characterStore.activeClipId);
            characterStore.setActiveClipId(null);
            console.log('[Hotkey] Deleted clip (BACKSPACE)');
          }
        },
        enabled: characterStore.activeClipId !== null,
      },

      // Preset poses (1-9)
      ...Array.from({ length: 9 }, (_, i) => ({
        key: `${i + 1}`,
        description: `Apply preset pose ${i + 1}`,
        action: () => {
          console.log(`[Hotkey] Applied preset pose ${i + 1}`);
          // TODO: Implement preset pose system (MEME-004)
        },
      })),

      // Undo/Redo (will integrate with history store)
      {
        key: 'ctrl+z',
        ctrl: true,
        description: 'Undo',
        action: () => {
          console.log('[Hotkey] Undo (CTRL+Z)');
          // TODO: Integrate with useHistoryStore
        },
      },
      {
        key: 'ctrl+shift+z',
        ctrl: true,
        shift: true,
        description: 'Redo',
        action: () => {
          console.log('[Hotkey] Redo (CTRL+SHIFT+Z)');
          // TODO: Integrate with useHistoryStore
        },
      },
    ];
  }, [characterStore]);

  /**
   * Register hotkeys
   */
  useEffect(() => {
    if (!enabled) return;

    const allHotkeys = [...coreHotkeys(), ...customHotkeys];

    // Build hotkey map
    const hotkeyMap = new Map<string, HotkeyConfig>();
    allHotkeys.forEach((config) => {
      if (config.enabled !== false) {
        hotkeyMap.set(config.key.toLowerCase(), config);
      }
    });

    activeHotkeysRef.current = hotkeyMap;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldPreventHotkey(event)) {
        return;
      }

      const hotkeyString = getHotkeyString(event);
      const config = hotkeyMap.get(hotkeyString);

      if (config) {
        event.preventDefault();
        config.action();
        onHotkeyPress?.(hotkeyString);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, coreHotkeys, customHotkeys, shouldPreventHotkey, getHotkeyString, onHotkeyPress]);

  return {
    /**
     * Get all active hotkeys for display
     */
    getActiveHotkeys: () => Array.from(activeHotkeysRef.current.values()),
  };
}

/**
 * Hotkey Display Component Helper
 *
 * Usage:
 * ```tsx
 * function HotkeyGuide() {
 *   const { getActiveHotkeys } = useHotkeys();
 *
 *   return (
 *     <div>
 *       {getActiveHotkeys().map(h => (
 *         <div key={h.key}>
 *           <kbd>{h.key}</kbd> - {h.description}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function formatHotkeyDisplay(key: string): string {
  return key
    .split('+')
    .map((k) => {
      if (k === 'ctrl') return '⌘';
      if (k === 'shift') return '⇧';
      if (k === 'alt') return '⌥';
      if (k === ' ') return 'Space';
      return k.toUpperCase();
    })
    .join(' + ');
}

/**
 * Hotkey constants for consistent usage
 */
export const HOTKEYS = {
  RECORD: 'r',
  STOP: 's',
  PLAY_PAUSE: ' ',
  EXPORT: 'e',
  LOOP: 'l',
  DELETE: 'delete',
  UNDO: 'ctrl+z',
  REDO: 'ctrl+shift+z',
  PRESET_1: '1',
  PRESET_2: '2',
  PRESET_3: '3',
  PRESET_4: '4',
  PRESET_5: '5',
  PRESET_6: '6',
  PRESET_7: '7',
  PRESET_8: '8',
  PRESET_9: '9',
} as const;
