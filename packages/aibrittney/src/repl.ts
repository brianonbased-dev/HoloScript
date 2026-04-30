import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Session, type SessionConfig, DEFAULT_SYSTEM_PROMPT } from './session.js';
import { streamChatFromOllama } from './ollama-stream.js';
import { runAgentTurn, type AgentEvent } from './agent.js';
import { McpClient, defaultMcpConfig } from './mcp-client.js';
import { TOOL_USE_SYSTEM_GUIDANCE } from './tools.js';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

function banner(session: Session, toolsOn: boolean): void {
  stdout.write(`${CYAN}${'ᴬᴵ'}Brittney${RESET} v0.2 — local agent for HoloScript\n`);
  stdout.write(`${DIM}model: ${session.config.model}  ollama: ${session.config.ollamaHost}${RESET}\n`);
  const toolsLabel = toolsOn ? `${GREEN}ON${RESET}` : `${DIM}OFF${RESET}`;
  stdout.write(`${DIM}/help for commands. Tools: ${toolsLabel}${DIM}. Ctrl+C to quit.${RESET}\n\n`);
}

function help(): void {
  stdout.write(`${CYAN}commands${RESET}\n`);
  stdout.write(`  ${GREEN}/help${RESET}           show this\n`);
  stdout.write(`  ${GREEN}/exit${RESET} | /quit   leave\n`);
  stdout.write(`  ${GREEN}/clear${RESET}          forget conversation history (keeps system prompt)\n`);
  stdout.write(`  ${GREEN}/model${RESET} <name>   switch ollama model (e.g. qwen2.5-coder:7b, brittney-qwen:latest)\n`);
  stdout.write(`  ${GREEN}/system${RESET} <text>  replace system prompt for this session\n`);
  stdout.write(`  ${GREEN}/show${RESET}           print current session config\n`);
  stdout.write(`  ${GREEN}/tools${RESET}          toggle MCP tool calling on/off\n`);
  stdout.write('\n');
}

interface ReplState {
  toolsOn: boolean;
}

async function handleSlash(
  cmd: string,
  session: Session,
  state: ReplState,
): Promise<'continue' | 'exit'> {
  const [verb, ...rest] = cmd.slice(1).split(/\s+/);
  const arg = rest.join(' ').trim();
  switch (verb) {
    case 'help':
      help();
      return 'continue';
    case 'exit':
    case 'quit':
      return 'exit';
    case 'clear':
      session.clear();
      stdout.write(`${DIM}history cleared${RESET}\n`);
      return 'continue';
    case 'model':
      if (!arg) {
        stdout.write(`${YELLOW}usage: /model <name>${RESET}\n`);
        return 'continue';
      }
      session.setModel(arg);
      stdout.write(`${DIM}model -> ${arg}${RESET}\n`);
      return 'continue';
    case 'system':
      if (!arg) {
        stdout.write(`${YELLOW}usage: /system <prompt text>${RESET}\n`);
        return 'continue';
      }
      session.setSystemPrompt(arg);
      stdout.write(`${DIM}system prompt updated; history reset to system-only${RESET}\n`);
      session.clear();
      return 'continue';
    case 'show':
      stdout.write(`${DIM}model:  ${session.config.model}${RESET}\n`);
      stdout.write(`${DIM}host:   ${session.config.ollamaHost}${RESET}\n`);
      stdout.write(`${DIM}msgs:   ${session.history.length} (incl. system)${RESET}\n`);
      stdout.write(`${DIM}tools:  ${state.toolsOn ? 'ON' : 'OFF'}${RESET}\n`);
      return 'continue';
    case 'tools': {
      state.toolsOn = !state.toolsOn;
      const newPrompt = state.toolsOn
        ? DEFAULT_SYSTEM_PROMPT + TOOL_USE_SYSTEM_GUIDANCE
        : DEFAULT_SYSTEM_PROMPT;
      session.setSystemPrompt(newPrompt);
      stdout.write(`${DIM}tools -> ${state.toolsOn ? 'ON' : 'OFF'}; system prompt + history reset${RESET}\n`);
      return 'continue';
    }
    default:
      stdout.write(`${YELLOW}unknown command: /${verb}${RESET}\n`);
      return 'continue';
  }
}

async function streamReply(session: Session): Promise<void> {
  const ac = new AbortController();
  const onSigint = () => ac.abort();
  process.once('SIGINT', onSigint);
  let assistantBuffer = '';
  let firstToken = true;
  let streamDone = false;
  try {
    for await (const chunk of streamChatFromOllama(
      session.config.ollamaHost,
      session.config.model,
      session.messages(),
      ac.signal,
    )) {
      if (chunk.type === 'token') {
        if (firstToken) {
          stdout.write(`${CYAN}ᴬᴵ${RESET} `);
          firstToken = false;
        }
        stdout.write(chunk.content);
        assistantBuffer += chunk.content;
      } else if (chunk.type === 'done') {
        streamDone = true;
        stdout.write('\n');
        if (chunk.totalTokens && chunk.evalDurationMs) {
          const tps = chunk.totalTokens / (chunk.evalDurationMs / 1000);
          stdout.write(`${DIM}${chunk.totalTokens} tok in ${chunk.evalDurationMs.toFixed(0)}ms (${tps.toFixed(1)} tok/s)${RESET}\n`);
        }
      } else if (chunk.type === 'error') {
        stdout.write(`\n${RED}error:${RESET} ${chunk.content}\n`);
        return;
      }
    }
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
  // Only save completed responses. If the stream was aborted (Ctrl+C) or
  // errored mid-stream, assistantBuffer holds a partial message that would
  // corrupt the model's context on subsequent turns.
  if (assistantBuffer && streamDone) session.push('assistant', assistantBuffer);
}

export interface RunReplOptions extends Partial<SessionConfig> {
  toolsEnabled?: boolean;
}

export async function runRepl(initial: RunReplOptions = {}): Promise<number> {
  const { toolsEnabled, ...sessionInit } = initial;
  const state: ReplState = { toolsOn: toolsEnabled === true };
  const baseSystem = sessionInit.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const session = new Session({
    ...sessionInit,
    systemPrompt: state.toolsOn ? baseSystem + TOOL_USE_SYSTEM_GUIDANCE : baseSystem,
  });
  const mcp = state.toolsOn ? new McpClient(defaultMcpConfig()) : null;
  if (state.toolsOn && mcp && !mcp.config.apiKey) {
    stdout.write(
      `${YELLOW}warn: tools requested but HOLOSCRIPT_API_KEY (or MCP_API_KEY) is not set. ` +
        `Tool calls will fail until you set one.${RESET}\n`,
    );
  }
  banner(session, state.toolsOn);
  const rl = createInterface({ input: stdin, output: stdout });

  while (true) {
    let line: string;
    try {
      line = await rl.question(`${GREEN}>${RESET} `);
    } catch {
      break;
    }
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('/')) {
      const action = await handleSlash(trimmed, session, state);
      if (action === 'exit') break;
      continue;
    }
    session.push('user', trimmed);
    if (state.toolsOn && mcp) {
      await agentReply(session, mcp);
    } else {
      await streamReply(session);
    }
  }

  rl.close();
  return 0;
}

async function agentReply(session: Session, mcp: McpClient): Promise<void> {
  const ac = new AbortController();
  const onSigint = () => ac.abort();
  process.once('SIGINT', onSigint);
  const onEvent = (e: AgentEvent): void => {
    switch (e.kind) {
      case 'tool-call':
        stdout.write(`${DIM}↳ ${e.message}${RESET}\n`);
        break;
      case 'tool-result':
        stdout.write(`${DIM}  ${e.message}${RESET}\n`);
        break;
      case 'final':
        if (e.message.trim()) {
          stdout.write(`${CYAN}ᴬᴵ${RESET} ${e.message}\n`);
        }
        break;
      case 'error':
        stdout.write(`${RED}error:${RESET} ${e.message}\n`);
        break;
      case 'thinking':
      default:
        break;
    }
  };
  try {
    await runAgentTurn({ session, mcp, signal: ac.signal, onEvent });
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}
