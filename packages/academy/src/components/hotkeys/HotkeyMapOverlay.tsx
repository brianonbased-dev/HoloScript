'use client';

/**
 * HotkeyMapOverlay — searchable keyboard shortcut reference modal.
 * Triggered by pressing "?" or clicking the keyboard icon.
 */

import { useEffect, useState } from 'react';
import { Keyboard, X, Search } from 'lucide-react';

interface HotkeyMapOverlayProps {
  open: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  action: string;
  description?: string;
}

interface ShortcutGroup {
  group: string;
  icon: string;
  shortcuts: Shortcut[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    group: 'Scene',
    icon: '🎬',
    shortcuts: [
      { keys: ['Ctrl', 'S'], action: 'Save Scene' },
      { keys: ['Ctrl', 'Z'], action: 'Undo' },
      { keys: ['Ctrl', 'Shift', 'Z'], action: 'Redo' },
      { keys: ['Ctrl', 'D'], action: 'Duplicate Object' },
      { keys: ['Del'], action: 'Delete Selected' },
      { keys: ['Escape'], action: 'Deselect / Close Modal' },
      { keys: ['?'], action: 'Open Shortcut Map' },
    ],
  },
  {
    group: 'Viewport',
    icon: '👁️',
    shortcuts: [
      { keys: ['W'], action: 'Move (Translate)' },
      { keys: ['E'], action: 'Rotate' },
      { keys: ['R'], action: 'Scale' },
      { keys: ['F'], action: 'Focus Selected Object' },
      { keys: ['G'], action: 'Toggle Grid' },
      { keys: ['Ctrl', '+'], action: 'Zoom In' },
      { keys: ['Ctrl', '-'], action: 'Zoom Out' },
      { keys: ['Numpad 0'], action: 'Camera View' },
    ],
  },
  {
    group: 'Code Editor',
    icon: '📝',
    shortcuts: [
      { keys: ['Ctrl', 'Enter'], action: 'Run / Compile Scene' },
      { keys: ['Ctrl', '/'], action: 'Toggle Comment' },
      { keys: ['Ctrl', 'F'], action: 'Find in Code' },
      { keys: ['Ctrl', 'Shift', 'F'], action: 'Format Code' },
      { keys: ['Tab'], action: 'Indent / Autocomplete' },
      { keys: ['Ctrl', 'Space'], action: 'Trigger Intellisense' },
    ],
  },
  {
    group: 'Panels',
    icon: '🗂',
    shortcuts: [
      { keys: ['Ctrl', 'B'], action: 'Toggle Left Sidebar' },
      { keys: ['Ctrl', 'Shift', 'B'], action: 'Toggle Brittney Chat' },
      { keys: ['Ctrl', 'P'], action: 'Command Palette / Trait Picker' },
      { keys: ['Ctrl', 'K'], action: 'Quick Open File' },
      { keys: ['Ctrl', '`'], action: 'Toggle Script Console' },
      { keys: ['Ctrl', 'Shift', 'R'], action: 'Open Scene Generator' },
    ],
  },
  {
    group: 'Traits',
    icon: '🏷️',
    shortcuts: [
      { keys: ['T'], action: 'Open Trait Palette', description: 'Browse and insert @traits' },
      { keys: ['Ctrl', 'Shift', 'T'], action: 'Open Trait Registry' },
      { keys: ['Ctrl', 'I'], action: 'Toggle Node Inspector' },
      { keys: ['Ctrl', 'Shift', 'P'], action: 'Toggle Profiler' },
    ],
  },
  {
    group: 'Selection',
    icon: '🖱️',
    shortcuts: [
      { keys: ['Click'], action: 'Select Object' },
      { keys: ['Shift', 'Click'], action: 'Multi-Select' },
      { keys: ['Ctrl', 'A'], action: 'Select All' },
      { keys: ['Ctrl', 'Shift', 'A'], action: 'Deselect All' },
      { keys: ['Ctrl', 'G'], action: 'Group Selected' },
    ],
  },
];

function KeyBadge({ k }: { k: string }) {
  return (
    <kbd className="inline-flex items-center rounded border border-studio-border bg-studio-surface px-1.5 py-0.5 font-mono text-[8px] text-studio-text shadow-sm">
      {k}
    </kbd>
  );
}

export function HotkeyMapOverlay({ open, onClose }: HotkeyMapOverlayProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  if (!open) return null;

  const q = query.toLowerCase();
  const filtered: ShortcutGroup[] = SHORTCUT_GROUPS.map((g) => ({
    ...g,
    shortcuts: g.shortcuts.filter(
      (s) =>
        !q ||
        s.action.toLowerCase().includes(q) ||
        s.keys.some((k) => k.toLowerCase().includes(q)) ||
        g.group.toLowerCase().includes(q)
    ),
  })).filter((g) => g.shortcuts.length > 0);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-studio-border bg-studio-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-4 py-3">
          <Keyboard className="h-5 w-5 text-studio-accent" />
          <span className="text-sm font-semibold">Keyboard Shortcuts</span>
          <div className="ml-3 flex flex-1 items-center gap-2 rounded-xl border border-studio-border bg-studio-surface px-2 py-1">
            <Search className="h-3.5 w-3.5 text-studio-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shortcuts…"
              className="flex-1 bg-transparent text-[10px] text-studio-text placeholder:text-studio-muted/60 outline-none"
            />
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — 2-column grid of groups */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-[10px] text-studio-muted">
              No shortcuts match "{query}"
            </p>
          )}
          <div className="columns-2 gap-4 space-y-4">
            {filtered.map((group) => (
              <div
                key={group.group}
                className="break-inside-avoid rounded-xl border border-studio-border bg-studio-surface/60 p-3 space-y-1.5 mb-4"
              >
                <p className="flex items-center gap-1.5 text-[10px] font-semibold">
                  <span>{group.icon}</span> {group.group}
                </p>
                {group.shortcuts.map((s) => (
                  <div key={s.action} className="flex items-center gap-2 py-0.5">
                    <div className="flex flex-1 items-center gap-1 flex-wrap">
                      {s.keys.map((k, i) => (
                        <span key={k} className="flex items-center gap-0.5">
                          <KeyBadge k={k} />
                          {i < s.keys.length - 1 && (
                            <span className="text-[8px] text-studio-muted">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                    <span className="text-[9px] text-studio-muted">{s.action}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-studio-border px-4 py-2 text-[8px] text-studio-muted flex items-center">
          <span>
            Press <KeyBadge k="?" /> anywhere to open · <KeyBadge k="Esc" /> to close
          </span>
          <span className="ml-auto">
            {SHORTCUT_GROUPS.reduce((a, g) => a + g.shortcuts.length, 0)} shortcuts
          </span>
        </div>
      </div>
    </div>
  );
}
