// @vitest-environment jsdom
/**
 * Tests for useOrchestrationKeyboard hook (Sprint 14 P5)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { useOrchestrationKeyboard } = await import('@/hooks/useOrchestrationKeyboard');

function fireKey(key: string, modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: modifiers.ctrlKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    bubbles: true,
  });
  window.dispatchEvent(event);
}

describe('useOrchestrationKeyboard', () => {
  const callbacks = {
    onToggleMCP: vi.fn(),
    onToggleWorkflow: vi.fn(),
    onToggleBehaviorTree: vi.fn(),
    onToggleEventMonitor: vi.fn(),
    onToggleToolCallGraph: vi.fn(),
    onToggleAgentEnsemble: vi.fn(),
    onTogglePlugins: vi.fn(),
    onToggleCloud: vi.fn(),
  };

  let result: ReturnType<typeof renderHook>;

  beforeEach(() => {
    vi.clearAllMocks();
    result = renderHook(() => useOrchestrationKeyboard(callbacks));
  });

  afterEach(() => {
    result.unmount();
  });

  it('Ctrl+M toggles MCP', () => {
    fireKey('m', { ctrlKey: true });
    expect(callbacks.onToggleMCP).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+W toggles Workflow', () => {
    fireKey('W', { ctrlKey: true, shiftKey: true });
    expect(callbacks.onToggleWorkflow).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+B toggles Behavior Tree', () => {
    fireKey('b', { ctrlKey: true });
    expect(callbacks.onToggleBehaviorTree).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+E toggles Event Monitor', () => {
    fireKey('e', { ctrlKey: true });
    expect(callbacks.onToggleEventMonitor).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+T toggles Tool Call Graph', () => {
    fireKey('T', { ctrlKey: true, shiftKey: true });
    expect(callbacks.onToggleToolCallGraph).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+A toggles Agent Ensemble', () => {
    fireKey('A', { ctrlKey: true, shiftKey: true });
    expect(callbacks.onToggleAgentEnsemble).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+P toggles Plugins', () => {
    fireKey('p', { ctrlKey: true });
    expect(callbacks.onTogglePlugins).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+D toggles Cloud', () => {
    fireKey('D', { ctrlKey: true, shiftKey: true });
    expect(callbacks.onToggleCloud).toHaveBeenCalledTimes(1);
  });

  it('unmodified keys do not trigger callbacks', () => {
    fireKey('m');
    fireKey('b');
    fireKey('e');
    expect(callbacks.onToggleMCP).not.toHaveBeenCalled();
    expect(callbacks.onToggleBehaviorTree).not.toHaveBeenCalled();
    expect(callbacks.onToggleEventMonitor).not.toHaveBeenCalled();
  });

  it('cleans up listener on unmount', () => {
    const spy = vi.spyOn(window, 'removeEventListener');
    result.unmount();
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
    spy.mockRestore();
  });
});
