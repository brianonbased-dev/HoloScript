import { describe, it, expect } from 'vitest';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrain } from '../brain.js';
import { resolveActiveTools, MESH_TOOLS } from '../tools.js';

// src/__tests__ → repo root is four levels up.
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
const JETSON_BRAIN = resolve(REPO_ROOT, 'compositions', 'jetson-orin-brain.hsplus');
const RECONSTRUCT_TRAIN_TWIN_BRAIN = resolve(
  REPO_ROOT,
  'compositions',
  'reconstruct-train-twin-brain.hsplus'
);

describe('resolveActiveTools — the model sees the BRAIN-DECLARED tools (F.126 #1, P0.0)', () => {
  it("jetson-orin-brain.hsplus's declared tool set actually reaches the model (no write_file amputation)", async () => {
    const brain = await loadBrain(JETSON_BRAIN);
    const { tools, declared, dropped } = resolveActiveTools(brain, { budget: 10 });
    // The brain's on_task llm_call declaration is the source of truth.
    expect(declared).toEqual([
      'write_file',
      'mcp_call',
      'read_file',
      'bash',
      'str_replace',
      'list_dir',
      'delegate_task',
      'http_request',
    ]);
    expect(dropped).toEqual([]);
    // All declared real specs reach the model -- NOT just write_file. mcp_call is the
    // bridge to the core MCP tool surface (compile/validate/generate/solve), Axis-1.
    expect(tools.map((t) => t.name).sort()).toEqual([
      'bash',
      'delegate_task',
      'http_request',
      'list_dir',
      'mcp_call',
      'read_file',
      'str_replace',
      'write_file',
    ]);
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
      onTaskActions: [
        { verb: 'llm_call', config: { tools: ['write_file', 'nonexistent_tool', 'bash'] } },
      ],
    };
    const { tools, dropped } = resolveActiveTools(brain);
    expect(dropped).toEqual(['nonexistent_tool']);
    expect(tools.map((t) => t.name).sort()).toEqual(['bash', 'write_file']);
  });

  it('SLIM-trims an oversized declared set for a small local model (W.710), keeping write_file first', () => {
    const all = MESH_TOOLS.map((t) => t.name);
    const brain = {
      requires: ['local-llm'],
      onTaskActions: [{ verb: 'llm_call', config: { tools: all } }],
    };
    const { tools } = resolveActiveTools(brain, { budget: 3 });
    expect(tools.length).toBe(3);
    expect(tools[0].name).toBe('write_file'); // grounding tool survives the trim
  });

  it('does NOT trim for a frontier (non-local) model even with a big declared set', () => {
    const all = MESH_TOOLS.map((t) => t.name);
    const brain = {
      requires: ['anthropic'],
      onTaskActions: [{ verb: 'llm_call', config: { tools: all } }],
    };
    const { tools } = resolveActiveTools(brain, { budget: 3 });
    expect(tools.length).toBe(MESH_TOOLS.length);
  });

  it('reconstruct-train-twin brain declares the native HoloMap -> train -> 3DGS chain as data', async () => {
    const brain = await loadBrain(RECONSTRUCT_TRAIN_TWIN_BRAIN);
    const llmCall = brain.onTaskActions?.find((action) => action.verb === 'llm_call');
    const { tools, declared, dropped } = resolveActiveTools(brain, { budget: 10 });

    expect(brain.systemPrompt).toContain('Mandatory pipeline');
    expect(brain.capabilityTags).toContain('holomap');
    expect(brain.capabilityTags).toContain('gaussian-train');
    expect(brain.capabilityTags).toContain('compile_to_3dgs');
    expect(brain.reflect?.escalateOnFail).toBe(true);
    expect(String(llmCall?.config.prompt)).toContain('blocker receipt');
    expect(declared).toEqual([
      'write_file',
      'read_file',
      'list_dir',
      'bash',
      'delegate_task',
      'holo_reconstruct_from_video',
      'holo_reconstruct_step',
      'holo_reconstruct_export',
      'compile_to_gaussian_train',
      'compile_to_3dgs',
    ]);
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'bash',
      'delegate_task',
      'list_dir',
      'read_file',
      'write_file',
    ]);
    expect(dropped).toEqual([
      'holo_reconstruct_from_video',
      'holo_reconstruct_step',
      'holo_reconstruct_export',
      'compile_to_gaussian_train',
      'compile_to_3dgs',
    ]);
  });
});
