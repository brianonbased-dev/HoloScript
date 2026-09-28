// @vitest-environment jsdom
/**
 * Accessibility and keyboard tests for the studio header — against the real
 * components and the real hook.
 *
 * WHAT THIS FILE USED TO BE (accessibility-buttons.test.ts, replaced 2026-09-21).
 * Five tests, none of which could fail because of anything in the application:
 *   - it declared EXPECTED_BUTTONS, a list of four button ids, inside itself and
 *     then asserted that its own list had unique entries matching a naming
 *     regex. Those four ids — studio-header-export-scene, -import-scene,
 *     -agent-monitor, -texture-paint — appear in NO file in this repository
 *     except that test. They never existed.
 *   - it declared SHORTCUT_MAP and asserted `${label} (${shortcut})` contains
 *     `shortcut`. That is a tautology: the expected value is built from the
 *     actual one. It passes for every possible input.
 *   - it asserted its own shortcut strings were well-formed and unique.
 * It never imported a component. StudioHeader, the component it was named for,
 * contains zero <button> elements — it is a container that renders NavBar and
 * StudioPanelOverlays. A file named for auditing buttons was auditing a literal.
 *
 * That is not a harmless gap: a dead "Export HIPAA Log" button shipped in
 * TherapySessionPanel with no onClick at all while this suite was green.
 *
 * WHAT IT IS NOW. The shortcut block fires real keyboard events at the real
 * hook and asserts the right callback runs. The button block renders the real
 * header and asserts every button a user can reach has an accessible name.
 * Both go red when the application changes.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, renderHook, screen, fireEvent, cleanup } from '@testing-library/react';

// The header's import graph reaches src/components/vr/VREditSession.tsx, which
// calls createXRStore at MODULE SCOPE — so merely importing it boots the WebXR
// emulator, which builds a real three.js WebGLRenderer and fails in jsdom. It
// arrives as "Vitest caught 1 unhandled error", a nonzero exit while every test
// still reports green. Same reason WebXRViewer.test.tsx and
// r3f-renderer-contract.test.tsx mock this package.
//
// Defining WebGL2RenderingContext instead was tried and was worse: the missing
// constructor WAS the capability check, so defining it told the emulator WebGL
// existed and it went further. Stubbing a capability makes detection lie.
vi.mock('@react-three/xr', () => ({
  createXRStore: vi.fn(() => ({
    getState: () => ({}),
    setState: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    destroy: vi.fn(),
    enterXR: vi.fn(),
    enterAR: vi.fn(),
    enterVR: vi.fn(),
  })),
  XR: ({ children }: { children?: React.ReactNode }) => children ?? null,
  useXR: () => ({ session: null, mode: null }),
}));

import { useOrchestrationKeyboard } from '@/hooks/useOrchestrationKeyboard';
import { NavBar } from '@/components/header/NavBar';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts — fired, not described
// ---------------------------------------------------------------------------

/** Every binding useOrchestrationKeyboard actually implements. */
const BINDINGS = [
  { name: 'onToggleMCP', label: 'MCP Servers', event: { ctrlKey: true, key: 'm' } },
  { name: 'onToggleWorkflow', label: 'Agent Orchestration', event: { ctrlKey: true, shiftKey: true, key: 'W' } },
  { name: 'onToggleBehaviorTree', label: 'Behavior Tree', event: { ctrlKey: true, key: 'b' } },
  { name: 'onToggleEventMonitor', label: 'Event Monitor', event: { ctrlKey: true, key: 'e' } },
  { name: 'onToggleToolCallGraph', label: 'Tool Call Graph', event: { ctrlKey: true, shiftKey: true, key: 'T' } },
  { name: 'onToggleAgentEnsemble', label: 'Agent Ensemble', event: { ctrlKey: true, shiftKey: true, key: 'A' } },
  { name: 'onTogglePlugins', label: 'Plugin Manager', event: { ctrlKey: true, key: 'p' } },
  { name: 'onToggleCloud', label: 'Cloud Deploy', event: { ctrlKey: true, shiftKey: true, key: 'D' } },
] as const;

function mountHotkeys() {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const b of BINDINGS) calls[b.name] = vi.fn();
  renderHook(() => useOrchestrationKeyboard(calls as never));
  return calls;
}

describe('studio header — orchestration keyboard shortcuts', () => {
  for (const binding of BINDINGS) {
    it(`${binding.label} fires on its own combination and nothing else does`, () => {
      const calls = mountHotkeys();

      fireEvent.keyDown(window, binding.event);

      expect(calls[binding.name]).toHaveBeenCalledTimes(1);
      for (const other of BINDINGS) {
        if (other.name === binding.name) continue;
        expect(calls[other.name], `${other.name} should not fire on ${binding.label}`).not.toHaveBeenCalled();
      }
    });
  }

  it('does nothing without the Ctrl modifier', () => {
    const calls = mountHotkeys();
    for (const binding of BINDINGS) {
      fireEvent.keyDown(window, { ...binding.event, ctrlKey: false });
    }
    for (const binding of BINDINGS) {
      expect(calls[binding.name], `${binding.name} fired without Ctrl`).not.toHaveBeenCalled();
    }
  });

  it('unbinds on unmount, so a stale listener cannot fire', () => {
    const calls: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const b of BINDINGS) calls[b.name] = vi.fn();
    const { unmount } = renderHook(() => useOrchestrationKeyboard(calls as never));

    unmount();
    fireEvent.keyDown(window, { ctrlKey: true, key: 'm' });

    expect(calls.onToggleMCP).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Buttons — rendered, not listed
// ---------------------------------------------------------------------------

/**
 * The accessible name a screen reader would announce, by the same order of
 * precedence the accessible-name computation uses for a <button>: its own
 * aria-label, then its text content, then the title attribute as a last resort.
 */
function accessibleName(button: HTMLElement): string {
  return (
    button.getAttribute('aria-label')?.trim() ||
    button.textContent?.trim() ||
    button.getAttribute('title')?.trim() ||
    ''
  );
}

describe('studio header — every button a user can reach has a name', () => {
  it('renders buttons at all', () => {
    render(<NavBar />);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('no button is announced as blank', () => {
    render(<NavBar />);
    const nameless = screen
      .getAllByRole('button')
      .filter((b) => accessibleName(b) === '')
      .map((b) => b.outerHTML.slice(0, 120));

    expect(nameless, `buttons with no accessible name:\n${nameless.join('\n')}`).toEqual([]);
  });

  it('the header itself is labelled as a landmark', () => {
    render(<NavBar />);
    const banner = screen.getByRole('banner');
    expect(accessibleName(banner) || banner.getAttribute('aria-label')).toBeTruthy();
  });
});

/**
 * A ratchet on the weakest kind of accessible name.
 *
 * `title` counts toward a button's accessible name, so the test above passes an
 * icon-only button that carries one. But a tooltip is a poor label: it is not
 * announced consistently across screen readers and it does not exist at all for
 * a touch user. An icon-only button whose ONLY name is a tooltip is a defect
 * waiting to be reported, not a pass.
 *
 * Measured on the rendered header 2026-09-21: 25 buttons, 2 with aria-label,
 * exactly 1 named by tooltip alone. This pins that list. Adding another
 * icon-only button fails here — which is the point. Fixing this one also fails,
 * and the fix is to delete it from the list, not to widen the rule.
 */
const TITLE_ONLY_NAMED_BUTTONS = ['Open Full Setup Wizard'];

describe('studio header — the tooltip-only ratchet', () => {
  it('no NEW button relies on a tooltip for its entire name', () => {
    render(<NavBar />);
    const titleOnly = screen
      .getAllByRole('button')
      .filter(
        (b) => !b.getAttribute('aria-label') && !b.textContent?.trim() && b.getAttribute('title')
      )
      .map((b) => b.getAttribute('title') ?? '')
      .sort();

    expect(
      titleOnly,
      'A button is named only by its tooltip. Give it an aria-label, or add it here ' +
        'with a reason. Do not loosen the filter.'
    ).toEqual([...TITLE_ONLY_NAMED_BUTTONS].sort());
  });
});
