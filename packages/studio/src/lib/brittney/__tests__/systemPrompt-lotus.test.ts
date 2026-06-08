/**
 * Tests for the Lotus Garden mode of buildContextualPrompt.
 *
 * `isLotusGardenScene` is the heuristic that decides whether to inject the
 * LOTUS_GARDEN_CONTEXT block into the system prompt — false positives
 * pollute every chat turn with irrelevant gardener instructions; false
 * negatives leave Brittney blind to the garden when she should be tending
 * it. Both modes need explicit coverage.
 */

import { describe, it, expect } from 'vitest';
import {
  HOLOSHELL_OPERATOR_CONTEXT,
  buildContextualPrompt,
  isLotusGardenScene,
} from '../systemPrompt';

describe('isLotusGardenScene', () => {
  it('detects @lotus_petal sentinel', () => {
    expect(isLotusGardenScene('object "Petal" { @lotus_petal { paper_id: "cael" } }')).toBe(true);
  });

  it('detects "The Lotus Flower" composition title', () => {
    expect(isLotusGardenScene('composition "The Lotus Flower" { ... }')).toBe(true);
  });

  it('detects lotus_root sentinel', () => {
    expect(isLotusGardenScene('@lotus_root { substrate: "parser" }')).toBe(true);
  });

  it('returns false for generic scene context', () => {
    expect(isLotusGardenScene('composition "Sunken Temple" { @physics }')).toBe(false);
    expect(isLotusGardenScene('object "Cube" { type: "mesh" }')).toBe(false);
  });

  it('returns false for null / undefined / empty', () => {
    expect(isLotusGardenScene(null)).toBe(false);
    expect(isLotusGardenScene(undefined)).toBe(false);
    expect(isLotusGardenScene('')).toBe(false);
  });

  it('returns false when only the literal word "lotus" appears', () => {
    // Avoid false positive on flower-themed scenes that aren't the garden.
    expect(isLotusGardenScene('object "Lotus Pond" { type: "mesh" }')).toBe(false);
  });
});

describe('buildContextualPrompt — lotus mode injection', () => {
  it('always includes the HoloShell operator contract before scene-specific modes', () => {
    const prompt = buildContextualPrompt('composition "Other" {}');
    expect(prompt).toContain('## HoloShell Operator Contract');
    expect(prompt).toContain('Hololand/apps/holoshell/docs/BRITTNEY_OPERATOR_SPEC.md');
    expect(prompt).toContain('Hololand/scripts/holoshell-brittney-turn.mjs');
    expect(prompt).toContain('Consume the HoloShell Brittney operator contract');
    expect(HOLOSHELL_OPERATOR_CONTEXT).toContain('read_only, guarded_execute, break_glass');
  });

  it('injects Lotus Garden Mode context when sceneContext IS the garden', () => {
    const prompt = buildContextualPrompt(
      'composition "The Lotus Flower" { object "Petal: CAEL" { @lotus_petal { paper_id: "cael" } } }'
    );
    expect(prompt).toContain('--- Lotus Garden Mode ---');
    expect(prompt).toContain('gardener of this garden');
    expect(prompt).toContain('cannot lie about a petal');
    expect(prompt).toContain('Trezor-confirmed');
  });

  it('does NOT inject Lotus Garden Mode for non-garden scenes', () => {
    const prompt = buildContextualPrompt('composition "Sunken Temple" { @physics }');
    expect(prompt).not.toContain('--- Lotus Garden Mode ---');
    expect(prompt).not.toContain('gardener of this garden');
  });

  it('does NOT inject Lotus Garden Mode when sceneContext is empty', () => {
    const prompt = buildContextualPrompt(null);
    expect(prompt).not.toContain('--- Lotus Garden Mode ---');
  });

  it('always includes the base SYSTEM_PROMPT regardless of garden mode', () => {
    const gardenPrompt = buildContextualPrompt('composition "The Lotus Flower" { @lotus_petal }');
    const genericPrompt = buildContextualPrompt('composition "Other" {}');
    expect(gardenPrompt).toContain('You are Brittney');
    expect(genericPrompt).toContain('You are Brittney');
  });

  it('lotus context appears AFTER the scene context (so model reads scene first)', () => {
    const prompt = buildContextualPrompt('composition "The Lotus Flower" { @lotus_petal }');
    const operatorIdx = prompt.indexOf('## HoloShell Operator Contract');
    const sceneIdx = prompt.indexOf('--- Current Scene ---');
    const lotusIdx = prompt.indexOf('--- Lotus Garden Mode ---');
    expect(operatorIdx).toBeGreaterThan(-1);
    expect(sceneIdx).toBeGreaterThan(-1);
    expect(sceneIdx).toBeGreaterThan(operatorIdx);
    expect(lotusIdx).toBeGreaterThan(sceneIdx);
  });
});

describe('buildContextualPrompt — consume-first gate', () => {
  it('includes the Consume-First Gate section in every prompt', () => {
    const prompt = buildContextualPrompt(null);
    expect(prompt).toContain('## Consume-First Gate');
    expect(prompt).toContain('holomesh_marketplace_search');
    expect(prompt).toContain('holomesh_team_board');
  });

  it('requires marketplace_search before create_object', () => {
    const prompt = buildContextualPrompt('composition "Scene" {}');
    // Gate must appear before Tool Guidance so the ordering is clear.
    const gateIdx = prompt.indexOf('## Consume-First Gate');
    const toolIdx = prompt.indexOf('## Tool Guidance');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(toolIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(toolIdx);
  });

  it('consume-before-recreate rule in ECOSYSTEM_OPERATING_CONTEXT names the concrete tools', () => {
    const prompt = buildContextualPrompt(null);
    // The operating context must reference the specific tools, not just the mantra.
    expect(prompt).toContain('holomesh_marketplace_search');
  });

  it('consume-first gate is present for founder mode too', () => {
    const prompt = buildContextualPrompt(null, null, true, {}, null, true);
    expect(prompt).toContain('## Consume-First Gate');
    expect(prompt).toContain('holomesh_marketplace_search');
  });
});
