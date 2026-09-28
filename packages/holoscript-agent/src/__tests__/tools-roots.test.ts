/**
 * Sandbox-root env-override contract.
 *
 * The same runner serves the Vast fleet (default /root/* roots) and a LOCAL
 * node (laptop / Jetson) via HOLOSCRIPT_AGENT_READ_ROOTS / _WRITE_ROOTS. Roots
 * are resolved at module load, so the env must be stubbed BEFORE importing
 * tools.ts — hence the dynamic import below.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';

const localRoot = mkdtempSync(join(tmpdir(), 'hs-agent-local-'));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let runTool: (use: any) => Promise<any>;

beforeAll(async () => {
  // Re-scope BOTH read and write to a local dir before the module loads.
  process.env.HOLOSCRIPT_AGENT_READ_ROOTS = [localRoot, join(localRoot, 'out')].join(delimiter);
  process.env.HOLOSCRIPT_AGENT_WRITE_ROOTS = join(localRoot, 'out');
  ({ runTool } = await import('../tools.js'));
});

describe('sandbox roots — env override', () => {
  it('writes under the overridden local write root', async () => {
    const res = await runTool({
      type: 'tool_use',
      id: 't1',
      name: 'write_file',
      input: { path: join(localRoot, 'out', 'scene.holo'), content: 'composition Demo {}' },
    });
    expect(res.is_error).toBeFalsy();
    expect(String(res.content)).toContain('wrote');
  });

  it('reads it back through the overridden read root', async () => {
    const res = await runTool({
      type: 'tool_use',
      id: 't2',
      name: 'read_file',
      input: { path: join(localRoot, 'out', 'scene.holo') },
    });
    expect(res.is_error).toBeFalsy();
    expect(String(res.content)).toContain('composition Demo');
  });

  it('REPLACES the fleet default — /root/agent-output is denied once overridden', async () => {
    const res = await runTool({
      type: 'tool_use',
      id: 't3',
      name: 'write_file',
      input: { path: '/root/agent-output/x', content: 'nope' },
    });
    expect(res.is_error).toBe(true);
    expect(String(res.content)).toContain('write denied');
  });
});

describe('vision_analyze — local image bytes never go to a hosted Ollama', () => {
  it.each([
    ['a cloud-tagged model from the tool call', 'http://127.0.0.1:11434', 'qwen3-vl:235b-cloud'],
    ['a hosted base URL', 'https://ollama.com', 'fara:7b'],
  ])('refuses %s before reading or sending the image', async (_label, baseUrl, model) => {
    const image = join(localRoot, 'frame.png');
    writeFileSync(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL = baseUrl;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const res = await runTool({
        type: 'tool_use',
        id: 'v1',
        name: 'vision_analyze',
        input: { image_path: image, model },
      });
      expect(res.is_error).toBe(true);
      expect(String(res.content)).toContain('REFUSING hosted Ollama');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      delete process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL;
      fetchSpy.mockRestore();
      warn.mockRestore();
    }
  });
});
