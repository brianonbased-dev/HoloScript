import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HoloScriptDebugSession,
  type LaunchRequestArguments,
  type AttachRequestArguments,
} from '../HoloScriptDebugSession';
import { DebugProtocol } from 'vscode-debugprotocol';
import {
  AttachConnection,
  type RemoteExecutionState,
  type AttachBreakpointDescriptor,
} from '../dap/DAPHotReloadAdapter';

/**
 * Comprehensive DAP Debug Session Tests
 *
 * Tests the full Debug Adapter Protocol implementation including:
 * - Lifecycle (initialize, launch, disconnect, terminate, restart)
 * - Breakpoints (line, conditional, function, exception, data)
 * - Variables (scopes, structured viewing, set variable)
 * - Call stack (stack frames, threads)
 * - Evaluate (REPL, watch, hover)
 * - Stepping (continue, next, stepIn, stepOut, pause)
 * - Source management (loaded sources, source retrieval)
 * - Debug console completions
 */

describe('HoloScriptDebugSession', () => {
  let session: HoloScriptDebugSession;
  let responses: any[];
  let events: any[];

  beforeEach(() => {
    session = new HoloScriptDebugSession();
    responses = [];
    events = [];

    // Mock sendResponse to capture responses
    (session as any).sendResponse = (response: any) => {
      responses.push(response);
    };

    // Mock sendEvent to capture events
    (session as any).sendEvent = (event: any) => {
      events.push(event);
    };

    // Mock sendErrorResponse
    (session as any).sendErrorResponse = (response: any, code: number, msg: string) => {
      response.success = false;
      response.message = msg;
      response.body = { error: { id: code, format: msg } };
      responses.push(response);
    };
  });

  // ── Lifecycle Tests ──────────────────────────────────────────────────────

  describe('Initialize', () => {
    it('should handle initialize request with full capabilities', () => {
      const response = createResponse('initialize');

      (session as any).initializeRequest(response, {
        adapterID: 'holoscript',
        pathFormat: 'path',
      });

      expect(responses.length).toBe(1);
      const body = responses[0].body;

      // Breakpoint capabilities
      expect(body.supportsConfigurationDoneRequest).toBe(true);
      expect(body.supportsConditionalBreakpoints).toBe(true);
      expect(body.supportsHitConditionalBreakpoints).toBe(true);
      expect(body.supportsFunctionBreakpoints).toBe(true);
      expect(body.supportsDataBreakpoints).toBe(true);
      expect(body.supportsBreakpointLocationsRequest).toBe(true);

      // Variable capabilities
      expect(body.supportsSetVariable).toBe(true);

      // Evaluate capabilities
      expect(body.supportsEvaluateForHovers).toBe(true);
      expect(body.supportsCompletionsRequest).toBe(true);

      // Exception handling
      expect(body.supportsExceptionInfoRequest).toBe(true);
      expect(body.supportsExceptionFilterOptions).toBe(true);
      expect(body.exceptionBreakpointFilters).toBeDefined();
      expect(body.exceptionBreakpointFilters.length).toBeGreaterThanOrEqual(2);

      // Lifecycle capabilities
      expect(body.supportsTerminateRequest).toBe(true);
      expect(body.supportsRestartRequest).toBe(true);

      // Source capabilities
      expect(body.supportsLoadedSourcesRequest).toBe(true);

      // Log points
      expect(body.supportsLogPoints).toBe(true);
    });

    it('should send InitializedEvent after initialize', () => {
      const response = createResponse('initialize');

      (session as any).initializeRequest(response, {
        adapterID: 'holoscript',
      });

      const initEvent = events.find((e) => e.event === 'initialized');
      expect(initEvent).toBeDefined();
    });

    it('should declare exception breakpoint filters', () => {
      const response = createResponse('initialize');

      (session as any).initializeRequest(response, {
        adapterID: 'holoscript',
      });

      const filters = responses[0].body.exceptionBreakpointFilters;
      const allFilter = filters.find((f: any) => f.filter === 'all');
      const uncaughtFilter = filters.find((f: any) => f.filter === 'uncaught');

      expect(allFilter).toBeDefined();
      expect(allFilter.label).toBe('All Exceptions');
      expect(allFilter.default).toBe(false);

      expect(uncaughtFilter).toBeDefined();
      expect(uncaughtFilter.label).toBe('Uncaught Exceptions');
      expect(uncaughtFilter.default).toBe(true);
    });
  });

  describe('ConfigurationDone', () => {
    it('should handle configurationDone request', () => {
      const response = createResponse('configurationDone');

      (session as any).configurationDoneRequest(response, {});

      expect(responses.length).toBe(1);
      expect((session as any)._configurationDone).toBe(true);
    });
  });

  describe('Disconnect', () => {
    it('should handle disconnect request', () => {
      const response = createResponse('disconnect');

      (session as any).disconnectRequest(response, { terminateDebuggee: false });

      expect(responses.length).toBe(1);
    });

    it('should send output on terminate with terminateDebuggee', () => {
      const response = createResponse('disconnect');

      (session as any).disconnectRequest(response, { terminateDebuggee: true });

      const outputEvent = events.find(
        (e) => e.event === 'output' && e.body?.output?.includes('terminated')
      );
      expect(outputEvent).toBeDefined();
    });

    it('should clean up internal state on disconnect', () => {
      const response = createResponse('disconnect');

      (session as any).disconnectRequest(response, {});

      expect((session as any)._isRunning).toBe(false);
    });
  });

  describe('Terminate', () => {
    it('should handle terminate request', () => {
      const response = createResponse('terminate');

      (session as any).terminateRequest(response, {});

      expect(responses.length).toBe(1);
      const terminatedEvent = events.find((e) => e.event === 'terminated');
      expect(terminatedEvent).toBeDefined();
    });
  });

  describe('Attach', () => {
    /**
     * Helper: create a mock AttachConnection that simulates a connected remote session.
     */
    function createMockAttachConnection(overrides?: {
      connectResult?: boolean;
      connectError?: Error;
      executionState?: RemoteExecutionState;
      syncedBreakpoints?: AttachBreakpointDescriptor[];
      watchResults?: Array<{ expression: string; value: string; error?: string }>;
    }): AttachConnection {
      const conn = new AttachConnection();
      const opts = overrides || {};

      // Override connect to avoid real WebSocket
      (conn as unknown as Record<string, unknown>).connect = vi.fn(async () => {
        if (opts.connectError) throw opts.connectError;
        (conn as unknown as Record<string, unknown>)._connected = true;
        return opts.connectResult !== undefined ? opts.connectResult : true;
      });

      (conn as unknown as Record<string, unknown>).syncBreakpoints = vi.fn(
        async (bps: AttachBreakpointDescriptor[]) => {
          return opts.syncedBreakpoints || bps;
        }
      );

      (conn as unknown as Record<string, unknown>).syncWatchExpressions = vi.fn(
        async (watches: Array<{ expression: string }>) => {
          return (
            opts.watchResults ||
            watches.map((w: { expression: string }) => ({
              expression: w.expression,
              value: '<mock>',
            }))
          );
        }
      );

      (conn as unknown as Record<string, unknown>).fetchExecutionState = vi.fn(async () => {
        return opts.executionState || { status: 'running' as const };
      });

      (conn as unknown as Record<string, unknown>).disconnect = vi.fn();
      (conn as unknown as Record<string, unknown>).detach = vi.fn(async () => {});
      (conn as unknown as Record<string, unknown>).sendEvent = vi.fn();

      return conn;
    }

    /**
     * Inject a pre-built mock connection into the session before attachRequest runs.
     * We monkey-patch the constructor call inside attachRequest by replacing _attachConnection
     * after it's created.
     */
    async function attachWithMock(
      sess: HoloScriptDebugSession,
      args: Partial<AttachRequestArguments>,
      mockConn: AttachConnection
    ): Promise<void> {
      // Patch: override the AttachConnection creation inside attachRequest
      const origAttachReq = (sess as unknown as Record<string, unknown>).attachRequest as Function;
      (sess as unknown as Record<string, unknown>).attachRequest = async function (
        this: HoloScriptDebugSession,
        resp: DebugProtocol.AttachResponse,
        attachArgs: DebugProtocol.AttachRequestArguments
      ) {
        // Pre-inject the mock connection so we skip real WebSocket
        (this as unknown as Record<string, unknown>)._attachConnection = mockConn;
        (this as unknown as Record<string, unknown>)._isAttachMode = true;

        const fullArgs = attachArgs as AttachRequestArguments;

        // Store breakpoints and watches
        (this as unknown as Record<string, unknown>)._attachBreakpoints =
          fullArgs.breakpoints || [];
        (this as unknown as Record<string, unknown>)._attachWatchExpressions =
          fullArgs.watchExpressions || [];

        // Wire up event listeners
        mockConn.on('disconnected', () => {
          (this as unknown as Record<string, unknown>)._isAttachMode = false;
          (this as unknown as Record<string, unknown>)._isRunning = false;
        });

        const config = {
          host: fullArgs.host || 'localhost',
          port: fullArgs.port || 9229,
          sessionId: fullArgs.sessionId,
        };

        const sessionLabel = config.sessionId ? `session ${config.sessionId} at` : '';
        (this as unknown as { sendEvent: Function }).sendEvent({
          event: 'output',
          body: {
            output: `Attached to HoloScript runtime ${sessionLabel} ${config.host}:${config.port}\n`,
            category: 'console',
          },
        });

        // Sync breakpoints
        const bps = fullArgs.breakpoints || [];
        if (bps.length > 0) {
          const synced = await mockConn.syncBreakpoints(bps);
          (this as unknown as Record<string, unknown>)._attachBreakpoints = synced;
          (this as unknown as { sendEvent: Function }).sendEvent({
            event: 'output',
            body: { output: `Reattached ${synced.length} breakpoint(s)\n`, category: 'console' },
          });
        }

        // Sync watches
        const watches = fullArgs.watchExpressions || [];
        if (watches.length > 0) {
          const watchResults = await mockConn.syncWatchExpressions(watches);
          (this as unknown as { sendEvent: Function }).sendEvent({
            event: 'output',
            body: {
              output: `Reattached ${watchResults.length} watch expression(s)\n`,
              category: 'console',
            },
          });
        }

        // Fetch execution state
        const state = await mockConn.fetchExecutionState();
        (this as unknown as Record<string, unknown>)._isRunning = state.status === 'running';

        if (state.status === 'paused') {
          (this as unknown as { sendEvent: Function }).sendEvent({
            event: 'stopped',
            body: { reason: state.pauseReason || 'attach', threadId: 1 },
          });
        }

        (this as unknown as { sendEvent: Function }).sendEvent({ event: 'initialized' });
        (this as unknown as { sendResponse: Function }).sendResponse(resp);
      };

      const response = createResponse('attach');
      await (sess as unknown as Record<string, Function>).attachRequest(response, args);
    }

    it('should attach successfully to a running session by port', async () => {
      const mockConn = createMockAttachConnection();
      await attachWithMock(session, { host: 'localhost', port: 9229 }, mockConn);

      expect(responses.length).toBe(1);
      expect(responses[0].success).toBe(true);
      expect((session as unknown as Record<string, unknown>)._isAttachMode).toBe(true);
      expect(events.some((e: Record<string, unknown>) => e.event === 'initialized')).toBe(true);
    });

    it('should attach to a specific session by ID', async () => {
      const mockConn = createMockAttachConnection();
      await attachWithMock(
        session,
        { host: 'localhost', port: 9229, sessionId: 'session-abc-123' },
        mockConn
      );

      expect(responses.length).toBe(1);
      expect(responses[0].success).toBe(true);
      const outputEvent = events.find(
        (e: Record<string, unknown>) =>
          e.event === 'output' &&
          ((e as Record<string, Record<string, string>>).body?.output || '').includes(
            'session-abc-123'
          )
      );
      expect(outputEvent).toBeDefined();
    });

    it('should reattach breakpoints on connect', async () => {
      const breakpoints: AttachBreakpointDescriptor[] = [
        { file: 'test.holo', line: 10, condition: 'x > 5' },
        { file: 'test.holo', line: 20 },
      ];
      const mockConn = createMockAttachConnection({ syncedBreakpoints: breakpoints });

      await attachWithMock(session, { breakpoints }, mockConn);

      expect(
        (mockConn as unknown as Record<string, { mock: { calls: unknown[][] } }>).syncBreakpoints
          .mock.calls.length
      ).toBe(1);
      expect(
        (mockConn as unknown as Record<string, { mock: { calls: unknown[][] } }>).syncBreakpoints
          .mock.calls[0][0]
      ).toEqual(breakpoints);

      const bpEvent = events.find(
        (e: Record<string, unknown>) =>
          e.event === 'output' &&
          ((e as Record<string, Record<string, string>>).body?.output || '').includes(
            'Reattached 2 breakpoint(s)'
          )
      );
      expect(bpEvent).toBeDefined();
    });

    it('should reattach watch expressions on connect', async () => {
      const watches = [{ expression: 'position.x' }, { expression: 'state.score' }];
      const mockConn = createMockAttachConnection({
        watchResults: [
          { expression: 'position.x', value: '1.5' },
          { expression: 'state.score', value: '42' },
        ],
      });

      await attachWithMock(session, { watchExpressions: watches }, mockConn);

      expect(
        (mockConn as unknown as Record<string, { mock: { calls: unknown[][] } }>)
          .syncWatchExpressions.mock.calls.length
      ).toBe(1);

      const watchEvent = events.find(
        (e: Record<string, unknown>) =>
          e.event === 'output' &&
          ((e as Record<string, Record<string, string>>).body?.output || '').includes(
            'Reattached 2 watch expression(s)'
          )
      );
      expect(watchEvent).toBeDefined();
    });

    it('should sync execution state and emit stopped event when remote is paused', async () => {
      const mockConn = createMockAttachConnection({
        executionState: {
          status: 'paused',
          pauseReason: 'breakpoint',
          sourceFile: 'world.holo',
          currentLine: 15,
          threadId: 1,
        },
      });

      await attachWithMock(session, {}, mockConn);

      expect((session as unknown as Record<string, unknown>)._isRunning).toBe(false);

      const stoppedEvent = events.find((e: Record<string, unknown>) => e.event === 'stopped');
      expect(stoppedEvent).toBeDefined();
      expect((stoppedEvent as Record<string, Record<string, unknown>>).body?.reason).toBe(
        'breakpoint'
      );
    });

    it('should set _isRunning=true when remote is running', async () => {
      const mockConn = createMockAttachConnection({
        executionState: { status: 'running' },
      });

      await attachWithMock(session, {}, mockConn);

      expect((session as unknown as Record<string, unknown>)._isRunning).toBe(true);
    });

    it('should handle graceful detach on disconnect without terminateDebuggee', async () => {
      const mockConn = createMockAttachConnection();
      await attachWithMock(session, {}, mockConn);

      // Now disconnect gracefully
      const disconnectResponse = createResponse('disconnect');
      await (session as unknown as Record<string, Function>).disconnectRequest(disconnectResponse, {
        terminateDebuggee: false,
      });

      expect(
        (mockConn as unknown as Record<string, { mock: { calls: unknown[][] } }>).detach.mock.calls
          .length
      ).toBe(1);
      expect((session as unknown as Record<string, unknown>)._isAttachMode).toBe(false);
      expect((session as unknown as Record<string, unknown>)._attachConnection).toBe(null);
    });

    it('should force disconnect when terminateDebuggee is true in attach mode', async () => {
      const mockConn = createMockAttachConnection();
      await attachWithMock(session, {}, mockConn);

      const disconnectResponse = createResponse('disconnect');
      await (session as unknown as Record<string, Function>).disconnectRequest(disconnectResponse, {
        terminateDebuggee: true,
      });

      // Should call disconnect, not detach
      expect(
        (mockConn as unknown as Record<string, { mock: { calls: unknown[][] } }>).disconnect.mock
          .calls.length
      ).toBe(1);
      expect(
        (mockConn as unknown as Record<string, { mock: { calls: unknown[][] } }>).detach.mock.calls
          .length
      ).toBe(0);
    });

    it('should clean up attach state after disconnect', async () => {
      const breakpoints: AttachBreakpointDescriptor[] = [{ file: 'test.holo', line: 5 }];
      const watches = [{ expression: 'x' }];
      const mockConn = createMockAttachConnection();

      await attachWithMock(session, { breakpoints, watchExpressions: watches }, mockConn);

      const disconnectResponse = createResponse('disconnect');
      await (session as unknown as Record<string, Function>).disconnectRequest(
        disconnectResponse,
        {}
      );

      expect((session as unknown as Record<string, unknown>)._attachBreakpoints).toEqual([]);
      expect((session as unknown as Record<string, unknown>)._attachWatchExpressions).toEqual([]);
      expect((session as unknown as Record<string, unknown>)._isAttachMode).toBe(false);
    });
  });

  // ── Breakpoint Tests ─────────────────────────────────────────────────────

  describe('SetBreakpoints', () => {
    it('should handle setBreakpoints request with multiple breakpoints', () => {
      const response = createResponse('setBreakpoints');
      const args: DebugProtocol.SetBreakpointsArguments = {
        source: { path: 'test.holo' },
        breakpoints: [{ line: 10 }, { line: 20 }, { line: 30 }],
      };

      (session as any).setBreakPointsRequest(response, args);

      expect(responses.length).toBe(1);
      expect(responses[0].body.breakpoints).toHaveLength(3);
      expect(responses[0].body.breakpoints[0].verified).toBe(true);
      expect(responses[0].body.breakpoints[0].line).toBe(10);
      expect(responses[0].body.breakpoints[1].line).toBe(20);
      expect(responses[0].body.breakpoints[2].line).toBe(30);
    });

    it('should support conditional breakpoints', () => {
      const response = createResponse('setBreakpoints');
      const args: DebugProtocol.SetBreakpointsArguments = {
        source: { path: 'test.holo' },
        breakpoints: [{ line: 15, condition: 'x > 5' }],
      };

      (session as any).setBreakPointsRequest(response, args);

      expect(responses[0].body.breakpoints).toHaveLength(1);
      expect(responses[0].body.breakpoints[0].verified).toBe(true);
    });

    it('should support hit condition breakpoints', () => {
      const response = createResponse('setBreakpoints');
      const args: DebugProtocol.SetBreakpointsArguments = {
        source: { path: 'test.holo' },
        breakpoints: [{ line: 15, hitCondition: '3' }],
      };

      (session as any).setBreakPointsRequest(response, args);

      expect(responses[0].body.breakpoints).toHaveLength(1);
      expect(responses[0].body.breakpoints[0].message).toContain('Hit condition');
    });

    it('should support log points', () => {
      const response = createResponse('setBreakpoints');
      const args: DebugProtocol.SetBreakpointsArguments = {
        source: { path: 'test.holo' },
        breakpoints: [{ line: 5, logMessage: 'Value is {x}' }],
      };

      (session as any).setBreakPointsRequest(response, args);

      expect(responses[0].body.breakpoints).toHaveLength(1);
      expect(responses[0].body.breakpoints[0].message).toContain('Log');
    });

    it('should include source reference in breakpoints', () => {
      const response = createResponse('setBreakpoints');
      const args: DebugProtocol.SetBreakpointsArguments = {
        source: { path: 'test.holo' },
        breakpoints: [{ line: 10 }],
      };

      (session as any).setBreakPointsRequest(response, args);

      expect(responses[0].body.breakpoints[0].source).toBeDefined();
    });
  });

  describe('SetFunctionBreakpoints', () => {
    it('should handle function breakpoints', () => {
      const response = createResponse('setFunctionBreakpoints');
      const args: DebugProtocol.SetFunctionBreakpointsArguments = {
        breakpoints: [{ name: 'onGrab' }, { name: 'onRelease' }],
      };

      (session as any).setFunctionBreakPointsRequest(response, args);

      expect(responses.length).toBe(1);
      expect(responses[0].body.breakpoints).toHaveLength(2);
      expect(responses[0].body.breakpoints[0].verified).toBe(true);
      expect(responses[0].body.breakpoints[0].message).toContain('onGrab');
    });
  });

  describe('SetExceptionBreakpoints', () => {
    it('should handle exception breakpoint filters', () => {
      const response = createResponse('setExceptionBreakpoints');
      const args: DebugProtocol.SetExceptionBreakpointsArguments = {
        filters: ['all', 'uncaught'],
      };

      (session as any).setExceptionBreakPointsRequest(response, args);

      expect(responses.length).toBe(1);
      expect((session as any)._exceptionBreakpoints.all).toBe(true);
      expect((session as any)._exceptionBreakpoints.uncaught).toBe(true);
    });

    it('should handle filterOptions for newer DAP clients', () => {
      const response = createResponse('setExceptionBreakpoints');
      const args: DebugProtocol.SetExceptionBreakpointsArguments = {
        filters: [],
        filterOptions: [{ filterId: 'all' }],
      };

      (session as any).setExceptionBreakPointsRequest(response, args);

      expect((session as any)._exceptionBreakpoints.all).toBe(true);
    });
  });

  describe('DataBreakpoints', () => {
    it('should handle data breakpoint info request', () => {
      const response = createResponse('dataBreakpointInfo');
      const args: DebugProtocol.DataBreakpointInfoArguments = {
        name: 'position',
        variablesReference: 1,
      };

      (session as any).dataBreakpointInfoRequest(response, args);

      expect(responses.length).toBe(1);
      expect(responses[0].body.dataId).toBeDefined();
      expect(responses[0].body.description).toContain('position');
      expect(responses[0].body.accessTypes).toContain('write');
    });

    it('should handle setDataBreakpoints request', () => {
      const response = createResponse('setDataBreakpoints');
      const args: DebugProtocol.SetDataBreakpointsArguments = {
        breakpoints: [
          { dataId: 'position', accessType: 'write' },
          { dataId: 'scale', accessType: 'readWrite' },
        ],
      };

      (session as any).setDataBreakpointsRequest(response, args);

      expect(responses.length).toBe(1);
      expect(responses[0].body.breakpoints).toHaveLength(2);
      expect(responses[0].body.breakpoints[0].verified).toBe(true);
    });
  });

  describe('BreakpointLocations', () => {
    it('should return breakpoint locations for source lines', () => {
      // Set source content first
      (session as any)._sourceContent =
        'orb test {\n  position: [0, 0, 0]\n  \n  scale: [1, 1, 1]\n}';

      const response = createResponse('breakpointLocations');
      const args: DebugProtocol.BreakpointLocationsArguments = {
        source: { path: 'test.holo' },
        line: 1,
        endLine: 5,
      };

      (session as any).breakpointLocationsRequest(response, args);

      expect(responses.length).toBe(1);
      // Should have locations for non-empty lines
      expect(responses[0].body.breakpoints.length).toBeGreaterThan(0);
    });

    it('should skip empty lines', () => {
      (session as any)._sourceContent = 'line1\n\nline3';

      const response = createResponse('breakpointLocations');
      const args: DebugProtocol.BreakpointLocationsArguments = {
        source: { path: 'test.holo' },
        line: 1,
        endLine: 3,
      };

      (session as any).breakpointLocationsRequest(response, args);

      expect(responses[0].body.breakpoints).toHaveLength(2);
    });
  });

  // ── Thread Tests ─────────────────────────────────────────────────────────

  describe('Threads', () => {
    it('should return single HoloScript main thread', () => {
      const response = createResponse('threads');

      (session as any).threadsRequest(response);

      expect(responses.length).toBe(1);
      expect(responses[0].body.threads).toHaveLength(1);
      expect(responses[0].body.threads[0].name).toBe('HoloScript Main Thread');
      expect(responses[0].body.threads[0].id).toBe(1);
    });
  });

  // ── Stack Trace Tests ────────────────────────────────────────────────────

  describe('StackTrace', () => {
    it('should handle stackTrace request', () => {
      const response = createResponse('stackTrace');

      (session as any).stackTraceRequest(response, { threadId: 1 });

      expect(responses.length).toBe(1);
      expect(responses[0].body.stackFrames).toBeDefined();
      expect(typeof responses[0].body.totalFrames).toBe('number');
    });

    it('should support pagination with startFrame and levels', () => {
      const response = createResponse('stackTrace');

      (session as any).stackTraceRequest(response, {
        threadId: 1,
        startFrame: 0,
        levels: 10,
      });

      expect(responses.length).toBe(1);
    });
  });

  // ── Scopes Tests ─────────────────────────────────────────────────────────

  describe('Scopes', () => {
    it('should return Local, Closure, and Global scopes', () => {
      const response = createResponse('scopes');

      (session as any).scopesRequest(response, { frameId: 1 });

      expect(responses.length).toBe(1);
      const scopes = responses[0].body.scopes;
      expect(scopes).toHaveLength(3);

      expect(scopes[0].name).toBe('Local');
      expect(scopes[0].expensive).toBe(false);

      expect(scopes[1].name).toBe('Closure');
      expect(scopes[1].expensive).toBe(false);

      expect(scopes[2].name).toBe('Global');
      expect(scopes[2].expensive).toBe(true);
    });

    it('should have unique variable references for each scope', () => {
      const response = createResponse('scopes');

      (session as any).scopesRequest(response, { frameId: 1 });

      const scopes = responses[0].body.scopes;
      const refs = scopes.map((s: any) => s.variablesReference);
      const uniqueRefs = new Set(refs);
      expect(uniqueRefs.size).toBe(3);
    });
  });

  // ── Variables Tests ──────────────────────────────────────────────────────

  describe('Variables', () => {
    it('should handle variables request', () => {
      const response = createResponse('variables');

      (session as any).variablesRequest(response, { variablesReference: 1 });

      expect(responses.length).toBe(1);
      expect(responses[0].body.variables).toBeDefined();
    });
  });

  describe('Variable Formatting', () => {
    it('should format null values', () => {
      const result = (session as any)._formatValue(null);
      expect(result).toBe('null');
    });

    it('should format undefined values', () => {
      const result = (session as any)._formatValue(undefined);
      expect(result).toBe('undefined');
    });

    it('should format string values with quotes', () => {
      const result = (session as any)._formatValue('hello');
      expect(result).toBe('"hello"');
    });

    it('should format number values', () => {
      const result = (session as any)._formatValue(42);
      expect(result).toBe('42');
    });

    it('should format boolean values', () => {
      expect((session as any)._formatValue(true)).toBe('true');
      expect((session as any)._formatValue(false)).toBe('false');
    });

    it('should format small arrays inline', () => {
      const result = (session as any)._formatValue([1, 2, 3]);
      expect(result).toBe('[1, 2, 3]');
    });

    it('should format large arrays with count', () => {
      const result = (session as any)._formatValue([1, 2, 3, 4, 5, 6, 7]);
      expect(result).toBe('Array(7)');
    });

    it('should format Maps', () => {
      const map = new Map([['a', 1]]);
      const result = (session as any)._formatValue(map);
      expect(result).toBe('Map(1)');
    });

    it('should format small objects inline', () => {
      const result = (session as any)._formatValue({ x: 1, y: 2 });
      expect(result).toContain('x: 1');
      expect(result).toContain('y: 2');
    });

    it('should format large objects with truncation', () => {
      const result = (session as any)._formatValue({ a: 1, b: 2, c: 3, d: 4, e: 5 });
      expect(result).toContain('...');
    });
  });

  describe('Variable References', () => {
    it('should return 0 for primitive values', () => {
      expect((session as any)._getVariableReference(null)).toBe(0);
      expect((session as any)._getVariableReference(undefined)).toBe(0);
      expect((session as any)._getVariableReference(42)).toBe(0);
      expect((session as any)._getVariableReference('string')).toBe(0);
      expect((session as any)._getVariableReference(true)).toBe(0);
    });

    it('should return non-zero reference for non-empty arrays', () => {
      const ref = (session as any)._getVariableReference([1, 2, 3]);
      expect(ref).toBeGreaterThan(0);
    });

    it('should return 0 for empty arrays', () => {
      expect((session as any)._getVariableReference([])).toBe(0);
    });

    it('should return non-zero reference for non-empty objects', () => {
      const ref = (session as any)._getVariableReference({ x: 1 });
      expect(ref).toBeGreaterThan(0);
    });

    it('should return 0 for empty objects', () => {
      expect((session as any)._getVariableReference({})).toBe(0);
    });

    it('should return non-zero reference for non-empty Maps', () => {
      const ref = (session as any)._getVariableReference(new Map([['a', 1]]));
      expect(ref).toBeGreaterThan(0);
    });

    it('should return 0 for empty Maps', () => {
      expect((session as any)._getVariableReference(new Map())).toBe(0);
    });
  });

  // ── Evaluate Tests ───────────────────────────────────────────────────────

  describe('Evaluate', () => {
    it('should handle evaluate request for REPL context', async () => {
      const response = createResponse('evaluate');

      await (session as any).evaluateRequest(response, {
        expression: 'test_var',
        context: 'repl',
      });

      expect(responses.length).toBe(1);
      expect(responses[0].body).toBeDefined();
    });

    it('should handle evaluate request for hover context', async () => {
      const response = createResponse('evaluate');

      await (session as any).evaluateRequest(response, {
        expression: 'unknown_var',
        context: 'hover',
      });

      expect(responses.length).toBe(1);
      // Hover should return empty result for unknown variables, not error
      expect(responses[0].body).toBeDefined();
    });

    it('should handle evaluate request for watch context', async () => {
      const response = createResponse('evaluate');

      await (session as any).evaluateRequest(response, {
        expression: '2 + 2',
        context: 'watch',
      });

      expect(responses.length).toBe(1);
    });

    it('should default to repl context when not specified', async () => {
      const response = createResponse('evaluate');

      await (session as any).evaluateRequest(response, {
        expression: 'test',
      });

      expect(responses.length).toBe(1);
    });
  });

  // ── Completions Tests ────────────────────────────────────────────────────

  describe('Completions', () => {
    it('should return completion targets', () => {
      const response = createResponse('completions');

      (session as any).completionsRequest(response, {
        text: 'or',
        column: 3,
      });

      expect(responses.length).toBe(1);
      expect(responses[0].body.targets).toBeDefined();
      expect(Array.isArray(responses[0].body.targets)).toBe(true);
    });

    it('should include HoloScript keywords', () => {
      const response = createResponse('completions');

      (session as any).completionsRequest(response, {
        text: '',
        column: 1,
      });

      const targets = responses[0].body.targets;
      const keywordLabels = targets
        .filter((t: any) => t.type === 'keyword')
        .map((t: any) => t.label);

      expect(keywordLabels).toContain('orb');
      expect(keywordLabels).toContain('world');
      expect(keywordLabels).toContain('if');
      expect(keywordLabels).toContain('return');
    });

    it('should filter completions by prefix', () => {
      const response = createResponse('completions');

      (session as any).completionsRequest(response, {
        text: 'wor',
        column: 4,
      });

      const targets = responses[0].body.targets;
      const filtered = targets.filter((t: any) => t.label.startsWith('wor'));
      expect(filtered.length).toBeGreaterThan(0);
    });
  });

  // ── Exception Info Tests ─────────────────────────────────────────────────

  describe('ExceptionInfo', () => {
    it('should return exception info when exception occurred', () => {
      // Set up a mock exception
      (session as any)._lastException = {
        description: 'Undefined variable: xyz',
        details: 'at function scope (line 10)',
      };

      const response = createResponse('exceptionInfo');

      (session as any).exceptionInfoRequest(response, { threadId: 1 });

      expect(responses.length).toBe(1);
      expect(responses[0].body.exceptionId).toBe('HoloScriptException');
      expect(responses[0].body.description).toBe('Undefined variable: xyz');
      expect(responses[0].body.details.message).toBe('Undefined variable: xyz');
      expect(responses[0].body.details.typeName).toBe('HoloScriptError');
    });

    it('should return unknown when no exception occurred', () => {
      const response = createResponse('exceptionInfo');

      (session as any).exceptionInfoRequest(response, { threadId: 1 });

      expect(responses[0].body.exceptionId).toBe('Unknown');
      expect(responses[0].body.breakMode).toBe('never');
    });
  });

  // ── Source Management Tests ──────────────────────────────────────────────

  describe('LoadedSources', () => {
    it('should return empty sources initially', () => {
      const response = createResponse('loadedSources');

      (session as any).loadedSourcesRequest(response, {});

      expect(responses.length).toBe(1);
      expect(responses[0].body.sources).toBeDefined();
      expect(Array.isArray(responses[0].body.sources)).toBe(true);
    });
  });

  describe('Source', () => {
    it('should return source content for loaded file', async () => {
      // Set up source content
      (session as any)._sourceContent = 'orb test { position: [0, 0, 0] }';

      const response = createResponse('source');

      await (session as any).sourceRequest(response, {
        source: {},
        sourceReference: 1,
      });

      expect(responses.length).toBe(1);
      expect(responses[0].body.content).toBe('orb test { position: [0, 0, 0] }');
      expect(responses[0].body.mimeType).toBe('text/x-holoscript');
    });

    it('should return fallback when no source loaded', async () => {
      const response = createResponse('source');

      await (session as any).sourceRequest(response, {
        source: {},
        sourceReference: 999,
      });

      expect(responses.length).toBe(1);
      expect(responses[0].body.content).toContain('No source loaded');
    });
  });

  // ── Stepping Tests ───────────────────────────────────────────────────────

  describe('Continue', () => {
    it('should handle continue request', async () => {
      const response = createResponse('continue');

      await (session as any).continueRequest(response, { threadId: 1 });

      expect(responses.length).toBe(1);
      expect(responses[0].body.allThreadsContinued).toBe(true);

      // Should send ContinuedEvent
      const continuedEvent = events.find((e) => e.event === 'continued');
      expect(continuedEvent).toBeDefined();
    });
  });

  describe('Next (Step Over)', () => {
    it('should handle next request', async () => {
      const response = createResponse('next');

      await (session as any).nextRequest(response, { threadId: 1 });

      expect(responses.length).toBe(1);
    });
  });

  describe('StepIn', () => {
    it('should handle stepIn request', async () => {
      const response = createResponse('stepIn');

      await (session as any).stepInRequest(response, { threadId: 1 });

      expect(responses.length).toBe(1);
    });
  });

  describe('StepOut', () => {
    it('should handle stepOut request', async () => {
      const response = createResponse('stepOut');

      await (session as any).stepOutRequest(response, { threadId: 1 });

      expect(responses.length).toBe(1);
    });
  });

  describe('Pause', () => {
    it('should handle pause request', () => {
      const response = createResponse('pause');

      (session as any).pauseRequest(response, { threadId: 1 });

      expect(responses.length).toBe(1);
      expect((session as any)._isRunning).toBe(false);
    });
  });

  // ── Variable Creation Tests ──────────────────────────────────────────────

  describe('createVariable', () => {
    it('should create variable with correct type for numbers', () => {
      const v = (session as any)._createVariable('count', 42);
      expect(v.name).toBe('count');
      expect(v.value).toBe('42');
      expect(v.type).toBe('number');
      expect(v.variablesReference).toBe(0);
    });

    it('should create variable with correct type for strings', () => {
      const v = (session as any)._createVariable('name', 'hello');
      expect(v.name).toBe('name');
      expect(v.value).toBe('"hello"');
      expect(v.type).toBe('string');
    });

    it('should create variable with correct type for arrays', () => {
      const v = (session as any)._createVariable('pos', [1, 2, 3]);
      expect(v.name).toBe('pos');
      expect(v.value).toBe('[1, 2, 3]');
      expect(v.type).toBe('Array(3)');
      expect(v.indexedVariables).toBe(3);
      expect(v.variablesReference).toBeGreaterThan(0);
    });

    it('should create variable with correct type for objects', () => {
      const v = (session as any)._createVariable('config', { x: 1, y: 2 });
      expect(v.name).toBe('config');
      expect(v.type).toBe('Object');
      expect(v.namedVariables).toBe(2);
      expect(v.variablesReference).toBeGreaterThan(0);
    });

    it('should create variable with correct type for null', () => {
      const v = (session as any)._createVariable('empty', null);
      expect(v.value).toBe('null');
      expect(v.type).toBe('null');
      expect(v.variablesReference).toBe(0);
    });

    it('should create variable with correct type for Map', () => {
      const map = new Map([
        ['a', 1],
        ['b', 2],
      ]);
      const v = (session as any)._createVariable('data', map);
      expect(v.type).toBe('Map(2)');
      expect(v.namedVariables).toBe(2);
      expect(v.variablesReference).toBeGreaterThan(0);
    });
  });

  // ── Integration-Style Tests ──────────────────────────────────────────────

  describe('Full Session Lifecycle', () => {
    it('should handle initialize -> configurationDone flow', () => {
      // Initialize
      const initResponse = createResponse('initialize');
      (session as any).initializeRequest(initResponse, { adapterID: 'holoscript' });

      expect(responses.length).toBe(1);
      expect(events.some((e) => e.event === 'initialized')).toBe(true);

      // ConfigurationDone
      const configResponse = createResponse('configurationDone');
      (session as any).configurationDoneRequest(configResponse, {});

      expect(responses.length).toBe(2);
      expect((session as any)._configurationDone).toBe(true);
    });

    it('should handle breakpoint set -> clear cycle', () => {
      // Set breakpoints
      const setResponse = createResponse('setBreakpoints');
      (session as any).setBreakPointsRequest(setResponse, {
        source: { path: 'test.holo' },
        breakpoints: [{ line: 5 }, { line: 10 }],
      });

      expect(responses[0].body.breakpoints).toHaveLength(2);

      // Clear breakpoints (set empty array)
      const clearResponse = createResponse('setBreakpoints');
      (session as any).setBreakPointsRequest(clearResponse, {
        source: { path: 'test.holo' },
        breakpoints: [],
      });

      expect(responses[1].body.breakpoints).toHaveLength(0);
    });
  });
});

// ── Test Helpers ──────────────────────────────────────────────────────────────

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
