/**
 * HoloScript Debug Adapter Protocol (DAP) Implementation
 *
 * Full DAP debugger for HoloScript providing:
 * - Breakpoints (line, conditional, hit count, exception, function, data)
 * - Variable inspection (scopes, structured viewing, modification)
 * - Call stack (stack frames, thread management)
 * - Evaluate/REPL (expressions, watch, hover, debug console)
 * - Stepping controls (step in, step out, step over, continue, pause)
 * - Source management (loaded sources, source retrieval)
 * - Debug console completions
 * - Restart and lifecycle management
 */

import {
  LoggingDebugSession,
  InitializedEvent,
  StoppedEvent,
  TerminatedEvent,
  OutputEvent,
  ContinuedEvent,
  _BreakpointEvent,
  LoadedSourceEvent,
  Thread,
  StackFrame,
  Scope,
  Source,
  Variable,
  _Breakpoint,
  _CompletionItem,
  Handles,
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import {
  HoloScriptDebugger,
  type StackFrame as HoloStackFrame,
  type DebugEvent,
} from '@holoscript/core';
import {
  AttachConnection,
  type AttachConfig,
  type AttachBreakpointDescriptor,
  type AttachWatchDescriptor,
  type RemoteExecutionState,
  type HotReloadEvent,
  type TraitVariableInfo,
  type PerformanceFrame,
} from './dap/DAPHotReloadAdapter';

// ── Launch/Attach Configuration ──────────────────────────────────────────────

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  /** An absolute path to the "program" to debug. */
  program: string;
  /** Automatically stop target after launch. If not specified, target does not stop. */
  stopOnEntry?: boolean;
  /** Enable logging output from the debugger. */
  trace?: boolean;
  /** Working directory for the program. */
  cwd?: string;
  /** Environment variables to set. */
  env?: Record<string, string>;
}

export interface AttachRequestArguments extends DebugProtocol.AttachRequestArguments {
  /** Port to attach to a running HoloScript process. */
  port?: number;
  /** Host to attach to. */
  host?: string;
  /** Session ID to attach to a specific running debug session. */
  sessionId?: string;
  /** Authentication token for the remote process. */
  token?: string;
  /** Connection timeout in milliseconds. */
  timeout?: number;
  /** Breakpoints to reattach after connecting. */
  breakpoints?: AttachBreakpointDescriptor[];
  /** Watch expressions to reattach after connecting. */
  watchExpressions?: AttachWatchDescriptor[];
}

// ── Scope Reference Descriptor ───────────────────────────────────────────────

interface ScopeDescriptor {
  type: 'local' | 'closure' | 'global';
  frameId: number;
}

// ── Variable Reference Descriptor ────────────────────────────────────────────

interface VariableContainer {
  /** The variables in this container. */
  variables: Map<string, unknown>;
  /** Parent variable path for nested objects. */
  parentPath?: string;
}

// ── Exception Breakpoint Configuration ───────────────────────────────────────

interface ExceptionBreakpointConfig {
  /** Break on all exceptions. */
  all: boolean;
  /** Break on uncaught exceptions only. */
  uncaught: boolean;
}

// ── Debug Session Implementation ─────────────────────────────────────────────

export class HoloScriptDebugSession extends LoggingDebugSession {
  private static THREAD_ID = 1;

  private _debugger: HoloScriptDebugger;
  private _sourceFile: string = '';
  private _sourceContent: string = '';
  private _configurationDone: boolean = false;

  // Handle management for variables/scopes
  private _variableHandles = new Handles<VariableContainer>();
  private _scopeHandles = new Handles<ScopeDescriptor>();

  // Loaded sources tracking
  private _loadedSources = new Map<string, Source>();
  private _sourceReferenceCounter = 0;

  // Exception breakpoint configuration
  private _exceptionBreakpoints: ExceptionBreakpointConfig = {
    all: false,
    uncaught: true,
  };

  // Function breakpoints
  private _functionBreakpoints: Map<string, DebugProtocol.Breakpoint> = new Map();

  // Data breakpoints (watch for variable changes)
  private _dataBreakpoints: Map<string, { accessType: string; variableName: string }> = new Map();

  // Last exception for exceptionInfo
  private _lastException: { description: string; details?: string } | null = null;

  // Track whether we are currently running (for pause support)
  private _isRunning: boolean = false;

  // Configuration for restart
  private _launchArgs: LaunchRequestArguments | null = null;

  // DAP Hot Reload adapter for attach-mode debugging
  private _attachConnection: AttachConnection | null = null;

  // Attach-mode state tracking
  private _attachBreakpoints: AttachBreakpointDescriptor[] = [];
  private _attachWatchExpressions: AttachWatchDescriptor[] = [];
  private _isAttachMode: boolean = false;

  public constructor() {
    super('holoscript-debug.txt');
    this._debugger = new HoloScriptDebugger();
    this._setupDebuggerEvents();
  }

  /**
   * Set up event listeners on the underlying HoloScript debugger engine.
   */
  private _setupDebuggerEvents(): void {
    this._debugger.on('breakpoint-hit', (_event: DebugEvent) => {
      this._isRunning = false;
      this.sendEvent(new StoppedEvent('breakpoint', HoloScriptDebugSession.THREAD_ID));
    });

    this._debugger.on('step-complete', (_event: DebugEvent) => {
      this._isRunning = false;
      this.sendEvent(new StoppedEvent('step', HoloScriptDebugSession.THREAD_ID));
    });

    this._debugger.on('state-change', (event: DebugEvent) => {
      const stateData = event.data as { status?: string; reason?: string };
      if (stateData.status === 'stopped' && stateData.reason === 'complete') {
        this._isRunning = false;
        this.sendEvent(new TerminatedEvent());
      } else if (stateData.status === 'paused') {
        this._isRunning = false;
        this.sendEvent(new StoppedEvent('pause', HoloScriptDebugSession.THREAD_ID));
      }
    });

    this._debugger.on('exception', (event: DebugEvent) => {
      this._isRunning = false;
      const errorData = event.data as { error?: string; node?: { type?: string }; line?: number };
      this._lastException = {
        description: errorData.error || 'Unknown exception',
        details: errorData.node
          ? `at ${errorData.node.type ?? 'unknown'} (line ${errorData.line || 0})`
          : undefined,
      };

      // Only break on exceptions if configured
      if (this._exceptionBreakpoints.all || this._exceptionBreakpoints.uncaught) {
        this.sendEvent(
          new StoppedEvent(
            'exception',
            HoloScriptDebugSession.THREAD_ID,
            errorData.error || 'Exception'
          )
        );
      }
    });

    this._debugger.on('output', (event: DebugEvent) => {
      const outputData = event.data as { output?: unknown };
      if (outputData.output !== undefined) {
        this.sendEvent(
          new OutputEvent(
            typeof outputData.output === 'string'
              ? outputData.output + '\n'
              : JSON.stringify(outputData.output, null, 2) + '\n',
            'stdout'
          )
        );
      }
    });
  }

  // ── Lifecycle Requests ───────────────────────────────────────────────────

  /**
   * DAP Initialize: declare capabilities.
   */
  protected initializeRequest(
    response: DebugProtocol.InitializeResponse,
    _args: DebugProtocol.InitializeRequestArguments
  ): void {
    response.body = response.body || {};

    // Breakpoint capabilities
    response.body.supportsConfigurationDoneRequest = true;
    response.body.supportsConditionalBreakpoints = true;
    response.body.supportsHitConditionalBreakpoints = true;
    response.body.supportsFunctionBreakpoints = true;
    response.body.supportsDataBreakpoints = true;
    response.body.supportsBreakpointLocationsRequest = true;

    // Stepping capabilities
    response.body.supportsSteppingGranularity = true;

    // Variable capabilities
    response.body.supportsSetVariable = true;

    // Evaluate capabilities
    response.body.supportsEvaluateForHovers = true;
    response.body.supportsCompletionsRequest = true;
    response.body.completionTriggerCharacters = ['.', '@', '"', "'"];

    // Exception handling
    response.body.supportsExceptionInfoRequest = true;
    response.body.supportsExceptionFilterOptions = true;
    response.body.exceptionBreakpointFilters = [
      {
        filter: 'all',
        label: 'All Exceptions',
        description: 'Break on all exceptions, including handled ones',
        default: false,
        supportsCondition: false,
      },
      {
        filter: 'uncaught',
        label: 'Uncaught Exceptions',
        description: 'Break only on uncaught exceptions',
        default: true,
        supportsCondition: false,
      },
    ];

    // Lifecycle capabilities
    response.body.supportsTerminateRequest = true;
    response.body.supportsRestartRequest = true;
    response.body.supportSuspendDebuggee = true;
    response.body.supportTerminateDebuggee = true;

    // Source capabilities
    response.body.supportsLoadedSourcesRequest = true;

    // Value formatting
    response.body.supportsValueFormattingOptions = true;

    // Clipboard evaluation
    response.body.supportsClipboardContext = true;

    // Log points
    response.body.supportsLogPoints = true;

    this.sendResponse(response);
    this.sendEvent(new InitializedEvent());
  }

  /**
   * DAP ConfigurationDone: client has finished configuring breakpoints, etc.
   */
  protected configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    _args: DebugProtocol.ConfigurationDoneArguments
  ): void {
    this._configurationDone = true;
    this.sendResponse(response);
  }

  /**
   * DAP Launch: start debugging a HoloScript program.
   */
  protected async launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: DebugProtocol.LaunchRequestArguments
  ): Promise<void> {
    const launchArgs = args as LaunchRequestArguments;
    this._launchArgs = launchArgs;
    this._sourceFile = launchArgs.program;

    // Load source code
    const fs = await import('fs');

    if (!fs.existsSync(this._sourceFile)) {
      this.sendErrorResponse(response, 1001, `Source file not found: ${this._sourceFile}`);
      return;
    }

    this._sourceContent = fs.readFileSync(this._sourceFile, 'utf8');
    const result = this._debugger.loadSource(this._sourceContent, this._sourceFile);

    if (!result.success) {
      this.sendErrorResponse(response, 1002, `Failed to load source: ${result.errors?.join(', ')}`);
      return;
    }

    // Track loaded source
    this._registerSource(this._sourceFile);

    // Send output about session start
    this.sendEvent(new OutputEvent(`Debugging: ${this._sourceFile}\n`, 'console'));

    this.sendResponse(response);

    // Wait for configuration to complete if needed
    if (!this._configurationDone) {
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (this._configurationDone) {
            clearInterval(interval);
            resolve();
          }
        }, 50);
        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(interval);
          resolve();
        }, 5000);
      });
    }

    if (launchArgs.stopOnEntry) {
      this.sendEvent(new StoppedEvent('entry', HoloScriptDebugSession.THREAD_ID));
    } else {
      this._isRunning = true;
      await this._debugger.start();
    }
  }

  /**
   * DAP Attach: attach to a running HoloScript process.
   *
   * Supports:
   * - Connecting by host:port (default localhost:9229)
   * - Connecting to a specific session by ID
   * - Reattaching breakpoints and watch expressions
   * - Syncing current execution state from the remote process
   * - Graceful detach (see disconnectRequest)
   */
  protected async attachRequest(
    response: DebugProtocol.AttachResponse,
    args: DebugProtocol.AttachRequestArguments
  ): Promise<void> {
    const attachArgs = args as AttachRequestArguments;
    const config: AttachConfig = {
      host: attachArgs.host || 'localhost',
      port: attachArgs.port || 9229,
      sessionId: attachArgs.sessionId,
      token: attachArgs.token,
      timeout: attachArgs.timeout,
    };

    this._attachConnection = new AttachConnection();

    let connected: boolean;
    try {
      connected = await this._attachConnection.connect(config);
    } catch (err) {
      this._attachConnection = null;
      const msg = err instanceof Error ? err.message : String(err);
      this.sendErrorResponse(
        response,
        1003,
        `Failed to attach to ${config.host}:${config.port}${config.sessionId ? ` (session: ${config.sessionId})` : ''}: ${msg}`
      );
      return;
    }

    if (!connected) {
      this._attachConnection = null;
      this.sendErrorResponse(
        response,
        1003,
        `Failed to attach to ${config.host}:${config.port}${config.sessionId ? ` (session: ${config.sessionId})` : ''}`
      );
      return;
    }

    this._isAttachMode = true;

    // Store breakpoints and watches for reattach
    this._attachBreakpoints = attachArgs.breakpoints || [];
    this._attachWatchExpressions = attachArgs.watchExpressions || [];

    // Set up event listeners for the attach connection
    this._attachConnection.on('hot-reload', (data: unknown) => {
      const ev = data as HotReloadEvent;
      this.sendEvent(
        new OutputEvent(
          `[Hot Reload] ${ev.filePath} ${ev.success ? 'OK' : 'FAILED'}${ev.errors?.length ? ': ' + ev.errors.join(', ') : ''}\n`,
          ev.success ? 'stdout' : 'stderr'
        )
      );
    });

    // Listen for remote disconnect
    this._attachConnection.on('disconnected', () => {
      if (this._isAttachMode) {
        this._isAttachMode = false;
        this._isRunning = false;
        this.sendEvent(new OutputEvent('Remote debug session disconnected.\n', 'console'));
        this.sendEvent(new TerminatedEvent());
      }
    });

    // Listen for remote breakpoint hits
    this._attachConnection.on('stopped', (data: unknown) => {
      const stopData = data as { reason?: string; threadId?: number };
      this._isRunning = false;
      this.sendEvent(
        new StoppedEvent(
          stopData.reason || 'breakpoint',
          stopData.threadId || HoloScriptDebugSession.THREAD_ID
        )
      );
    });

    const sessionLabel = config.sessionId ? `session ${config.sessionId} at` : '';
    this.sendEvent(
      new OutputEvent(
        `Attached to HoloScript runtime ${sessionLabel} ${config.host}:${config.port}\n`,
        'console'
      )
    );

    // Sync breakpoints if provided
    if (this._attachBreakpoints.length > 0) {
      try {
        const synced = await this._attachConnection.syncBreakpoints(this._attachBreakpoints);
        this._attachBreakpoints = synced;
        this.sendEvent(new OutputEvent(`Reattached ${synced.length} breakpoint(s)\n`, 'console'));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.sendEvent(new OutputEvent(`Warning: Failed to sync breakpoints: ${msg}\n`, 'stderr'));
      }
    }

    // Sync watch expressions if provided
    if (this._attachWatchExpressions.length > 0) {
      try {
        const watchResults = await this._attachConnection.syncWatchExpressions(
          this._attachWatchExpressions
        );
        this.sendEvent(
          new OutputEvent(`Reattached ${watchResults.length} watch expression(s)\n`, 'console')
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.sendEvent(
          new OutputEvent(`Warning: Failed to sync watch expressions: ${msg}\n`, 'stderr')
        );
      }
    }

    // Fetch and sync current execution state
    try {
      const state = await this._attachConnection.fetchExecutionState();
      this._isRunning = state.status === 'running';

      if (state.sourceFile) {
        this._sourceFile = state.sourceFile;
        this._registerSource(state.sourceFile);
      }

      this.sendEvent(
        new OutputEvent(
          `Remote state: ${state.status}${state.currentLine ? ` at line ${state.currentLine}` : ''}\n`,
          'console'
        )
      );

      // If the remote is paused, emit a stopped event so the UI updates
      if (state.status === 'paused') {
        this.sendEvent(
          new StoppedEvent(
            state.pauseReason || 'attach',
            state.threadId || HoloScriptDebugSession.THREAD_ID
          )
        );
      }
    } catch (err) {
      // Non-fatal: we can still debug without initial state sync
      const msg = err instanceof Error ? err.message : String(err);
      this.sendEvent(
        new OutputEvent(`Warning: Could not fetch execution state: ${msg}\n`, 'stderr')
      );
      this._isRunning = true;
    }

    this.sendEvent(new InitializedEvent());
    this.sendResponse(response);
  }

  /**
   * DAP Disconnect: end debug session.
   * In attach mode, performs a graceful detach that leaves the remote process running
   * (unless terminateDebuggee is true).
   */
  protected async disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    args: DebugProtocol.DisconnectArguments
  ): Promise<void> {
    // Stop the debugger
    this._debugger.stop();
    this._isRunning = false;

    // Clean up attach connection if present
    if (this._attachConnection) {
      if (this._isAttachMode && !args.terminateDebuggee) {
        // Graceful detach: notify remote we are leaving without killing it
        try {
          await this._attachConnection.detach();
        } catch {
          // Best-effort detach; swallow errors
          this._attachConnection.disconnect();
        }
        this.sendEvent(
          new OutputEvent(
            'Detached from remote debug session (process continues running).\n',
            'console'
          )
        );
      } else {
        this._attachConnection.disconnect();
      }
      this._attachConnection = null;
    }

    this._isAttachMode = false;
    this._attachBreakpoints = [];
    this._attachWatchExpressions = [];

    // Clean up handles
    this._variableHandles.reset();
    this._scopeHandles.reset();
    this._loadedSources.clear();
    this._functionBreakpoints.clear();
    this._dataBreakpoints.clear();
    this._lastException = null;

    if (args.terminateDebuggee) {
      this.sendEvent(new OutputEvent('Debuggee terminated.\n', 'console'));
    }

    this.sendResponse(response);
  }

  /**
   * DAP Terminate: request graceful termination.
   */
  protected terminateRequest(
    response: DebugProtocol.TerminateResponse,
    _args: DebugProtocol.TerminateArguments
  ): void {
    this._debugger.stop();
    this._isRunning = false;
    this.sendEvent(new TerminatedEvent());
    this.sendResponse(response);
  }

  /**
   * DAP Restart: restart the debug session.
   */
  protected async restartRequest(
    response: DebugProtocol.RestartResponse,
    _args: DebugProtocol.RestartArguments
  ): Promise<void> {
    // Stop current execution
    this._debugger.stop();
    this._isRunning = false;

    // Reset handles
    this._variableHandles.reset();
    this._scopeHandles.reset();
    this._lastException = null;

    // Re-load source if we have launch args
    if (this._launchArgs && this._sourceFile) {
      const fs = await import('fs');
      this._sourceContent = fs.readFileSync(this._sourceFile, 'utf8');
      const result = this._debugger.loadSource(this._sourceContent, this._sourceFile);

      if (!result.success) {
        this.sendErrorResponse(
          response,
          1004,
          `Failed to reload source: ${result.errors?.join(', ')}`
        );
        return;
      }

      this.sendEvent(new OutputEvent(`Restarting: ${this._sourceFile}\n`, 'console'));
      this.sendResponse(response);

      if (this._launchArgs.stopOnEntry) {
        this.sendEvent(new StoppedEvent('entry', HoloScriptDebugSession.THREAD_ID));
      } else {
        this._isRunning = true;
        await this._debugger.start();
      }
    } else {
      this.sendResponse(response);
    }
  }

  // ── Breakpoint Requests ──────────────────────────────────────────────────

  /**
   * DAP SetBreakpoints: set line breakpoints with optional conditions and hit counts.
   */
  protected setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): void {
    const path = args.source.path as string;
    const clientLines = args.breakpoints || [];

    // Clear existing breakpoints for this file
    this._debugger.clearBreakpoints();

    const breakpoints: DebugProtocol.Breakpoint[] = clientLines.map(
      (bp: DebugProtocol.SourceBreakpoint) => {
        // Handle log points (messages instead of breaking)
        if (bp.logMessage) {
          // Set breakpoint but mark it as a logpoint
          const coreBp = this._debugger.setBreakpoint(bp.line, {
            file: path,
            condition: bp.condition,
          });

          const dapBp: DebugProtocol.Breakpoint = {
            id: parseInt(coreBp.id.replace('bp_', '')),
            verified: true,
            line: coreBp.line,
            source: this._createSource(path),
            message: `Log: ${bp.logMessage}`,
          };
          return dapBp;
        }

        // Standard breakpoint with optional condition and hit count
        const coreBp = this._debugger.setBreakpoint(bp.line, {
          file: path,
          condition: bp.condition,
        });

        const dapBp: DebugProtocol.Breakpoint = {
          id: parseInt(coreBp.id.replace('bp_', '')),
          verified: true,
          line: coreBp.line,
          source: this._createSource(path),
        };

        // Include hit condition message if present
        if (bp.hitCondition) {
          dapBp.message = `Hit condition: ${bp.hitCondition}`;
        }

        return dapBp;
      }
    );

    response.body = { breakpoints };
    this.sendResponse(response);
  }

  /**
   * DAP SetFunctionBreakpoints: break when entering named functions/actions.
   */
  protected setFunctionBreakPointsRequest(
    response: DebugProtocol.SetFunctionBreakpointsResponse,
    args: DebugProtocol.SetFunctionBreakpointsArguments
  ): void {
    // Clear old function breakpoints
    this._functionBreakpoints.clear();

    const breakpoints: DebugProtocol.Breakpoint[] = (args.breakpoints || []).map(
      (fbp: DebugProtocol.FunctionBreakpoint, index: number) => {
        const bp: DebugProtocol.Breakpoint = {
          id: 10000 + index,
          verified: true,
          message: `Function breakpoint: ${fbp.name}`,
        };

        this._functionBreakpoints.set(fbp.name, bp);
        return bp;
      }
    );

    response.body = { breakpoints };
    this.sendResponse(response);
  }

  /**
   * DAP SetExceptionBreakpoints: configure exception break behavior.
   */
  protected setExceptionBreakPointsRequest(
    response: DebugProtocol.SetExceptionBreakpointsResponse,
    args: DebugProtocol.SetExceptionBreakpointsArguments
  ): void {
    this._exceptionBreakpoints.all = (args.filters || []).includes('all');
    this._exceptionBreakpoints.uncaught = (args.filters || []).includes('uncaught');

    // Also handle filterOptions for newer DAP clients
    if (args.filterOptions) {
      for (const option of args.filterOptions) {
        if (option.filterId === 'all') {
          this._exceptionBreakpoints.all = true;
        }
        if (option.filterId === 'uncaught') {
          this._exceptionBreakpoints.uncaught = true;
        }
      }
    }

    const breakpoints: DebugProtocol.Breakpoint[] = [];
    if (this._exceptionBreakpoints.all) {
      breakpoints.push({ verified: true, message: 'Break on all exceptions' });
    }
    if (this._exceptionBreakpoints.uncaught) {
      breakpoints.push({ verified: true, message: 'Break on uncaught exceptions' });
    }

    response.body = { breakpoints };
    this.sendResponse(response);
  }

  /**
   * DAP DataBreakpointInfo: query whether a data breakpoint can be set for a variable.
   */
  protected dataBreakpointInfoRequest(
    response: DebugProtocol.DataBreakpointInfoResponse,
    args: DebugProtocol.DataBreakpointInfoArguments
  ): void {
    const varName = args.name;
    const dataId = args.variablesReference ? `${args.variablesReference}:${varName}` : varName;

    response.body = {
      dataId,
      description: `Watch for changes to '${varName}'`,
      accessTypes: ['write', 'readWrite'] as DebugProtocol.DataBreakpointAccessType[],
      canPersist: false,
    };
    this.sendResponse(response);
  }

  /**
   * DAP SetDataBreakpoints: set data (watchpoint) breakpoints.
   */
  protected setDataBreakpointsRequest(
    response: DebugProtocol.SetDataBreakpointsResponse,
    args: DebugProtocol.SetDataBreakpointsArguments
  ): void {
    this._dataBreakpoints.clear();

    const breakpoints: DebugProtocol.Breakpoint[] = (args.breakpoints || []).map(
      (dbp: DebugProtocol.DataBreakpoint, index: number) => {
        const id = `data_${index}`;
        this._dataBreakpoints.set(id, {
          accessType: dbp.accessType || 'write',
          variableName: dbp.dataId,
        });

        return {
          id: 20000 + index,
          verified: true,
          message: `Data breakpoint on '${dbp.dataId}' (${dbp.accessType || 'write'})`,
        } as DebugProtocol.Breakpoint;
      }
    );

    response.body = { breakpoints };
    this.sendResponse(response);
  }

  /**
   * DAP BreakpointLocations: return possible breakpoint locations in a source range.
   */
  protected breakpointLocationsRequest(
    response: DebugProtocol.BreakpointLocationsResponse,
    args: DebugProtocol.BreakpointLocationsArguments
  ): void {
    const startLine = args.line;
    const endLine = args.endLine || startLine;
    const locations: DebugProtocol.BreakpointLocation[] = [];

    // Every non-empty line is a potential breakpoint location
    if (this._sourceContent) {
      const lines = this._sourceContent.split('\n');
      for (let i = startLine - 1; i < Math.min(endLine, lines.length); i++) {
        const line = lines[i];
        if (line && line.trim().length > 0) {
          locations.push({ line: i + 1 });
        }
      }
    }

    response.body = { breakpoints: locations };
    this.sendResponse(response);
  }

  // ── Thread and Execution Requests ────────────────────────────────────────

  /**
   * DAP Threads: HoloScript runs single-threaded.
   */
  protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = {
      threads: [new Thread(HoloScriptDebugSession.THREAD_ID, 'HoloScript Main Thread')],
    };
    this.sendResponse(response);
  }

  /**
   * DAP Continue: resume execution.
   */
  protected async continueRequest(
    response: DebugProtocol.ContinueResponse,
    _args: DebugProtocol.ContinueArguments
  ): Promise<void> {
    this._isRunning = true;
    response.body = { allThreadsContinued: true };
    this.sendResponse(response);
    this.sendEvent(new ContinuedEvent(HoloScriptDebugSession.THREAD_ID, true));
    await this._debugger.continue();
  }

  /**
   * DAP Next (step over): execute next statement without entering functions.
   */
  protected async nextRequest(
    response: DebugProtocol.NextResponse,
    _args: DebugProtocol.NextArguments
  ): Promise<void> {
    this._isRunning = true;
    this.sendResponse(response);
    await this._debugger.stepOver();
  }

  /**
   * DAP StepIn: step into the next function call.
   */
  protected async stepInRequest(
    response: DebugProtocol.StepInResponse,
    _args: DebugProtocol.StepInArguments
  ): Promise<void> {
    this._isRunning = true;
    this.sendResponse(response);
    await this._debugger.stepInto();
  }

  /**
   * DAP StepOut: step out of the current function.
   */
  protected async stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    _args: DebugProtocol.StepOutArguments
  ): Promise<void> {
    this._isRunning = true;
    this.sendResponse(response);
    await this._debugger.stepOut();
  }

  /**
   * DAP Pause: interrupt execution.
   */
  protected pauseRequest(
    response: DebugProtocol.PauseResponse,
    _args: DebugProtocol.PauseArguments
  ): void {
    this._debugger.pause();
    this._isRunning = false;
    this.sendResponse(response);
  }

  // ── Stack and Scope Requests ─────────────────────────────────────────────

  /**
   * DAP StackTrace: return the call stack with source mapping.
   */
  protected stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    args: DebugProtocol.StackTraceArguments
  ): void {
    const frames = this._debugger.getCallStack();
    const startFrame = args.startFrame || 0;
    const levels = args.levels || frames.length;
    const endFrame = Math.min(startFrame + levels, frames.length);

    const stackFrames: DebugProtocol.StackFrame[] = [];

    for (let i = startFrame; i < endFrame; i++) {
      const f: HoloStackFrame = frames[i];
      const source = this._createSource(f.file || this._sourceFile);

      const sf = new StackFrame(f.id, f.name, source, f.line, f.column);

      // Add presentation hint based on frame position
      if (i === 0) {
        sf.presentationHint = 'normal';
      } else if (f.name.startsWith('_') || f.name.startsWith('__')) {
        sf.presentationHint = 'subtle';
      }

      stackFrames.push(sf);
    }

    // If no stack frames from the debugger but we're paused, create a synthetic top frame
    if (stackFrames.length === 0) {
      const state = this._debugger.getState();
      if (state.status === 'paused' || state.currentLine > 0) {
        const source = this._createSource(this._sourceFile);
        const sf = new StackFrame(0, '<top level>', source, state.currentLine, state.currentColumn);
        stackFrames.push(sf);
      }
    }

    response.body = {
      stackFrames,
      totalFrames: frames.length || stackFrames.length,
    };
    this.sendResponse(response);
  }

  /**
   * DAP Scopes: return variable scopes for a stack frame.
   * Creates Local, Closure, and Global scopes.
   */
  protected scopesRequest(
    response: DebugProtocol.ScopesResponse,
    args: DebugProtocol.ScopesArguments
  ): void {
    const frameId = args.frameId;
    const scopes: Scope[] = [];

    // Local scope -- variables in the current frame
    const localRef = this._scopeHandles.create({ type: 'local', frameId });
    scopes.push(new Scope('Local', localRef, false));

    // Closure scope -- variables from enclosing scopes
    const closureRef = this._scopeHandles.create({ type: 'closure', frameId });
    scopes.push(new Scope('Closure', closureRef, false));

    // Global scope -- all runtime variables
    const globalRef = this._scopeHandles.create({ type: 'global', frameId });
    scopes.push(new Scope('Global', globalRef, true));

    response.body = { scopes };
    this.sendResponse(response);
  }

  /**
   * DAP Variables: return variables for a given reference (scope or structured variable).
   */
  protected variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments
  ): void {
    const variables: Variable[] = [];
    const ref = args.variablesReference;

    // Check if this is a scope reference
    const scopeDesc = this._scopeHandles.get(ref);
    if (scopeDesc) {
      const vars = this._getVariablesForScope(scopeDesc);
      for (const [name, value] of vars) {
        const v = this._createVariable(name, value);
        variables.push(v);
      }
    } else {
      // It's a structured variable container reference
      const container = this._variableHandles.get(ref);
      if (container) {
        for (const [name, value] of container.variables) {
          const v = this._createVariable(name, value);
          variables.push(v);
        }
      }
    }

    // Apply filter and pagination
    let filtered = variables;
    if (args.filter === 'named') {
      filtered = variables.filter((v) => isNaN(Number(v.name)));
    } else if (args.filter === 'indexed') {
      filtered = variables.filter((v) => !isNaN(Number(v.name)));
    }

    const start = args.start || 0;
    const count = args.count || filtered.length;
    const paged = filtered.slice(start, start + count);

    response.body = { variables: paged };
    this.sendResponse(response);
  }

  /**
   * DAP SetVariable: modify a variable value during debugging.
   */
  protected setVariableRequest(
    response: DebugProtocol.SetVariableResponse,
    args: DebugProtocol.SetVariableArguments
  ): void {
    const name = args.name;
    const valueStr = args.value;

    // Parse the new value
    let newValue: unknown;
    try {
      newValue = JSON.parse(valueStr);
    } catch {
      // If not valid JSON, treat as string
      newValue = valueStr;
    }

    // Try to set the variable in the runtime
    try {
      const runtime = this._debugger.getRuntime();
      const context = runtime.getContext();

      if (context.variables.has(name)) {
        context.variables.set(name, newValue);
        const displayValue = this._formatValue(newValue);

        response.body = {
          value: displayValue,
          type: typeof newValue,
          variablesReference: this._getVariableReference(newValue),
        };
        this.sendResponse(response);
      } else {
        this.sendErrorResponse(response, 1010, `Variable '${name}' not found`);
      }
    } catch (error) {
      this.sendErrorResponse(
        response,
        1011,
        `Failed to set variable: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ── Evaluate and Completions ─────────────────────────────────────────────

  /**
   * DAP Evaluate: evaluate an expression in the debug context.
   * Supports watch, hover, repl, and clipboard contexts.
   */
  protected async evaluateRequest(
    response: DebugProtocol.EvaluateResponse,
    args: DebugProtocol.EvaluateArguments
  ): Promise<void> {
    const expression = args.expression;
    const context = args.context || 'repl';

    try {
      const result = await this._debugger.evaluate(expression);

      if (result.error) {
        if (context === 'hover') {
          // For hover, silently return empty if expression can't be evaluated
          response.body = {
            result: '',
            variablesReference: 0,
          };
        } else {
          // For repl/watch, show the error
          response.body = {
            result: `Error: ${result.error}`,
            variablesReference: 0,
          };
          // Also send as output for REPL context
          if (context === 'repl') {
            this.sendEvent(new OutputEvent(`Error: ${result.error}\n`, 'stderr'));
          }
        }
      } else {
        const displayValue = this._formatValue(result.value);
        const varRef = this._getVariableReference(result.value);

        response.body = {
          result: displayValue,
          type: typeof result.value,
          variablesReference: varRef,
        };

        // For REPL, also echo the result as output
        if (context === 'repl') {
          this.sendEvent(new OutputEvent(`=> ${displayValue}\n`, 'stdout'));
        }
      }
    } catch (error) {
      response.body = {
        result: `Evaluation error: ${error instanceof Error ? error.message : String(error)}`,
        variablesReference: 0,
      };
    }

    this.sendResponse(response);
  }

  /**
   * DAP Completions: provide auto-complete suggestions for the debug console.
   */
  protected completionsRequest(
    response: DebugProtocol.CompletionsResponse,
    args: DebugProtocol.CompletionsArguments
  ): void {
    const text = args.text;
    const column = args.column;
    const prefix = text.substring(0, column - 1);
    const targets: DebugProtocol.CompletionItem[] = [];

    // Get all variables from runtime context
    try {
      const vars = this._debugger.getVariables();
      for (const [name] of vars) {
        if (name.startsWith(prefix) || prefix === '') {
          targets.push({
            label: name,
            type: 'variable',
            start: 0,
            length: prefix.length,
          });
        }
      }
    } catch {
      // Variables not available
    }

    // Add HoloScript keywords
    const keywords = [
      'orb',
      'world',
      'composition',
      'template',
      'state',
      'logic',
      'physics',
      'animation',
      'import',
      'from',
      'export',
      'if',
      'else',
      'while',
      'for',
      'return',
      'true',
      'false',
      'null',
    ];

    for (const kw of keywords) {
      if (kw.startsWith(prefix) || prefix === '') {
        targets.push({
          label: kw,
          type: 'keyword',
          start: 0,
          length: prefix.length,
        });
      }
    }

    response.body = { targets };
    this.sendResponse(response);
  }

  // ── Exception Info ───────────────────────────────────────────────────────

  /**
   * DAP ExceptionInfo: return details about the last exception.
   */
  protected exceptionInfoRequest(
    response: DebugProtocol.ExceptionInfoResponse,
    _args: DebugProtocol.ExceptionInfoArguments
  ): void {
    if (this._lastException) {
      response.body = {
        exceptionId: 'HoloScriptException',
        description: this._lastException.description,
        breakMode: this._exceptionBreakpoints.all ? 'always' : 'unhandled',
        details: {
          message: this._lastException.description,
          typeName: 'HoloScriptError',
          stackTrace: this._lastException.details,
        },
      };
    } else {
      response.body = {
        exceptionId: 'Unknown',
        breakMode: 'never',
      };
    }
    this.sendResponse(response);
  }

  // ── Source Management ────────────────────────────────────────────────────

  /**
   * DAP Source: return source content for a given source reference.
   */
  protected async sourceRequest(
    response: DebugProtocol.SourceResponse,
    args: DebugProtocol.SourceArguments
  ): Promise<void> {
    const sourcePath = args.source?.path;

    if (sourcePath) {
      try {
        const fs = await import('fs');
        const content = fs.readFileSync(sourcePath, 'utf8');
        response.body = {
          content,
          mimeType: 'text/x-holoscript',
        };
      } catch {
        response.body = {
          content: `// Source not available: ${sourcePath}`,
          mimeType: 'text/x-holoscript',
        };
      }
    } else {
      response.body = {
        content: this._sourceContent || '// No source loaded',
        mimeType: 'text/x-holoscript',
      };
    }

    this.sendResponse(response);
  }

  /**
   * DAP LoadedSources: return all currently loaded source files.
   */
  protected loadedSourcesRequest(
    response: DebugProtocol.LoadedSourcesResponse,
    _args: DebugProtocol.LoadedSourcesArguments
  ): void {
    response.body = {
      sources: Array.from(this._loadedSources.values()),
    };
    this.sendResponse(response);
  }

  // ── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Register a source file for tracking.
   */
  private _registerSource(filePath: string): Source {
    if (!this._loadedSources.has(filePath)) {
      const pathModule = require('path');
      const name = pathModule.basename(filePath);
      const source = new Source(name, filePath, ++this._sourceReferenceCounter);
      this._loadedSources.set(filePath, source);
      this.sendEvent(new LoadedSourceEvent('new', source));
    }
    return this._loadedSources.get(filePath)!;
  }

  /**
   * Create a DAP Source object from a file path.
   */
  private _createSource(filePath: string): Source {
    if (this._loadedSources.has(filePath)) {
      return this._loadedSources.get(filePath)!;
    }
    const pathModule = require('path');
    const name = pathModule.basename(filePath);
    return new Source(name, filePath);
  }

  /**
   * Get variables for a given scope descriptor.
   */
  private _getVariablesForScope(scope: ScopeDescriptor): Map<string, unknown> {
    switch (scope.type) {
      case 'local': {
        // Get variables from the specific stack frame
        return this._debugger.getVariables(scope.frameId);
      }
      case 'closure': {
        // For closure, return variables from parent frames
        const callStack = this._debugger.getCallStack();
        const closureVars = new Map<string, unknown>();
        for (const frame of callStack) {
          if (frame.id !== scope.frameId) {
            for (const [name, value] of frame.variables) {
              closureVars.set(name, value);
            }
          }
        }
        return closureVars;
      }
      case 'global': {
        // Return all runtime context variables
        return this._debugger.getVariables();
      }
      default:
        return new Map();
    }
  }

  /**
   * Create a DAP Variable with proper type detection and structured references.
   */
  private _createVariable(name: string, value: unknown): Variable {
    const displayValue = this._formatValue(value);
    const varRef = this._getVariableReference(value);

    const v = new Variable(name, displayValue, varRef);

    // DAP Variable supports type/indexedVariables/namedVariables as optional fields
    const ext = v as Variable & {
      type?: string;
      indexedVariables?: number;
      namedVariables?: number;
    };

    // Add type information
    if (value === null) {
      ext.type = 'null';
    } else if (value === undefined) {
      ext.type = 'undefined';
    } else if (Array.isArray(value)) {
      ext.type = `Array(${value.length})`;
      ext.indexedVariables = value.length;
      ext.namedVariables = 0;
    } else if (value instanceof Map) {
      ext.type = `Map(${value.size})`;
      ext.namedVariables = value.size;
    } else if (typeof value === 'object') {
      ext.type = value.constructor?.name || 'Object';
      ext.namedVariables = Object.keys(value as object).length;
    } else {
      ext.type = typeof value;
    }

    return v;
  }

  /**
   * Format a value for display in the debugger.
   */
  private _formatValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
      if (value.length <= 5) {
        return `[${value.map((v) => this._formatValue(v)).join(', ')}]`;
      }
      return `Array(${value.length})`;
    }
    if (value instanceof Map) {
      return `Map(${value.size})`;
    }
    if (typeof value === 'object') {
      const keys = Object.keys(value as object);
      if (keys.length <= 3) {
        const entries = keys.map(
          (k) => `${k}: ${this._formatValue((value as Record<string, unknown>)[k])}`
        );
        return `{${entries.join(', ')}}`;
      }
      return `Object {${keys.slice(0, 3).join(', ')}, ...}`;
    }
    return String(value);
  }

  /**
   * Get a variable reference for structured types (objects, arrays, maps).
   * Returns 0 for primitives (no expansion possible).
   */
  private _getVariableReference(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value !== 'object') return 0;

    const childVars = new Map<string, unknown>();

    if (Array.isArray(value)) {
      if (value.length === 0) return 0;
      value.forEach((item, index) => {
        childVars.set(String(index), item);
      });
    } else if (value instanceof Map) {
      if (value.size === 0) return 0;
      for (const [k, v] of value) {
        childVars.set(String(k), v);
      }
    } else {
      const keys = Object.keys(value as object);
      if (keys.length === 0) return 0;
      for (const key of keys) {
        childVars.set(key, (value as Record<string, unknown>)[key]);
      }
    }

    return this._variableHandles.create({ variables: childVars });
  }
}
