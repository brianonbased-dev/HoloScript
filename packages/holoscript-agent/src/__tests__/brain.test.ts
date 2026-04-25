import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadBrain } from '../brain.js';

const MINI_BRAIN = `
composition "MiniBrain" {
  identity {
    name: "mini-brain"
    version: "0.1.0"
    domain: "security"
    capability_tags: [
      "threat-model", "adversarial-evaluation", "paper-21"
    ]
    paper_targets: ["paper-21-ati"]
  }

  decision_loop {
    priority_1: "do the right thing"
  }
}
`;

const DOMAINLESS_BRAIN = `
composition "Other" {
  decision_loop { priority_1: "be fast" }
}
`;

// Real .hsplus files in the wild use both `identity {` (security-auditor,
// trait-inference, sesl-training, etc.) AND `identity: {` (lean-theorist,
// antigravity-hot). Both must parse — the colon variant produced empty
// capabilityTags before this test existed (silent claim-blackhole).
const COLON_FORM_BRAIN = `
composition "ColonForm" {
  identity: {
    name: "colon-form"
    version: "0.1.0"
    domain: "formal-methods"
    capability_tags: ["lean4", "type-theory", "mechanized-proofs"]
  }

  decision_loop { priority_1: "be precise" }
}
`;

describe('loadBrain', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'brain-test-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('captures the full file as the system prompt (LLM is the brain parser)', async () => {
    const path = join(dir, 'mini.hsplus');
    writeFileSync(path, MINI_BRAIN, 'utf8');
    const brain = await loadBrain(path);
    expect(brain.systemPrompt).toBe(MINI_BRAIN);
    expect(brain.brainPath).toBe(path);
  });

  it('extracts domain + capability_tags for routing without regex on the DSL', async () => {
    const path = join(dir, 'mini2.hsplus');
    writeFileSync(path, MINI_BRAIN, 'utf8');
    const brain = await loadBrain(path);
    expect(brain.domain).toBe('security');
    expect(brain.capabilityTags).toEqual(['threat-model', 'adversarial-evaluation', 'paper-21']);
  });

  it('falls back to "unknown"/[] when identity block is absent (no-throw routing)', async () => {
    const path = join(dir, 'domainless.hsplus');
    writeFileSync(path, DOMAINLESS_BRAIN, 'utf8');
    const brain = await loadBrain(path);
    expect(brain.domain).toBe('unknown');
    expect(brain.capabilityTags).toEqual([]);
  });

  it('parses identity: { ... } (colon form) — fixes silent claim-blackhole on lean-theorist', async () => {
    const path = join(dir, 'colon.hsplus');
    writeFileSync(path, COLON_FORM_BRAIN, 'utf8');
    const brain = await loadBrain(path);
    expect(brain.domain).toBe('formal-methods');
    expect(brain.capabilityTags).toEqual(['lean4', 'type-theory', 'mechanized-proofs']);
  });

  it('honors the requested scope tier', async () => {
    const path = join(dir, 'tiered.hsplus');
    writeFileSync(path, MINI_BRAIN, 'utf8');
    expect((await loadBrain(path, 'cold')).scopeTier).toBe('cold');
    expect((await loadBrain(path, 'hot')).scopeTier).toBe('hot');
  });
});
