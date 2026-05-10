import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  defaultConfigPath,
  readLocalConfig,
  removeChannel,
  resolveApiKey,
  setChannelEnabled,
  upsertChannel,
  writeLocalConfig,
} from '../local-config.js';

let tempDirs: string[] = [];

function tempConfigPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aibrittney-config-'));
  tempDirs.push(dir);
  return join(dir, 'config.json');
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe('aibrittney local config', () => {
  it('round-trips config and resolves API key through the configured env var', () => {
    const path = tempConfigPath();
    writeLocalConfig(
      {
        model: 'qwen2.5-coder:14b',
        ollamaHost: 'https://ollama.com',
        apiKeyEnv: 'BRITTNEY_OLLAMA_KEY',
        toolsEnabled: true,
        channels: [],
      },
      path,
    );

    const config = readLocalConfig(path);
    expect(config.model).toBe('qwen2.5-coder:14b');
    expect(config.ollamaHost).toBe('https://ollama.com');
    expect(config.toolsEnabled).toBe(true);
    expect(resolveApiKey(config, { BRITTNEY_OLLAMA_KEY: 'secret' })).toBe('secret');
  });

  it('adds, disables, and removes channel definitions', () => {
    const path = tempConfigPath();
    const withChannel = upsertChannel(readLocalConfig(path), {
      id: 'studio',
      type: 'webhook',
      target: 'https://studio.local/events',
      enabled: true,
      createdAt: '2026-05-10T00:00:00.000Z',
    });
    const disabled = setChannelEnabled(withChannel, 'studio', false);
    writeLocalConfig(disabled, path);

    const config = readLocalConfig(path);
    expect(config.channels).toEqual([
      {
        id: 'studio',
        type: 'webhook',
        target: 'https://studio.local/events',
        enabled: false,
        createdAt: '2026-05-10T00:00:00.000Z',
      },
    ]);

    writeLocalConfig(removeChannel(config, 'studio'), path);
    expect(readLocalConfig(path).channels).toEqual([]);
  });

  it('uses AIBRITTNEY_CONFIG when resolving the default path', () => {
    expect(defaultConfigPath({ AIBRITTNEY_CONFIG: 'C:/tmp/aibrittney.json' })).toBe(
      'C:/tmp/aibrittney.json',
    );
  });
});
