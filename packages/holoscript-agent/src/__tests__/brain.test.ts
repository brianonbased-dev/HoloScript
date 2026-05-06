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

  // ─── Universal+segregated routing fields (founder ruling 2026-05-06) ─────
  // Brains may declare requires / prefers / avoids capability arrays in the
  // identity block; router uses them at session start to pick a provider.
  // Backward-compat: brains without these fields get empty arrays = open
  // routing = today's behavior.

  it('extracts requires/prefers/avoids when declared in identity block', async () => {
    const BRAIN_WITH_ROUTING = `
composition "RoutingAware" {
  identity {
    domain: "agentic-coding"
    capability_tags: ["code-review", "long-horizon"]
    requires: ["streaming", "tools", "vision"]
    prefers: ["taskBudget", "compaction", "promptCaching"]
    avoids: ["liveWebSearch"]
  }

  decision_loop { priority_1: "ship the gap" }
}
`;
    const path = join(dir, 'routing.hsplus');
    writeFileSync(path, BRAIN_WITH_ROUTING, 'utf8');
    const brain = await loadBrain(path);
    expect(brain.requires).toEqual(['streaming', 'tools', 'vision']);
    expect(brain.prefers).toEqual(['taskBudget', 'compaction', 'promptCaching']);
    expect(brain.avoids).toEqual(['liveWebSearch']);
  });

  it('defaults requires/prefers/avoids to empty arrays for backward-compat', async () => {
    // MINI_BRAIN has no requires/prefers/avoids fields — should still parse,
    // and router should treat empty = open routing (today's behavior).
    const path = join(dir, 'compat.hsplus');
    writeFileSync(path, MINI_BRAIN, 'utf8');
    const brain = await loadBrain(path);
    expect(brain.requires).toEqual([]);
    expect(brain.prefers).toEqual([]);
    expect(brain.avoids).toEqual([]);
    // False case (G.GOLD.013): MUST NOT default to undefined / null —
    // router does set arithmetic and undefined.length would crash.
    expect(brain.requires).not.toBe(undefined);
    expect(brain.prefers).not.toBe(undefined);
    expect(brain.avoids).not.toBe(undefined);
  });

  it('defaults routing fields to empty arrays when identity block is absent', async () => {
    const path = join(dir, 'no-identity.hsplus');
    writeFileSync(path, DOMAINLESS_BRAIN, 'utf8');
    const brain = await loadBrain(path);
    expect(brain.requires).toEqual([]);
    expect(brain.prefers).toEqual([]);
    expect(brain.avoids).toEqual([]);
  });

  it('supports routing fields under the colon-form identity block', async () => {
    // identity: { ... } variant must also extract routing fields, mirroring
    // the capability_tags fix that closed the silent claim-blackhole.
    const COLON_FORM_WITH_ROUTING = `
composition "ColonFormRouting" {
  identity: {
    domain: "formal-methods"
    requires: ["streaming"]
    prefers: ["adjustableEffort"]
    avoids: ["liveWebSearch", "hostedShell"]
  }

  decision_loop { priority_1: "be precise" }
}
`;
    const path = join(dir, 'colon-routing.hsplus');
    writeFileSync(path, COLON_FORM_WITH_ROUTING, 'utf8');
    const brain = await loadBrain(path);
    expect(brain.requires).toEqual(['streaming']);
    expect(brain.prefers).toEqual(['adjustableEffort']);
    expect(brain.avoids).toEqual(['liveWebSearch', 'hostedShell']);
  });
});
