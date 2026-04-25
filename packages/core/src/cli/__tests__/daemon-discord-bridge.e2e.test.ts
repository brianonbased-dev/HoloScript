import { afterEach, describe, expect, it } from 'vitest';
import { readJson } from '../../errors/safeJsonParse';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

interface BridgeHarness {
  proc: ChildProcess;
  tempDir: string;
  stateDir: string;
  sentFile: string;
  stdout: string[];
  stderr: string[];
}

function waitFor(predicate: () => boolean, timeoutMs = 30000, intervalMs = 30): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('Timed out waiting for bridge condition'));
      }
    }, intervalMs);
  });
}

function makeMockDiscordModule(modulePath: string): void {
  const mockCode = `
export const GatewayIntentBits = {
  Guilds: 1,
  GuildMessages: 2,
  MessageContent: 4,
};

class MockChannel {
  async send(message) {
    const fs = await import('fs');
    const file = process.env.MOCK_DISCORD_SENT_FILE;
    const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
    fs.writeFileSync(file, prev + String(message) + '\\n', 'utf-8');
  }

  isTextBased() {
    return true;
  }
}

export class Client {
  constructor(_opts) {
    this.handlers = new Map();
    this.channels = {
      fetch: async (_channelId) => new MockChannel(),
    };
    this.user = { tag: 'mock-bot#0001' };
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  async login(_token) {
    const ready = this.handlers.get('ready');
    const onMessage = this.handlers.get('messageCreate');
    if (ready) {
      setTimeout(() => ready(), 10);
    }
    if (onMessage) {
      setTimeout(() => onMessage({
        author: { bot: false, id: 'u1', username: 'tester' },
        channelId: process.env.DISCORD_CHANNEL_ID,
        content: 'incoming from discord',
        id: 'm1',
        guildId: 'g1',
      }), 50);
    }
    return 'ok';
  }

  async destroy() {
    return;
  }
}
`;
  writeFileSync(modulePath, mockCode, 'utf-8');
}

function startBridgeHarness(): BridgeHarness {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'holo-discord-bridge-'));
  const stateDir = path.join(tempDir, '.holoscript');
  const sentFile = path.join(tempDir, 'sent.txt');
  const mockModule = path.join(tempDir, 'mock-discord.mjs');
  mkdirSync(stateDir, { recursive: true });

  // Seed outbox so we can verify outbound relay.
  writeFileSync(
    path.join(stateDir, 'outbox.jsonl'),
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      channel: 'discord',
      message: 'outbound from daemon',
      metadata: { test: true },
    })}\n`,
    'utf-8'
  );

  makeMockDiscordModule(mockModule);

  // Keep parity with existing runner daemon tests: prefer compiled path, fall back to tsx.
  const compiledBridgePath = path.resolve(__dirname, '../../../dist/cli/daemon-discord-bridge.js');
  const useCompiled = existsSync(compiledBridgePath);

  const spawnArgs = useCompiled
    ? [compiledBridgePath]
    : (() => {
        const tsxPkgDir = path.dirname(require.resolve('tsx/package.json'));
        const tsxCliPath = path.join(tsxPkgDir, 'dist', 'cli.mjs');
        return [tsxCliPath, path.resolve(__dirname, '../daemon-discord-bridge.ts')];
      })();

  const proc = spawn(process.execPath, spawnArgs, {
    cwd: path.resolve(__dirname, '../../../..'),
    env: {
      ...process.env,
      DISCORD_BOT_TOKEN: 'test-token',
      DISCORD_CHANNEL_ID: 'test-channel',
      HOLODAEMON_STATE_DIR: stateDir,
      DISCORD_BRIDGE_MODULE: mockModule,
      DISCORD_BRIDGE_POLL_MS: '100',
      MOCK_DISCORD_SENT_FILE: sentFile,
      HOLODAEMON_INBOX_SIGNATURE_SECRET: 'bridge-test-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdout: string[] = [];
  const stderr: string[] = [];
  proc.stdout.setEncoding('utf-8');
  proc.stderr.setEncoding('utf-8');
  proc.stdout.on('data', (chunk: string) => stdout.push(chunk));
  proc.stderr.on('data', (chunk: string) => stderr.push(chunk));

  return { proc, tempDir, stateDir, sentFile, stdout, stderr };
}

afterEach(() => {
  // explicit per-test cleanup
});

describe('daemon-discord-bridge e2e', () => {
  it('relays outbox to discord and ingests discord message into signed inbox', async () => {
    const harness = startBridgeHarness();

    try {
      await waitFor(
        () => harness.stdout.some((line) => line.includes('[discord-bridge] Ready')),
        30000
      );

      await waitFor(
        () =>
          existsSync(harness.sentFile) &&
          readFileSync(harness.sentFile, 'utf-8').includes('outbound from daemon'),
        30000
      );

      const inboxPath = path.join(harness.stateDir, 'inbox.jsonl');
      await waitFor(
        () =>
          existsSync(inboxPath) &&
          readFileSync(inboxPath, 'utf-8').includes('incoming from discord'),
        30000
      );

      const inboxRaw = readFileSync(inboxPath, 'utf-8').trim().split(/\r?\n/).filter(Boolean);
      expect(inboxRaw.length).toBeGreaterThan(0);
      const latest = readJson(inboxRaw[inboxRaw.length - 1]) as {
        metadata?: { signature?: string };
        message?: string;
      };

      expect(latest.message).toBe('incoming from discord');
      expect(typeof latest.metadata?.signature).toBe('string');
      expect((latest.metadata?.signature || '').length).toBe(64);
    } finally {
      try {
        harness.proc.kill();
      } catch {
        // best effort
      }
      rmSync(harness.tempDir, { recursive: true, force: true });
    }
  }, 90000);
});
