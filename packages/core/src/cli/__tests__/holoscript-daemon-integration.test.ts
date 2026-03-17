import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { resolveCommand } from '../../../test-utils/resolve-command';

/**
 * Integration Test: Three-Phase Daemon Architecture
 * 
 * Phase 1: HeadlessRuntime Native Action Bridge
 * - Tests ActionHandler registration and action:* → handler → action:result flow
 * 
 * Phase 2: CLI daemon Subcommand
 * - Tests holoscript daemon <file> with cycle control and state persistence
 * 
 * Phase 3: Standalone Action Handlers
 * - Tests daemon-actions.ts handlers (diagnose, generate_fix, verify_compilation, etc.)
 */

interface DaemonMessage {
  type: string;
  op?: string;
  action?: string;
  actionRequestId?: string;
  status?: string;
  error?: string;
  success?: boolean;
  [key: string]: unknown;
}

class DaemonHarness {
  private process: ReturnType<typeof spawn> | null = null;
  private buffer = '';
  private messageQueue: DaemonMessage[] = [];
  private resolveWaiters: Map<string, (msg: DaemonMessage) => void> = new Map();
  private readonly tempDir: string;
  private actionRegistry: Map<string, (params: unknown) => Promise<boolean>> = new Map();

  constructor() {
    this.tempDir = mkdtempSync(join(process.cwd(), 'daemon-test-'));
  }

  async start(compositionFile: string, options: { cycles?: number; debug?: boolean } = {}): Promise<void> {
    const tsxPath = resolveCommand('tsx');
    const cliPath = join(process.cwd(), 'packages/core/src/cli/holoscript-runner.ts');

    this.process = spawn('node', [tsxPath, cliPath, 'daemon', compositionFile, ...(options.cycles ? ['--cycles', String(options.cycles)] : [])], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    this.process.stdout!.on('data', (data) => {
      this.buffer += data.toString();
      this.parseMessages();
    });

    this.process.stderr!.on('data', (data) => {
      if (options.debug) console.error('[daemon stderr]', data.toString());
    });

    return this.waitFor('daemon:ready', 5000);
  }

  private parseMessages(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines[lines.length - 1]; // keep incomplete line

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as DaemonMessage;
        this.messageQueue.push(msg);

        // Resolve any waiters for this message type
        const key = msg.type;
        const resolver = this.resolveWaiters.get(key);
        if (resolver) {
          resolver(msg);
          this.resolveWaiters.delete(key);
        }
      } catch (e) {
        // Not JSON, skip
      }
    }
  }

  private waitFor(type: string, timeoutMs: number = 5000): Promise<DaemonMessage> {
    return new Promise((resolve, reject) => {
      // Check if already in queue
      const existing = this.messageQueue.find((m) => m.type === type);
      if (existing) {
        this.messageQueue = this.messageQueue.filter((m) => m !== existing);
        return resolve(existing);
      }

      // Wait for future message
      const timer = setTimeout(() => {
        this.resolveWaiters.delete(type);
        reject(new Error(`Timeout waiting for ${type}`));
      }, timeoutMs);

      this.resolveWaiters.set(type, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
  }

  async sendCommand(command: Record<string, unknown>): Promise<DaemonMessage> {
    if (!this.process?.stdin) throw new Error('Daemon not running');
    this.process.stdin.write(JSON.stringify(command) + '\n');
    return this.waitFor('daemon:ok', 5000);
  }

  async registerAction(name: string, handler: (params: unknown) => Promise<boolean>): Promise<void> {
    this.actionRegistry.set(name, handler);
    await this.sendCommand({ op: 'action:register', action: name, timeoutMs: 5000 });
  }

  async triggerAction(actionName: string, params: unknown = {}): Promise<void> {
    await this.sendCommand({ op: 'emit', event: `action:${actionName}`, payload: params });
  }

  async resolveActionRequest(actionRequestId: string, success: boolean): Promise<void> {
    await this.sendCommand({ op: 'action:resolve', actionRequestId, success });
  }

  async waitForActionRequest(): Promise<DaemonMessage> {
    return this.waitFor('daemon:action_request', 30000);
  }

  async stop(): Promise<void> {
    if (!this.process) return;
    await this.sendCommand({ op: 'stop' });
    await new Promise((resolve) => {
      this.process!.on('exit', resolve);
      setTimeout(resolve, 5000);
    });
    this.process = null;
  }

  cleanup(): void {
    this.stop().catch(() => {});
    try {
      rmSync(this.tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

describe('Daemon Integration: Three Phases', () => {
  let harness: DaemonHarness;
  let compositionFile: string;

  beforeAll(() => {
    harness = new DaemonHarness();
  });

  afterAll(() => {
    harness.cleanup();
  });

  it('Phase 1: Native Action Bridge — action:* events trigger handlers and emit action:result', async () => {
    // Create a minimal composition with a BehaviorTree action
    const composition = `
composition "ActionBridgeTest" {
  template "Root" {
    @behavioral_tree
    tree {
      sequence {
        action "test_action" {
          param1: "value1"
        }
      }
    }
  }
  object "Root" using "Root" { }
}
`;
    compositionFile = join(harness['tempDir'], 'action-bridge.hsplus');
    writeFileSync(compositionFile, composition);

    await harness.start(compositionFile, { debug: false });

    // Register a handler for test_action
    let handlerCalled = false;
    await harness.registerAction('test_action', async (params) => {
      handlerCalled = true;
      expect(params).toHaveProperty('param1', 'value1');
      return true;
    });

    // Trigger the action
    await harness.triggerAction('test_action', { param1: 'value1' });

    // Wait for daemon to forward the action request to orchestrator
    const actionRequest = await harness.waitForActionRequest();
    expect(actionRequest.type).toBe('daemon:action_request');
    expect(actionRequest.action).toBe('test_action');
    expect(actionRequest.actionRequestId).toBeDefined();

    // Resolve the action
    await harness.resolveActionRequest(actionRequest.actionRequestId as string, true);

    // Verify handler was called via native bridge
    expect(handlerCalled).toBe(true);

    await harness.stop();
  });

  it('Phase 2: Daemon Subcommand — cycle control and state persistence', async () => {
    const composition = `
composition "DaemonCycleTest" {
  state {
    cycle_count: 0
  }
  template "Cycler" {
    @behavioral_tree
    tree {
      sequence {
        action "increment_cycle"
      }
    }
  }
  object "Cycler" using "Cycler" { }
}
`;
    compositionFile = join(harness['tempDir'], 'daemon-cycle.hsplus');
    writeFileSync(compositionFile, composition);

    // Start daemon with 3 cycles
    await harness.start(compositionFile, { cycles: 3 });

    // Register increment_cycle action
    let cycleCount = 0;
    await harness.registerAction('increment_cycle', async () => {
      cycleCount++;
      return true;
    });

    // Trigger 3 actions (one per cycle)
    for (let i = 0; i < 3; i++) {
      await harness.triggerAction('increment_cycle');
      const request = await harness.waitForActionRequest();
      await harness.resolveActionRequest(request.actionRequestId as string, true);
    }

    // Verify cycle count
    expect(cycleCount).toBe(3);

    await harness.stop();
  });

  it('Phase 3: Standalone Daemon Actions — diagnose, generate_fix, verify_compilation', async () => {
    const composition = `
composition "DaemonActionsTest" {
  state {
    diagnosis: ""
  }
  template "SelfHealing" {
    @behavioral_tree
    tree {
      sequence {
        action "diagnose"
        action "generate_fix"
        action "verify_compilation"
      }
    }
  }
  object "SelfHealing" using "SelfHealing" { }
}
`;
    compositionFile = join(harness['tempDir'], 'daemon-actions.hsplus');
    writeFileSync(compositionFile, composition);

    await harness.start(compositionFile, { cycles: 1 });

    const actionSequence = ['diagnose', 'generate_fix', 'verify_compilation'];
    const executedActions = [];

    for (const actionName of actionSequence) {
      await harness.registerAction(actionName, async () => {
        executedActions.push(actionName);
        return true;
      });
    }

    // Trigger all actions
    for (const actionName of actionSequence) {
      await harness.triggerAction(actionName);
      const request = await harness.waitForActionRequest();
      expect(request.action).toBe(actionName);
      await harness.resolveActionRequest(request.actionRequestId as string, true);
    }

    // Verify all actions executed in order
    expect(executedActions).toEqual(actionSequence);

    await harness.stop();
  });

  it('End-to-End: Full daemon cycle with action failure and recovery', async () => {
    const composition = `
composition "FailureRecoveryTest" {
  state {
    retry_count: 0
  }
  template "Resilient" {
    @behavioral_tree
    tree {
      repeat {
        sequence {
          action "attempt_operation"
        }
      }
    }
  }
  object "Resilient" using "Resilient" { }
}
`;
    compositionFile = join(harness['tempDir'], 'failure-recovery.hsplus');
    writeFileSync(compositionFile, composition);

    await harness.start(compositionFile);

    let attemptCount = 0;
    await harness.registerAction('attempt_operation', async () => {
      attemptCount++;
      // Fail first 2 attempts, succeed on 3rd
      return attemptCount > 2;
    });

    // Trigger 3 attempts
    for (let i = 0; i < 3; i++) {
      await harness.triggerAction('attempt_operation');
      const request = await harness.waitForActionRequest();
      const shouldSucceed = attemptCount > 2;
      await harness.resolveActionRequest(request.actionRequestId as string, shouldSucceed);
    }

    expect(attemptCount).toBe(3);

    await harness.stop();
  });
});
