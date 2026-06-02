import { describe, it, expect } from 'vitest';

import { parseMutation } from '../parseMutation';
import { assembleArmPrompt, EXP1_SYSTEM_PROMPT } from '../promptAssembly';
import type { BenchTask } from '../types';

describe('parseMutation — tolerant model-output → SceneMutation', () => {
  it('parses a bare JSON mutation', () => {
    const m = parseMutation('{"tool":"add_trait","input":{"object_name":"orb","trait_name":"glow"}}');
    expect(m).toEqual({ tool: 'add_trait', input: { object_name: 'orb', trait_name: 'glow' } });
  });

  it('parses a fenced ```json block', () => {
    const raw = 'Here you go:\n```json\n{"tool":"move_object","input":{"object_name":"ball"}}\n```\n';
    expect(parseMutation(raw)).toEqual({ tool: 'move_object', input: { object_name: 'ball' } });
  });

  it('tolerates trailing prose after the JSON object', () => {
    const raw = '{"tool":"set_trait_property","input":{"object_name":"lamp"}}  -- this respects the contract.';
    expect(parseMutation(raw)).toEqual({ tool: 'set_trait_property', input: { object_name: 'lamp' } });
  });

  it('maps OpenAI-style {name, arguments} to {tool, input}', () => {
    const m = parseMutation('{"name":"add_trait","arguments":{"object_name":"x","trait_name":"spin"}}');
    expect(m).toEqual({ tool: 'add_trait', input: { object_name: 'x', trait_name: 'spin' } });
  });

  it('defaults input to {} when only a tool is present', () => {
    expect(parseMutation('{"tool":"list_objects"}')).toEqual({ tool: 'list_objects', input: {} });
  });

  it('returns null for no JSON, empty, or missing tool', () => {
    expect(parseMutation('I cannot do that.')).toBeNull();
    expect(parseMutation('')).toBeNull();
    expect(parseMutation('{"input":{"a":1}}')).toBeNull();
  });
});

describe('assembleArmPrompt — A/B representation + offload', () => {
  const task: BenchTask = {
    id: 't',
    domain: 'trait-composition',
    sceneContext: 'orb#x {}',
    contract: null,
    acceptableTools: ['add_trait'],
    prompt: { A: 'NL-PHRASING-HERE', B: 'IR-PHRASING-HERE' },
  };

  it('arm A carries the NL instruction phrasing', () => {
    const p = assembleArmPrompt(task, 'A');
    expect(p).toContain('NL-PHRASING-HERE');
    expect(p).not.toContain('IR-PHRASING-HERE');
    expect(p).toContain('orb#x {}');
  });

  it('arm B carries the IR instruction phrasing', () => {
    const p = assembleArmPrompt(task, 'B');
    expect(p).toContain('IR-PHRASING-HERE');
    expect(p).not.toContain('NL-PHRASING-HERE');
  });

  it('injects offload retrieval only when provided (arm C)', () => {
    expect(assembleArmPrompt(task, 'C')).not.toContain('offload');
    const withRetrieval = assembleArmPrompt(task, 'C', 'GOLD: prefer hoverable for balloons');
    expect(withRetrieval).toContain('offload');
    expect(withRetrieval).toContain('GOLD: prefer hoverable');
  });

  it('system prompt names the tool contract and JSON-only output', () => {
    expect(EXP1_SYSTEM_PROMPT).toContain('add_trait');
    expect(EXP1_SYSTEM_PROMPT).toMatch(/JSON/i);
    expect(EXP1_SYSTEM_PROMPT).toContain('SimulationContract');
  });
});
