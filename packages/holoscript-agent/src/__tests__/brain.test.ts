import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
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

  it('extracts the free-text preamble (before the first HoloScript section) as the system prompt', async () => {
    // W.741: loadBrain no longer sends the whole file. extractSystemPromptPreamble
    // cuts at the first HoloScript directive (#version / identity { / …) so a
    // constrained local model (qwen3:4b, small num_ctx) isn't fed ~1500 tokens of
    // structured metadata that truncate the CRITICAL tool-calling rules before the
    // model sees them. Real .hsplus brains put the instruction text first, then the
    // structured sections. (Was previously "captures the full file" — stale post-W.741.)
    const PREAMBLE_BRAIN = [
      'You are a security auditor running on a HoloMesh seat.',
      'ALWAYS call at least one tool; never reply with plain text only.',
      '',
      '#version 6.0.0',
      'identity {',
      '  domain: "security"',
      '  capability_tags: ["threat-model"]',
      '}',
      '',
    ].join('\n');
    const path = join(dir, 'preamble.hsplus');
    writeFileSync(path, PREAMBLE_BRAIN, 'utf8');
    const brain = await loadBrain(path);
    expect(brain.systemPrompt).toBe(
      'You are a security auditor running on a HoloMesh seat.\n' +
        'ALWAYS call at least one tool; never reply with plain text only.'
    );
    expect(brain.brainPath).toBe(path);
  });

  it('does not promote a direct #brain document to the system prompt', async () => {
    const directPath = join(dir, 'direct-brain.hsplus');
    writeFileSync(
      directPath,
      [
        '#brain DirectBrain',
        '#version 6.0.0',
        'identity { domain: "security" capability_tags: ["threat-model"] }',
        '',
      ].join('\n'),
      'utf8'
    );

    const directBrain = await loadBrain(directPath);
    expect(directBrain.systemPrompt).toBe('');
    expect(directBrain.systemPrompt).not.toContain('#brain');
    expect(directBrain.systemPrompt).not.toContain('identity');

    const commentedPath = join(dir, 'commented-brain.hsplus');
    writeFileSync(
      commentedPath,
      [
        '// Review only the declared security surface.',
        '// Escalate evidence gaps.',
        '#brain CommentedBrain',
        '#version 6.0.0',
        'identity { domain: "security" }',
        '',
      ].join('\n'),
      'utf8'
    );

    expect((await loadBrain(commentedPath)).systemPrompt).toBe(
      '// Review only the declared security surface.\n// Escalate evidence gaps.'
    );
  });

  it('projects domain + capability_tags through the typed runtime document adapter', async () => {
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

  it('loads the canonical-parser golden brain through the same typed runtime projection', async () => {
    const fixturePath = resolve(import.meta.dirname, '../brains/holoscript-engineer.hsplus');
    const brain = await loadBrain(fixturePath);

    expect(brain.domain).toBe('holoscript-language');
    expect(brain.capabilityTags).toEqual([
      'native_authoring',
      'trait_porting',
      'compiler_work',
      'rust_wasm',
      'language_design',
    ]);
    expect(brain.requires).toEqual(['tools']);
    expect(brain.onTaskActions?.map((action) => action.verb)).toEqual([
      'recall',
      'rag_query',
      'llm_call',
      'reflect',
    ]);
    expect(brain.frameDeclaration).toMatchObject({
      domain: 'holoscript-language',
      capability_tier: 2,
      trust_tier: 2,
      allowed_tools: ['parse_hs', 'validate_holoscript'],
    });
    expect(brain.systemPrompt).not.toContain('#brain');
  });

  it('extracts @frame_declaration as a typed runtime tool boundary', async () => {
    const path = join(dir, 'framed.hsplus');
    writeFileSync(
      path,
      `
#version 6.0.0
brain FramedAgent : @behavior_tree {
  @frame_declaration {
    domain: "holoscript-language"
    horizon: "2026-07"
    capability_tier: 2
    trust_tier: 1
    allowed_tools: ["parse_hs", "validate_holoscript"]
    denied_domains: ["finance", "medical-advice"]
  }
  identity { domain: "holoscript-language" }
}
`,
      'utf8'
    );

    const brain = await loadBrain(path);
    expect(brain.frameDeclaration).toEqual({
      domain: 'holoscript-language',
      horizon: '2026-07',
      capability_tier: 2,
      trust_tier: 1,
      allowed_tools: ['parse_hs', 'validate_holoscript'],
      denied_domains: ['finance', 'medical-advice'],
    });
  });

  it('leaves unframed brains backward-compatible', async () => {
    const path = join(dir, 'unframed.hsplus');
    writeFileSync(path, MINI_BRAIN, 'utf8');
    expect((await loadBrain(path)).frameDeclaration).toBeUndefined();
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

// ─── Reflect cognitive gate (W.736) ──────────────────────────────────────────
// A brain may declare a `reflect { criteria, escalate_on_fail }` verb; loadBrain
// surfaces it so the runner can run a self-evaluation pass and (with
// escalate_on_fail) escalate a failed artifact to the fleet instead of marking
// it done. Absent → undefined (existing brains are unaffected).
describe('loadBrain — reflect gate', () => {
  let rdir: string;
  beforeAll(() => {
    rdir = mkdtempSync(join(tmpdir(), 'brain-reflect-'));
  });
  afterAll(() => {
    rmSync(rdir, { recursive: true, force: true });
  });

  const withReflect = (reflectLine: string) =>
    [
      'You are an edge agent. Always call a tool.',
      '',
      '#version 6.0.0',
      'identity { domain: "robotics-edge" capability_tags: ["jetson"] }',
      'behavior on_task {',
      `  ${reflectLine}`,
      '}',
      '',
    ].join('\n');

  it('parses a reflect block with escalate_on_fail: true', async () => {
    const path = join(rdir, 'r1.hsplus');
    writeFileSync(
      path,
      withReflect(
        'reflect { of: "the artifact", criteria: "valid HoloScript", escalate_on_fail: true }'
      ),
      'utf8'
    );
    const brain = await loadBrain(path);
    expect(brain.reflect).toBeDefined();
    expect(brain.reflect?.criteria).toBe('valid HoloScript');
    expect(brain.reflect?.escalateOnFail).toBe(true);
  });

  it('defaults escalateOnFail to false (advisory) when escalate_on_fail is absent', async () => {
    const path = join(rdir, 'r2.hsplus');
    writeFileSync(path, withReflect('reflect { criteria: "completeness" }'), 'utf8');
    const brain = await loadBrain(path);
    expect(brain.reflect?.criteria).toBe('completeness');
    expect(brain.reflect?.escalateOnFail).toBe(false);
  });

  it('falls back to `of` when criteria is absent', async () => {
    const path = join(rdir, 'r3.hsplus');
    writeFileSync(path, withReflect('reflect { of: "the scene" }'), 'utf8');
    expect((await loadBrain(path)).reflect?.criteria).toBe('the scene');
  });

  it('returns undefined when no reflect block is declared (existing brains unaffected)', async () => {
    const path = join(rdir, 'r4.hsplus');
    writeFileSync(path, 'You are an agent.\n\n#version 6.0.0\nidentity { domain: "x" }\n', 'utf8');
    expect((await loadBrain(path)).reflect).toBeUndefined();
  });
});
