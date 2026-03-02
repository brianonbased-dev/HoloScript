/**
 * Tests for HoloScriptDebugger
 *
 * Covers:
 * - Breakpoint management (set, remove, toggle, clear)
 * - Debug state management
 * - Source loading
 * - Watch expressions
 * - Event handling
 * - Call stack operations
 */

import { describe, it, expect } from 'vitest';
import { HoloScriptDebugger } from './HoloScriptDebugger';

describe('HoloScriptDebugger', () => {
  describe('constructor', () => {
    it('creates debugger without runtime', () => {
      const debugger_ = new HoloScriptDebugger();
      expect(debugger_).toBeDefined();
    });
  });

  describe('breakpoints', () => {
    it('sets a breakpoint at a line', () => {
      const dbg = new HoloScriptDebugger();
      const bp = dbg.setBreakpoint(10);
      expect(bp.line).toBe(10);
      expect(bp.enabled).toBe(true);
      expect(bp.hitCount).toBe(0);
      expect(bp.id).toBeTruthy();
    });

    it('sets breakpoint with condition', () => {
      const dbg = new HoloScriptDebugger();
      const bp = dbg.setBreakpoint(5, { condition: 'x > 10' });
      expect(bp.condition).toBe('x > 10');
    });

    it('gets all breakpoints', () => {
      const dbg = new HoloScriptDebugger();
      dbg.setBreakpoint(1);
      dbg.setBreakpoint(5);
      dbg.setBreakpoint(10);
      expect(dbg.getBreakpoints().length).toBe(3);
    });

    it('removes breakpoint by ID', () => {
      const dbg = new HoloScriptDebugger();
      const bp = dbg.setBreakpoint(10);
      expect(dbg.removeBreakpoint(bp.id)).toBe(true);
      expect(dbg.getBreakpoints().length).toBe(0);
    });

    it('returns false for non-existent breakpoint removal', () => {
      const dbg = new HoloScriptDebugger();
      expect(dbg.removeBreakpoint('non-existent')).toBe(false);
    });

    it('removes breakpoints at a specific line', () => {
      const dbg = new HoloScriptDebugger();
      dbg.setBreakpoint(10);
      dbg.setBreakpoint(10);
      dbg.setBreakpoint(20);
      const removed = dbg.removeBreakpointsAtLine(10);
      expect(removed).toBe(2);
      expect(dbg.getBreakpoints().length).toBe(1);
    });

    it('toggles breakpoint', () => {
      const dbg = new HoloScriptDebugger();
      const bp = dbg.setBreakpoint(10);
      expect(bp.enabled).toBe(true);
      dbg.toggleBreakpoint(bp.id);
      const updated = dbg.getBreakpoints().find(b => b.id === bp.id);
      expect(updated?.enabled).toBe(false);
    });

    it('clears all breakpoints', () => {
      const dbg = new HoloScriptDebugger();
      dbg.setBreakpoint(1);
      dbg.setBreakpoint(5);
      dbg.clearBreakpoints();
      expect(dbg.getBreakpoints()).toEqual([]);
    });
  });

  describe('debug state', () => {
    it('starts in stopped state', () => {
      const dbg = new HoloScriptDebugger();
      const state = dbg.getState();
      expect(state.status).toBe('stopped');
    });

    it('has empty call stack initially', () => {
      const dbg = new HoloScriptDebugger();
      expect(dbg.getCallStack()).toEqual([]);
    });

    it('returns empty variables for no stack', () => {
      const dbg = new HoloScriptDebugger();
      const vars = dbg.getVariables();
      expect(vars.size).toBe(0);
    });
  });

  describe('loadSource', () => {
    it('loads valid source code', () => {
      const dbg = new HoloScriptDebugger();
      const result = dbg.loadSource('world test { scene main { } }');
      expect(result.success).toBeDefined();
    });

    it('loads with file name', () => {
      const dbg = new HoloScriptDebugger();
      const result = dbg.loadSource('world test { }', 'test.holo');
      expect(result.success).toBeDefined();
    });
  });

  describe('watch', () => {
    it('creates a watch expression', () => {
      const dbg = new HoloScriptDebugger();
      const watch = dbg.watch('state.count');
      expect(watch.id).toBeTruthy();
      expect(watch.expression).toBe('state.count');
    });
  });

  describe('event handling', () => {
    it('registers and removes event handlers', () => {
      const dbg = new HoloScriptDebugger();
      const handler = () => {};
      dbg.on('breakpoint-hit', handler);
      dbg.off('breakpoint-hit', handler);
      // No assertion needed — just verify no throw
    });
  });

  describe('stop', () => {
    it('sets state to stopped', () => {
      const dbg = new HoloScriptDebugger();
      dbg.stop();
      expect(dbg.getState().status).toBe('stopped');
    });
  });

  describe('pause', () => {
    it('does not pause when already stopped', () => {
      const dbg = new HoloScriptDebugger();
      dbg.pause();
      // pause only works from 'running' state
      expect(dbg.getState().status).toBe('stopped');
    });
  });

  describe('runtime', () => {
    it('exposes underlying runtime', () => {
      const dbg = new HoloScriptDebugger();
      expect(dbg.getRuntime()).toBeDefined();
    });
  });
});
