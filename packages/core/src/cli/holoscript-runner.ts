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

import 'dotenv/config';

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { createHeadlessRuntime, getProfile, HEADLESS_PROFILE } from '../runtime/HeadlessRuntime';
import { createHeadlessRuntime as createProfileRuntime } from '../runtime/profiles/HeadlessRuntime';
import type { ActionHandler } from '../runtime/profiles/HeadlessRuntime';
import { HEADLESS_PROFILE as PROFILES_HEADLESS } from '../runtime/profiles/RuntimeProfile';
import { InteropContext } from '../interop/Interoperability';
import { parse } from '../parser/HoloScriptPlusParser';
import { ScriptTestRunner } from '../traits/ScriptTestTrait';
import { CompositionTestRunner } from '../traits/TestTrait';
import { AbsorbProcessor } from '../traits/AbsorbTrait';
import { HotReloadWatcher } from '../traits/HotReloadTrait';
import { registerStdlib } from '../stdlib';
import type { HostCapabilities } from '../traits/TraitTypes';
import { createDaemonActions, getDaemonFileState } from '@holoscript/absorb-service/daemon';
import type { DaemonConfig, DaemonHost, LLMProvider } from '@holoscript/absorb-service/daemon';
import { generateProvenance } from '../deploy/provenance';
import type { LicenseType } from '../deploy/provenance';
import { checkLicenseCompatibility } from '../deploy/license-checker';
import {
  calculateRevenueDistribution,
  formatRevenueDistribution,
  ethToWei,
} from '../deploy/revenue-splitter';
import { PROTOCOL_CONSTANTS } from '../deploy/protocol-types';
import type { ImportChainNode } from '../deploy/protocol-types';

// ── Argument parsing ────────────────────────────────────────────────────────
export interface CLIOptions {
  command:
    | 'run'
    | 'test'
    | 'compile'
    | 'deploy'
    | 'absorb'
    | 'daemon'
    | 'holodaemon'
    | 'moltbook-daemon'
    | 'holomesh-daemon'
    | 'daemon-status'
    | 'help';
  json: boolean;
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
  provider: 'anthropic' | 'xai' | 'openai' | 'ollama';
  toolProfile: 'claude-hsplus' | 'grok-hsplus' | 'standard';
  model: string;
  timeout: number; // per-cycle timeout in minutes
  focus?: string; // override focus rotation with fixed focus
  enforceGotchas: boolean; // fail compile if critical @gotcha violations found
  providerRotation: boolean; // alternate providers per cycle (Claude→Grok→Claude→...)
  alwaysOn: boolean;
  cycleIntervalSec: number;
  allowShell: boolean;
  allowedShellCommands: string[];
  allowedHosts: string[];
  allowedPaths: string[];
  skillsDir?: string;
  /** G.ARCH.002: Session identity for daemon state isolation */
  sessionId?: string;
  /** Quality tier for compilation (controls particle counts, LOD, shader complexity) */
  qualityTier?: 'low' | 'med' | 'high' | 'ultra';
  // Deploy-specific options
  /** Share the composition to the community gallery */
  share: boolean;
  /** Author name for provenance */
  author: string;
  /** License type for provenance */
  license: string;
  /** Deploy server URL */
  serverUrl: string;
  // Protocol publish options
  /** Publish to HoloScript Protocol (on-chain registry + CDN) */
  publish: boolean;
  /** Also mint as Zora NFT */
  mintNft: boolean;
  /** Collect price in ETH (e.g. '0.01') */
  price: string;
  /** Wallet private key (or use HOLOSCRIPT_WALLET_KEY env var) */
  walletKey: string;
}

function defaultModelForProvider(provider: CLIOptions['provider']): string {
  switch (provider) {
    case 'xai':
      return 'grok-3';
    case 'openai':
      return 'gpt-4.1';
    case 'ollama':
      return 'brittney-qwen-v23:latest';
    case 'anthropic':
    default:
      return 'claude-sonnet-4-20250514';
  }
}

function defaultToolProfileForProvider(
  provider: CLIOptions['provider']
): CLIOptions['toolProfile'] {
  switch (provider) {
    case 'xai':
      return 'grok-hsplus';
    case 'anthropic':
      return 'claude-hsplus';
    case 'openai':
    case 'ollama':
    default:
      return 'standard';
  }
}

function parseProvider(value: string | undefined): CLIOptions['provider'] | undefined {
  const normalized = value?.toLowerCase();
  if (
    normalized === 'anthropic' ||
    normalized === 'xai' ||
    normalized === 'openai' ||
    normalized === 'ollama'
  ) {
    return normalized;
  }
  return undefined;
}

function parseToolProfile(value: string | undefined): CLIOptions['toolProfile'] | undefined {
  const normalized = value?.toLowerCase();
  if (normalized === 'claude-hsplus' || normalized === 'grok-hsplus' || normalized === 'standard') {
    return normalized;
  }
  return undefined;
}

function daemonEnvDefaults(): {
  provider: CLIOptions['provider'];
  toolProfile: CLIOptions['toolProfile'];
  model: string;
} {
  const provider = parseProvider(process.env.HOLODAEMON_PROVIDER) || 'anthropic';
  const toolProfile =
    parseToolProfile(process.env.HOLODAEMON_TOOL_PROFILE) ||
    defaultToolProfileForProvider(provider);
  const model = process.env.HOLODAEMON_MODEL || defaultModelForProvider(provider);

  return { provider, toolProfile, model };
}

function parseArgs(argv: string[]): CLIOptions {
  const args = argv.slice(2);
  const envDefaults = daemonEnvDefaults();
  const opts: CLIOptions = {
    command: 'help',
    json: false,
    target: 'headless',
    profile: 'headless',
    debug: false,
    watch: false,
    daemon: false,
    ticks: 100,
    cycles: 15,
    commit: false,
    enforceGotchas: false,
    providerRotation: false,
    alwaysOn: false,
    cycleIntervalSec: 30,
    allowShell: false,
    allowedShellCommands: [],
    allowedHosts: [],
    allowedPaths: [],
    provider: envDefaults.provider,
    toolProfile: envDefaults.toolProfile,
    model: envDefaults.model,
    timeout: 30,
    sessionId: randomUUID(),
    // Deploy defaults
    share: false,
    author: '',
    license: 'free',
    serverUrl: 'https://mcp.holoscript.net',
    // Protocol publish defaults
    publish: false,
    mintNft: false,
    price: '0',
    walletKey: '',
  };
  let modelExplicit = false;
  let toolProfileExplicit = false;

  if (args.length === 0) return opts;

  // First arg is command
  const cmd = args[0];
  if (
    cmd === 'run' ||
    cmd === 'test' ||
    cmd === 'compile' ||
    cmd === 'deploy' ||
    cmd === 'absorb' ||
    cmd === 'daemon' ||
    cmd === 'holodaemon' ||
    cmd === 'moltbook-daemon' ||
    cmd === 'holomesh-daemon'
  ) {
    opts.command = cmd;
  }

  // Second arg is file path
  // Detect 'holoscript daemon status' sub-subcommand before treating args[1] as a file
  if (opts.command === 'daemon' && args[1] === 'status') {
    opts.command = 'daemon-status';
  }

  if (args[1] && !args[1].startsWith('--') && opts.command !== 'daemon-status') {
    opts.file = args[1];
  }

  // Parse flags
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target' && args[i + 1]) opts.target = args[++i] as CLIOptions['target'];
    if (args[i] === '--profile' && args[i + 1]) opts.profile = args[++i];
    if (args[i] === '--output' && args[i + 1]) opts.output = args[++i];
    if (args[i] === '--tier' && args[i + 1]) {
      const tier = args[++i].toLowerCase();
      if (['low', 'med', 'high', 'ultra'].includes(tier)) {
        opts.qualityTier = tier as CLIOptions['qualityTier'];
      }
    }
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
    if (args[i] === '--provider' && args[i + 1]) {
      const provider = parseProvider(args[++i]);
      if (provider) {
        opts.provider = provider;
      }
    }
    if (args[i] === '--tool-profile' && args[i + 1]) {
      const profile = parseToolProfile(args[++i]);
      if (profile) {
        opts.toolProfile = profile;
        toolProfileExplicit = true;
      }
    }
    if (args[i] === '--model' && args[i + 1]) {
      opts.model = args[++i];
      modelExplicit = true;
    }
    if (args[i] === '--timeout' && args[i + 1]) {
      const parsed = Number(args[++i]);
      if (Number.isFinite(parsed) && parsed > 0) {
        opts.timeout = Math.min(120, Math.max(1, Math.floor(parsed)));
      }
    }
    if (args[i] === '--focus' && args[i + 1]) {
      opts.focus = args[++i];
    }
    if (args[i] === '--enforce-gotchas') opts.enforceGotchas = true;
    if (args[i] === '--provider-rotation') opts.providerRotation = true;
    if (args[i] === '--always-on') opts.alwaysOn = true;
    if (args[i] === '--allow-shell') opts.allowShell = true;
    if (args[i] === '--skills-dir' && args[i + 1]) opts.skillsDir = args[++i];
    if (args[i] === '--cycle-interval-sec' && args[i + 1]) {
      const parsed = Number(args[++i]);
      if (Number.isFinite(parsed) && parsed >= 1) {
        opts.cycleIntervalSec = Math.floor(parsed);
      }
    }
    if (args[i] === '--allow-shell-command' && args[i + 1]) {
      opts.allowedShellCommands.push(args[++i]);
    }
    if (args[i] === '--allow-host' && args[i + 1]) {
      opts.allowedHosts.push(args[++i]);
    }
    if (args[i] === '--allow-path' && args[i + 1]) {
      opts.allowedPaths.push(args[++i]);
    }
    if (args[i] === '--json') opts.json = true;
    // Deploy-specific flags
    if (args[i] === '--share') opts.share = true;
    if (args[i] === '--author' && args[i + 1]) opts.author = args[++i];
    if (args[i] === '--license' && args[i + 1]) opts.license = args[++i];
    if (args[i] === '--server' && args[i + 1]) opts.serverUrl = args[++i];
    // Protocol publish flags
    if (args[i] === '--publish') opts.publish = true;
    if (args[i] === '--mint-nft') opts.mintNft = true;
    if (args[i] === '--price' && args[i + 1]) opts.price = args[++i];
    if (args[i] === '--wallet-key' && args[i + 1]) opts.walletKey = args[++i];
  }

  if (!modelExplicit) {
    opts.model = defaultModelForProvider(opts.provider);
  }
  if (!toolProfileExplicit) {
    opts.toolProfile = defaultToolProfileForProvider(opts.provider);
  }

  return opts;
}

function extractChatText(data: any): string {
  return (
    data?.content?.[0]?.text ??
    data?.choices?.[0]?.message?.content ??
    data?.message?.content ??
    data?.response ??
    ''
  );
}

function extractTokenUsage(data: any): { inputTokens: number; outputTokens: number } {
  const inputTokens =
    data?.usage?.input_tokens ?? data?.usage?.prompt_tokens ?? data?.prompt_eval_count ?? 0;
  const outputTokens =
    data?.usage?.output_tokens ?? data?.usage?.completion_tokens ?? data?.eval_count ?? 0;

  return {
    inputTokens: Number.isFinite(inputTokens) ? Number(inputTokens) : 0,
    outputTokens: Number.isFinite(outputTokens) ? Number(outputTokens) : 0,
  };
}

function createDaemonLLMProvider(opts: CLIOptions): LLMProvider {
  if (opts.provider === 'anthropic') {
    return {
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

        const data = await response.json();
        const usage = extractTokenUsage(data);
        return {
          text: extractChatText(data),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        };
      },
    };
  }

  if (opts.provider === 'xai') {
    return {
      chat: async ({ system, prompt, maxTokens }) => {
        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) throw new Error('XAI_API_KEY not set');

        const response = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: opts.model,
            max_tokens: maxTokens || 4096,
            temperature: 0.2,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
          }),
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`xAI API ${response.status}: ${body.slice(0, 200)}`);
        }

        const data = await response.json();
        const usage = extractTokenUsage(data);
        return {
          text: extractChatText(data),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        };
      },
    };
  }

  if (opts.provider === 'openai') {
    return {
      chat: async ({ system, prompt, maxTokens }) => {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY not set');

        const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: opts.model,
            max_tokens: maxTokens || 4096,
            temperature: 0.2,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
          }),
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`OpenAI API ${response.status}: ${body.slice(0, 200)}`);
        }

        const data = await response.json();
        const usage = extractTokenUsage(data);
        return {
          text: extractChatText(data),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        };
      },
    };
  }

  // ollama
  return {
    chat: async ({ system, prompt }) => {
      const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: opts.model,
          system,
          prompt,
          stream: false,
          options: {
            temperature: 0.2,
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Ollama API ${response.status}: ${body.slice(0, 200)}`);
      }

      const data = await response.json();
      const usage = extractTokenUsage(data);
      return {
        text: extractChatText(data),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      };
    },
  };
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
      exec: (
        command: string,
        args: string[] = [],
        options?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number }
      ) =>
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
      fetch: async (
        url: string,
        options?: {
          method?: string;
          headers?: Record<string, string>;
          body?: string;
          credentials?: 'omit' | 'same-origin' | 'include';
        }
      ) => {
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

        runtime.registerAction(
          actionName,
          (params: Record<string, unknown>, blackboard: Record<string, unknown>) => {
            const actionRequestId = `daemon-action-${nextActionId++}`;
            const timeoutMs = Number.isFinite(command?.timeoutMs)
              ? Math.max(1, Math.floor(command.timeoutMs))
              : 30000;

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
          }
        );

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

  // Register stdlib I/O actions (G.ARCH.003)
  registerStdlib(
    runtime as unknown as { registerAction: (name: string, handler: ActionHandler) => void },
    {
      policy: {
        rootDir: path.dirname(filePath),
        allowedPaths:
          opts.allowedPaths.length > 0
            ? opts.allowedPaths
            : ['compositions', 'data', 'src', 'packages'],
        maxFileBytes: 2 * 1024 * 1024,
        allowShell: opts.allowShell,
        allowedShellCommands: opts.allowedShellCommands,
        maxShellOutputBytes: 100 * 1024,
        shellTimeoutMs: 60_000,
        allowNetwork: opts.allowedHosts.length > 0,
        allowedHosts: opts.allowedHosts,
      },
      hostCapabilities: createNodeHostCapabilities(path.dirname(filePath)),
    }
  );

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
  console.log(
    `[holoscript] Complete — ${stats.tickCount} ticks, ${stats.nodesProcessed} nodes processed`
  );

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
        console.log(
          `[holoscript] Complete — ${newStats.tickCount} ticks, ${newStats.nodesProcessed} nodes`
        );
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
  const scriptResults = runner.runTestsFromSource(source, filePath);

  // Also run @test blocks (native composition tests with $stateVar syntax)
  // Prefer runtime state (properly parses nested objects) over raw text extraction
  const runtimeState = runtime.getAllState();
  const compositionState =
    Object.keys(runtimeState).length > 0
      ? runtimeState
      : CompositionTestRunner.extractStateFromSource(source);
  const computedDefs = CompositionTestRunner.extractComputedFromSource(source);
  const compositionRunner = new CompositionTestRunner(compositionState, computedDefs, {
    debug: opts.debug,
  });
  const compositionResults = compositionRunner.runTestsFromSource(source);

  const results = [...scriptResults, ...compositionResults];

  // Report
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  console.log('');
  for (const result of results) {
    const icon = result.status === 'passed' ? '✓' : result.status === 'failed' ? '✗' : '○';
    const color =
      result.status === 'passed'
        ? '\x1b[32m'
        : result.status === 'failed'
          ? '\x1b[31m'
          : '\x1b[33m';
    console.log(`  ${color}${icon}\x1b[0m ${result.name} (${result.durationMs}ms)`);
    if (result.error) {
      console.log(`    \x1b[31m${result.error}\x1b[0m`);
    }
  }

  console.log('');
  console.log(
    `Tests: ${passed} passed, ${failed} failed, ${skipped} skipped (${results.length} total)`
  );

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

  // --enforce-gotchas: scan for critical @gotcha violations before compiling
  if (opts.enforceGotchas) {
    const gotchaRe = /@gotcha\s*\{([^}]+)\}/g;
    let gMatch: RegExpExecArray | null;
    const criticals: { warning: string; mitigation: string }[] = [];
    while ((gMatch = gotchaRe.exec(source)) !== null) {
      const block = gMatch[1];
      const sevMatch = block.match(/severity:\s*"([^"]*)"/i);
      const severity = sevMatch?.[1] || 'warning';
      if (severity === 'critical') {
        const warnMatch = block.match(/warning:\s*"([^"]*)"/i);
        const mitMatch = block.match(/mitigation:\s*"([^"]*)"/i);
        criticals.push({
          warning: warnMatch?.[1] || 'Unknown critical gotcha',
          mitigation: mitMatch?.[1] || 'No mitigation specified',
        });
      }
    }
    if (criticals.length > 0) {
      console.error(
        `[holoscript compile] BLOCKED by ${criticals.length} critical @gotcha violation(s):`
      );
      for (const g of criticals) {
        console.error(`  ✗ ${g.warning}`);
        console.error(`    mitigation: ${g.mitigation}`);
      }
      process.exit(1);
    }
    console.log(`[holoscript compile] @gotcha check passed (no critical violations)`);
  }

  const ast = parse(source);
  const outputPath =
    opts.output ||
    filePath.replace(/\.(hs|hsplus|holo)$/, `.${opts.target === 'python' ? 'py' : 'js'}`);

  console.log(
    `[holoscript compile] ${path.basename(filePath)} → ${opts.target} → ${path.basename(outputPath)}`
  );

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

// ── Deploy ──────────────────────────────────────────────────────────────────

async function deployScript(opts: CLIOptions): Promise<void> {
  if (!opts.file) {
    console.error('Error: No source file specified');
    console.error(
      'Usage: holoscript deploy <file> [--share] [--publish] [--price <eth>] [--mint-nft] [--author <name>] [--license <type>] [--server <url>]'
    );
    process.exit(1);
  }

  const filePath = path.resolve(opts.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  const title = path.basename(filePath, path.extname(filePath));

  // Parse
  console.log(`Parsing ${fileName}...`);
  const ast = parse(source);
  if (ast.errors && ast.errors.length > 0) {
    console.error('Parse errors:');
    for (const err of ast.errors) {
      console.error(`  ${err.message || err}`);
    }
    process.exit(1);
  }

  // Generate provenance
  const license = (opts.license || 'free') as LicenseType;
  const provenance = generateProvenance(source, ast, {
    author: opts.author || 'anonymous',
    license,
    version: 1,
  });

  console.log(
    `Provenance: ${provenance.publishMode} | hash: ${provenance.hash.slice(0, 12)}... | license: ${provenance.license}`
  );

  // License compatibility check (if composition imports other compositions)
  if (provenance.imports.length > 0) {
    // For now, imported licenses default to 'free' since we can't resolve them at CLI time
    // The server-side deploy endpoint will do full resolution
    const importedLicenses = provenance.imports.map((imp) => ({
      path: imp.path,
      license: 'free' as LicenseType,
    }));

    const licenseCheck = checkLicenseCompatibility(license, importedLicenses);

    if (licenseCheck.warnings.length > 0) {
      for (const w of licenseCheck.warnings) {
        console.log(`  Warning: ${w}`);
      }
    }
    if (!licenseCheck.compatible) {
      console.error('License compatibility errors:');
      for (const e of licenseCheck.errors) {
        console.error(`  ${e}`);
      }
      process.exit(1);
    }
    if (licenseCheck.forcedLicense) {
      console.log(`  License forced to "${licenseCheck.forcedLicense}" by imports`);
    }
  }

  // Deploy to server
  const serverUrl = opts.serverUrl.replace(/\/$/, '');

  // ── Protocol Publish (--publish) ─────────────────────────────────────────
  if (opts.publish) {
    const priceWei = ethToWei(opts.price || '0');

    // Revenue preview
    const importChain: ImportChainNode[] = provenance.imports.map((imp, i) => ({
      contentHash: imp.hash || `import-${i}`,
      author: imp.author || imp.path,
      depth: 1,
      children: [],
    }));

    const revenuePreview = calculateRevenueDistribution(
      priceWei,
      provenance.author || 'anonymous',
      importChain
    );

    console.log('\nRevenue distribution:');
    for (const line of formatRevenueDistribution(revenuePreview)) {
      console.log(`  ${line}`);
    }

    // Store metadata first
    console.log(`\nPublishing to protocol at ${serverUrl}...`);
    const metadataBody = JSON.stringify({
      contentHash: provenance.hash,
      provenance: {
        hash: provenance.hash,
        author: provenance.author,
        license: provenance.license,
        publishMode: provenance.publishMode,
        imports: provenance.imports,
        created: provenance.created,
      },
    });

    try {
      const metaRes = await fetch(`${serverUrl}/api/protocol/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: metadataBody,
      });
      if (!metaRes.ok) {
        const text = await metaRes.text();
        console.error(`Metadata storage failed (${metaRes.status}): ${text}`);
        process.exit(1);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Metadata storage failed: ${msg}`);
      process.exit(1);
    }

    // Register protocol record (also deploys scene)
    const protocolBody = JSON.stringify({
      contentHash: provenance.hash,
      author: provenance.author || 'anonymous',
      importHashes: provenance.imports.map((imp) => imp.hash).filter(Boolean),
      license: provenance.license,
      publishMode: provenance.publishMode,
      price: opts.price || '0',
      referralBps: PROTOCOL_CONSTANTS.DEFAULT_REFERRAL_BPS,
      metadataURI: `${serverUrl}/metadata/${provenance.hash}`,
      mintAsNFT: opts.mintNft,
      // Include scene data for CDN deploy
      code: source,
      title,
      description: `Published from CLI: ${fileName}`,
    });

    try {
      const pubRes = await fetch(`${serverUrl}/api/protocol`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: protocolBody,
      });

      if (!pubRes.ok) {
        const text = await pubRes.text();
        console.error(`Protocol publish failed (${pubRes.status}): ${text}`);
        process.exit(1);
      }

      const pubResult = (await pubRes.json()) as {
        contentHash: string;
        protocolId: string;
        collectUrl: string;
        registryUrl: string;
        sceneUrl?: string;
        embedUrl?: string;
      };

      console.log('\nPublished to HoloScript Protocol!');
      console.log(`  Hash:     ${pubResult.contentHash}`);
      console.log(`  ID:       ${pubResult.protocolId}`);
      console.log(`  Collect:  ${pubResult.collectUrl}`);
      console.log(`  Registry: ${pubResult.registryUrl}`);
      if (pubResult.sceneUrl) {
        console.log(`  Scene:    ${pubResult.sceneUrl}`);
      }
      if (pubResult.embedUrl) {
        console.log(`  Embed:    ${pubResult.embedUrl}`);
      }
      if (priceWei > 0n) {
        console.log(`  Price:    ${opts.price} ETH`);
      } else {
        console.log('  Price:    Free collect');
      }
      if (opts.mintNft) {
        console.log('  NFT:      Zora mint requested');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Protocol publish failed: ${msg}`);
      console.error(
        'Is the server running? Try: holoscript deploy <file> --publish --server http://localhost:3000'
      );
      process.exit(1);
    }

    return; // Protocol publish includes CDN deploy, so we're done
  }

  // ── CDN-only Deploy (existing behavior) ──────────────────────────────────
  const endpoint = `${serverUrl}/api/deploy`;

  console.log(`Deploying to ${serverUrl}...`);

  const body = JSON.stringify({
    code: source,
    title,
    description: `Deployed from CLI: ${fileName}`,
    author: provenance.author,
    license: provenance.license,
    provenance: {
      hash: provenance.hash,
      publishMode: provenance.publishMode,
      imports: provenance.imports,
    },
  });

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`Deploy failed (${res.status}): ${text}`);
      process.exit(1);
    }

    const result = (await res.json()) as {
      id: string;
      url: string;
      embed: string;
      api: string;
      provenance?: { hash: string; publishMode: string };
    };

    console.log('\nDeployed successfully!');
    console.log(`  ID:    ${result.id}`);
    console.log(`  URL:   ${result.url}`);
    console.log(`  Embed: ${result.embed}`);
    console.log(`  API:   ${result.api}`);
    if (result.provenance) {
      console.log(`  Mode:  ${result.provenance.publishMode}`);
      console.log(`  Hash:  ${result.provenance.hash}`);
    }

    if (opts.share) {
      console.log(`\nShare URL: ${result.url}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Deploy failed: ${msg}`);
    console.error(
      'Is the server running? Try: holoscript deploy <file> --server http://localhost:3000'
    );
    process.exit(1);
  }
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
    console.error(
      `Error: Unsupported file type '${ext}'. Supported: .py, .ts, .tsx, .js, .jsx, .mjs`
    );
    process.exit(1);
  }

  const outputPath = opts.output || filePath.replace(/\.\w+$/, '.hsplus');
  console.log(
    `[holoscript absorb] ${path.basename(filePath)} (${language}) → ${path.basename(outputPath)}`
  );

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract @economy trait config from composition AST (walks body/children). */
function extractEconomyConfig(
  ast: Record<string, unknown>
):
  | {
      budget?: number;
      default_spend_limit?: number;
      initial_balance?: number;
      task_completion_reward?: number;
    }
  | undefined {
  const result: {
    budget?: number;
    default_spend_limit?: number;
    initial_balance?: number;
    task_completion_reward?: number;
  } = {};
  let found = false;

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;

    // Check traits array on this node
    if (Array.isArray(obj.traits)) {
      for (const trait of obj.traits) {
        const t = trait as Record<string, unknown>;
        if (t.name === 'economy' && typeof t.config === 'object' && t.config) {
          const cfg = t.config as Record<string, unknown>;
          if (typeof cfg.budget === 'number') result.budget = cfg.budget;
          if (typeof cfg.default_spend_limit === 'number')
            result.default_spend_limit = cfg.default_spend_limit;
          if (typeof cfg.initial_balance === 'number') result.initial_balance = cfg.initial_balance;
          if (typeof cfg.task_completion_reward === 'number')
            result.task_completion_reward = cfg.task_completion_reward;
          found = true;
        }
      }
    }

    // Check directives for @economy
    if (Array.isArray(obj.directives)) {
      for (const dir of obj.directives) {
        const d = dir as Record<string, unknown>;
        if (
          (d.type === 'trait' || d.type === 'ObjectTrait') &&
          d.name === 'economy' &&
          typeof d.config === 'object' &&
          d.config
        ) {
          const cfg = d.config as Record<string, unknown>;
          if (typeof cfg.budget === 'number') result.budget = cfg.budget;
          if (typeof cfg.default_spend_limit === 'number')
            result.default_spend_limit = cfg.default_spend_limit;
          if (typeof cfg.initial_balance === 'number') result.initial_balance = cfg.initial_balance;
          if (typeof cfg.task_completion_reward === 'number')
            result.task_completion_reward = cfg.task_completion_reward;
          found = true;
        }
      }
    }

    // Recurse into body, children, objects
    if (Array.isArray(obj.body)) obj.body.forEach(walk);
    if (Array.isArray(obj.children)) obj.children.forEach(walk);
    if (Array.isArray(obj.objects)) obj.objects.forEach(walk);
  }

  walk(ast);
  return found ? result : undefined;
}

function loadRuntimeSkillActions(
  skillsDir: string,
  opts: CLIOptions,
  host: DaemonHost,
  repoRoot: string,
  debug = false
): Record<string, ActionHandler> {
  const actions: Record<string, ActionHandler> = {};
  if (!fs.existsSync(skillsDir)) return actions;

  const files = fs
    .readdirSync(skillsDir)
    .filter((name) => name.endsWith('.hsplus'))
    .map((name) => path.join(skillsDir, name));

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const actionRe = /action\s+"([^"]+)"\s*\{([\s\S]*?)\}/g;
    let match: RegExpExecArray | null;
    while ((match = actionRe.exec(content)) !== null) {
      const actionName = match[1].trim();
      const block = match[2];
      const commandMatch = block.match(/command\s*:\s*["']([^"']+)["']/);
      if (!commandMatch) continue;
      const command = commandMatch[1].trim();

      const argMatch = block.match(/args\s*:\s*\[([^\]]*)\]/);
      const bakedArgs: string[] = [];
      if (argMatch) {
        const argValueRe = /["']([^"']+)["']/g;
        let argToken: RegExpExecArray | null;
        while ((argToken = argValueRe.exec(argMatch[1])) !== null) {
          bakedArgs.push(argToken[1]);
        }
      }

      actions[actionName] = async (params, bb, ctx) => {
        if (!opts.allowShell) {
          bb.skill_error = `Skill ${actionName} blocked: shell disabled`;
          return false;
        }
        if (opts.allowedShellCommands.length > 0) {
          const executable = command.split(/\s+/)[0].toLowerCase();
          const allowed = opts.allowedShellCommands.some((c) => c.toLowerCase() === executable);
          if (!allowed) {
            bb.skill_error = `Skill ${actionName} blocked: command ${executable} not allowlisted`;
            return false;
          }
        }

        const runtimeArgs = Array.isArray(params.args)
          ? params.args.filter((v): v is string => typeof v === 'string')
          : [];
        const timeoutMs =
          typeof params.timeoutMs === 'number' && Number.isFinite(params.timeoutMs)
            ? Math.max(1_000, Math.min(300_000, Math.floor(params.timeoutMs)))
            : 60_000;

        const result = await host.exec(command, [...bakedArgs, ...runtimeArgs], {
          cwd: repoRoot,
          timeoutMs,
        });
        bb.skill_last_action = actionName;
        bb.skill_last_code = result.code ?? -1;
        bb.skill_last_stdout = result.stdout.slice(0, 50_000);
        bb.skill_last_stderr = result.stderr.slice(0, 50_000);
        ctx.emit('daemon:skill:executed', { actionName, code: result.code, file });
        return result.code === 0;
      };
    }
  }

  if (debug) {
    console.log(
      `[daemon] Loaded ${Object.keys(actions).length} runtime skill action(s) from ${skillsDir}`
    );
  }
  return actions;
}

export async function daemonScript(opts: CLIOptions): Promise<void> {
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
    const errors =
      parseResult.errors?.map((e: { message: string }) => e.message).join(', ') || 'unknown';
    console.error(`[daemon] Parse failed: ${errors}`);
    process.exit(1);
  }

  const compositionAST = parseResult.ast as Record<string, unknown>;

  console.log(`[daemon] Composition: ${path.basename(filePath)}`);
  console.log(`[daemon] Repo root: ${repoRoot}`);
  console.log(
    `[daemon] Cycles: ${opts.cycles} | Commit: ${opts.commit} | Timeout: ${opts.timeout}min | ` +
      `Provider: ${opts.provider} | Model: ${opts.model} | Tool profile: ${opts.toolProfile} | ` +
      `Always-on: ${opts.alwaysOn} | Cycle interval: ${opts.cycleIntervalSec}s`
  );

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
        console.error(
          `[daemon] Another daemon is running (PID ${existing.pid}). Remove ${lockFile} to force.`
        );
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

  const fileWatchers: fs.FSWatcher[] = [];

  const cleanup = () => {
    clearInterval(heartbeatTimer);
    for (const watcher of fileWatchers) {
      try {
        watcher.close();
      } catch {
        /* best effort */
      }
    }
    try {
      fs.rmSync(lockFile, { force: true });
    } catch {
      /* best effort */
    }
  };
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
  process.once('uncaughtException', (err) => {
    cleanup();
    console.error('[daemon] Uncaught:', err);
    process.exit(1);
  });
  process.once('unhandledRejection', (err) => {
    cleanup();
    console.error('[daemon] Unhandled:', err);
    process.exit(1);
  });

  // Create host capabilities
  const host: DaemonHost = {
    readFile: (p) => fs.readFileSync(path.resolve(repoRoot, p), 'utf-8'),
    writeFile: (p, c) => {
      const resolved = path.resolve(repoRoot, p);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, c, 'utf-8');
    },
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
        child.stdout?.on('data', (d: Buffer) => {
          stdout += d.toString('utf-8');
        });
        child.stderr?.on('data', (d: Buffer) => {
          stderr += d.toString('utf-8');
        });
        if (execOpts.timeoutMs && execOpts.timeoutMs > 0) {
          timer = setTimeout(() => {
            try {
              child.kill('SIGKILL');
            } catch {
              /* */
            }
          }, execOpts.timeoutMs);
        }
        child.on('close', (code) => {
          if (timer) clearTimeout(timer);
          resolve({ code, stdout, stderr });
        });
        child.on('error', reject);
      }),
  };

  const skillsDirRel = opts.skillsDir || 'compositions/skills';
  const skillsDirAbs = path.resolve(repoRoot, skillsDirRel);
  if (!fs.existsSync(skillsDirAbs)) {
    fs.mkdirSync(skillsDirAbs, { recursive: true });
  }

  let runtimeSkillActions = loadRuntimeSkillActions(skillsDirAbs, opts, host, repoRoot, opts.debug);
  let activeRuntime: { registerAction: (name: string, handler: ActionHandler) => void } | null =
    null;

  const reloadRuntimeSkills = () => {
    runtimeSkillActions = loadRuntimeSkillActions(skillsDirAbs, opts, host, repoRoot, opts.debug);
    if (activeRuntime) {
      for (const [name, handler] of Object.entries(runtimeSkillActions)) {
        activeRuntime.registerAction(name, handler);
      }
    }
  };

  try {
    const watcher = fs.watch(skillsDirAbs, { persistent: false }, () => {
      reloadRuntimeSkills();
    });
    fileWatchers.push(watcher);
  } catch (error) {
    if (opts.debug) {
      console.warn(
        `[daemon] Skill watcher unavailable for ${skillsDirAbs}: ${(error as Error).message}`
      );
    }
  }

  // LLM provider (provider-aware)
  const llm = createDaemonLLMProvider(opts);

  // Daemon configuration — read strategy from composition blackboard (source of truth)
  const defaultFocusRotation = [
    'typefix',
    'coverage',
    'typefix',
    'lint',
    'target-sweep',
    'trait-sampling',
    'runtime-matrix',
    'absorb-roundtrip',
    'typefix',
    'all',
  ];
  const focusRotation =
    (getASTBlackboardValue(compositionAST, 'focus_rotation') as string[] | undefined) ??
    defaultFocusRotation;
  const providerRotationEnabled =
    (getASTBlackboardValue(compositionAST, 'provider_rotation_enabled') as boolean | undefined) ??
    opts.providerRotation;
  const rotationProviders = (getASTBlackboardValue(compositionAST, 'provider_rotation') as
    | string[]
    | undefined) ?? ['anthropic', 'xai'];
  const quarantineThreshold =
    (getASTBlackboardValue(compositionAST, 'quarantine_threshold') as number | undefined) ?? 3;

  // Extract @economy trait config from composition AST
  const economyConfig = extractEconomyConfig(compositionAST);
  if (economyConfig && opts.debug) {
    console.log(`[daemon] Economy config from composition:`, economyConfig);
  }

  const config: DaemonConfig = {
    repoRoot,
    commit: opts.commit,
    model: opts.model,
    provider: opts.provider,
    toolProfile: opts.toolProfile,
    verbose: opts.debug,
    trial: opts.trial,
    focusRotation,
    stateDir,
    quarantineThreshold,
    skillsDir: opts.skillsDir,
    toolPolicy: {
      allowShell: opts.allowShell,
      allowedShellCommands: opts.allowedShellCommands,
      allowedHosts: opts.allowedHosts,
      allowedPaths: opts.allowedPaths,
    },
    economyConfig,
    sessionId: opts.sessionId,
  };

  // Load persisted daemon state
  const stateFile = path.join(stateDir, 'daemon-state.json');
  const telemetryFile = path.join(stateDir, 'daemon-telemetry.jsonl');
  interface DaemonPersistedState {
    totalCycles: number;
    focusIndex: number;
    bestQuality: number;
    lastQuality: number;
    totalCostUSD: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    typeErrorBaseline: number;
    lastFocus: string;
    lastCycleTimeISO: string;
  }
  const daemonStateDefaults: DaemonPersistedState = {
    totalCycles: 0,
    focusIndex: 0,
    bestQuality: 0,
    lastQuality: 0,
    totalCostUSD: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    typeErrorBaseline: 0,
    lastFocus: '',
    lastCycleTimeISO: '',
  };
  let daemonState: DaemonPersistedState = { ...daemonStateDefaults };
  if (fs.existsSync(stateFile)) {
    try {
      daemonState = { ...daemonState, ...JSON.parse(fs.readFileSync(stateFile, 'utf-8')) };
    } catch {
      /* use defaults */
    }
  }

  // Load persisted file tracking (committed + quarantined files across cycles)
  // Must load BEFORE createDaemonActions so committedFiles/failedFiles are available.
  const fileStateFile = path.join(stateDir, 'daemon-file-state.json');
  if (fs.existsSync(fileStateFile)) {
    try {
      const fileState = JSON.parse(fs.readFileSync(fileStateFile, 'utf-8'));
      config.committedFiles = fileState.committed || [];
      config.failedFiles = fileState.failures || {};
    } catch {
      /* use defaults */
    }
  }

  // Set historical baseline for quality scoring (persists across sessions).
  // First run: baseline will be measured and stored. Subsequent runs reuse it.
  if (daemonState.typeErrorBaseline > 0) {
    config.typeErrorBaseline = daemonState.typeErrorBaseline;
  }

  // Create action handlers (rebuilt per cycle if provider rotation enabled)
  let daemonResult = createDaemonActions(host, llm, config);
  let actions = daemonResult.actions;

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

  let convergenceStreak = 0;
  const CONVERGENCE_THRESHOLD = 3; // early exit after N zero-delta cycles

  let cycle = 0;
  while (opts.alwaysOn || cycle < opts.cycles) {
    // Use the persisted focus index directly; do not add cycle offset here.
    // Adding cycle caused double-advancement and could bypass forced focuses.
    let focusIdx = daemonState.focusIndex % focusRotation.length;
    let focus = opts.focus || focusRotation[focusIdx];

    // Skip stale focuses: if last 3 wisdom entries for this focus all had delta=0, advance
    if (!opts.focus) {
      const wisdomFile = path.join(stateDir, 'accumulated-wisdom.json');
      let wisdomEntries: Array<{ focus?: string; delta?: number }> = [];
      try {
        if (fs.existsSync(wisdomFile)) {
          wisdomEntries = JSON.parse(fs.readFileSync(wisdomFile, 'utf-8'));
        }
      } catch {
        /* ignore */
      }

      const STALE_THRESHOLD = 3;
      let attempts = 0;
      while (attempts < focusRotation.length) {
        const focusHistory = wisdomEntries.filter((w) => w.focus === focus);
        const lastN = focusHistory.slice(-STALE_THRESHOLD);
        const isStale = lastN.length >= STALE_THRESHOLD && lastN.every((w) => (w.delta || 0) === 0);
        if (!isStale) break;
        console.log(
          `[daemon] Skipping stale focus "${focus}" (${STALE_THRESHOLD} consecutive zero-delta cycles)`
        );
        focusIdx = (focusIdx + 1) % focusRotation.length;
        focus = focusRotation[focusIdx];
        attempts++;
      }
    }

    config.cycleFocus = focus;
    config.daemonFile = filePath;
    config.qualityBefore = daemonState.lastQuality;
    const cycleStart = Date.now();

    // Provider rotation: rebuild LLM + actions for alternating providers
    // (reads provider_rotation_enabled + provider_rotation from composition blackboard)
    if (providerRotationEnabled) {
      const cycleProvider = rotationProviders[
        cycle % rotationProviders.length
      ] as CLIOptions['provider'];
      const cycleModel = defaultModelForProvider(cycleProvider);
      const cycleToolProfile = defaultToolProfileForProvider(cycleProvider);
      const cycleOpts = {
        ...opts,
        provider: cycleProvider,
        model: cycleModel,
        toolProfile: cycleToolProfile,
      };
      const cycleLlm = createDaemonLLMProvider(cycleOpts);
      config.provider = cycleProvider;
      config.model = cycleModel;
      config.toolProfile = cycleToolProfile;
      daemonResult = createDaemonActions(host, cycleLlm, config);
      actions = daemonResult.actions;
      console.log(
        `\n[daemon] === Cycle ${cycle + 1}${opts.alwaysOn ? '' : `/${opts.cycles}`} | Focus: ${focus} | Provider: ${cycleProvider} (${cycleModel}) ===`
      );
    } else {
      console.log(
        `\n[daemon] === Cycle ${cycle + 1}${opts.alwaysOn ? '' : `/${opts.cycles}`} | Focus: ${focus} ===`
      );
    }

    // Fresh AST per cycle (deep clone for clean BT state)
    // Note: JSON clone strips Maps, so materializeTraits must run after clone
    const cycleAST = JSON.parse(JSON.stringify(compositionAST));
    materializeTraits(cycleAST);

    // Set focus in AST blackboard before runtime creation
    const bbValues = {
      focus,
      cycleNumber: daemonState.totalCycles + cycle,
      daemon_file: filePath,
      quality_before: daemonState.lastQuality,
    };
    setASTBlackboard(cycleAST, bbValues);
    if (opts.debug) {
      console.log(`[daemon] Blackboard injection: focus=${focus}, daemon_file=${filePath}`);
    }

    // Create runtime with profile-aware HeadlessRuntime (auto-tick via setInterval)
    const runtime = createProfileRuntime(cycleAST, {
      profile: PROFILES_HEADLESS,
      tickRate: 10,
      debug: opts.debug,
      hostCapabilities: createNodeHostCapabilities(repoRoot),
    });
    activeRuntime = runtime as { registerAction: (name: string, handler: ActionHandler) => void };

    // Register all action handlers
    for (const [name, handler] of Object.entries(actions)) {
      runtime.registerAction(name, handler);
    }
    for (const [name, handler] of Object.entries(runtimeSkillActions)) {
      runtime.registerAction(name, handler);
    }

    // Wire trait event listeners: @economy budget enforcement, @feedback_loop metrics,
    // @structured_logger routing. This connects daemon-actions.ts to the native traits
    // declared in the composition (economy:spend → EconomyTrait, logger:* → StructuredLoggerTrait).
    daemonResult.wireTraitListeners(runtime);

    // Wait for BT completion or timeout
    const maxWaitMs = opts.timeout * 60 * 1000;
    const btResult = await new Promise<{ status: string; blackboard: Record<string, unknown> }>(
      (resolve) => {
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
            const p = payload as
              | { status?: string; blackboard?: Record<string, unknown> }
              | undefined;
            resolve({
              status: p?.status || 'unknown',
              blackboard: p?.blackboard || {},
            });
          }
        });

        // Start runtime — auto-ticks at tickRate Hz
        runtime.start();
      }
    );

    // Extract results before stopping (so traits can still process events)
    const btStatus = btResult.status;
    const btBlackboard = btResult.blackboard;
    const durationSec = ((Date.now() - cycleStart) / 1000).toFixed(1);
    const stats = runtime.getStats();
    const inputTokens = (btBlackboard.inputTokens as number) || 0;
    const outputTokens = (btBlackboard.outputTokens as number) || 0;
    const qualityAfter = (btBlackboard.quality_after as number) || daemonState.lastQuality;
    const costUSD = (inputTokens * 3) / 1_000_000 + (outputTokens * 15) / 1_000_000;
    const committed = (btBlackboard.committed_count as number) || 0;
    const qualityDelta = qualityAfter - (config.qualityBefore || 0);

    // Emit cycle telemetry for @transform → @buffer trait pipeline
    // @transform picks fields + computes qualityDelta/tokensPerDollar
    // @buffer batches into daemon:telemetry_batch_flushed
    runtime.emit('daemon:cycle_raw_telemetry', {
      focus,
      ticks: stats.updateCount,
      inputTokens,
      outputTokens,
      qualityBefore: daemonState.lastQuality,
      qualityAfter,
      costUSD,
      committed: committed > 0,
    });

    // Emit raw quality for @transform quality_clamp → feedback:update_metric
    runtime.emit('daemon:raw_quality', { value: qualityAfter, focus });

    // Emit remaining @feedback_loop metrics
    // cost_efficiency: quality achieved per dollar spent (normalized 0-1)
    const totalTokens = inputTokens + outputTokens;
    const costEfficiency =
      costUSD > 0 ? Math.min(1, (qualityAfter * totalTokens) / (costUSD * 500_000)) : qualityAfter;
    runtime.emit('feedback:update_metric', { name: 'cost_efficiency', value: costEfficiency });

    // emergence_ratio: fraction of candidates that got committed
    const candidateCount = Array.isArray(btBlackboard.candidates)
      ? (btBlackboard.candidates as unknown[]).length
      : 0;
    const emergenceRatio = candidateCount > 0 ? Math.min(1, committed / candidateCount) : 0;
    runtime.emit('feedback:update_metric', { name: 'emergence_ratio', value: emergenceRatio });

    // regenerative_health: wisdom accumulation relative to cap (200)
    const wisdomCount = (btBlackboard.wisdomCount as number) || 0;
    const regenerativeHealth = Math.min(1, wisdomCount / 200);
    runtime.emit('feedback:update_metric', {
      name: 'regenerative_health',
      value: regenerativeHealth,
    });

    runtime.stop();
    activeRuntime = null;

    // Persist machine-readable cycle telemetry for observability and e2e verification.
    const telemetryRecord = {
      timestamp: new Date().toISOString(),
      cycleNumber: daemonState.totalCycles + 1,
      focus,
      provider: config.provider,
      model: config.model,
      btStatus,
      ticks: stats.updateCount,
      inputTokens,
      outputTokens,
      totalTokens,
      costUSD,
      qualityBefore: config.qualityBefore || 0,
      qualityAfter,
      qualityDelta,
      typeErrors: (btBlackboard.quality_typeErrors as number) ?? null,
      testsPassed: (btBlackboard.quality_testsPassed as number) ?? null,
      testsTotal: (btBlackboard.quality_testsTotal as number) ?? null,
      committedCount: committed,
      candidateCount,
      wisdomCount,
      durationSec: Number(durationSec),
    };
    fs.appendFileSync(telemetryFile, `${JSON.stringify(telemetryRecord)}\n`, 'utf-8');

    console.log(
      `[daemon] Cycle ${cycle + 1} done in ${durationSec}s | ` +
        `${stats.updateCount} ticks | BT: ${btStatus} | quality: ${qualityAfter.toFixed(3)}`
    );

    // Update persisted state
    daemonState.totalCycles++;
    daemonState.focusIndex = (focusIdx + 1) % focusRotation.length;
    daemonState.lastQuality = qualityAfter;
    if (qualityAfter > daemonState.bestQuality) {
      daemonState.bestQuality = qualityAfter;
    }
    daemonState.totalInputTokens += inputTokens;
    daemonState.totalOutputTokens += outputTokens;
    daemonState.totalCostUSD += costUSD;
    daemonState.lastFocus = focus;
    daemonState.lastCycleTimeISO = new Date().toISOString();

    // Persist type error baseline on first measurement (used for quality scoring)
    const cycleTypeErrors =
      (btBlackboard.typeErrorBaseline as number) || (btBlackboard.typeErrorCount as number) || 0;
    if (daemonState.typeErrorBaseline === 0 && cycleTypeErrors > 0) {
      daemonState.typeErrorBaseline = cycleTypeErrors;
      config.typeErrorBaseline = cycleTypeErrors;
      console.log(`[daemon] Established type error baseline: ${cycleTypeErrors}`);
    }

    fs.writeFileSync(stateFile, JSON.stringify(daemonState, null, 2), 'utf-8');

    // Persist file tracking (committed + quarantined files)
    const fileState = getDaemonFileState();
    fs.writeFileSync(fileStateFile, JSON.stringify(fileState, null, 2), 'utf-8');

    // Convergence detection: escalate strategy when quality plateaus
    if (qualityDelta <= 0 && committed === 0) {
      convergenceStreak++;
      if (convergenceStreak >= CONVERGENCE_THRESHOLD) {
        // Strategy escalation instead of giving up:
        // 1. Force next cycle to 'typefix' (most productive focus)
        // 2. Increase quarantine threshold to try harder on stuck files
        // 3. Clear committed-file tracking to retry with accumulated wisdom
        console.log(
          `[daemon] Plateau detected — ${convergenceStreak} consecutive zero-delta cycles. Escalating strategy.`
        );
        convergenceStreak = 0; // reset streak after escalation

        // Bump quarantine threshold so files get more attempts
        const oldThreshold = config.quarantineThreshold || 3;
        config.quarantineThreshold = oldThreshold + 2;
        console.log(
          `[daemon] Raised quarantine threshold: ${oldThreshold} → ${config.quarantineThreshold}`
        );

        // Force typefix focus for the next cycle (skip unproductive focuses)
        if (!opts.focus) {
          const typefixIdx = focusRotation.indexOf('typefix');
          if (typefixIdx >= 0) {
            daemonState.focusIndex = typefixIdx;
            console.log(`[daemon] Forcing next cycle to 'typefix' focus`);
          }
        }

        // If we've escalated twice already (threshold >= original+4), then truly stop
        if (config.quarantineThreshold >= quarantineThreshold + 4) {
          console.log(
            `[daemon] Escalated twice with no progress. Stopping to avoid wasting tokens.`
          );
          break;
        }
      }
    } else {
      convergenceStreak = 0;
    }

    cycle++;

    if (opts.alwaysOn && opts.cycleIntervalSec > 0) {
      console.log(`[daemon] Sleeping ${opts.cycleIntervalSec}s before next cycle...`);
      await sleep(opts.cycleIntervalSec * 1000);
    }
  }

  cleanup();

  console.log(`\n[daemon] Completed ${cycle} cycle(s).`);
  console.log(
    `[daemon] Best quality: ${daemonState.bestQuality.toFixed(3)} | ` +
      `Total cost: $${daemonState.totalCostUSD.toFixed(3)} | ` +
      `Total cycles: ${daemonState.totalCycles}`
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

/** Read a value from the AST's blackboard (composition is source of truth) */
function getASTBlackboardValue(ast: unknown, key: string): unknown {
  const visited = new WeakSet<object>();
  let result: unknown = undefined;

  const walk = (node: unknown): void => {
    if (result !== undefined || !node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (visited.has(obj)) return;
    visited.add(obj);

    if (obj.blackboard && typeof obj.blackboard === 'object' && !Array.isArray(obj.blackboard)) {
      const bb = obj.blackboard as Record<string, unknown>;
      if (key in bb) {
        result = bb[key];
        return;
      }
    }

    for (const k of Object.keys(obj)) {
      const val = obj[k];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) walk(item);
        } else if (!(val instanceof Map)) {
          walk(val);
        }
      }
      if (result !== undefined) return;
    }
  };
  walk(ast);
  return result;
}

// ── HoloMesh Daemon ─────────────────────────────────────────────────────────
// Decentralized knowledge exchange daemon.
// Uses holomesh-daemon-actions.ts for BT action handlers.

export async function holoMeshDaemonScript(opts: CLIOptions): Promise<void> {
  if (!opts.file) {
    console.error('Error: No composition file specified');
    console.error('Usage: holoscript holomesh-daemon compositions/holomesh-agent.hsplus [options]');
    process.exit(1);
  }

  const filePath = path.resolve(opts.file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  if (!process.env.MCP_API_KEY) {
    console.error('[holomesh-daemon] MCP_API_KEY environment variable is required');
    process.exit(1);
  }

  const rawSource = fs.readFileSync(filePath, 'utf-8');
  // Strip #version, #target, #mode directives (not supported by core parser)
  const source = rawSource.replace(/^#(version|target|mode)\s+.*/gm, '');
  const parseResult = parse(source);

  if (!parseResult.success || !parseResult.ast) {
    const errors =
      parseResult.errors?.map((e: { message: string }) => e.message).join(', ') || 'unknown';
    console.error(`[holomesh-daemon] Parse failed: ${errors}`);
    process.exit(1);
  }

  const compositionAST = parseResult.ast as Record<string, unknown>;
  const stateDir = path.resolve(path.dirname(filePath), '.holoscript');
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  const stateFile = path.join(stateDir, 'holomesh-state.json');

  console.log(`[holomesh-daemon] Composition: ${path.basename(filePath)}`);
  console.log(`[holomesh-daemon] Cycles: ${opts.cycles} | Always-on: ${opts.alwaysOn}`);

  // Lock file
  const lockFile = path.join(stateDir, 'holomesh-daemon.lock');
  const lockData = { pid: process.pid, time: Date.now(), heartbeat: Date.now() };

  if (fs.existsSync(lockFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
      if (Date.now() - existing.heartbeat < 120_000) {
        console.error(
          `[holomesh-daemon] Another daemon is running (PID ${existing.pid}). Remove ${lockFile} to force.`
        );
        process.exit(1);
      }
      console.log(`[holomesh-daemon] Reclaiming stale lock from PID ${existing.pid}`);
    } catch {
      /* corrupt lock, reclaim */
    }
  }
  fs.writeFileSync(lockFile, JSON.stringify(lockData), 'utf-8');

  const heartbeatTimer = setInterval(() => {
    try {
      fs.writeFileSync(lockFile, JSON.stringify({ ...lockData, heartbeat: Date.now() }), 'utf-8');
    } catch {
      /* */
    }
  }, 30_000);

  const cleanup = () => {
    clearInterval(heartbeatTimer);
    try {
      fs.rmSync(lockFile, { force: true });
    } catch {
      /* */
    }
  };
  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);

  // Late-import holomesh dependencies (they're in mcp-server, not core)
  let createHoloMeshDaemonActions: any;
  let HoloMeshOrchestratorClient: any;

  try {
    // Dynamic import from sibling package (mcp-server is a peer dep)
    // Try package import first, fall back to relative path for monorepo dev
    let actionsModule: any;
    let clientModule: any;
    try {
      actionsModule = await import('@holoscript/mcp-server/holomesh/agent/holomesh-daemon-actions');
      clientModule = await import('@holoscript/mcp-server/holomesh/orchestrator-client');
    } catch {
      // Monorepo: resolve via relative path from packages/core/src/cli/ to packages/mcp-server/src/
      actionsModule =
        await import('../../../mcp-server/src/holomesh/agent/holomesh-daemon-actions');
      clientModule = await import('../../../mcp-server/src/holomesh/orchestrator-client');
    }
    createHoloMeshDaemonActions = actionsModule.createHoloMeshDaemonActions;
    HoloMeshOrchestratorClient = clientModule.HoloMeshOrchestratorClient;
  } catch (err) {
    console.error(`[holomesh-daemon] Failed to import holomesh modules: ${(err as Error).message}`);
    console.error('[holomesh-daemon] Ensure @holoscript/mcp-server is installed');
    cleanup();
    process.exit(1);
  }

  // Create orchestrator client
  const meshConfig = {
    orchestratorUrl:
      process.env.MCP_ORCHESTRATOR_URL || 'https://mcp-orchestrator-production-45f9.up.railway.app',
    apiKey: process.env.MCP_API_KEY!,
    workspace: process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
    agentName: process.env.HOLOMESH_AGENT_NAME || 'holomesh-agent',
    discoveryIntervalMs: 5 * 60 * 1000,
    inboxIntervalMs: 60 * 1000,
    maxContributionsPerCycle: 5,
    maxQueriesPerCycle: 3,
    budgetCapUSD: parseFloat(process.env.HOLOMESH_BUDGET_CAP || '5'),
  };
  const client = new HoloMeshOrchestratorClient(meshConfig);

  // V2 P2P config from environment
  const v2Enabled = process.env.HOLOMESH_V2_ENABLED === 'true';
  const localAgentDid =
    process.env.HOLOMESH_AGENT_DID || (v2Enabled ? `did:holo:${meshConfig.agentName}` : undefined);

  // V3 Wallet config from environment
  const walletEnabled = process.env.HOLOMESH_WALLET_ENABLED === 'true';
  const walletTestnet = process.env.HOLOMESH_WALLET_TESTNET === 'true';

  // Create action handlers
  const { actions, wireTraitListeners } = createHoloMeshDaemonActions(client, {
    stateFile,
    verbose: opts.debug,
    v2Enabled,
    localAgentDid,
    localMcpUrl: process.env.HOLOMESH_LOCAL_MCP_URL || 'https://mcp.holoscript.net',
    crdtSnapshotPath: v2Enabled
      ? path.join(path.dirname(stateFile), 'holomesh-crdt.bin')
      : undefined,
    peerStorePath: v2Enabled
      ? path.join(path.dirname(stateFile), 'holomesh-peers.json')
      : undefined,
    walletEnabled,
    walletTestnet,
  });

  console.log(
    `[holomesh-daemon] ${Object.keys(actions).length} action handlers registered${v2Enabled ? ` (V2 P2P enabled, DID: ${localAgentDid})` : ''}${walletEnabled ? ' (V3 Wallet enabled)' : ''}`
  );

  // Cycle loop
  let cycle = 0;
  while (opts.alwaysOn || cycle < opts.cycles) {
    console.log(
      `\n[holomesh-daemon] === Cycle ${cycle + 1}${opts.alwaysOn ? '' : `/${opts.cycles}`} ===`
    );

    const cycleAST = JSON.parse(JSON.stringify(compositionAST));
    materializeTraits(cycleAST);

    const runtime = createProfileRuntime(cycleAST, {
      profile: PROFILES_HEADLESS,
      tickRate: 1,
      debug: opts.debug,
      hostCapabilities: createNodeHostCapabilities(path.dirname(filePath)),
    });

    for (const [name, handler] of Object.entries(actions)) {
      runtime.registerAction(name, handler as ActionHandler);
    }
    wireTraitListeners(runtime);

    const maxWaitMs = (opts.timeout ?? 5) * 60 * 1000;
    const btResult = await new Promise<{ status: string }>((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ status: 'timeout' });
        }
      }, maxWaitMs);

      runtime.on('bt_complete', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ status: 'complete' });
        }
      });

      runtime.start();
    });

    runtime.stop();
    console.log(`[holomesh-daemon] Cycle ${cycle + 1} ${btResult.status}`);

    cycle++;

    if (opts.alwaysOn || cycle < opts.cycles) {
      const intervalSec = opts.cycleIntervalSec > 0 ? opts.cycleIntervalSec : 120;
      const jitter = 1 + (Math.random() * 2 - 1) * 0.3;
      const waitMs = Math.round(intervalSec * 1000 * jitter);
      console.log(`[holomesh-daemon] Waiting ${Math.round(waitMs / 1000)}s before next cycle...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  cleanup();
  console.log('[holomesh-daemon] Done');
}

async function daemonStatus(jsonOutput = false): Promise<void> {
  const repoRoot = findGitRoot(process.cwd());
  const stateDir = path.join(repoRoot, '.holoscript');

  if (!fs.existsSync(stateDir)) {
    if (jsonOutput) {
      console.log(
        JSON.stringify({
          status: 'missing_state_dir',
          running: false,
          stateDir,
        })
      );
    } else {
      console.log('[daemon status] No state directory found. Run a daemon cycle first.');
    }
    return;
  }

  // Is daemon running? Check lock file heartbeat
  const lockFile = path.join(stateDir, 'daemon.lock');
  let isRunning = false;
  let lockPid = 0;
  let lastHeartbeat = 0;
  if (fs.existsSync(lockFile)) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
      lockPid = lock.pid;
      lastHeartbeat = lock.heartbeat;
      isRunning = Date.now() - lastHeartbeat < 120_000;
    } catch {
      /* corrupt lock */
    }
  }

  // Load daemon-state.json
  const stateFile = path.join(stateDir, 'daemon-state.json');
  let ds: Record<string, unknown> = {};
  if (fs.existsSync(stateFile)) {
    try {
      ds = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    } catch {
      /* */
    }
  }

  // Load file state
  const fileStateFile = path.join(stateDir, 'daemon-file-state.json');
  let fileState: { committed: string[]; failures: Record<string, number> } = {
    committed: [],
    failures: {},
  };
  if (fs.existsSync(fileStateFile)) {
    try {
      fileState = JSON.parse(fs.readFileSync(fileStateFile, 'utf-8'));
    } catch {
      /* */
    }
  }

  // Wisdom count
  const wisdomFile = path.join(stateDir, 'accumulated-wisdom.json');
  let wisdomCount = 0;
  if (fs.existsSync(wisdomFile)) {
    try {
      wisdomCount = (JSON.parse(fs.readFileSync(wisdomFile, 'utf-8')) as unknown[]).length;
    } catch {
      /* */
    }
  }

  // Fix ledger — last 5 entries
  const ledgerFile = path.join(stateDir, 'fix-ledger.json');
  let ledger: Array<{
    timestamp?: string;
    candidate?: string;
    focus?: string;
    result?: string;
    commitSha?: string;
    errorsAfter?: number;
  }> = [];
  if (fs.existsSync(ledgerFile)) {
    try {
      ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf-8'));
    } catch {
      /* */
    }
  }

  // Telemetry stats from JSONL cycle records
  const telemetryFile = path.join(stateDir, 'daemon-telemetry.jsonl');
  let telemetryCount = 0;
  let lastTelemetry: Record<string, unknown> | undefined;
  if (fs.existsSync(telemetryFile)) {
    try {
      const lines = fs
        .readFileSync(telemetryFile, 'utf-8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      telemetryCount = lines.length;
      if (lines.length > 0) {
        lastTelemetry = JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
      }
    } catch {
      // ignore malformed telemetry file
    }
  }

  const totalCycles = (ds.totalCycles as number) || 0;
  const lastFocus = (ds.lastFocus as string) || 'n/a';
  const lastCycleTime = ds.lastCycleTimeISO
    ? new Date(ds.lastCycleTimeISO as string).toLocaleString()
    : 'never';
  const bestQ = Number((ds.bestQuality as number) || 0).toFixed(3);
  const lastQ = Number((ds.lastQuality as number) || 0).toFixed(3);
  const baseline = ds.typeErrorBaseline
    ? `${ds.typeErrorBaseline} type errors`
    : 'not yet measured';
  const totalCost = Number((ds.totalCostUSD as number) || 0);
  const tokIn = Number((ds.totalInputTokens as number) || 0);
  const tokOut = Number((ds.totalOutputTokens as number) || 0);
  const quarantined = Object.values(fileState.failures).filter((n) => n >= 3).length;

  if (jsonOutput) {
    console.log(
      JSON.stringify({
        status: 'ok',
        running: isRunning,
        pid: lockPid || null,
        heartbeatAgeSec: lastHeartbeat > 0 ? Math.round((Date.now() - lastHeartbeat) / 1000) : null,
        stateDir,
        session: {
          totalCycles,
          lastFocus,
          lastCycleTimeISO: (ds.lastCycleTimeISO as string) || null,
        },
        quality: {
          best: Number(bestQ),
          last: Number(lastQ),
          baselineTypeErrors: (ds.typeErrorBaseline as number) || 0,
        },
        cost: {
          totalUSD: totalCost,
          tokensIn: tokIn,
          tokensOut: tokOut,
        },
        files: {
          committed: fileState.committed.length,
          quarantined,
        },
        wisdomCount,
        telemetry: {
          file: telemetryFile,
          count: telemetryCount,
          last: lastTelemetry || null,
        },
        recentLedger: ledger.slice(-5),
      })
    );
    return;
  }

  const G = '\x1b[32m';
  const Y = '\x1b[33m';
  const R = '\x1b[0m';
  const B = '\x1b[1m';

  const runStatus = isRunning
    ? `${G}● RUNNING${R} (PID ${lockPid}, heartbeat ${Math.round((Date.now() - lastHeartbeat) / 1000)}s ago)`
    : `${Y}○ IDLE${R}`;

  console.log(`\n${B}HoloDaemon Status${R}  ${runStatus}`);
  console.log(`  State dir:  ${stateDir}\n`);

  console.log(`${B}Session${R}`);
  console.log(`  Total cycles:  ${totalCycles}`);
  console.log(`  Last focus:    ${lastFocus}`);
  console.log(`  Last cycle:    ${lastCycleTime}`);

  console.log(`\n${B}Quality${R}`);
  console.log(`  Best:      ${bestQ}`);
  console.log(`  Last:      ${lastQ}`);
  console.log(`  Baseline:  ${baseline}`);

  const totalCostDisplay = totalCost.toFixed(4);
  const tokInDisplay = tokIn.toLocaleString();
  const tokOutDisplay = tokOut.toLocaleString();
  console.log(`\n${B}Cost${R}`);
  console.log(`  Total:      $${totalCostDisplay}`);
  console.log(`  Tokens in:  ${tokInDisplay}`);
  console.log(`  Tokens out: ${tokOutDisplay}`);

  console.log(`\n${B}Files${R}`);
  console.log(`  Committed:   ${fileState.committed.length}`);
  console.log(`  Quarantined: ${quarantined}`);
  console.log(`  Wisdom:      ${wisdomCount} entries`);
  console.log(`  Telemetry:   ${telemetryCount} entries`);

  const recent = ledger.slice(-5);
  if (recent.length > 0) {
    console.log(`\n${B}Recent Ledger Entries${R} (last ${recent.length})`);
    for (const entry of recent) {
      const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '?';
      const file = entry.candidate ? path.basename(entry.candidate) : '?';
      const result =
        entry.result === 'committed'
          ? `${G}committed${R}`
          : entry.result === 'rolled_back'
            ? `${Y}rolled_back${R}`
            : entry.result || '?';
      const sha = entry.commitSha ? ` (${entry.commitSha.slice(0, 7)})` : '';
      console.log(`  ${ts}  ${file}  ${result}${sha}  focus:${entry.focus || '?'}`);
    }
  }

  console.log('');
}

function showHelp(): void {
  console.log(`
HoloScript CLI — Headless Runner v5.0

Usage:
  holoscript run <file>     [--target node|python|ros2] [--profile headless|minimal|full] [--ticks <n>] [--daemon] [--debug]
  holoscript test <file>    [--debug]
  holoscript compile <file> [--target node|python] [--output <path>] [--enforce-gotchas]
  holoscript deploy <file>  [--share] [--publish] [--price <eth>] [--mint-nft] [--wallet-key <key>] [--author <name>] [--license <type>] [--server <url>]
  holoscript absorb <file>  [--output <path>] [--debug]
  holoscript daemon <file>  [--provider anthropic|xai|openai|ollama] [--tool-profile claude-hsplus|grok-hsplus|standard] [--cycles <n>] [--commit] [--model <model>] [--trial <n>] [--provider-rotation] [--always-on] [--cycle-interval-sec <n>] [--skills-dir <path>] [--allow-shell] [--allow-shell-command <cmd>] [--allow-host <host>] [--allow-path <path>] [--debug]
  holoscript daemon status  [--json]

Environment defaults (daemon):
  HOLODAEMON_PROVIDER       anthropic|xai|openai|ollama
  HOLODAEMON_TOOL_PROFILE   claude-hsplus|grok-hsplus|standard
  HOLODAEMON_MODEL          model identifier for selected provider

Supported file types:
  .hs       Agent templates, behavior trees, event handlers
  .hsplus   Full language with modules, types, async/await
  .holo     Spatial compositions (optional render target)

Examples:
  holoscript run agent.hs --target node --debug
  holoscript run agent.hs --daemon
  holoscript test tests.hs
  holoscript compile service.hsplus --target python --output service.py
  holoscript compile world.holo --enforce-gotchas
  holoscript absorb legacy.py --output agent.hsplus
  holoscript daemon compositions/self-improve-daemon.hsplus --cycles 15 --commit
  holoscript daemon compositions/self-improve-daemon.hsplus --provider xai --model grok-3
  holoscript daemon compositions/self-improve-daemon.hsplus --provider anthropic --tool-profile claude-hsplus
  holoscript daemon compositions/self-improve-daemon.hsplus --provider-rotation --cycles 10
  holoscript daemon status
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
    case 'deploy':
      await deployScript(opts);
      break;
    case 'absorb':
      absorbScript(opts);
      break;
    case 'daemon':
    case 'holodaemon':
      await daemonScript(opts);
      break;
    case 'holomesh-daemon':
      await holoMeshDaemonScript(opts);
      break;
    case 'daemon-status':
      await daemonStatus(opts.json);
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
