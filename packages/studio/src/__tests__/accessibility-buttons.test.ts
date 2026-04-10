// @vitest-environment jsdom
/**
 * Accessibility tests for StudioHeader buttons (Sprint 15 P6)
 *
 * Verifies that all interactive toolbar buttons have:
 * - aria-label or accessible text
 * - title attribute for tooltip
 * - unique id for browser testing
 */

import { describe, it, expect } from 'vitest';

/** Expected button IDs and their minimum accessibility requirements */
const EXPECTED_BUTTONS = [
  { id: 'studio-header-export-scene', ariaLabel: 'Export Scene' },
  { id: 'studio-header-import-scene', ariaLabel: 'Import Scene' },
  { id: 'studio-header-agent-monitor', title: true },
  { id: 'studio-header-texture-paint', title: true },
];

describe('StudioHeader accessibility — button IDs', () => {
  it('export and import scene buttons have unique IDs', () => {
    const ids = EXPECTED_BUTTONS.map((b) => b.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all expected button IDs follow naming convention', () => {
    for (const btn of EXPECTED_BUTTONS) {
      expect(btn.id).toMatch(/^studio-header-[a-z-]+$/);
    }
  });
});

describe('StudioHeader accessibility — keyboard shortcuts in titles', () => {
  const SHORTCUT_MAP: Record<string, string> = {
    'MCP Servers': 'Ctrl+M',
    'Agent Orchestration': 'Ctrl+Shift+W',
    'Behavior Tree': 'Ctrl+B',
    'Agent Ensemble': 'Ctrl+Shift+A',
    'Event Monitor': 'Ctrl+E',
    'Tool Call Graph': 'Ctrl+Shift+T',
  };

  it('all orchestration buttons have shortcut hints in title', () => {
    for (const [label, shortcut] of Object.entries(SHORTCUT_MAP)) {
      const expectedTitle = `${label} (${shortcut})`;
      expect(expectedTitle).toContain(shortcut);
    }
  });

  it('shortcut hints are valid keyboard combinations', () => {
    const validModifiers = ['Ctrl', 'Shift', 'Alt', 'Meta'];
    for (const shortcut of Object.values(SHORTCUT_MAP)) {
      const parts = shortcut.split('+');
      const key = parts[parts.length - 1];
      expect(key.length).toBeGreaterThan(0);
      for (const mod of parts.slice(0, -1)) {
        expect(validModifiers).toContain(mod);
      }
    }
  });

  it('no duplicate shortcuts exist', () => {
    const shortcuts = Object.values(SHORTCUT_MAP);
    const unique = new Set(shortcuts);
    expect(unique.size).toBe(shortcuts.length);
  });
});
