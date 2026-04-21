/**
 * HotkeyGuide.tsx — Visual Keyboard Shortcut Guide
 *
 * Displays available hotkeys for character studio
 * Shows/hides with '?' key
 */

import { useState, useEffect } from 'react';
import { useHotkeys, formatHotkeyDisplay, HOTKEYS } from '../../../hooks/useHotkeys';

export function HotkeyGuide() {
  const [isVisible, setIsVisible] = useState(false);
  const { _getActiveHotkeys } = useHotkeys({ enabled: !isVisible });

  // Toggle guide with '?' key
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        setIsVisible((prev) => !prev);
      }
      // ESC to close
      if (e.key === 'Escape' && isVisible) {
        setIsVisible(false);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isVisible]);

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 w-8 h-8 bg-gray-800 text-white rounded-full hover:bg-gray-700 transition-colors z-50"
        title="Show keyboard shortcuts (?)"
      >
        ?
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 text-white rounded-lg shadow-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Keyboard Shortcuts</h2>
            <p className="text-gray-400 text-sm">Viral workflow at lightspeed ⚡</p>
          </div>
          <button
            onClick={() => setIsVisible(false)}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Shortcuts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Recording Section */}
          <Section title="🎬 Recording">
            <Shortcut keys="R" description="Start recording" />
            <Shortcut keys="S" description="Stop recording" />
            <Shortcut keys="SPACE" description="Play/pause animation" />
            <Shortcut keys="L" description="Toggle loop" />
          </Section>

          {/* Export Section */}
          <Section title="💾 Export">
            <Shortcut keys="E" description="Export current clip" />
          </Section>

          {/* Management Section */}
          <Section title="🗂️ Management">
            <Shortcut keys="DELETE" description="Delete selected clip" />
            <Shortcut keys="BACKSPACE" description="Delete selected clip" />
          </Section>

          {/* Editing Section */}
          <Section title="✏️ Editing">
            <Shortcut keys="⌘Z" description="Undo" />
            <Shortcut keys="⌘⇧Z" description="Redo" />
          </Section>

          {/* Presets Section */}
          <Section title="🎭 Preset Poses">
            <Shortcut keys="1-9" description="Apply preset pose 1-9" />
          </Section>

          {/* Help Section */}
          <Section title="❓ Help">
            <Shortcut keys="?" description="Show/hide this guide" />
            <Shortcut keys="ESC" description="Close guide" />
          </Section>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-gray-700 text-center text-sm text-gray-400">
          <p>Pro tip: Keep your hands on the keyboard for maximum degen efficiency 🚀</p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Shortcut({ keys, description }: { keys: string; description: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-300">{description}</span>
      <kbd className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs font-mono">
        {keys}
      </kbd>
    </div>
  );
}

/**
 * Minimal floating hint for new users
 */
export function HotkeyHint() {
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('hotkey-hint-dismissed');
    if (dismissed) {
      setIsDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('hotkey-hint-dismissed', 'true');
    setIsDismissed(true);
  };

  if (isDismissed) return null;

  return (
    <div className="fixed bottom-20 right-4 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 z-40 animate-bounce">
      <span className="text-sm">
        Press <kbd className="px-2 py-0.5 bg-purple-700 rounded">?</kbd> for shortcuts
      </span>
      <button onClick={handleDismiss} className="text-white/80 hover:text-white" title="Dismiss">
        ×
      </button>
    </div>
  );
}
