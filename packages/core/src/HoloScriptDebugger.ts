/**
 * HoloScript Debugger
 *
 * Step-through debugging with breakpoints, call stack inspection,
 * and variable watch capabilities.
 */

import { HoloScriptRuntime } from './HoloScriptRuntime';
import { HoloScriptCodeParser } from './HoloScriptCodeParser';
import type { ASTNode } from './types';

export interface Breakpoint {
  id: string;
  line: number;
  column?: number;
  condition?: string;
  hitCount: number;
  enabled: boolean;
  file?: string;
}

export interface StackFrame {
  id: number;
  name: string;
  file?: string;
  line: number;
  column: number;
  variables: Map<string, unknown>;
  node: ASTNode;
}

export interface DebugState {
  status: 'running' | 'paused' | 'stopped' | 'stepping';
  currentLine: number;
  currentColumn: number;
  currentNode: ASTNode | null;
  callStack: StackFrame[];
  breakpoints: Breakpoint[];
}

export type StepMode = 'into' | 'over' | 'out';

export interface DebugEvent {
  type: 'breakpoint-hit' | 'step-complete' | 'exception' | 'output' | 'state-change';
  data: unknown;
}

type DebugEventHandler = (event: DebugEvent) => void;

/**
 * HoloScript Debugger with breakpoints and step-through execution
 */
export class HoloScriptDebugger {
  private runtime: HoloScriptRuntime;
  private parser: HoloScriptCodeParser;
  private breakpoints: Map<string, Breakpoint> = new Map();
  private callStack: StackFrame[] = [];
  private currentAST: ASTNode[] = [];
  private currentNodeIndex: number = 0;
  private frameIdCounter: number = 0;
  private breakpointIdCounter: number = 0;
  private eventHandlers: Map<string, DebugEventHandler[]> = new Map();

  private state: DebugState = {
    status: 'stopped',
    currentLine: 0,
    currentColumn: 0,
    currentNode: null,
    callStack: [],
    breakpoints: [],
  };

  constructor(runtime?: HoloScriptRuntime) {
    this.runtime = runtime || new HoloScriptRuntime();
    this.parser = new HoloScriptCodeParser();
  }

  /**
   * Load source code for debugging
   */
  loadSource(code: string, file?: string): { success: boolean; errors?: string[] } {
    const parseResult = this.parser.parse(code);

    if (!parseResult.success) {
      return {
        success: false,
        errors: parseResult.errors.map((e) => `Line ${e.line}: ${e.message}`),
      };
    }

    this.currentAST = parseResult.ast;
    this.currentNodeIndex = 0;
    this.state.status = 'stopped';
    this.callStack = [];

    // Store file reference in nodes
    if (file) {
      for (const node of this.currentAST) {
        (node as ASTNode & { file?: string }).file = file;
      }
    }

    return { success: true };
  }

  /**
   * Set a breakpoint at a line
   */
  setBreakpoint(line: number, options: Partial<Breakpoint> = {}): Breakpoint {
    const id = `bp_${++this.breakpointIdCounter}`;
    const breakpoint: Breakpoint = {
      id,
      line,
      column: options.column,
      condition: options.condition,
      hitCount: 0,
      enabled: options.enabled !== false,
      file: options.file,
    };

    this.breakpoints.set(id, breakpoint);
    this.updateBreakpointList();

    return breakpoint;
  }

  /**
   * Remove a breakpoint by ID
   */
  removeBreakpoint(id: string): boolean {
    const removed = this.breakpoints.delete(id);
    if (removed) {
      this.updateBreakpointList();
    }
    return removed;
  }

  /**
   * Remove all breakpoints at a line
   */
  removeBreakpointsAtLine(line: number): number {
    let removed = 0;
    for (const [id, bp] of this.breakpoints) {
      if (bp.line === line) {
        this.breakpoints.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      this.updateBreakpointList();
    }
    return removed;
  }

  /**
   * Toggle breakpoint enabled state
   */
  toggleBreakpoint(id: string): boolean {
    const bp = this.breakpoints.get(id);
    if (bp) {
      bp.enabled = !bp.enabled;
      this.updateBreakpointList();
      return bp.enabled;
    }
    return false;
  }

  /**
   * Get all breakpoints
   */
  getBreakpoints(): Breakpoint[] {
    return Array.from(this.breakpoints.values());
  }

  /**
   * Clear all breakpoints
   */
  clearBreakpoints(): void {
    this.breakpoints.clear();
    this.updateBreakpointList();
  }

  /**
   * Start debugging from the beginning
   */
  async start(): Promise<void> {
    this.currentNodeIndex = 0;
    this.callStack = [];
    this.frameIdCounter = 0;
    this.runtime.reset();
    this.state.status = 'running';

    await this.runUntilBreakpoint();
  }

  /**
   * Continue execution until next breakpoint or end
   */
  async continue(): Promise<void> {
    if (this.state.status !== 'paused') return;

    this.state.status = 'running';
    this.currentNodeIndex++;
    await this.runUntilBreakpoint();
  }

  /**
   * Step into the next node
   */
  async stepInto(): Promise<void> {
    if (this.state.status !== 'paused') return;

    this.state.status = 'stepping';
    await this.executeStep('into');
  }

  /**
   * Step over the current node
   */
  async stepOver(): Promise<void> {
    if (this.state.status !== 'paused') return;

    this.state.status = 'stepping';
    await this.executeStep('over');
  }

  /**
   * Step out of the current function
   */
  async stepOut(): Promise<void> {
    if (this.state.status !== 'paused') return;

    this.state.status = 'stepping';
    await this.executeStep('out');
  }

  /**
   * Stop debugging
   */
  stop(): void {
    this.state.status = 'stopped';
    this.callStack = [];
    this.currentNodeIndex = 0;
    this.emitEvent({ type: 'state-change', data: { status: 'stopped' } });
  }

  /**
   * Pause execution
   */
  pause(): void {
    if (this.state.status === 'running') {
      this.state.status = 'paused';
      this.emitEvent({ type: 'state-change', data: { status: 'paused' } });
    }
  }

  /**
   * Get current debug state
   */
  getState(): DebugState {
    return { ...this.state };
  }

  /**
   * Get call stack
   */
  getCallStack(): StackFrame[] {
    return [...this.callStack];
  }

  /**
   * Get variables at a specific stack frame
   */
  getVariables(frameId?: number): Map<string, unknown> {
    if (frameId !== undefined) {
      const frame = this.callStack.find((f) => f.id === frameId);
      return frame?.variables || new Map();
    }

    // Return all variables from runtime context
    return new Map(this.runtime.getContext().variables);
  }

  /**
   * Evaluate an expression in the current context
   */
  async evaluate(expression: string): Promise<{ value: unknown; error?: string }> {
    try {
      // Try to evaluate as a variable lookup first
      const varValue = this.runtime.getVariable(expression);
      if (varValue !== undefined) {
        return { value: varValue };
      }

      // Try to parse and execute as an expression
      const parseResult = this.parser.parse(expression);
      if (!parseResult.success) {
        return { value: undefined, error: parseResult.errors[0]?.message };
      }

      // Execute the expression
      const results = await this.runtime.executeProgram(parseResult.ast);
      const lastResult = results[results.length - 1];

      return { value: lastResult?.output };
    } catch (error) {
      return { value: undefined, error: String(error) };
    }
  }

  /**
   * Set a watch expression
   */
  watch(expression: string): { id: string; expression: string } {
    const id = `watch_${Date.now()}`;
    return { id, expression };
  }

  /**
   * Register an event handler
   */
  on(event: string, handler: DebugEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  /**
   * Remove an event handler
   */
  off(event: string, handler: DebugEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Get the underlying runtime
   */
  getRuntime(): HoloScriptRuntime {
    return this.runtime;
  }

  // Private methods

  private async runUntilBreakpoint(): Promise<void> {
    while (this.currentNodeIndex < this.currentAST.length) {
      if (this.state.status === 'stopped') break;

      const node = this.currentAST[this.currentNodeIndex];

      // Check for breakpoint
      if (this.shouldBreakAt(node)) {
        this.state.status = 'paused';
        this.updateCurrentState(node);

        const bp = this.findBreakpointAtLine(node.line ?? 0);
        if (bp) {
          bp.hitCount++;
          this.emitEvent({
            type: 'breakpoint-hit',
            data: { breakpoint: bp, node, line: node.line ?? 0 },
          });
        }
        return;
      }

      // Execute the node
      await this.executeNode(node);
      this.currentNodeIndex++;
    }

    // Execution complete
    this.state.status = 'stopped';
    this.emitEvent({ type: 'state-change', data: { status: 'stopped', reason: 'complete' } });
  }

  private async executeStep(mode: StepMode): Promise<void> {
    const startStackDepth = this.callStack.length;

    if (this.currentNodeIndex >= this.currentAST.length) {
      this.state.status = 'stopped';
      return;
    }

    const node = this.currentAST[this.currentNodeIndex];

    switch (mode) {
      case 'into':
        // Execute one node, stepping into function calls
        await this.executeNode(node);
        this.currentNodeIndex++;
        break;

      case 'over':
        // Execute one node, treating function calls as single steps
        await this.executeNode(node);
        this.currentNodeIndex++;
        break;

      case 'out':
        // Execute until we leave the current stack frame
        while (this.currentNodeIndex < this.currentAST.length) {
          await this.executeNode(this.currentAST[this.currentNodeIndex]);
          this.currentNodeIndex++;

          if (this.callStack.length < startStackDepth) {
            break;
          }
        }
        break;
    }

    // Update state after step
    if (this.currentNodeIndex < this.currentAST.length) {
      this.state.status = 'paused';
      this.updateCurrentState(this.currentAST[this.currentNodeIndex]);
      this.emitEvent({
        type: 'step-complete',
        data: { mode, node: this.currentAST[this.currentNodeIndex] },
      });
    } else {
      this.state.status = 'stopped';
      this.emitEvent({ type: 'state-change', data: { status: 'stopped', reason: 'complete' } });
    }
  }

  private async executeNode(node: ASTNode): Promise<void> {
    // Push stack frame for functions
    if (node.type === 'function') {
      const funcNode = node as ASTNode & { name: string };
      this.pushStackFrame(funcNode.name, node);
    }

    try {
      // Execute via runtime
      const result = await this.runtime.executeNode(node);

      if (!result.success && result.error) {
        this.emitEvent({
          type: 'exception',
          data: { error: result.error, node, line: node.line },
        });
      }

      if (result.output !== undefined) {
        this.emitEvent({
          type: 'output',
          data: { output: result.output, node },
        });
      }
    } catch (error) {
      this.emitEvent({
        type: 'exception',
        data: { error: String(error), node, line: node.line },
      });
    }

    // Pop stack frame when function completes
    if (node.type === 'function') {
      this.popStackFrame();
    }
  }

  private shouldBreakAt(node: ASTNode): boolean {
    const line = node.line;

    for (const bp of this.breakpoints.values()) {
      if (!bp.enabled) continue;
      if (bp.line !== line) continue;

      // Check condition if present
      if (bp.condition) {
        try {
          const value = this.runtime.getVariable(bp.condition);
          if (!value) continue;
        } catch {
          continue;
        }
      }

      return true;
    }

    return false;
  }

  private findBreakpointAtLine(line: number): Breakpoint | null {
    for (const bp of this.breakpoints.values()) {
      if (bp.line === line && bp.enabled) {
        return bp;
      }
    }
    return null;
  }

  private pushStackFrame(name: string, node: ASTNode): void {
    const frame: StackFrame = {
      id: ++this.frameIdCounter,
      name,
      file: (node as ASTNode & { file?: string }).file,
      line: node.line ?? 0,
      column: node.column ?? 0,
      variables: new Map(this.runtime.getContext().variables),
      node,
    };

    this.callStack.push(frame);
    this.state.callStack = [...this.callStack];
  }

  private popStackFrame(): StackFrame | undefined {
    const frame = this.callStack.pop();
    this.state.callStack = [...this.callStack];
    return frame;
  }

  private updateCurrentState(node: ASTNode): void {
    this.state.currentLine = node.line ?? 0;
    this.state.currentColumn = node.column ?? 0;
    this.state.currentNode = node;
  }

  private updateBreakpointList(): void {
    this.state.breakpoints = Array.from(this.breakpoints.values());
  }

  private emitEvent(event: DebugEvent): void {
    const handlers = this.eventHandlers.get(event.type) || [];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Debug event handler error:', error);
      }
    }

    // Also emit to 'all' handlers
    const allHandlers = this.eventHandlers.get('all') || [];
    for (const handler of allHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Debug event handler error:', error);
      }
    }
  }
}

/**
 * Create a debugger instance
 */
export function createDebugger(runtime?: HoloScriptRuntime): HoloScriptDebugger {
  return new HoloScriptDebugger(runtime);
}
