import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runRepl } from './repl.js';
import { defaultModel, defaultOllamaHost } from './session.js';

interface ParsedArgs {
  model?: string;
  host?: string;
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
  aibrittney                  start interactive REPL with default model
  aibrittney --model <name>   start REPL with specific ollama model
  aibrittney --host <url>     point at a remote ollama (default: ${defaultOllamaHost()})
  aibrittney --tools          enable MCP tool calling (codebase, knowledge, parser)
  aibrittney configure        manage local config (placeholder in v0.1)
  aibrittney gateway          run as a background gateway (placeholder in v0.1)
  aibrittney channels         manage messaging channels (placeholder in v0.1)
  aibrittney --version        print version
  aibrittney --help           print this

defaults:
  model = ${defaultModel()} (override via AIBRITTNEY_MODEL or --model)
  host  = ${defaultOllamaHost()} (override via OLLAMA_HOST or --host)
  tools = OFF (toggle in REPL with /tools, or pass --tools)

REPL slash commands:
  /help /exit /clear /model <name> /system <prompt> /show /tools

tool calling (v0.2, opt-in):
  - requires HOLOSCRIPT_API_KEY (or MCP_API_KEY) in env
  - exposes a curated set of MCP tools to the local model:
    holo_query_codebase, holo_ask_codebase, knowledge_query, holo_parse_to_graph
  - tool calls are dispatched via the orchestrator at MCP_ORCHESTRATOR_URL
    (default https://mcp-orchestrator-production-45f9.up.railway.app)
  - the model must natively support function/tool calls (qwen2.5-coder, llama3.1+,
    etc). Brittney custom models that don't expose tool tokens will fall back
    to plain chat with no calls.

prerequisites:
  - ollama running locally on ${defaultOllamaHost()}
  - the chosen model pulled (e.g. \`ollama pull qwen2.5-coder:7b\`)
`);
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
  if (args.subcommand === 'configure' || args.subcommand === 'gateway' || args.subcommand === 'channels') {
    process.stderr.write(
      `aibrittney: subcommand "${args.subcommand}" is reserved for v0.2+ (BUILDS 3-4 in roadmap). Not implemented yet.\n`,
    );
    return 2;
  }
  return runRepl({ model: args.model, ollamaHost: args.host, toolsEnabled: args.toolsEnabled });
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`fatal: ${(err as Error).stack ?? String(err)}\n`);
    process.exit(1);
  },
);
