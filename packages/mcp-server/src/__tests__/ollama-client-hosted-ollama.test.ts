/**
 * The MCP server's Ollama path is a "local fallback only". A hosted Ollama URL
 * (ollama.com) or a cloud-tagged model is not local, so nothing is sent to it and it
 * does not report as available — unless HOLO_ALLOW_HOSTED_OLLAMA=1
 * (2026-09-24 native-inference audit follow-up).
 *
 * ollama-client reads its env at import time, so each case stubs env, resets the
 * module registry, and imports it fresh.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadClient(env: Record<string, string>) {
  vi.resetModules();
  for (const name of [
    'LLM_PROVIDER',
    'OPENROUTER_API_KEY',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'OLLAMA_URL',
    'OLLAMA_MODEL',
    'HOLO_ALLOW_HOSTED_OLLAMA',
  ]) {
    vi.stubEnv(name, env[name] ?? '');
  }
  return import('../ollama-client');
}

function okCompletion() {
  return new Response(
    JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

describe('mcp-server ollama-client: hosted Ollama is not the local fallback', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sends nothing to ollama.com and reports Ollama unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => okCompletion());
    const client = await loadClient({ LLM_PROVIDER: 'ollama', OLLAMA_URL: 'https://ollama.com' });

    expect(await client.queryOllama('hello')).toBeNull();
    expect(await client.isOllamaAvailable()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('HOSTED OLLAMA REFUSED'));
  });

  it('refuses a cloud-tagged OLLAMA_MODEL on a local Ollama too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => okCompletion());
    const client = await loadClient({
      LLM_PROVIDER: 'ollama',
      OLLAMA_URL: 'http://127.0.0.1:11434',
      OLLAMA_MODEL: 'glm-4.6:cloud',
    });

    expect(await client.queryOllama('hello')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still queries an owned Ollama', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => okCompletion());
    const client = await loadClient({
      LLM_PROVIDER: 'ollama',
      OLLAMA_URL: 'http://127.0.0.1:11434',
    });

    await client.queryOllama('hello');
    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0][0])).toContain('127.0.0.1:11434');
  });
});
