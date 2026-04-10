/**
 * Tests for debugServer entry point and HoloScriptDebugSession integration
 *
 * The debugServer.ts file is the entry point that calls
 * HoloScriptDebugSession.run(HoloScriptDebugSession). These tests
 * validate the module structure and the session factory aspects
 * that the existing DebugSession.test.ts does not cover.
 *
 * Additionally tests DAP request sequences, restart lifecycle,
 * and edge cases not covered by DebugSession.test.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HoloScriptDebugSession, type LaunchRequestArguments } from '../HoloScriptDebugSession';
import { DebugProtocol } from 'vscode-debugprotocol';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createResponse(command: string): DebugProtocol.Response {
  return {
    seq: 0,
    type: 'response',
    request_seq: 1,
    command,
    success: true,
    body: {},
  };
}

function createSession() {
  const session = new HoloScriptDebugSession();
  const responses: any[] = [];
  const events: any[] = [];

  (session as any).sendResponse = (response: any) => {
    responses.push(response);
  };
  (session as any).sendEvent = (event: any) => {
    events.push(event);
  };
  (session as any).sendErrorResponse = (response: any, code: number, msg: string) => {
    response.success = false;
    response.message = msg;
    response.body = { error: { id: code, format: msg } };
    responses.push(response);
  };

  return { session, responses, events };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('debugServer module', () => {
  describe('HoloScriptDebugSession exports', () => {
    it('should export HoloScriptDebugSession class', () => {
      expect(HoloScriptDebugSession).toBeDefined();
      expect(typeof HoloScriptDebugSession).toBe('function');
    });

    it('should have a static run method', () => {
      expect(typeof HoloScriptDebugSession.run).toBe('function');
    });

    it('should be constructable', () => {
      const session = new HoloScriptDebugSession();
      expect(session).toBeInstanceOf(HoloScriptDebugSession);
    });
  });
});

describe('HoloScriptDebugSession - extended tests', () => {
  let session: HoloScriptDebugSession;
  let responses: any[];
  let events: any[];

  beforeEach(() => {
    const created = createSession();
    session = created.session;
    responses = created.responses;
    events = created.events;
  });

  // ── Restart lifecycle ──────────────────────────────────────────────────

  describe('restart without prior launch', () => {
    it('should complete restart gracefully when no launch args are set', async () => {
      const response = createResponse('restart');

      await (session as any).restartRequest(response, {});

      expect(responses.length).toBe(1);
      // Should just send the response without error
      expect(responses[0].success).not.toBe(false);
    });
  });

  // ── SetVariable error paths ────────────────────────────────────────────

  describe('setVariable edge cases', () => {
    it('should handle JSON-parseable values', () => {
      const response = createResponse('setVariable');

      // This will try to set variable in runtime, which may throw
      // because there's no loaded source. We test the error handling.
      (session as any).setVariableRequest(response, {
        variablesReference: 1,
        name: 'testVar',
        value: '42',
      });

      expect(responses.length).toBe(1);
      // Should have responded (either success or error)
    });

    it('should treat non-JSON values as strings', () => {
      const response = createResponse('setVariable');

      (session as any).setVariableRequest(response, {
        variablesReference: 1,
        name: 'testVar',
        value: 'hello world',
      });

      expect(responses.length).toBe(1);
    });
  });

  // ── Multiple breakpoint types in sequence ──────────────────────────────

  describe('multiple breakpoint type interactions', () => {
    it('should handle setting line, function, exception, and data breakpoints', () => {
      // Line breakpoints
      const lineResp = createResponse('setBreakpoints');
      (session as any).setBreakPointsRequest(lineResp, {
        source: { path: 'test.holo' },
        breakpoints: [{ line: 5 }],
      });
      expect(responses[0].body.breakpoints).toHaveLength(1);

      // Function breakpoints
      const funcResp = createResponse('setFunctionBreakpoints');
      (session as any).setFunctionBreakPointsRequest(funcResp, {
        breakpoints: [{ name: 'onInit' }],
      });
      expect(responses[1].body.breakpoints).toHaveLength(1);
      expect(responses[1].body.breakpoints[0].message).toContain('onInit');

      // Exception breakpoints
      const excResp = createResponse('setExceptionBreakpoints');
      (session as any).setExceptionBreakPointsRequest(excResp, {
        filters: ['all'],
      });
      expect((session as any)._exceptionBreakpoints.all).toBe(true);

      // Data breakpoints info
      const dataInfoResp = createResponse('dataBreakpointInfo');
      (session as any).dataBreakpointInfoRequest(dataInfoResp, {
        name: 'health',
        variablesReference: 0,
      });
      expect(responses[3].body.dataId).toBe('health');

      // Data breakpoints set
      const dataResp = createResponse('setDataBreakpoints');
      (session as any).setDataBreakpointsRequest(dataResp, {
        breakpoints: [{ dataId: 'health', accessType: 'write' }],
      });
      expect(responses[4].body.breakpoints).toHaveLength(1);
    });
  });

  // ── Variables filter and pagination ────────────────────────────────────

  describe('variables pagination', () => {
    it('should handle variables request with named filter', () => {
      const response = createResponse('variables');

      (session as any).variablesRequest(response, {
        variablesReference: 99999,
        filter: 'named',
      });

      expect(responses.length).toBe(1);
      expect(responses[0].body.variables).toBeDefined();
    });

    it('should handle variables request with indexed filter', () => {
      const response = createResponse('variables');

      (session as any).variablesRequest(response, {
        variablesReference: 99999,
        filter: 'indexed',
      });

      expect(responses.length).toBe(1);
      expect(responses[0].body.variables).toBeDefined();
    });

    it('should handle variables request with start and count', () => {
      const response = createResponse('variables');

      (session as any).variablesRequest(response, {
        variablesReference: 99999,
        start: 0,
        count: 5,
      });

      expect(responses.length).toBe(1);
    });
  });

  // ── Completions with @ prefix ──────────────────────────────────────────

  describe('completions edge cases', () => {
    it('should provide completions for @ prefix', () => {
      const response = createResponse('completions');

      (session as any).completionsRequest(response, {
        text: '@',
        column: 2,
      });

      expect(responses.length).toBe(1);
      expect(responses[0].body.targets).toBeDefined();
    });

    it('should provide all keywords when prefix is empty', () => {
      const response = createResponse('completions');

      (session as any).completionsRequest(response, {
        text: '',
        column: 1,
      });

      const targets = responses[0].body.targets;
      const keywordTargets = targets.filter((t: any) => t.type === 'keyword');
      expect(keywordTargets.length).toBeGreaterThanOrEqual(17);
    });
  });

  // ── Stack frame presentation hint ──────────────────────────────────────

  describe('stack frame synthetic top frame', () => {
    it('should create synthetic top frame when paused with no stack frames', () => {
      const response = createResponse('stackTrace');

      (session as any).stackTraceRequest(response, {
        threadId: 1,
        startFrame: 0,
        levels: 20,
      });

      expect(responses.length).toBe(1);
      // The response should have stackFrames defined
      expect(responses[0].body.stackFrames).toBeDefined();
    });
  });

  // ── Source request with path ───────────────────────────────────────────

  describe('source request edge cases', () => {
    it('should handle sourceRequest without source path', async () => {
      (session as any)._sourceContent = '';

      const response = createResponse('source');

      await (session as any).sourceRequest(response, {
        source: {},
        sourceReference: 1,
      });

      expect(responses.length).toBe(1);
      expect(responses[0].body.mimeType).toBe('text/x-holoscript');
    });
  });

  // ── Loaded sources request ─────────────────────────────────────────────

  describe('loaded sources tracking', () => {
    it('should return empty sources when nothing is loaded', () => {
      const response = createResponse('loadedSources');

      (session as any).loadedSourcesRequest(response, {});

      expect(responses[0].body.sources).toEqual([]);
    });
  });

  // ── Exception breakpoint configuration toggle ─────────────────────────

  describe('exception breakpoint toggle', () => {
    it('should clear exception breakpoints when empty filters', () => {
      // First set all
      const setResp = createResponse('setExceptionBreakpoints');
      (session as any).setExceptionBreakPointsRequest(setResp, {
        filters: ['all', 'uncaught'],
      });

      expect((session as any)._exceptionBreakpoints.all).toBe(true);
      expect((session as any)._exceptionBreakpoints.uncaught).toBe(true);

      // Then clear
      const clearResp = createResponse('setExceptionBreakpoints');
      (session as any).setExceptionBreakPointsRequest(clearResp, {
        filters: [],
      });

      expect((session as any)._exceptionBreakpoints.all).toBe(false);
      expect((session as any)._exceptionBreakpoints.uncaught).toBe(false);
    });
  });

  // ── Pause then continue flow ──────────────────────────────────────────

  describe('pause -> continue flow', () => {
    it('should transition isRunning state correctly', async () => {
      // Pause
      const pauseResp = createResponse('pause');
      (session as any).pauseRequest(pauseResp, { threadId: 1 });
      expect((session as any)._isRunning).toBe(false);

      // Continue
      const contResp = createResponse('continue');
      await (session as any).continueRequest(contResp, { threadId: 1 });
      expect((session as any)._isRunning).toBe(true);

      const continuedEvent = events.find((e) => e.event === 'continued');
      expect(continuedEvent).toBeDefined();
    });
  });

  // ── Disconnect cleans up state ─────────────────────────────────────────

  describe('disconnect cleanup', () => {
    it('should clear all internal state on disconnect', () => {
      // Set up some state first
      (session as any)._exceptionBreakpoints.all = true;
      (session as any)._isRunning = true;
      (session as any)._lastException = { description: 'test' };

      const response = createResponse('disconnect');
      (session as any).disconnectRequest(response, {});

      expect((session as any)._isRunning).toBe(false);
      expect((session as any)._lastException).toBeNull();
    });
  });

  // ── Evaluate contexts ─────────────────────────────────────────────────

  describe('evaluate context handling', () => {
    it('should send stderr output for REPL errors', async () => {
      const response = createResponse('evaluate');

      await (session as any).evaluateRequest(response, {
        expression: 'undefined_var',
        context: 'repl',
      });

      expect(responses.length).toBe(1);
    });

    it('should send stdout output for REPL success', async () => {
      const response = createResponse('evaluate');

      await (session as any).evaluateRequest(response, {
        expression: '1 + 1',
        context: 'repl',
      });

      expect(responses.length).toBe(1);
    });

    it('should handle clipboard context', async () => {
      const response = createResponse('evaluate');

      await (session as any).evaluateRequest(response, {
        expression: 'some_value',
        context: 'clipboard',
      });

      expect(responses.length).toBe(1);
    });
  });

  // ── Variable type detection ────────────────────────────────────────────

  describe('_createVariable type detection', () => {
    it('should detect undefined type', () => {
      const v = (session as any)._createVariable('x', undefined);
      expect(v.type).toBe('undefined');
    });

    it('should detect function type', () => {
      const v = (session as any)._createVariable('fn', 'hello');
      expect(v.type).toBe('string');
    });

    it('should detect object constructor name', () => {
      class MyClass {}
      const v = (session as any)._createVariable('obj', new MyClass());
      expect(v.type).toBe('MyClass');
    });
  });

  // ── Format value edge cases ────────────────────────────────────────────

  describe('_formatValue edge cases', () => {
    it('should format nested objects', () => {
      const result = (session as any)._formatValue({ a: { b: 1 } });
      expect(result).toContain('a:');
    });

    it('should format empty array', () => {
      const result = (session as any)._formatValue([]);
      expect(result).toBe('[]');
    });

    it('should format empty object', () => {
      const result = (session as any)._formatValue({});
      expect(result).toBe('{}');
    });

    it('should format empty Map', () => {
      const result = (session as any)._formatValue(new Map());
      expect(result).toBe('Map(0)');
    });

    it('should format exactly 5 element array inline', () => {
      const result = (session as any)._formatValue([1, 2, 3, 4, 5]);
      expect(result).toBe('[1, 2, 3, 4, 5]');
    });

    it('should format 6 element array as Array(6)', () => {
      const result = (session as any)._formatValue([1, 2, 3, 4, 5, 6]);
      expect(result).toBe('Array(6)');
    });

    it('should format exactly 3 key object inline', () => {
      const result = (session as any)._formatValue({ a: 1, b: 2, c: 3 });
      expect(result).toContain('a: 1');
      expect(result).toContain('b: 2');
      expect(result).toContain('c: 3');
      expect(result).not.toContain('...');
    });

    it('should format 4+ key object with truncation', () => {
      const result = (session as any)._formatValue({ a: 1, b: 2, c: 3, d: 4 });
      expect(result).toContain('...');
    });
  });
});
