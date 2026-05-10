import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { runRepl } from './repl.js';
import { defaultModel, defaultOllamaHost, defaultApiKey } from './session.js';
import {
  defaultConfigPath,
  readLocalConfig,
  removeChannel,
  resolveApiKey,
  setChannelEnabled,
  setGatewayState,
  upsertChannel,
  writeLocalConfig,
  type AIBrittneyLocalConfig,
  type GatewayState,
} from './local-config.js';

interface ParsedArgs {
  model?: string;
  host?: string;
  apiKey?: string;
  toolsEnabled?: boolean;
  showVersion?: boolean;
  showHelp?: boolean;
  subcommand?: 'configure' | 'gateway' | 'channels';
  positional: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model' || a === '-m') {
      out.model = argv[++i];
    } else if (a === '--host' || a === '-H') {
      out.host = argv[++i];
    } else if (a === '--api-key' || a === '-k') {
      out.apiKey = argv[++i];
    } else if (a === '--cloud') {
      // Convenience flag — point at Ollama Cloud + use OLLAMA_API_KEY.
      out.host = out.host ?? 'https://ollama.com';
    } else if (a === '--tools' || a === '-t') {
      out.toolsEnabled = true;
    } else if (a === '--no-tools') {
      out.toolsEnabled = false;
    } else if (a === '--version' || a === '-v') {
      out.showVersion = true;
    } else if (a === '--help' || a === '-h') {
      out.showHelp = true;
    } else if (!out.subcommand && (a === 'configure' || a === 'gateway' || a === 'channels')) {
      out.subcommand = a;
    } else {
      out.positional.push(a);
    }
  }
  return out;
}

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function printHelp(): void {
  const v = readVersion();
  process.stdout.write(`AIBrittney v${v} — interactive CLI agent for HoloScript

usage:
  aibrittney                       start REPL against local ollama
  aibrittney --model <name>        use specific model (e.g. qwen2.5-coder:7b)
  aibrittney --host <url>          point at a remote ollama
  aibrittney --api-key <key>       bearer token for hosted endpoints
  aibrittney --cloud --model kimi-k2.6:cloud
                                   shortcut: Ollama Cloud + the named model
  aibrittney --tools               enable MCP tool calling
  aibrittney configure             show local config
  aibrittney configure set <key> <value>
                                   set model, host, api-key-env, or tools
  aibrittney channels list         list configured channels
  aibrittney channels add <id> <type> <target>
                                   add or replace a messaging channel
  aibrittney gateway start|status|stop
                                   manage the local gateway heartbeat process
  aibrittney --version             print version
  aibrittney --help                print this

defaults:
  model = ${defaultModel()} (override via AIBRITTNEY_MODEL or --model)
  host  = ${defaultOllamaHost()} (override via OLLAMA_HOST or --host)
  api-key = ${defaultApiKey() ? '<set via OLLAMA_API_KEY>' : '<not set — local-only>'}
  tools = OFF (toggle in REPL with /tools, or pass --tools)
  config = ${defaultConfigPath()}

REPL slash commands:
  /help /exit /clear /model <name> /system <prompt> /show /tools

Ollama Cloud usage:
  The same /api/chat protocol works against ollama.com when the request
  carries an Authorization: Bearer header. Cloud-class models like
  kimi-k2.6:cloud require a paid Ollama account.

    export OLLAMA_API_KEY=<your-cloud-key>
    aibrittney --cloud --model kimi-k2.6:cloud

  --cloud is just shorthand for --host https://ollama.com. AIBrittney
  warns at startup if --host is non-localhost and no api-key is set.

tool calling (v0.2, opt-in):
  - requires HOLOSCRIPT_API_KEY (or MCP_API_KEY) in env
  - exposes a curated set of MCP tools to the local model:
    holo_query_codebase, holo_ask_codebase, knowledge_query, holo_parse_to_graph
  - tool calls are dispatched via the orchestrator at MCP_ORCHESTRATOR_URL
    (default https://mcp-orchestrator-production-45f9.up.railway.app)
  - the model must natively support function/tool calls (qwen2.5-coder,
    llama3.1+, kimi-k2.6, etc). Models without tool tokens fall back to
    plain chat with no calls.

prerequisites (local mode):
  - ollama running locally on ${defaultOllamaHost()}
  - the chosen model pulled (e.g. \`ollama pull qwen2.5-coder:7b\`)
`);
}

function printConfig(config: AIBrittneyLocalConfig, configPath: string): void {
  process.stdout.write(`config: ${configPath}\n`);
  process.stdout.write(`model: ${config.model ?? '<env/default>'}\n`);
  process.stdout.write(`host: ${config.ollamaHost ?? '<env/default>'}\n`);
  process.stdout.write(`api-key-env: ${config.apiKeyEnv ?? 'OLLAMA_API_KEY'}\n`);
  process.stdout.write(`tools: ${config.toolsEnabled === undefined ? '<cli/repl default>' : String(config.toolsEnabled)}\n`);
  process.stdout.write(`channels: ${config.channels.length}\n`);
  if (config.gateway) {
    process.stdout.write(
      `gateway: ${config.gateway.status}${config.gateway.pid ? ` pid=${config.gateway.pid}` : ''}\n`,
    );
  }
}

function handleConfigure(args: ParsedArgs, configPath: string): number {
  const config = readLocalConfig(configPath);
  const [action, key, ...rest] = args.positional;
  const value = rest.join(' ').trim();

  if (!action || action === 'show') {
    printConfig(config, configPath);
    return 0;
  }
  if (action === 'path') {
    process.stdout.write(`${configPath}\n`);
    return 0;
  }
  if (action === 'set') {
    if (!key || !value) return usageError('usage: aibrittney configure set <model|host|api-key-env|tools> <value>');
    const next = { ...config };
    switch (key) {
      case 'model':
        next.model = value;
        break;
      case 'host':
        next.ollamaHost = value;
        break;
      case 'api-key-env':
        next.apiKeyEnv = value;
        break;
      case 'tools':
        next.toolsEnabled = parseOnOff(value);
        if (next.toolsEnabled === undefined) return usageError('tools must be one of: on, off, true, false');
        break;
      default:
        return usageError(`unknown config key: ${key}`);
    }
    writeLocalConfig(next, configPath);
    process.stdout.write(`updated ${key} in ${configPath}\n`);
    return 0;
  }
  if (action === 'unset') {
    if (!key) return usageError('usage: aibrittney configure unset <model|host|api-key-env|tools>');
    const next = { ...config };
    switch (key) {
      case 'model':
        delete next.model;
        break;
      case 'host':
        delete next.ollamaHost;
        break;
      case 'api-key-env':
        delete next.apiKeyEnv;
        break;
      case 'tools':
        delete next.toolsEnabled;
        break;
      default:
        return usageError(`unknown config key: ${key}`);
    }
    writeLocalConfig(next, configPath);
    process.stdout.write(`unset ${key} in ${configPath}\n`);
    return 0;
  }
  return usageError(`unknown configure action: ${action}`);
}

function handleChannels(args: ParsedArgs, configPath: string): number {
  const config = readLocalConfig(configPath);
  const positional = args.positional.filter((item) => item !== '--disabled');
  const disabled = args.positional.includes('--disabled');
  const [action, id, type, ...targetParts] = positional;

  if (!action || action === 'list') {
    if (config.channels.length === 0) {
      process.stdout.write('no channels configured\n');
      return 0;
    }
    for (const channel of config.channels) {
      process.stdout.write(
        `${channel.enabled ? 'on ' : 'off'} ${channel.id} ${channel.type} ${channel.target}\n`,
      );
    }
    return 0;
  }
  if (action === 'add') {
    const target = targetParts.join(' ').trim();
    if (!id || !type || !target) return usageError('usage: aibrittney channels add <id> <type> <target> [--disabled]');
    const next = upsertChannel(config, { id, type, target, enabled: !disabled });
    writeLocalConfig(next, configPath);
    process.stdout.write(`channel ${id} saved\n`);
    return 0;
  }
  if (action === 'remove') {
    if (!id) return usageError('usage: aibrittney channels remove <id>');
    const next = removeChannel(config, id);
    writeLocalConfig(next, configPath);
    process.stdout.write(`channel ${id} removed\n`);
    return 0;
  }
  if (action === 'enable' || action === 'disable') {
    if (!id) return usageError(`usage: aibrittney channels ${action} <id>`);
    if (!config.channels.some((channel) => channel.id === id)) return usageError(`unknown channel: ${id}`);
    const next = setChannelEnabled(config, id, action === 'enable');
    writeLocalConfig(next, configPath);
    process.stdout.write(`channel ${id} ${action === 'enable' ? 'enabled' : 'disabled'}\n`);
    return 0;
  }
  return usageError(`unknown channels action: ${action}`);
}

async function handleGateway(args: ParsedArgs, configPath: string): Promise<number> {
  const config = readLocalConfig(configPath);
  const [action = 'status'] = args.positional;
  if (action === 'status') {
    const state = config.gateway;
    if (!state) {
      process.stdout.write('gateway: stopped\n');
      return 0;
    }
    const alive = state.pid ? isProcessRunning(state.pid) : false;
    const visibleStatus =
      alive || state.status === 'stopped' ? state.status : 'stale';
    process.stdout.write(`gateway: ${visibleStatus}\n`);
    if (state.pid) process.stdout.write(`pid: ${state.pid}\n`);
    if (state.lastHeartbeatAt) process.stdout.write(`last-heartbeat: ${state.lastHeartbeatAt}\n`);
    process.stdout.write(`channels: ${config.channels.filter((channel) => channel.enabled).length}\n`);
    return 0;
  }
  if (action === 'start') {
    const currentPid = config.gateway?.pid;
    if (currentPid && isProcessRunning(currentPid)) {
      process.stdout.write(`gateway already running pid=${currentPid}\n`);
      return 0;
    }
    const entry = process.argv[1] ?? fileURLToPath(import.meta.url);
    const child = spawn(process.execPath, [entry, 'gateway', 'run'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, AIBRITTNEY_CONFIG: configPath },
    });
    child.unref();
    const state = gatewayState('starting', config, configPath, child.pid);
    writeLocalConfig(setGatewayState(config, state), configPath);
    process.stdout.write(`gateway starting pid=${child.pid ?? 'unknown'}\n`);
    return 0;
  }
  if (action === 'stop') {
    const pid = config.gateway?.pid;
    if (pid && isProcessRunning(pid)) {
      process.kill(pid);
    }
    const state = {
      ...gatewayState('stopped', config, configPath, pid),
      stoppedAt: new Date().toISOString(),
    };
    writeLocalConfig(setGatewayState(config, state), configPath);
    process.stdout.write('gateway stopped\n');
    return 0;
  }
  if (action === 'run') {
    const once = args.positional.includes('--once');
    const intervalMs = readIntervalMs(args.positional);
    return runGatewayLoop(configPath, intervalMs, once);
  }
  return usageError(`unknown gateway action: ${action}`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.showVersion) {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }
  if (args.showHelp || args.positional.includes('help')) {
    printHelp();
    return 0;
  }
  const configPath = defaultConfigPath();
  if (args.subcommand === 'configure') {
    return handleConfigure(args, configPath);
  }
  if (args.subcommand === 'channels') {
    return handleChannels(args, configPath);
  }
  if (args.subcommand === 'gateway') {
    return handleGateway(args, configPath);
  }
  const config = readLocalConfig(configPath);
  return runRepl({
    model: args.model ?? config.model,
    ollamaHost: args.host ?? config.ollamaHost,
    apiKey: args.apiKey ?? resolveApiKey(config),
    toolsEnabled: args.toolsEnabled ?? config.toolsEnabled,
  });
}

function usageError(message: string): number {
  process.stderr.write(`aibrittney: ${message}\n`);
  return 2;
}

function parseOnOff(value: string): boolean | undefined {
  if (value === 'on' || value === 'true' || value === '1') return true;
  if (value === 'off' || value === 'false' || value === '0') return false;
  return undefined;
}

function gatewayState(
  status: GatewayState['status'],
  config: AIBrittneyLocalConfig,
  configPath: string,
  pid = process.pid,
): GatewayState {
  const now = new Date().toISOString();
  return {
    status,
    pid,
    startedAt: config.gateway?.startedAt ?? now,
    lastHeartbeatAt: status === 'stopped' ? config.gateway?.lastHeartbeatAt : now,
    configPath,
    channelCount: config.channels.filter((channel) => channel.enabled).length,
  };
}

async function runGatewayLoop(configPath: string, intervalMs: number, once: boolean): Promise<number> {
  process.stdout.write(`aibrittney gateway running pid=${process.pid} config=${configPath}\n`);
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    do {
      const config = readLocalConfig(configPath);
      const state = gatewayState('running', config, configPath);
      writeLocalConfig(setGatewayState(config, state), configPath);
      if (once) {
        const onceConfig = readLocalConfig(configPath);
        writeLocalConfig(
          setGatewayState(onceConfig, {
            ...gatewayState('stopped', onceConfig, configPath),
            lastHeartbeatAt: state.lastHeartbeatAt,
            stoppedAt: new Date().toISOString(),
          }),
          configPath,
        );
        return 0;
      }
      await sleep(intervalMs);
    } while (!stopping);

    const config = readLocalConfig(configPath);
    writeLocalConfig(
      setGatewayState(config, {
        ...gatewayState('stopped', config, configPath),
        stoppedAt: new Date().toISOString(),
      }),
      configPath,
    );
    return 0;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

function readIntervalMs(args: string[]): number {
  const idx = args.indexOf('--interval-ms');
  if (idx < 0) return 30_000;
  const parsed = Number(args[idx + 1]);
  return Number.isFinite(parsed) && parsed >= 250 ? parsed : 30_000;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`fatal: ${(err as Error).stack ?? String(err)}\n`);
    process.exit(1);
  },
);
