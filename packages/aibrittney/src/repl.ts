import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Session, type SessionConfig } from './session.js';
import { streamChatFromOllama } from './ollama-stream.js';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

function banner(session: Session): void {
  stdout.write(`${CYAN}${'ᴬᴵ'}Brittney${RESET} v0.1 — local agent for HoloScript\n`);
  stdout.write(`${DIM}model: ${session.config.model}  ollama: ${session.config.ollamaHost}${RESET}\n`);
  stdout.write(`${DIM}/help for commands. Tools: OFF. Ctrl+C to quit.${RESET}\n\n`);
}

function help(): void {
  stdout.write(`${CYAN}commands${RESET}\n`);
  stdout.write(`  ${GREEN}/help${RESET}           show this\n`);
  stdout.write(`  ${GREEN}/exit${RESET} | /quit   leave\n`);
  stdout.write(`  ${GREEN}/clear${RESET}          forget conversation history (keeps system prompt)\n`);
  stdout.write(`  ${GREEN}/model${RESET} <name>   switch ollama model (e.g. qwen2.5-coder:7b, brittney-qwen:latest)\n`);
  stdout.write(`  ${GREEN}/system${RESET} <text>  replace system prompt for this session\n`);
  stdout.write(`  ${GREEN}/show${RESET}           print current session config\n`);
  stdout.write('\n');
}

async function handleSlash(cmd: string, session: Session): Promise<'continue' | 'exit'> {
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
      return 'continue';
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
  if (assistantBuffer) session.push('assistant', assistantBuffer);
}

export async function runRepl(initial: Partial<SessionConfig> = {}): Promise<number> {
  const session = new Session(initial);
  banner(session);
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
      const action = await handleSlash(trimmed, session);
      if (action === 'exit') break;
      continue;
    }
    session.push('user', trimmed);
    await streamReply(session);
  }

  rl.close();
  return 0;
}
