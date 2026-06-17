import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrain } from '../brain.js';
import { resolveActiveTools, MESH_TOOLS } from '../tools.js';

// src/__tests__ → repo root is four levels up.
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
const JETSON_BRAIN = resolve(REPO_ROOT, 'compositions', 'jetson-orin-brain.hsplus');

describe('resolveActiveTools — the model sees the BRAIN-DECLARED tools (F.126 #1, P0.0)', () => {
  it("jetson-orin-brain.hsplus's declared 4-tool set actually reaches the model (no write_file amputation)", async () => {
    const brain = await loadBrain(JETSON_BRAIN);
    const { tools, declared, dropped } = resolveActiveTools(brain);
    // The brain's on_task llm_call declares exactly these four.
    expect(declared).toEqual(['write_file', 'read_file', 'list_dir', 'bash']);
    expect(dropped).toEqual([]);
    // All four resolve to real specs and reach the model — NOT just write_file.
    expect(tools.map((t) => t.name).sort()).toEqual(['bash', 'list_dir', 'read_file', 'write_file']);
    expect(brain.requires).toContain('local-llm'); // it IS the small-model path the amputation used to hit
  });

  it('a local-llm brain that declares NO tools falls back to write_file-only (grounding floor, backward-compatible)', () => {
    const { tools, declared } = resolveActiveTools({ requires: ['local-llm'], onTaskActions: [] });
    expect(declared).toEqual([]);
    expect(tools.map((t) => t.name)).toEqual(['write_file']);
  });

  it('a non-local brain that declares NO tools falls back to the full menu', () => {
    const { tools } = resolveActiveTools({ requires: ['anthropic'], onTaskActions: [] });
    expect(tools.length).toBe(MESH_TOOLS.length);
  });

  it('drops an unknown declared tool name without crashing, keeps the known ones', () => {
    const brain = {
      requires: ['local-llm'],
      onTaskActions: [{ verb: 'llm_call', config: { tools: ['write_file', 'nonexistent_tool', 'bash'] } }],
    };
    const { tools, dropped } = resolveActiveTools(brain);
    expect(dropped).toEqual(['nonexistent_tool']);
    expect(tools.map((t) => t.name).sort()).toEqual(['bash', 'write_file']);
  });

  it('SLIM-trims an oversized declared set for a small local model (W.710), keeping write_file first', () => {
    const all = MESH_TOOLS.map((t) => t.name);
    const brain = { requires: ['local-llm'], onTaskActions: [{ verb: 'llm_call', config: { tools: all } }] };
    const { tools } = resolveActiveTools(brain, { budget: 3 });
    expect(tools.length).toBe(3);
    expect(tools[0].name).toBe('write_file'); // grounding tool survives the trim
  });

  it('does NOT trim for a frontier (non-local) model even with a big declared set', () => {
    const all = MESH_TOOLS.map((t) => t.name);
    const brain = { requires: ['anthropic'], onTaskActions: [{ verb: 'llm_call', config: { tools: all } }] };
    const { tools } = resolveActiveTools(brain, { budget: 3 });
    expect(tools.length).toBe(MESH_TOOLS.length);
  });
});
