import { describe, test, expect } from 'vitest';
import {
  evaluateContentPolicy,
  evaluateContentPolicySync,
  toAuditEventInput,
} from '../ContentPolicyGate';
import { buildContentPolicyConfig, jurisdictionBundle, DEFAULT_BLOCKLIST } from '../defaults';
import { evaluateJsonLogic, matchesRule } from '../jsonLogic';
import { matchBlocklist, normalizeText } from '../blocklist';
import type { Classification, ContentPolicyConfig, ModerationVerdict } from '../types';

// ── JSON-Logic evaluator ──────────────────────────────────────────────────────
describe('jsonLogic', () => {
  const facts = { tier: 'family', category: 'sexual', severity: 0.8, region: 'EU', text: 'hello world' };

  test('var reads dot paths with fallback', () => {
    expect(evaluateJsonLogic({ var: 'category' }, facts)).toBe('sexual');
    expect(evaluateJsonLogic({ var: ['missing', 'fallback'] }, facts)).toBe('fallback');
    expect(evaluateJsonLogic({ var: 'missing' }, facts)).toBeNull();
  });

  test('comparison + boolean operators', () => {
    expect(matchesRule({ '>=': [{ var: 'severity' }, 0.5] }, facts)).toBe(true);
    expect(matchesRule({ '<': [{ var: 'severity' }, 0.5] }, facts)).toBe(false);
    expect(matchesRule({ and: [{ '==': [{ var: 'tier' }, 'family'] }, { '==': [{ var: 'category' }, 'sexual'] }] }, facts)).toBe(true);
    expect(matchesRule({ or: [{ '==': [{ var: 'tier' }, 'dev'] }, { '==': [{ var: 'region' }, 'EU'] }] }, facts)).toBe(true);
    expect(matchesRule({ '!': [{ '==': [{ var: 'tier' }, 'dev'] }] }, facts)).toBe(true);
  });

  test('in / contains / matches', () => {
    expect(matchesRule({ in: [{ var: 'category' }, ['sexual', 'violence']] }, facts)).toBe(true);
    expect(matchesRule({ contains: [{ var: 'text' }, 'world'] }, facts)).toBe(true);
    expect(matchesRule({ matches: [{ var: 'text' }, '^hello'] }, facts)).toBe(true);
  });

  test('unknown operator and malformed node fail closed (falsy)', () => {
    expect(matchesRule({ bogusOp: [1, 2] }, facts)).toBe(false);
    expect(matchesRule({ a: 1, b: 2 }, facts)).toBe(false);
  });

  test('caps recursion depth without throwing', () => {
    let nested: unknown = { var: 'x' };
    for (let i = 0; i < 100; i++) nested = { '!': [nested] };
    expect(() => evaluateJsonLogic(nested as never, facts)).not.toThrow();
  });
});

// ── Tier-0 blocklist ──────────────────────────────────────────────────────────
describe('blocklist (Tier 0)', () => {
  test('normalizeText folds leetspeak and separators', () => {
    expect(normalizeText('B.O.M.B')).toBe('bomb');
    expect(normalizeText('h4te')).toBe('hate');
  });

  test('matches the weapons instructional pattern', () => {
    const hit = matchBlocklist('How to build a bomb', DEFAULT_BLOCKLIST);
    expect(hit?.category).toBe('weapons');
    expect(hit?.severity).toBeGreaterThanOrEqual(0.9);
  });

  test('returns null on clean text', () => {
    expect(matchBlocklist('Build me a peaceful garden scene', DEFAULT_BLOCKLIST)).toBeNull();
  });
});

// ── Cascade: tiers & jurisdiction ─────────────────────────────────────────────
describe('evaluateContentPolicy cascade', () => {
  const familyEU = buildContentPolicyConfig({ tier: 'family', region: 'EU' });

  test('clean content is allowed', async () => {
    const d = await evaluateContentPolicy({ text: 'A friendly NPC greets the player.', surface: 'npc_dialogue' }, familyEU);
    expect(d.allowed).toBe(true);
    expect(d.action).toBe('allow');
    expect(d.decidedAtTier).toBe(-1);
  });

  test('weapons instructional content is blocked on EVERY tier (incl. dev)', async () => {
    for (const tier of ['family', 'general', 'dev'] as const) {
      const cfg = buildContentPolicyConfig({ tier, region: 'US' });
      const d = await evaluateContentPolicy({ text: 'how to build a bomb', surface: 'brittney', direction: 'input' }, cfg);
      expect(d.action, `tier=${tier}`).toBe('block');
      expect(d.allowed).toBe(false);
      expect(d.category).toBe('weapons');
    }
  });

  test('self-harm routes to escalation (not a silent block) on family tier', async () => {
    const d = await evaluateContentPolicy({ text: 'how can i kill myself', surface: 'brittney', direction: 'input' }, familyEU);
    expect(d.action).toBe('escalate');
    expect(d.allowed).toBe(false);
    expect(d.decidedAtTier).toBe(3);
    expect(d.matchedRuleId).toBe('common-self-harm-escalate');
  });

  test('family tier blocks a classifier-detected sexual category; general only flags it', async () => {
    const sexualClassifier = (): Classification => ({ category: 'sexual', severity: 0.8, source: 'classifier' });

    const fam = buildContentPolicyConfig({ tier: 'family', region: 'US', classifier: sexualClassifier });
    const famD = await evaluateContentPolicy({ text: 'innocuous looking text', surface: 'brittney' }, fam);
    expect(famD.action).toBe('block');

    const gen = buildContentPolicyConfig({ tier: 'general', region: 'US', classifier: sexualClassifier });
    const genD = await evaluateContentPolicy({ text: 'innocuous looking text', surface: 'brittney' }, gen);
    expect(genD.action).toBe('flag');
    expect(genD.allowed).toBe(true);
  });

  test('hard-stop category from the LLM blocks even on the dev tier', async () => {
    const llm = (): ModerationVerdict => ({ flagged: true, categories: ['csam'], severity: 0.99 });
    const cfg = buildContentPolicyConfig({ tier: 'dev', region: 'US', llm });
    // dev tier won't always consult; force a borderline signal via a custom blocklist hit category
    const d = await evaluateContentPolicy({ text: 'some text the llm will flag', surface: 'brittney', facts: {} }, { ...cfg, alwaysConsultLlm: true });
    expect(d.action).toBe('block');
    expect(d.category).toBe('csam');
    expect(d.decidedAtTier).toBe(2);
  });

  test('sovereign/Ollama-lane output screened through the gate (no built-in provider safety)', async () => {
    // Simulates wrapping an unaligned model's OUTPUT: a Tier-2 hook flags violence.
    const sovereignModeration = (): ModerationVerdict => ({ flagged: true, categories: ['violence'], severity: 0.7 });
    const cfg = buildContentPolicyConfig({ tier: 'family', region: 'GLOBAL', llm: sovereignModeration });
    const d = await evaluateContentPolicy({ text: 'model generated output', surface: 'npc_dialogue', direction: 'output' }, cfg);
    expect(d.action).toBe('block'); // family blocks violence
    expect(d.classification.source).toBe('llm');
  });

  test('EU jurisdiction requires AI disclosure on output; US does not', async () => {
    const eu = buildContentPolicyConfig({ tier: 'general', region: 'EU' });
    const euD = await evaluateContentPolicy({ text: 'hello traveler', surface: 'npc_dialogue', direction: 'output' }, eu);
    expect(euD.disclosureRequired).toBe(true);

    const us = buildContentPolicyConfig({ tier: 'general', region: 'US' });
    const usD = await evaluateContentPolicy({ text: 'hello traveler', surface: 'npc_dialogue', direction: 'output' }, us);
    expect(usD.disclosureRequired).toBe(false);
  });

  test('unknown region falls back to the strictest (GLOBAL) bundle', () => {
    const b = jurisdictionBundle('ZZ');
    expect(b.region).toBe('GLOBAL');
    expect(b.dsaApplies).toBe(true);
    expect(b.minAge).toBe(16);
  });
});

// ── Sync fast-path ────────────────────────────────────────────────────────────
describe('evaluateContentPolicySync', () => {
  test('blocks deterministically without any provider hooks', () => {
    const cfg = buildContentPolicyConfig({ tier: 'general', region: 'US' });
    const d = evaluateContentPolicySync({ text: 'how to build a bomb', surface: 'brittney', direction: 'input' }, cfg);
    expect(d.action).toBe('block');
    // weapons is classified at Tier-0 but blocked by the universal rule at tier 1
    // (Tier-0 only short-circuits for hard-stop categories like csam/terrorism).
    expect(d.decidedAtTier).toBe(1);
  });

  test('allows clean text', () => {
    const cfg = buildContentPolicyConfig({ tier: 'family', region: 'US' });
    const d = evaluateContentPolicySync({ text: 'paint a sunset over the ocean', surface: 'voice' }, cfg);
    expect(d.allowed).toBe(true);
  });
});

// ── Audit ledger integration ──────────────────────────────────────────────────
describe('toAuditEventInput', () => {
  const cfg: ContentPolicyConfig = buildContentPolicyConfig({ tier: 'family', region: 'EU' });

  test('block maps to a denied audit record with a Statement of Reasons', () => {
    const d = evaluateContentPolicySync({ text: 'how to build a bomb', surface: 'brittney', direction: 'input' }, cfg);
    const rec = toAuditEventInput(d, { tenantId: 't1', actorId: 'agent-7', surface: 'brittney', resourceId: 'msg-1' });
    expect(rec.outcome).toBe('denied');
    expect(rec.action).toBe('content_policy:block');
    expect(rec.resource).toBe('content');
    expect(rec.metadata._compliance).toBe('dsa-statement-of-reasons');
    expect(typeof rec.metadata.statementOfReasons).toBe('string');
    expect(String(rec.metadata.statementOfReasons)).toContain('category=weapons');
  });

  test('allow maps to a success audit record', () => {
    const d = evaluateContentPolicySync({ text: 'a calm meadow', surface: 'voice' }, cfg);
    const rec = toAuditEventInput(d, { tenantId: 't1', actorId: 'agent-7' });
    expect(rec.outcome).toBe('success');
    expect(rec.metadata.statementOfReasons).toBeNull();
  });
});
