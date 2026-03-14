/**
 * DAPHotReloadAdapter -- Adds hot-reload and attach-mode capabilities to the
 * HoloScript DAP debugger.
 *
 * TARGET: packages/lsp/src/DAPHotReloadAdapter.ts
 *
 * Enhancements over the base HoloScriptDebugSession:
 * 1. Attach mode: connect to a running HoloScript process via WebSocket
 * 2. Hot-reload: detect source changes and reload without restarting the session
 * 3. Conditional breakpoint evaluation with HoloScript expression engine
 * 4. Trait-aware variable inspection (expand @physics, @grabbable configs)
 * 5. Performance timeline integration (frame time, trait update costs)
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export interface AttachConfig {
  /** WebSocket host for the running process. */
  host: string;
  /** WebSocket port for the running process. */
  port: number;
  /** Optional authentication token. */
  token?: string;
  /** Timeout for connection attempt in ms. */
  timeout?: number;
}

export interface HotReloadEvent {
  /** Source file that changed. */
  filePath: string;
  /** Type of change. */
  changeType: 'modified' | 'created' | 'deleted';
  /** Timestamp of the change. */
  timestamp: number;
  /** Whether the reload was successful. */
  success: boolean;
  /** Errors encountered during reload. */
  errors?: string[];
  /** Objects that were affected. */
  affectedObjects?: string[];
}

export interface TraitVariableInfo {
  /** Trait name (e.g., 'physics', 'grabbable'). */
  traitName: string;
  /** Object the trait is applied to. */
  objectId: string;
  /** Current trait configuration. */
  config: Record<string, unknown>;
  /** Whether the trait is currently active. */
  active: boolean;
  /** Last update timestamp. */
  lastUpdate: number;
}

export interface PerformanceFrame {
  /** Frame number. */
  frameNumber: number;
  /** Total frame time in ms. */
  frameTimeMs: number;
  /** Per-trait update times. */
  traitTimes: Record<string, number>;
  /** Number of active objects. */
  activeObjects: number;
  /** Memory usage in bytes. */
  memoryBytes: number;
}

// =============================================================================
// WEBSOCKET ATTACH PROTOCOL
// =============================================================================

/**
 * Protocol messages for attach-mode communication over WebSocket.
 */
export interface DAPAttachMessage {
  type: 'request' | 'response' | 'event';
  id: number;
  command?: string;
  body?: unknown;
  success?: boolean;
  error?: string;
}

/**
 * Manages the WebSocket connection for attach-mode debugging.
 */
export class AttachConnection {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private eventListeners = new Map<string, ((data: unknown) => void)[]>();
  private _connected = false;

  get connected(): boolean {
    return this._connected;
  }

  /**
   * Connect to a running HoloScript process.
   */
  async connect(config: AttachConfig): Promise<boolean> {
    const url = `ws://${config.host}:${config.port}/debug`;
    const timeout = config.timeout || 5000;

    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Connection timeout after ${timeout}ms`));
      }, timeout);

      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          clearTimeout(timer);
          this._connected = true;

          // Authenticate if token provided
          if (config.token) {
            this.send('authenticate', { token: config.token })
              .then(() => resolve(true))
              .catch(reject);
          } else {
            resolve(true);
          }
        };

        this.ws.onmessage = (event: MessageEvent) => {
          this.handleMessage(event.data as string);
        };

        this.ws.onclose = () => {
          this._connected = false;
          this.rejectAllPending(new Error('Connection closed'));
          this.emit('disconnected', {});
        };

        this.ws.onerror = (err: Event) => {
          clearTimeout(timer);
          this._connected = false;
          reject(new Error(`WebSocket error: ${err.type}`));
        };
      } catch (err) {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * Send a request and wait for a response.
   */
  async send(command: string, body?: unknown): Promise<unknown> {
    if (!this.ws || !this._connected) {
      throw new Error('Not connected');
    }

    const id = ++this.messageId;
    const message: DAPAttachMessage = { type: 'request', id, command, body };

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${command} timed out`));
      }, 10000);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.ws!.send(JSON.stringify(message));
    });
  }

  /**
   * Send a one-way message (no response expected).
   */
  sendEvent(command: string, body?: unknown): void {
    if (!this.ws || !this._connected) return;

    const message: DAPAttachMessage = {
      type: 'event',
      id: ++this.messageId,
      command,
      body,
    };
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Register an event listener.
   */
  on(event: string, listener: (data: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  /**
   * Disconnect from the running process.
   */
  disconnect(): void {
    if (this.ws) {
      this.rejectAllPending(new Error('Disconnecting'));
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  // -- Private methods --

  private handleMessage(raw: string): void {
    let msg: DAPAttachMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'response') {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(msg.id);
        if (msg.success) {
          pending.resolve(msg.body);
        } else {
          pending.reject(new Error(msg.error || 'Request failed'));
        }
      }
    } else if (msg.type === 'event') {
      this.emit(msg.command || 'unknown', msg.body);
    }
  }

  private emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch {
          // Don't let listener errors break the connection
        }
      }
    }
  }

  private rejectAllPending(reason: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(reason);
    }
    this.pendingRequests.clear();
  }
}

// =============================================================================
// HOT RELOAD MANAGER
// =============================================================================

/**
 * Manages hot-reload of HoloScript sources during debugging.
 * Watches for file changes and incrementally updates the running program.
 */
export class HotReloadManager {
  private watchedFiles = new Map<string, { mtime: number; content: string }>();
  private reloadHistory: HotReloadEvent[] = [];
  private _enabled = true;
  private _debounceMs = 300;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges: string[] = [];
  private onReload: ((event: HotReloadEvent) => void) | null = null;

  /** Enable or disable hot reload. */
  get enabled(): boolean { return this._enabled; }
  set enabled(value: boolean) { this._enabled = value; }

  /** Debounce interval in ms. */
  get debounceMs(): number { return this._debounceMs; }
  set debounceMs(value: number) { this._debounceMs = Math.max(50, value); }

  /**
   * Register a file for hot-reload watching.
   */
  registerFile(filePath: string, content: string): void {
    this.watchedFiles.set(filePath, {
      mtime: Date.now(),
      content,
    });
  }

  /**
   * Set the reload callback.
   */
  setReloadHandler(handler: (event: HotReloadEvent) => void): void {
    this.onReload = handler;
  }

  /**
   * Notify the manager that a file has changed.
   * Debounces multiple rapid changes into a single reload.
   */
  fileChanged(filePath: string, newContent: string): void {
    if (!this._enabled) return;

    const existing = this.watchedFiles.get(filePath);
    if (existing && existing.content === newContent) return; // No actual change

    this.watchedFiles.set(filePath, {
      mtime: Date.now(),
      content: newContent,
    });

    if (!this.pendingChanges.includes(filePath)) {
      this.pendingChanges.push(filePath);
    }

    // Debounce
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.executePendingReloads();
    }, this._debounceMs);
  }

  /**
   * Execute all pending reloads.
   */
  private executePendingReloads(): void {
    const changes = [...this.pendingChanges];
    this.pendingChanges = [];

    for (const filePath of changes) {
      const event: HotReloadEvent = {
        filePath,
        changeType: 'modified',
        timestamp: Date.now(),
        success: true,
      };

      try {
        // Validate the new source before accepting
        const fileData = this.watchedFiles.get(filePath);
        if (!fileData) {
          event.success = false;
          event.errors = ['File data not found'];
        } else {
          const validation = this.validateSource(fileData.content);
          if (!validation.valid) {
            event.success = false;
            event.errors = validation.errors;
          } else {
            event.affectedObjects = validation.affectedObjects;
          }
        }
      } catch (err) {
        event.success = false;
        event.errors = [err instanceof Error ? err.message : String(err)];
      }

      this.reloadHistory.push(event);
      if (this.onReload) {
        this.onReload(event);
      }
    }
  }

  /**
   * Basic source validation before hot-reload.
   * Checks for syntax errors and returns affected objects.
   */
  private validateSource(content: string): {
    valid: boolean;
    errors: string[];
    affectedObjects: string[];
  } {
    const errors: string[] = [];
    const affectedObjects: string[] = [];

    // Check for balanced braces
    let braceCount = 0;
    for (const char of content) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      if (braceCount < 0) {
        errors.push('Unmatched closing brace');
        break;
      }
    }
    if (braceCount > 0) {
      errors.push(`${braceCount} unclosed brace(s)`);
    }

    // Extract object names that would be affected
    const objectRegex = /object\s+"([^"]+)"/g;
    let match;
    while ((match = objectRegex.exec(content)) !== null) {
      affectedObjects.push(match[1]);
    }

    // Check for template references
    const templateRegex = /template\s+"([^"]+)"/g;
    while ((match = templateRegex.exec(content)) !== null) {
      affectedObjects.push(`template:${match[1]}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      affectedObjects,
    };
  }

  /**
   * Get reload history.
   */
  getHistory(): HotReloadEvent[] {
    return [...this.reloadHistory];
  }

  /**
   * Get the last N reload events.
   */
  getRecentReloads(count: number = 10): HotReloadEvent[] {
    return this.reloadHistory.slice(-count);
  }

  /**
   * Clear the reload history.
   */
  clearHistory(): void {
    this.reloadHistory = [];
  }

  /**
   * Stop watching and clean up.
   */
  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.watchedFiles.clear();
    this.pendingChanges = [];
    this.onReload = null;
  }
}

// =============================================================================
// TRAIT-AWARE VARIABLE INSPECTOR
// =============================================================================

/**
 * Expands trait configurations into structured variable trees for the debugger.
 * This allows the user to inspect @physics { mass: 2.0 } as a structured
 * variable in the debugger's Variables panel.
 */
export class TraitVariableInspector {
  /**
   * Extract trait variables from an object's property bag.
   * Returns structured trait info for debugger display.
   */
  extractTraitVariables(
    objectId: string,
    props: Record<string, unknown>,
    activeTraits: string[] = [],
  ): TraitVariableInfo[] {
    const traits: TraitVariableInfo[] = [];

    // Look for trait-like properties (prefixed with @ or trait_ or in a traits map)
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('@') || key.startsWith('trait_')) {
        const traitName = key.replace(/^@/, '').replace(/^trait_/, '');
        traits.push({
          traitName,
          objectId,
          config: typeof value === 'object' && value !== null
            ? value as Record<string, unknown>
            : { value },
          active: activeTraits.includes(traitName),
          lastUpdate: Date.now(),
        });
      }
    }

    // Check for a 'traits' property containing trait configurations
    const traitsMap = props['traits'] as Record<string, unknown> | undefined;
    if (traitsMap && typeof traitsMap === 'object') {
      for (const [traitName, config] of Object.entries(traitsMap)) {
        traits.push({
          traitName,
          objectId,
          config: typeof config === 'object' && config !== null
            ? config as Record<string, unknown>
            : { value: config },
          active: activeTraits.includes(traitName),
          lastUpdate: Date.now(),
        });
      }
    }

    return traits;
  }

  /**
   * Format trait info as debugger variable entries.
   * Returns a map suitable for the DAP variablesRequest.
   */
  formatForDebugger(traits: TraitVariableInfo[]): Map<string, unknown> {
    const vars = new Map<string, unknown>();

    for (const trait of traits) {
      const prefix = trait.active ? '[active]' : '[inactive]';
      const key = `@${trait.traitName} ${prefix}`;

      // Create structured value with config entries
      const traitObj: Record<string, unknown> = {
        '__status': trait.active ? 'active' : 'inactive',
        '__objectId': trait.objectId,
        '__lastUpdate': new Date(trait.lastUpdate).toISOString(),
      };

      for (const [configKey, configValue] of Object.entries(trait.config)) {
        traitObj[configKey] = configValue;
      }

      vars.set(key, traitObj);
    }

    return vars;
  }
}

// =============================================================================
// PERFORMANCE TIMELINE
// =============================================================================

/**
 * Collects performance data during debugging for timeline visualization.
 * Shows frame times, per-trait costs, and memory usage.
 */
export class PerformanceTimeline {
  private frames: PerformanceFrame[] = [];
  private maxFrames: number;
  private _recording = false;

  constructor(maxFrames: number = 600) {
    this.maxFrames = maxFrames;
  }

  /** Start recording performance data. */
  start(): void {
    this._recording = true;
  }

  /** Stop recording. */
  stop(): void {
    this._recording = false;
  }

  /** Whether we are currently recording. */
  get recording(): boolean {
    return this._recording;
  }

  /**
   * Record a frame's performance data.
   */
  recordFrame(frame: PerformanceFrame): void {
    if (!this._recording) return;

    this.frames.push(frame);

    // Ring buffer: evict oldest frames
    if (this.frames.length > this.maxFrames) {
      this.frames.shift();
    }
  }

  /**
   * Get the last N frames.
   */
  getRecentFrames(count: number = 60): PerformanceFrame[] {
    return this.frames.slice(-count);
  }

  /**
   * Get average frame time over the last N frames.
   */
  getAverageFrameTime(count: number = 60): number {
    const recent = this.getRecentFrames(count);
    if (recent.length === 0) return 0;
    const sum = recent.reduce((acc, f) => acc + f.frameTimeMs, 0);
    return sum / recent.length;
  }

  /**
   * Get the top N most expensive traits.
   */
  getHottestTraits(count: number = 5): Array<{ trait: string; avgMs: number }> {
    const traitTotals = new Map<string, { sum: number; count: number }>();

    for (const frame of this.frames) {
      for (const [trait, time] of Object.entries(frame.traitTimes)) {
        const existing = traitTotals.get(trait) || { sum: 0, count: 0 };
        existing.sum += time;
        existing.count += 1;
        traitTotals.set(trait, existing);
      }
    }

    const avgList = Array.from(traitTotals.entries())
      .map(([trait, data]) => ({
        trait,
        avgMs: data.sum / data.count,
      }))
      .sort((a, b) => b.avgMs - a.avgMs);

    return avgList.slice(0, count);
  }

  /**
   * Detect frame time spikes (frames that took >2x the average).
   */
  detectSpikes(threshold: number = 2.0): PerformanceFrame[] {
    const avg = this.getAverageFrameTime();
    if (avg === 0) return [];
    return this.frames.filter(f => f.frameTimeMs > avg * threshold);
  }

  /**
   * Get performance summary for the debug console.
   */
  getSummary(): string {
    if (this.frames.length === 0) return 'No performance data recorded.';

    const avg = this.getAverageFrameTime();
    const fps = avg > 0 ? (1000 / avg).toFixed(1) : 'N/A';
    const hottestTraits = this.getHottestTraits(3);
    const spikes = this.detectSpikes();
    const lastFrame = this.frames[this.frames.length - 1];

    const lines = [
      `Performance Summary (${this.frames.length} frames):`,
      `  Avg frame time: ${avg.toFixed(2)}ms (~${fps} FPS)`,
      `  Active objects: ${lastFrame.activeObjects}`,
      `  Memory: ${(lastFrame.memoryBytes / 1024 / 1024).toFixed(1)}MB`,
      `  Spikes (>2x avg): ${spikes.length}`,
    ];

    if (hottestTraits.length > 0) {
      lines.push('  Hottest traits:');
      for (const t of hottestTraits) {
        lines.push(`    @${t.trait}: ${t.avgMs.toFixed(3)}ms avg`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Export timeline data as JSON for external analysis.
   */
  exportJSON(): string {
    return JSON.stringify({
      frameCount: this.frames.length,
      avgFrameTime: this.getAverageFrameTime(),
      hottestTraits: this.getHottestTraits(10),
      spikeCount: this.detectSpikes().length,
      frames: this.frames,
    }, null, 2);
  }

  /** Clear all recorded data. */
  clear(): void {
    this.frames = [];
  }
}

// =============================================================================
// CONDITIONAL BREAKPOINT EVALUATOR
// =============================================================================

/**
 * Evaluates conditional breakpoint expressions in the HoloScript context.
 * Supports trait property access, comparisons, and basic arithmetic.
 *
 * Examples:
 *   "@physics.mass > 5.0"
 *   "state.score >= 100 && state.combo_count > 3"
 *   "this.position[1] < 0"
 */
export class ConditionalBreakpointEvaluator {
  /**
   * Evaluate a conditional expression against the current context.
   *
   * @param expression The condition expression string
   * @param context Current variable context
   * @returns Whether the condition is met (breakpoint should fire)
   */
  evaluate(
    expression: string,
    context: Record<string, unknown>,
  ): { result: boolean; error?: string } {
    try {
      // Sanitize: only allow safe characters
      if (/[;{}()=]/.test(expression.replace(/[<>!=]=?/g, '').replace(/\(/g, '').replace(/\)/g, ''))) {
        return {
          result: false,
          error: `Unsafe characters in expression: ${expression}`,
        };
      }

      // Replace trait property access (@trait.prop) with context lookups
      let normalized = expression.replace(
        /@(\w+)\.(\w+)/g,
        (_, trait, prop) => {
          const traitConfig = context[`@${trait}`] || context[`trait_${trait}`] || context[trait];
          if (traitConfig && typeof traitConfig === 'object') {
            return String((traitConfig as Record<string, unknown>)[prop] ?? 'undefined');
          }
          return 'undefined';
        }
      );

      // Replace state.X with context lookups
      normalized = normalized.replace(
        /state\.(\w+)/g,
        (_, prop) => {
          const state = context['state'] as Record<string, unknown> | undefined;
          if (state && prop in state) {
            const val = state[prop];
            return typeof val === 'string' ? `"${val}"` : String(val);
          }
          return 'undefined';
        }
      );

      // Replace this.X with context lookups
      normalized = normalized.replace(
        /this\.(\w+)(?:\[(\d+)\])?/g,
        (_, prop, index) => {
          const val = context[prop];
          if (index !== undefined && Array.isArray(val)) {
            return String(val[parseInt(index)] ?? 'undefined');
          }
          return typeof val === 'string' ? `"${val}"` : String(val ?? 'undefined');
        }
      );

      // Simple expression evaluator for comparisons
      const result = this.evaluateSimpleExpression(normalized);
      return { result };
    } catch (err) {
      return {
        result: false,
        error: `Evaluation error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Evaluate a simple normalized expression (numbers, comparisons, &&, ||).
   */
  private evaluateSimpleExpression(expr: string): boolean {
    // Handle && and ||
    if (expr.includes('&&')) {
      const parts = expr.split('&&').map(p => p.trim());
      return parts.every(part => this.evaluateSimpleExpression(part));
    }
    if (expr.includes('||')) {
      const parts = expr.split('||').map(p => p.trim());
      return parts.some(part => this.evaluateSimpleExpression(part));
    }

    // Handle negation
    const trimmed = expr.trim();
    if (trimmed.startsWith('!')) {
      return !this.evaluateSimpleExpression(trimmed.slice(1));
    }

    // Handle comparisons
    const comparisonMatch = trimmed.match(/^(.+?)\s*(>=|<=|===|!==|==|!=|>|<)\s*(.+)$/);
    if (comparisonMatch) {
      const left = this.parseValue(comparisonMatch[1].trim());
      const op = comparisonMatch[2];
      const right = this.parseValue(comparisonMatch[3].trim());

      switch (op) {
        case '>': return left > right;
        case '<': return left < right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        case '==':
        case '===': return left === right;
        case '!=':
        case '!==': return left !== right;
        default: return false;
      }
    }

    // Boolean literal
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;

    // Non-zero number is truthy
    const num = Number(trimmed);
    if (!isNaN(num)) return num !== 0;

    // Non-empty string (quoted)
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.length > 2;
    }

    return trimmed !== 'undefined' && trimmed !== 'null' && trimmed !== '';
  }

  /**
   * Parse a value string into a number for comparison.
   */
  private parseValue(s: string): number {
    // Remove quotes for string comparison
    if (s.startsWith('"') && s.endsWith('"')) {
      return s.length; // Use length as numeric proxy (for ordering)
    }
    const n = Number(s);
    return isNaN(n) ? 0 : n;
  }
}
