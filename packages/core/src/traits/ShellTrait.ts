/**
 * ShellTrait — v5.1
 *
 * Subprocess execution for HoloScript compositions. Wraps child_process.spawn
 * with timeout, output capture, and environment configuration.
 * Headless/server-only — not available in browser contexts.
 *
 * Events:
 *  shell:start    { pid, command, args }
 *  shell:stdout   { pid, data }
 *  shell:stderr   { pid, data }
 *  shell:exit     { pid, code, signal, elapsed }
 *  shell:timeout  { pid, command, timeout_ms }
 *  shell:error    { command, error }
 *  shell:exec     (command) Execute a shell command
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface ShellConfig {
  /** Default command to run */
  command: string;
  /** Default arguments */
  args: string[];
  /** Working directory */
  cwd: string;
  /** Timeout in ms (0 = no timeout) */
  timeout_ms: number;
  /** Capture stdout/stderr as events */
  capture_output: boolean;
  /** Additional environment variables */
  env: Record<string, string>;
  /** Maximum output buffer size in bytes */
  max_output_bytes: number;
}

export interface ShellState {
  activeProcesses: Map<
    number,
    {
      pid: number;
      command: string;
      startedAt: number;
      stdout: string;
      stderr: string;
      timer: ReturnType<typeof setTimeout> | null;
    }
  >;
  history: Array<{
    command: string;
    exitCode: number | null;
    elapsed: number;
    timestamp: number;
  }>;
  totalExecutions: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const shellHandler: TraitHandler<ShellConfig> = {
  name: 'shell',

  defaultConfig: {
    command: '',
    args: [],
    cwd: process.cwd?.() ?? '.',
    timeout_ms: 30000,
    capture_output: true,
    env: {},
    max_output_bytes: 1024 * 1024, // 1MB
  },

  onAttach(node: HSPlusNode, _config: ShellConfig, _context: TraitContext): void {
    const state: ShellState = {
      activeProcesses: new Map(),
      history: [],
      totalExecutions: 0,
    };
    node.__shellState = state;
  },

  onDetach(node: HSPlusNode, _config: ShellConfig, _context: TraitContext): void {
    const state: ShellState | undefined = node.__shellState;
    if (state) {
      // Kill all active processes
      for (const [, proc] of state.activeProcesses) {
        if (proc.timer) clearTimeout(proc.timer);
        try {
          process.kill(proc.pid);
        } catch {
          /* best effort */
        }
      }
      state.activeProcesses.clear();
    }
    delete node.__shellState;
  },

  onUpdate(_node: HSPlusNode, _config: ShellConfig, _context: TraitContext, _delta: number): void {
    // Event-driven
  },

  onEvent(node: HSPlusNode, config: ShellConfig, context: TraitContext, event: TraitEvent): void {
    const state: ShellState | undefined = node.__shellState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = (event as any)?.payload ?? event;

    switch (eventType) {
      case 'shell:exec': {
        const command = (payload.command as string) || config.command;
        const args = (payload.args as string[]) || config.args;
        const cwd = (payload.cwd as string) || config.cwd;
        const processCaps = context.hostCapabilities?.process;

        if (!command) {
          context.emit?.('shell:error', { command: '', error: 'No command specified' });
          return;
        }

        // Preferred path: execute through policy-aware host capabilities.
        if (processCaps?.exec) {
          const startedAt = Date.now();
          const pid = Date.now();
          const cmd = `${command} ${args.join(' ')}`.trim();

          state.totalExecutions++;
          context.emit?.('shell:start', { pid, command, args });

          Promise.resolve(
            processCaps.exec(command, args, {
              cwd,
              env: { ...config.env, ...(payload.env ?? {}) },
              timeoutMs: config.timeout_ms,
            })
          )
            .then((result: any) => {
              const stdout = (result?.stdout as string | undefined) ?? '';
              const stderr = (result?.stderr as string | undefined) ?? '';
              const code = (result?.code as number | null | undefined) ?? null;
              const signal = (result?.signal as string | null | undefined) ?? null;
              const elapsed = Date.now() - startedAt;

              if (stdout) context.emit?.('shell:stdout', { pid, data: stdout });
              if (stderr) context.emit?.('shell:stderr', { pid, data: stderr });

              state.history.push({
                command: cmd,
                exitCode: code,
                elapsed,
                timestamp: Date.now(),
              });
              if (state.history.length > 50) state.history.shift();

              context.emit?.('shell:exit', { pid, code, signal, elapsed });
            })
            .catch((err: unknown) => {
              context.emit?.('shell:error', {
                command: cmd,
                error: err?.message ?? String(err),
              });
            });
          break;
        }

        try {
          const { spawn } = require('child_process');
          const env = { ...process.env, ...config.env, ...(payload.env ?? {}) };

          const child = spawn(command, args, {
            cwd,
            env,
            stdio: config.capture_output ? 'pipe' : 'ignore',
            shell: true,
          });

          const startedAt = Date.now();
          const pid = child.pid ?? 0;

          const procEntry = {
            pid,
            command: `${command} ${args.join(' ')}`.trim(),
            startedAt,
            stdout: '',
            stderr: '',
            timer: null as ReturnType<typeof setTimeout> | null,
          };
          state.activeProcesses.set(pid, procEntry);
          state.totalExecutions++;

          context.emit?.('shell:start', { pid, command, args });

          // Timeout
          if (config.timeout_ms > 0) {
            procEntry.timer = setTimeout(() => {
              try {
                child.kill('SIGKILL');
              } catch {
                /* best effort */
              }
              context.emit?.('shell:timeout', {
                pid,
                command: procEntry.command,
                timeout_ms: config.timeout_ms,
              });
            }, config.timeout_ms);
          }

          // Output capture
          if (config.capture_output && child.stdout) {
            child.stdout.on('data', (data: Buffer) => {
              const text = data.toString('utf-8');
              if (procEntry.stdout.length < config.max_output_bytes) {
                procEntry.stdout += text;
              }
              context.emit?.('shell:stdout', { pid, data: text });
            });
          }

          if (config.capture_output && child.stderr) {
            child.stderr.on('data', (data: Buffer) => {
              const text = data.toString('utf-8');
              if (procEntry.stderr.length < config.max_output_bytes) {
                procEntry.stderr += text;
              }
              context.emit?.('shell:stderr', { pid, data: text });
            });
          }

          // Exit
          child.on('close', (code: number | null, signal: string | null) => {
            const elapsed = Date.now() - startedAt;
            if (procEntry.timer) clearTimeout(procEntry.timer);
            state.activeProcesses.delete(pid);

            state.history.push({
              command: procEntry.command,
              exitCode: code,
              elapsed,
              timestamp: Date.now(),
            });
            if (state.history.length > 50) state.history.shift();

            context.emit?.('shell:exit', { pid, code, signal, elapsed });
          });

          child.on('error', (err: unknown) => {
            if (procEntry.timer) clearTimeout(procEntry.timer);
            state.activeProcesses.delete(pid);
            context.emit?.('shell:error', {
              command: procEntry.command,
              error: err.message,
            });
          });
        } catch (err: unknown) {
          context.emit?.('shell:error', { command, error: err.message });
        }
        break;
      }

      case 'shell:kill': {
        const pid = payload.pid as number;
        const proc = state.activeProcesses.get(pid);
        if (proc) {
          if (proc.timer) clearTimeout(proc.timer);
          try {
            process.kill(pid, payload.signal ?? 'SIGTERM');
          } catch {
            /* best effort */
          }
        }
        break;
      }

      case 'shell:get_status': {
        context.emit?.('shell:status', {
          active: state.activeProcesses.size,
          totalExecutions: state.totalExecutions,
          history: state.history.slice(-10),
        });
        break;
      }
    }
  },
};

export default shellHandler;
