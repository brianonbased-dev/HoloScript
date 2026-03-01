/**
 * RPCManager.ts
 *
 * Remote procedure call system: method registration, reliability modes,
 * channel routing, timeout handling, and call tracking.
 *
 * @module networking
 */

// =============================================================================
// TYPES
// =============================================================================

export type ReliabilityMode = 'unreliable' | 'reliable' | 'reliableOrdered';
export type RPCTarget = 'server' | 'client' | 'all' | 'others';

export interface RPCCall {
  id: number;
  method: string;
  args: unknown[];
  senderId: string;
  target: RPCTarget;
  reliability: ReliabilityMode;
  channel: number;
  timestamp: number;
  responded: boolean;
  result?: unknown;
  error?: string;
}

export interface RPCHandler {
  method: string;
  handler: (...args: unknown[]) => unknown;
  reliability: ReliabilityMode;
  channel: number;
  rateLimit: number;         // Max calls per second, 0 = unlimited
}

export interface RPCStats {
  totalCalls: number;
  totalResponses: number;
  totalErrors: number;
  avgResponseTime: number;
  callsPerSecond: number;
}

// =============================================================================
// RPC MANAGER
// =============================================================================

let _rpcId = 0;

export class RPCManager {
  private handlers: Map<string, RPCHandler> = new Map();
  private pendingCalls: Map<number, RPCCall> = new Map();
  private callHistory: RPCCall[] = [];
  private maxHistory = 200;
  private localId: string;
  private defaultTimeout = 5000; // ms
  private rateLimitCounters: Map<string, { count: number; resetAt: number }> = new Map();
  private stats: RPCStats = { totalCalls: 0, totalResponses: 0, totalErrors: 0, avgResponseTime: 0, callsPerSecond: 0 };
  private responseTimes: number[] = [];

  constructor(localId: string) {
    this.localId = localId;
  }

  // ---------------------------------------------------------------------------
  // Handler Registration
  // ---------------------------------------------------------------------------

  register(method: string, handler: (...args: unknown[]) => unknown,
           reliability: ReliabilityMode = 'reliable', channel = 0, rateLimit = 0): void {
    this.handlers.set(method, { method, handler, reliability, channel, rateLimit });
  }

  unregister(method: string): boolean {
    return this.handlers.delete(method);
  }

  hasHandler(method: string): boolean {
    return this.handlers.has(method);
  }

  getRegisteredMethods(): string[] {
    return [...this.handlers.keys()];
  }

  // ---------------------------------------------------------------------------
  // Calling
  // ---------------------------------------------------------------------------

  call(method: string, args: unknown[], target: RPCTarget = 'server'): RPCCall | null {
    const handler = this.handlers.get(method);
    const reliability = handler?.reliability ?? 'reliable';
    const channel = handler?.channel ?? 0;

    // Rate limit check
    if (handler?.rateLimit && handler.rateLimit > 0) {
      const now = Date.now();
      let counter = this.rateLimitCounters.get(method);
      if (!counter || now >= counter.resetAt) {
        counter = { count: 0, resetAt: now + 1000 };
        this.rateLimitCounters.set(method, counter);
      }
      if (counter.count >= handler.rateLimit) {
        return null; // Rate limited
      }
      counter.count++;
    }

    const rpc: RPCCall = {
      id: _rpcId++,
      method,
      args,
      senderId: this.localId,
      target,
      reliability,
      channel,
      timestamp: Date.now(),
      responded: false,
    };

    this.pendingCalls.set(rpc.id, rpc);
    this.stats.totalCalls++;

    this.callHistory.push(rpc);
    if (this.callHistory.length > this.maxHistory) this.callHistory.shift();

    return rpc;
  }

  // ---------------------------------------------------------------------------
  // Execution (called when an RPC message is received)
  // ---------------------------------------------------------------------------

  execute(rpcId: number, method: string, args: unknown[], senderId: string): { result?: unknown; error?: string } {
    const handler = this.handlers.get(method);
    if (!handler) {
      return { error: `Unknown RPC method: ${method}` };
    }

    try {
      const result = handler.handler(...args);
      return { result };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      this.stats.totalErrors++;
      return { error };
    }
  }

  // ---------------------------------------------------------------------------
  // Response Handling
  // ---------------------------------------------------------------------------

  respond(rpcId: number, result?: unknown, error?: string): boolean {
    const call = this.pendingCalls.get(rpcId);
    if (!call) return false;

    call.responded = true;
    call.result = result;
    call.error = error;

    const responseTime = Date.now() - call.timestamp;
    this.responseTimes.push(responseTime);
    if (this.responseTimes.length > 100) this.responseTimes.shift();
    this.stats.avgResponseTime = this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
    this.stats.totalResponses++;

    if (error) this.stats.totalErrors++;

    this.pendingCalls.delete(rpcId);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Timeout Processing
  // ---------------------------------------------------------------------------

  processTimeouts(timeout?: number): RPCCall[] {
    const now = Date.now();
    const maxAge = timeout ?? this.defaultTimeout;
    const timedOut: RPCCall[] = [];

    for (const [id, call] of this.pendingCalls) {
      if (now - call.timestamp > maxAge && !call.responded) {
        call.error = 'RPC timed out';
        call.responded = true;
        timedOut.push(call);
        this.pendingCalls.delete(id);
        this.stats.totalErrors++;
      }
    }

    return timedOut;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getPendingCount(): number { return this.pendingCalls.size; }
  getCallHistory(): RPCCall[] { return [...this.callHistory]; }
  getStats(): RPCStats { return { ...this.stats }; }

  getCallsByMethod(method: string): RPCCall[] {
    return this.callHistory.filter(c => c.method === method);
  }

  setTimeout(ms: number): void { this.defaultTimeout = ms; }

  clear(): void {
    this.pendingCalls.clear();
    this.callHistory = [];
    this.responseTimes = [];
    this.stats = { totalCalls: 0, totalResponses: 0, totalErrors: 0, avgResponseTime: 0, callsPerSecond: 0 };
  }
}
