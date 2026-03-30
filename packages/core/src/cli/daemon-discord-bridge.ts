#!/usr/bin/env node

/**
 * daemon-discord-bridge
 *
 * Bridges daemon queue files to/from Discord:
 * - Reads `.holoscript/outbox.jsonl` and sends messages to a Discord channel.
 * - Listens for channel messages and appends them to `.holoscript/inbox.jsonl`.
 *
 * Required env vars:
 * - DISCORD_BOT_TOKEN
 * - DISCORD_CHANNEL_ID
 *
 * Optional env vars:
 * - HOLODAEMON_STATE_DIR (default: <cwd>/.holoscript)
 * - DISCORD_BRIDGE_POLL_MS (default: 2000)
 */

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { createHmac } from 'crypto';

interface BridgeState {
  outboxLineOffset: number;
}

interface QueueEnvelope {
  timestamp: string;
  channel?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

interface BackoffState {
  failures: number;
  nextAttemptAt: number;
}

function resolveModuleSpecifier(raw: string): string {
  if (!raw) return 'discord.js';
  const normalized = raw.trim();
  if (!normalized) return 'discord.js';
  if (
    path.isAbsolute(normalized) ||
    normalized.startsWith('.') ||
    normalized.endsWith('.js') ||
    normalized.endsWith('.mjs')
  ) {
    const abs = path.isAbsolute(normalized) ? normalized : path.resolve(process.cwd(), normalized);
    return pathToFileURL(abs).href;
  }
  return normalized;
}

function backoffDelayMs(failures: number, baseMs: number, maxMs: number): number {
  const jitter = Math.floor(Math.random() * Math.max(250, Math.floor(baseMs / 2)));
  return Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, failures - 1)) + jitter);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function signEnvelope(envelope: Record<string, unknown>, secret: string): string {
  const payload = stableJson(envelope);
  return createHmac('sha256', secret).update(payload).digest('hex');
}

interface DiscordLikeChannel {
  isTextBased: () => boolean;
  send: (message: string) => Promise<unknown>;
}

interface DiscordMessageLike {
  author?: { bot?: boolean; id?: string; username?: string };
  channelId?: string;
  content?: unknown;
  id?: string;
  guildId?: string | null;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readState(filePath: string): BridgeState {
  try {
    if (!fs.existsSync(filePath)) return { outboxLineOffset: 0 };
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as BridgeState;
  } catch {
    return { outboxLineOffset: 0 };
  }
}

function writeState(filePath: string, state: BridgeState): void {
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

function appendJsonl(filePath: string, payload: Record<string, unknown>): void {
  const line = `${JSON.stringify(payload)}\n`;
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  fs.writeFileSync(filePath, `${existing}${line}`, 'utf-8');
}

function readJsonl(filePath: string): QueueEnvelope[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs
    .readFileSync(filePath, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const out: QueueEnvelope[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as QueueEnvelope;
      out.push(parsed);
    } catch {
      // Ignore malformed line; keep bridge alive.
    }
  }
  return out;
}

async function main(): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!token || !channelId) {
    console.error('[discord-bridge] Missing DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID');
    process.exit(1);
  }
  const requiredChannelId = channelId;

  const stateDir = process.env.HOLODAEMON_STATE_DIR
    ? path.resolve(process.env.HOLODAEMON_STATE_DIR)
    : path.resolve(process.cwd(), '.holoscript');
  ensureDir(stateDir);

  const inboxPath = path.join(stateDir, 'inbox.jsonl');
  const outboxPath = path.join(stateDir, 'outbox.jsonl');
  const statePath = path.join(stateDir, 'discord-bridge-state.json');
  const pollMs = Math.max(500, Number(process.env.DISCORD_BRIDGE_POLL_MS || 2000));
  const backoffBaseMs = Math.max(1000, Number(process.env.DISCORD_BRIDGE_BACKOFF_BASE_MS || 2000));
  const backoffMaxMs = Math.max(
    backoffBaseMs,
    Number(process.env.DISCORD_BRIDGE_BACKOFF_MAX_MS || 60000)
  );
  const moduleSpec = resolveModuleSpecifier(process.env.DISCORD_BRIDGE_MODULE || 'discord.js');
  const inboundSignatureSecret = process.env.HOLODAEMON_INBOX_SIGNATURE_SECRET || '';

  let discordModule: Record<string, unknown>;
  try {
    const dynamicImport = new Function('m', 'return import(m)') as (
      moduleName: string
    ) => Promise<unknown>;
    discordModule = (await dynamicImport(moduleSpec)) as Record<string, unknown>;
  } catch {
    console.error(
      '[discord-bridge] discord.js not installed. Add it with: pnpm --filter @holoscript/core add discord.js'
    );
    process.exit(1);
  }

  const ClientCtor = discordModule.Client as {
    new (opts: { intents: number[] }): {
      channels: { fetch: (channelId: string) => Promise<unknown> };
      user?: { tag?: string };
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      login: (token: string) => Promise<unknown>;
      destroy: () => Promise<void>;
    };
  };
  const GatewayIntentBits = discordModule.GatewayIntentBits as Record<string, number>;
  const client = new ClientCtor({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  const state = readState(statePath);
  let timer: ReturnType<typeof setInterval> | null = null;
  const backoff: BackoffState = { failures: 0, nextAttemptAt: 0 };

  async function flushOutbox(): Promise<void> {
    if (Date.now() < backoff.nextAttemptAt) return;

    const envelopes = readJsonl(outboxPath);
    if (state.outboxLineOffset >= envelopes.length) return;

    const channel = (await client.channels.fetch(requiredChannelId)) as DiscordLikeChannel | null;
    if (!channel || typeof channel.isTextBased !== 'function' || !channel.isTextBased()) {
      throw new Error('Discord channel unavailable or not text-based');
    }

    for (let i = state.outboxLineOffset; i < envelopes.length; i++) {
      const env = envelopes[i];
      const text = typeof env.message === 'string' ? env.message.trim() : '';
      if (!text) {
        state.outboxLineOffset = i + 1;
        continue;
      }
      await channel.send(text);
      state.outboxLineOffset = i + 1;
    }

    writeState(statePath, state);
    backoff.failures = 0;
    backoff.nextAttemptAt = 0;
  }

  client.on('ready', () => {
    console.log(`[discord-bridge] Ready as ${client.user?.tag || 'unknown-user'}`);
    timer = setInterval(() => {
      flushOutbox().catch((error: unknown) => {
        backoff.failures += 1;
        const delay = backoffDelayMs(backoff.failures, backoffBaseMs, backoffMaxMs);
        backoff.nextAttemptAt = Date.now() + delay;
        console.error(
          `[discord-bridge] Outbox flush failed (#${backoff.failures}). Retrying in ${delay}ms:`,
          (error as Error).message
        );
      });
    }, pollMs);
  });

  client.on('messageCreate', (...args: unknown[]) => {
    const message = (args[0] ?? {}) as DiscordMessageLike;
    if (!message || message.author?.bot) return;
    if (message.channelId !== requiredChannelId) return;

    const envelope: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      channel: 'discord',
      authorId: message.author?.id,
      authorName: message.author?.username,
      message: String(message.content || ''),
      metadata: {
        messageId: message.id,
        guildId: message.guildId,
        channelId: message.channelId,
      },
    };

    if (inboundSignatureSecret) {
      const signature = signEnvelope(envelope, inboundSignatureSecret);
      (envelope.metadata as Record<string, unknown>).signature = signature;
    }

    appendJsonl(inboxPath, envelope);
  });

  const shutdown = async () => {
    if (timer) clearInterval(timer);
    writeState(statePath, state);
    await client.destroy();
  };

  process.once('SIGINT', () => {
    shutdown().finally(() => process.exit(0));
  });
  process.once('SIGTERM', () => {
    shutdown().finally(() => process.exit(0));
  });

  await client.login(token);
}

main().catch((error) => {
  console.error('[discord-bridge] Fatal:', (error as Error).message);
  process.exit(1);
});
