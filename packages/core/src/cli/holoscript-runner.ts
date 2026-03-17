#!/usr/bin/env node
/**
 * HoloScript Headless Runner — CLI entry point
 *
 * Usage:
 *   holoscript run script.hs                          # Default headless
 *   holoscript run script.hs --target node             # Compile to Node.js
 *   holoscript run script.hs --target python           # Compile to Python
 *   holoscript run script.hs --profile minimal         # With physics
 *   holoscript run script.hs --debug                   # Verbose output
 *   holoscript test script.hs                          # Run @script_test blocks
 *
 * Supports .hs, .hsplus, and .holo files.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { spawn } from 'child_process';
import { createHeadlessRuntime, getProfile, HEADLESS_PROFILE } from '../runtime/HeadlessRuntime';
import { createHeadlessRuntime as createProfileRuntime } from '../runtime/profiles/HeadlessRuntime';
import { HEADLESS_PROFILE as PROFILES_HEADLESS } from '../runtime/profiles/RuntimeProfile';
import { InteropContext } from '../interop/Interoperability';
import { parse } from '../parser/HoloScriptPlusParser';
import { ScriptTestRunner } from '../traits/ScriptTestTrait';
import { AbsorbProcessor } from '../traits/AbsorbTrait';
import { HotReloadWatcher } from '../traits/HotReloadTrait';
import type { HostCapabilities } from '../traits/TraitTypes';
import { createDaemonActions } from './daemon-actions';
import type { DaemonConfig, DaemonHost, LLMProvider } from './daemon-actions';

// ── Argument parsing ────────────────────────────────────────────────────────
interface CLIOptions {
  command: 'run' | 'test' | 'compile' | 'absorb' | 'daemon' | 'holodaemon' | 'help';
  file?: string;
  target: 'node' | 'python' | 'ros2' | 'headless';
  profile: string;
  debug: boolean;
  output?: string;
  watch: boolean;
  daemon: boolean;
  ticks: number;
  // Daemon-specific options
  cycles: number;
  commit: boolean;
  trial?: number;
  model: string;
}

function parseArgs(argv: string[]): CLIOptions {
  const args = argv.slice(2);
  const opts: CLIOptions = {
    command: 'help',
    target: 'headless',
    profile: 'headless',
    debug: false,
    watch: false,
    daemon: false,
    ticks: 100,
    cycles: 15,
    commit: false,
    model: 'claude-sonnet-4-20250514',
  };

  if (args.length === 0) return opts;

  // First arg is command
  const cmd = args[0];
  if (cmd === 'run' || cmd === 'test' || cmd === 'compile' || cmd === 'absorb' || cmd === 'daemon' || cmd === 'holodaemon') {
    opts.command = cmd;
  }

  // Second arg is file path
  if (args[1] && !args[1].startsWith('--')) {
    opts.file = args[1];
  }

  // Parse flags
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && args[i + 1]) opts.target = args[++i] as CLIOptions['target'];
    if (args[i] === '--profile' && args[i + 1]) opts.profile = args[++i];
    if (args[i] === '--output' && args[i + 1]) opts.output = args[++i];
    if (args[i] === '--debug' || args[i] === '--verbose') opts.debug = true;
    if (args[i] === '--watch' || args[i] === '-w') opts.watch = true;
    if (args[i] === '--daemon') opts.daemon = true;
    if (args[i] === '--ticks' && args[i + 1]) {
      const parsed = Number(args[++i]);
      if (Number.isFinite(parsed) && parsed >= 0) {
        opts.ticks = Math.floor(parsed);
      }
    }
    if (args[i] === '--cycles' && args[i + 1]) {
      const parsed = Number(args[++i]);
      if (Number.isFinite(parsed) && parsed > 0) {
        opts.cycles = Math.floor(parsed);
      }
    }
    if (args[i] === '--commit') opts.commit = true;
    if (args[i] === '--trial' && args[i + 1]) {
      opts.trial = Number(args[++i]);
    }
    if (args[i] === '--model' && args[i + 1]) {
      opts.model = args[++i];
    }
  }

  return opts;
}

function createNodeHostCapabilities(cwd: string): HostCapabilities {
  return {
    fileSystem: {
      readFile: (filePath: string) => fs.readFileSync(path.resolve(cwd, filePath), 'utf-8'),
      writeFile: (filePath: string, content: string) => {
        fs.writeFileSync(path.resolve(cwd, filePath), content, 'utf-8');
      },
      deleteFile: (filePath: string) => {
        fs.rmSync(path.resolve(cwd, filePath), { force: true });
      },
      exists: (filePath: string) => fs.existsSync(path.resolve(cwd, filePath)),
    },
    process: {
      exec: (command: string, args: string[] = [], options?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number }) =>
        new Promise((resolve, reject) => {
          const child = spawn(command, args, {
            cwd: options?.cwd ?? cwd,
            env: { ...process.env, ...(options?.env ?? {}) },
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
          });

          let stdout = '';
          let stderr = '';
          let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

          child.stdout?.on('data', (data: Buffer) => {
            stdout += data.toString('utf-8');
          });
          child.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString('utf-8');
          });

          if (options?.timeoutMs && options.timeoutMs > 0) {
            timeoutHandle = setTimeout(() => {
              try {
                child.kill('SIGKILL');
              } catch {
                // best effort
              }
            }, options.timeoutMs);
          }

          child.on('close', (code: number | null, signal: string | null) => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            resolve({ code, signal, stdout, stderr });
          });

          child.on('error', (error) => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            reject(error);
          });
        }),
    },
    network: {
      fetch: async (url: string, options?: { method?: string; headers?: Record<string, string>; body?: string; credentials?: 'omit' | 'same-origin' | 'include' }) => {
        if (typeof fetch === 'undefined') {
          throw new Error('fetch is not available in this runtime');
        }

        const response = await fetch(url, {
          method: options?.method,
          headers: options?.headers,
          body: options?.body,
          credentials: options?.credentials,
        });

        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });

        const contentType = headers['content-type'] ?? '';
        let body: unknown;
        let text: string | undefined;
        let json: unknown;

        if (contentType.includes('application/json')) {
          try {
            json = await response.json();
            body = json;
          } catch {
            text = await response.text();
            body = text;
          }
        } else {
          text = await response.text();
          body = text;
        }

        return {
          status: response.status,
          ok: response.ok,
          headers,
          body,
          text,
          json,
        };
      },
    },
  };
}

function runTicks(runtime: { tick: () => void }, count: number): void {
  for (let i = 0; i < count; i++) {
    runtime.tick();
  }
}

async function runDaemon(runtime: any, opts: CLIOptions): Promise<void> {
  const supportsEvents = typeof runtime.emit === 'function';
  const supportsStats = typeof runtime.getStats === 'function';
  const supportsActionRegistry = typeof runtime.registerAction === 'function';
  const supportsSubscriptions = typeof runtime.on === 'function';

  const pendingActionResolutions = new Map<
    string,
    {
      resolve: (value: boolean) => void;
      reject: (reason?: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
      runtimeRequestId: string;
      actionName: string;
    }
  >();
  const registeredActions = new Set<string>();
  let nextActionId = 1;

  const send = (message: Record<string, unknown>) => {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  };

  const unsubscribeActionResult = supportsSubscriptions
    ? runtime.on('action:result', (payload: unknown) => {
        send({
          type: 'daemon:action_result',
          payload,
        });
      })
    : () => {};

  send({
    type: 'daemon:ready',
    profile: opts.profile,
    supportsEvents,
    supportsStats,
    supportsActionRegistry,
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  const close = () => {
    for (const [, pending] of pendingActionResolutions) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Daemon shutting down'));
    }
    pendingActionResolutions.clear();

    try {
      unsubscribeActionResult();
    } catch {
      // best effort
    }

    try {
      runtime.stop();
    } catch {
      // best effort
    }
    rl.close();
  };

  process.once('SIGINT', () => {
    send({ type: 'daemon:stopped', reason: 'SIGINT' });
    close();
  });
  process.once('SIGTERM', () => {
    send({ type: 'daemon:stopped', reason: 'SIGTERM' });
    close();
  });

  rl.on('line', (line: string) => {
    const raw = line.trim();
    if (!raw) return;

    let command: any;
    try {
      command = JSON.parse(raw);
    } catch {
      send({ type: 'daemon:error', error: 'Invalid JSON command' });
      return;
    }

    const op = command?.op;
    switch (op) {
      case 'tick': {
        const count = Number.isFinite(command?.count) ? Math.max(0, Math.floor(command.count)) : 1;
        runTicks(runtime, count);
        send({ type: 'daemon:ok', op, ticked: count, stats: runtime.getStats?.() });
        break;
      }
      case 'emit': {
        if (!supportsEvents) {
          send({ type: 'daemon:error', op, error: 'Runtime does not expose emit()' });
          break;
        }
        runtime.emit(command.event, command.payload);
        send({ type: 'daemon:ok', op, event: command.event });
        break;
      }
      case 'state:get': {
        const key = command?.key;
        const value = typeof key === 'string' ? runtime.getState(key) : runtime.getAllState?.();
        send({ type: 'daemon:ok', op, key, value });
        break;
      }
      case 'state:set': {
        const key = command?.key;
        if (typeof key === 'string') {
          runtime.setState(key, command.value);
          send({ type: 'daemon:ok', op, key });
        } else {
          send({ type: 'daemon:error', op, error: 'state:set requires string key' });
        }
        break;
      }
      case 'stats': {
        send({ type: 'daemon:ok', op, stats: runtime.getStats?.() });
        break;
      }
      case 'action:register': {
        if (!supportsActionRegistry) {
          send({ type: 'daemon:error', op, error: 'Runtime does not expose registerAction()' });
          break;
        }

        const actionName = command?.name;
        if (typeof actionName !== 'string' || actionName.trim() === '') {
          send({ type: 'daemon:error', op, error: 'action:register requires non-empty name' });
          break;
        }

        runtime.registerAction(actionName, (params: Record<string, unknown>, blackboard: Record<string, unknown>) => {
          const actionRequestId = `daemon-action-${nextActionId++}`;
          const timeoutMs = Number.isFinite(command?.timeoutMs) ? Math.max(1, Math.floor(command.timeoutMs)) : 30000;

          return new Promise<boolean>((resolve, reject) => {
            const timer = setTimeout(() => {
              pendingActionResolutions.delete(actionRequestId);
              resolve(false);
              send({
                type: 'daemon:action_timeout',
                action: actionName,
                actionRequestId,
                timeoutMs,
              });
            }, timeoutMs);

            pendingActionResolutions.set(actionRequestId, {
              resolve,
              reject,
              timer,
              runtimeRequestId: actionRequestId,
              actionName,
            });

            send({
              type: 'daemon:action_request',
              action: actionName,
              actionRequestId,
              params,
              blackboard,
            });
          });
        });

        registeredActions.add(actionName);
        send({ type: 'daemon:ok', op, name: actionName });
        break;
      }
      case 'action:list': {
        send({
          type: 'daemon:ok',
          op,
          actions: [...registeredActions],
          pending: pendingActionResolutions.size,
        });
        break;
      }
      case 'action:resolve': {
        const actionRequestId = command?.actionRequestId;
        if (typeof actionRequestId !== 'string') {
          send({ type: 'daemon:error', op, error: 'action:resolve requires actionRequestId' });
          break;
        }

        const pending = pendingActionResolutions.get(actionRequestId);
        if (!pending) {
          send({ type: 'daemon:error', op, error: `Unknown actionRequestId: ${actionRequestId}` });
          break;
        }

        clearTimeout(pending.timer);
        pendingActionResolutions.delete(actionRequestId);

        const status = command?.status;
        const success =
          typeof command?.success === 'boolean'
            ? command.success
            : status === 'success' || status === true;

        pending.resolve(Boolean(success));
        send({ type: 'daemon:ok', op, actionRequestId, success: Boolean(success) });
        break;
      }
      case 'action:unregister': {
        if (!supportsActionRegistry) {
          send({ type: 'daemon:error', op, error: 'Runtime does not expose registerAction()' });
          break;
        }

        const actionName = command?.name;
        if (typeof actionName !== 'string' || actionName.trim() === '') {
          send({ type: 'daemon:error', op, error: 'action:unregister requires non-empty name' });
          break;
        }

        runtime.registerAction(actionName, () => false);
        registeredActions.delete(actionName);
        send({ type: 'daemon:ok', op, name: actionName });
        break;
      }
      case 'stop': {
        send({ type: 'daemon:stopped', reason: 'command' });
        close();
        break;
      }
      default:
        send({ type: 'daemon:error', error: `Unknown op: ${String(op)}` });
    }
  });

  await new Promise<void>((resolve) => {
    rl.once('close', () => resolve());
  });
}

// ── Commands ────────────────────────────────────────────────────────────────

async function runScript(opts: CLIOptions): Promise<void> {
  if (!opts.file) {
    console.error('Error: No input file specified');
    process.exit(1);
  }

  const filePath = path.resolve(opts.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath);

  console.log(`[holoscript] Running ${path.basename(filePath)} (target: ${opts.target})`);

  // Parse the source
  const ast = parse(source);

  if (opts.debug) {
    console.log(`[holoscript] Parsed ${ast.body?.length || 0} top-level nodes`);
    console.log(`[holoscript] File type: ${ext}`);
  }

  // Create runtime
  const profile = opts.profile === 'headless' ? HEADLESS_PROFILE : getProfile(opts.profile);
  const runtime = createHeadlessRuntime(ast, {
    profile,
    tickRate: 10,
    debug: opts.debug,
    hostCapabilities: createNodeHostCapabilities(path.dirname(filePath)),
  });

  // Set up interop context
  const _interop = new InteropContext(path.dirname(filePath));

  if (opts.debug) {
    console.log(`[holoscript] Profile: ${profile.name}`);
    console.log(`[holoscript] Interop context: ${path.dirname(filePath)}`);
  }

  // Run
  runtime.start();

  if (opts.daemon) {
    if (opts.debug) {
      console.log('[holoscript] Entering daemon mode');
    }
    await runDaemon(runtime as any, opts);
    return;
  }

  // For headless scripts, run a fixed number of ticks then stop
  runTicks(runtime, opts.ticks);

  runtime.stop();

  // Report
  const stats = runtime.getStats();
  console.log(`[holoscript] Complete — ${stats.tickCount} ticks, ${stats.nodesProcessed} nodes processed`);

  // Watch mode: re-run on file changes
  if (opts.watch) {
    console.log(`[holoscript] Watching for changes... (Ctrl+C to stop)`);
    const watcher = new HotReloadWatcher({
      watchPaths: [path.dirname(filePath)],
      extensions: ['.hs', '.hsplus', '.holo'],
      debounceMs: 300,
      mode: 'soft',
    });

    watcher.on('reload', async (event: { filePath: string }) => {
      console.log(`\n[holoscript] File changed: ${path.basename(event.filePath)}`);
      console.log(`[holoscript] Re-running ${path.basename(filePath)}...`);

      try {
        const newSource = fs.readFileSync(filePath, 'utf-8');
        const newAst = parse(newSource);
        const newRuntime = createHeadlessRuntime(newAst, {
          profile: opts.profile === 'headless' ? HEADLESS_PROFILE : getProfile(opts.profile),
          tickRate: 10,
          debug: opts.debug,
          hostCapabilities: createNodeHostCapabilities(path.dirname(filePath)),
        });
        newRuntime.start();
        runTicks(newRuntime, opts.ticks);
        newRuntime.stop();
        const newStats = newRuntime.getStats();
        console.log(`[holoscript] Complete — ${newStats.tickCount} ticks, ${newStats.nodesProcessed} nodes`);
      } catch (err: unknown) {
        console.error(`[holoscript] Error:`, (err as Error).message);
      }
    });

    watcher.start();

    // Keep process alive
    await new Promise(() => {});
  }
}

async function testScript(opts: CLIOptions): Promise<void> {
  if (!opts.file) {
    console.error('Error: No test file specified');
    process.exit(1);
  }

  const filePath = path.resolve(opts.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(filePath, 'utf-8');

  console.log(`[holoscript test] Running tests in ${path.basename(filePath)}`);

  // Parse and create a headless runtime to populate state for assertions
  const ast = parse(source);
  const profile = HEADLESS_PROFILE;
  const runtime = createHeadlessRuntime(ast, { profile, tickRate: 10, debug: opts.debug });
  runtime.start();
  for (let i = 0; i < 50; i++) runtime.tick();

  const runner = new ScriptTestRunner({
    debug: opts.debug,
    runtimeState: runtime.getAllState(),
  });
  const results = runner.runTestsFromSource(source, filePath);

  // Report
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  console.log('');
  for (const result of results) {
    const icon = result.status === 'passed' ? '✓' : result.status === 'failed' ? '✗' : '○';
    const color = result.status === 'passed' ? '\x1b[32m' : result.status === 'failed' ? '\x1b[31m' : '\x1b[33m';
    console.log(`  ${color}${icon}\x1b[0m ${result.name} (${result.durationMs}ms)`);
    if (result.error) {
      console.log(`    \x1b[31m${result.error}\x1b[0m`);
    }
  }

  console.log('');
  console.log(`Tests: ${passed} passed, ${failed} failed, ${skipped} skipped (${results.length} total)`);

  if (failed > 0) process.exit(1);
}

function compileScript(opts: CLIOptions): void {
  if (!opts.file) {
    console.error('Error: No input file specified');
    process.exit(1);
  }

  const filePath = path.resolve(opts.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(filePath, 'utf-8');
  const ast = parse(source);
  const outputPath = opts.output || filePath.replace(/\.(hs|hsplus|holo)$/, `.${opts.target === 'python' ? 'py' : 'js'}`);

  console.log(`[holoscript compile] ${path.basename(filePath)} → ${opts.target} → ${path.basename(outputPath)}`);

  // Generate target output
  let output: string;
  switch (opts.target) {
    case 'node':
      output = generateNodeTarget(ast);
      break;
    case 'python':
      output = generatePythonTarget(ast);
      break;
    default:
      output = JSON.stringify(ast, null, 2);
  }

  fs.writeFileSync(outputPath, output, 'utf-8');
  console.log(`[holoscript compile] Written to ${outputPath}`);
}

function generateNodeTarget(ast: any): string {
  const lines: string[] = [
    '// Auto-generated by holoscript compile --target node',
    '// Source: HoloScript composition',
    `"use strict";`,
    '',
  ];

  if (ast.body) {
    for (const node of ast.body) {
      if (node.type === 'composition' || node.type === 'ObjectDeclaration') {
        lines.push(`// ${node.type}: ${node.name || 'unnamed'}`);
        lines.push(`module.exports.${node.name || 'default'} = ${JSON.stringify(node, null, 2)};`);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function generatePythonTarget(ast: any): string {
  const lines: string[] = [
    '# Auto-generated by holoscript compile --target python',
    '# Source: HoloScript composition',
    'import json',
    '',
  ];

  if (ast.body) {
    for (const node of ast.body) {
      if (node.type === 'composition' || node.type === 'ObjectDeclaration') {
        const name = node.name || 'default_obj';
        lines.push(`# ${node.type}: ${name}`);
        lines.push(`${name} = json.loads('''${JSON.stringify(node)}''')`);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function absorbScript(opts: CLIOptions): void {
  if (!opts.file) {
    console.error('Error: No source file specified');
    process.exit(1);
  }

  const filePath = path.resolve(opts.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();

  // Auto-detect language from extension
  const langMap: Record<string, 'python' | 'typescript' | 'javascript'> = {
    '.py': 'python',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
  };

  const language = langMap[ext];
  if (!language) {
    console.error(`Error: Unsupported file type '${ext}'. Supported: .py, .ts, .tsx, .js, .jsx, .mjs`);
    process.exit(1);
  }

  const outputPath = opts.output || filePath.replace(/\.\w+$/, '.hsplus');
  console.log(`[holoscript absorb] ${path.basename(filePath)} (${language}) → ${path.basename(outputPath)}`);

  const processor = new AbsorbProcessor();
  const result = processor.absorb({ language, filePath, content });

  // Write output
  fs.writeFileSync(outputPath, result.generatedHSPlus, 'utf-8');

  // Report
  console.log(`[holoscript absorb] Extracted:`);
  console.log(`  ${result.functions.length} functions`);
  console.log(`  ${result.classes.length} classes`);
  console.log(`  ${result.imports.length} imports`);
  console.log(`  ${result.constants.length} constants`);

  if (result.warnings.length > 0) {
    console.log(`\n  Warnings:`);
    for (const w of result.warnings) {
      console.log(`    ⚠ ${w}`);
    }
  }

  console.log(`[holoscript absorb] Written to ${outputPath}`);
}

// ── Daemon subcommand ───────────────────────────────────────────────────────

function findGitRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  return startDir;
}

async function daemonScript(opts: CLIOptions): Promise<void> {
  if (!opts.file) {
    console.error('Error: No composition file specified');
    process.exit(1);
  }

  const filePath = path.resolve(opts.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const repoRoot = findGitRoot(path.dirname(filePath));
  const source = fs.readFileSync(filePath, 'utf-8');
  const parseResult = parse(source);

  if (!parseResult.success || !parseResult.ast) {
    const errors = parseResult.errors?.map((e: { message: string }) => e.message).join(', ') || 'unknown';
    console.error(`[daemon] Parse failed: ${errors}`);
    process.exit(1);
  }

  const compositionAST = parseResult.ast as Record<string, unknown>;

  console.log(`[daemon] Composition: ${path.basename(filePath)}`);
  console.log(`[daemon] Repo root: ${repoRoot}`);
  console.log(`[daemon] Cycles: ${opts.cycles} | Commit: ${opts.commit} | Model: ${opts.model}`);

  // State directory
  const stateDir = path.join(repoRoot, '.holoscript');
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });

  // Lock file (W.090: prevent orphaned daemons)
  const lockFile = path.join(stateDir, 'daemon.lock');
  const lockData = { pid: process.pid, time: Date.now(), heartbeat: Date.now() };

  if (fs.existsSync(lockFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
      const staleMs = 120_000;
      if (Date.now() - existing.heartbeat < staleMs) {
        console.error(`[daemon] Another daemon is running (PID ${existing.pid}). Remove ${lockFile} to force.`);
        process.exit(1);
      }
      console.log(`[daemon] Reclaiming stale lock from PID ${existing.pid}`);
    } catch {
      // Corrupt lock file, reclaim
    }
  }
  fs.writeFileSync(lockFile, JSON.stringify(lockData), 'utf-8');

  // Heartbeat timer
  const heartbeatTimer = setInterval(() => {
    try {
      fs.writeFileSync(lockFile, JSON.stringify({ ...lockData, heartbeat: Date.now() }), 'utf-8');
    } catch {
      // best effort
    }
  }, 30_000);

  const cleanup = () => {
    clearInterval(heartbeatTimer);
    try { fs.rmSync(lockFile, { force: true }); } catch { /* best effort */ }
  };
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
  process.once('uncaughtException', (err) => { cleanup(); console.error('[daemon] Uncaught:', err); process.exit(1); });
  process.once('unhandledRejection', (err) => { cleanup(); console.error('[daemon] Unhandled:', err); process.exit(1); });

  // Create host capabilities
  const host: DaemonHost = {
    readFile: (p) => fs.readFileSync(path.resolve(repoRoot, p), 'utf-8'),
    writeFile: (p, c) => fs.writeFileSync(path.resolve(repoRoot, p), c, 'utf-8'),
    exists: (p) => fs.existsSync(path.resolve(repoRoot, p)),
    exec: (cmd, args = [], execOpts = {}) =>
      new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
          cwd: execOpts.cwd ?? repoRoot,
          shell: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let timer: ReturnType<typeof setTimeout> | null = null;
        child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf-8'); });
        child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf-8'); });
        if (execOpts.timeoutMs && execOpts.timeoutMs > 0) {
          timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* */ } }, execOpts.timeoutMs);
        }
        child.on('close', (code) => {
          if (timer) clearTimeout(timer);
          resolve({ code, stdout, stderr });
        });
        child.on('error', reject);
      }),
  };

  // LLM provider (Anthropic Messages API via fetch)
  const llm: LLMProvider = {
    chat: async ({ system, prompt, maxTokens }) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: maxTokens || 4096,
          system,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Anthropic API ${response.status}: ${body.slice(0, 200)}`);
      }

      const data = await response.json() as {
        content?: Array<{ text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      return {
        text: data.content?.[0]?.text || '',
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      };
    },
  };

  // Daemon configuration
  const focusRotation = ['typefix', 'coverage', 'typefix', 'docs', 'typefix', 'complexity', 'all'];
  const config: DaemonConfig = {
    repoRoot,
    commit: opts.commit,
    model: opts.model,
    verbose: opts.debug,
    trial: opts.trial,
    focusRotation,
    stateDir,
  };

  // Create action handlers
  const actions = createDaemonActions(host, llm, config);

  // Load persisted daemon state
  const stateFile = path.join(stateDir, 'daemon-state.json');
  let daemonState = {
    totalCycles: 0, focusIndex: 0, bestQuality: 0, lastQuality: 0,
    totalCostUSD: 0, totalInputTokens: 0, totalOutputTokens: 0,
  };
  if (fs.existsSync(stateFile)) {
    try {
      daemonState = { ...daemonState, ...JSON.parse(fs.readFileSync(stateFile, 'utf-8')) };
    } catch { /* use defaults */ }
  }

  // API credit pre-check (W.090: 1-token validation call)
  try {
    await llm.chat({ system: 'reply ok', prompt: 'ok', maxTokens: 1 });
    console.log('[daemon] API key validated');
  } catch (err: unknown) {
    console.error(`[daemon] API key validation failed: ${(err as Error).message}`);
    cleanup();
    process.exit(1);
  }

  // ── Cycle loop ──────────────────────────────────────────────────────────

  for (let cycle = 0; cycle < opts.cycles; cycle++) {
    const focusIdx = (daemonState.focusIndex + cycle) % focusRotation.length;
    const focus = focusRotation[focusIdx];
    const cycleStart = Date.now();

    console.log(`\n[daemon] === Cycle ${cycle + 1}/${opts.cycles} | Focus: ${focus} ===`);

    // Fresh AST per cycle (deep clone for clean BT state)
    // Note: JSON clone strips Maps, so materializeTraits must run after clone
    const cycleAST = JSON.parse(JSON.stringify(compositionAST));
    materializeTraits(cycleAST);

    // Set focus in AST blackboard before runtime creation
    setASTBlackboard(cycleAST, {
      focus,
      cycleNumber: daemonState.totalCycles + cycle,
      quality_before: daemonState.lastQuality,
    });

    // Create runtime with profile-aware HeadlessRuntime (auto-tick via setInterval)
    const runtime = createProfileRuntime(cycleAST, {
      profile: PROFILES_HEADLESS,
      tickRate: 10,
      debug: opts.debug,
      hostCapabilities: createNodeHostCapabilities(repoRoot),
    });

    // Register all action handlers
    for (const [name, handler] of Object.entries(actions)) {
      runtime.registerAction(name, handler);
    }

    // Wait for BT completion or timeout
    const maxWaitMs = 10 * 60 * 1000; // 10 minutes max per cycle
    const btResult = await new Promise<{ status: string; blackboard: Record<string, unknown> }>((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ status: 'timeout', blackboard: {} });
        }
      }, maxWaitMs);

      runtime.on('bt_complete', (payload: unknown) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          const p = payload as { status?: string; blackboard?: Record<string, unknown> } | undefined;
          resolve({
            status: p?.status || 'unknown',
            blackboard: p?.blackboard || {},
          });
        }
      });

      // Start runtime — auto-ticks at tickRate Hz
      runtime.start();
    });

    runtime.stop();

    const btStatus = btResult.status;
    const btBlackboard = btResult.blackboard;

    // Extract results
    const durationSec = ((Date.now() - cycleStart) / 1000).toFixed(1);
    const stats = runtime.getStats();
    const inputTokens = (btBlackboard.inputTokens as number) || 0;
    const outputTokens = (btBlackboard.outputTokens as number) || 0;
    const qualityAfter = (btBlackboard.quality_after as number) || daemonState.lastQuality;

    console.log(
      `[daemon] Cycle ${cycle + 1} done in ${durationSec}s | ` +
      `${stats.updateCount} ticks | BT: ${btStatus} | quality: ${qualityAfter.toFixed(3)}`,
    );

    // Update persisted state
    daemonState.totalCycles++;
    daemonState.focusIndex = focusIdx + 1;
    daemonState.lastQuality = qualityAfter;
    if (qualityAfter > daemonState.bestQuality) {
      daemonState.bestQuality = qualityAfter;
    }
    daemonState.totalInputTokens += inputTokens;
    daemonState.totalOutputTokens += outputTokens;

    const costUSD = (inputTokens * 3 / 1_000_000) + (outputTokens * 15 / 1_000_000);
    daemonState.totalCostUSD += costUSD;

    fs.writeFileSync(stateFile, JSON.stringify(daemonState, null, 2), 'utf-8');
  }

  cleanup();

  console.log(`\n[daemon] All ${opts.cycles} cycles complete.`);
  console.log(
    `[daemon] Best quality: ${daemonState.bestQuality.toFixed(3)} | ` +
    `Total cost: $${daemonState.totalCostUSD.toFixed(3)} | ` +
    `Total cycles: ${daemonState.totalCycles}`,
  );
}

/**
 * Convert parsed directives to traits Map on each node.
 * The parser stores @trait directives in the directives[] array,
 * but HeadlessRuntime expects node.traits as a Map<string, unknown>.
 * This mirrors R3FCompiler's conversion (R3FCompiler.ts:2208-2219).
 */
function materializeTraits(ast: unknown): void {
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;

    // Rebuild traits Map from directives (Maps don't survive JSON clone)
    const traits = new Map<string, unknown>();
    if (Array.isArray(n.directives)) {
      for (const directive of n.directives) {
        const d = directive as Record<string, unknown>;
        if (d.type === 'trait' && typeof d.name === 'string') {
          traits.set(d.name, d.config ?? {});
        }
      }
    }

    // Replace traits: always set a Map (empty or populated) to avoid
    // plain {} left by JSON.parse(JSON.stringify(Map)) being non-iterable
    if (traits.size > 0) {
      n.traits = traits;
    } else if (n.traits && !(n.traits instanceof Map)) {
      // Plain {} from JSON clone of empty Map — remove to prevent iteration errors
      delete n.traits;
    }

    // Recurse into all child collections
    for (const key of ['body', 'children', 'nodes', 'members']) {
      if (Array.isArray(n[key])) {
        (n[key] as unknown[]).forEach(walk);
      }
    }
    if (n.root && typeof n.root === 'object') {
      walk(n.root);
    }
  };
  walk(ast);
}

/**
 * Set values in the AST's blackboard node (used to configure BT per cycle).
 * Deep traversal into ALL object properties including Map values to find
 * blackboard inside trait configs (e.g. @behavior_tree { blackboard: {...} }).
 */
function setASTBlackboard(ast: unknown, values: Record<string, unknown>): void {
  const visited = new WeakSet<object>();
  let found = false;

  const walk = (node: unknown): void => {
    if (found || !node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (visited.has(obj)) return;
    visited.add(obj);

    // Direct blackboard object
    if (obj.blackboard && typeof obj.blackboard === 'object' && !Array.isArray(obj.blackboard)) {
      Object.assign(obj.blackboard as object, values);
      found = true;
      return;
    }

    // Deep traverse ALL properties (not just body/children/nodes/members)
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) walk(item);
        } else if (val instanceof Map) {
          for (const v of val.values()) walk(v);
        } else {
          walk(val);
        }
      }
      if (found) return;
    }
  };
  walk(ast);
}

function showHelp(): void {
  console.log(`
HoloScript CLI — Headless Runner v5.0

Usage:
  holoscript run <file>     [--target node|python|ros2] [--profile headless|minimal|full] [--ticks <n>] [--daemon] [--debug]
  holoscript test <file>    [--debug]
  holoscript compile <file> [--target node|python] [--output <path>]
  holoscript absorb <file>  [--output <path>] [--debug]
  holoscript daemon <file>  [--cycles <n>] [--commit] [--model <model>] [--trial <n>] [--debug]

Supported file types:
  .hs       Agent templates, behavior trees, event handlers
  .hsplus   Full language with modules, types, async/await
  .holo     Spatial compositions (optional render target)

Examples:
  holoscript run agent.hs --target node --debug
  holoscript run agent.hs --daemon
  holoscript test tests.hs
  holoscript compile service.hsplus --target python --output service.py
  holoscript absorb legacy.py --output agent.hsplus
  holoscript daemon compositions/self-improve-daemon.hsplus --cycles 15 --commit
`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  switch (opts.command) {
    case 'run':
      await runScript(opts);
      break;
    case 'test':
      await testScript(opts);
      break;
    case 'compile':
      compileScript(opts);
      break;
    case 'absorb':
      absorbScript(opts);
      break;
    case 'daemon':
    case 'holodaemon':
      await daemonScript(opts);
      break;
    case 'help':
    default:
      showHelp();
  }
}

main().catch((err) => {
  console.error('[holoscript] Fatal error:', err.message);
  process.exit(1);
});
