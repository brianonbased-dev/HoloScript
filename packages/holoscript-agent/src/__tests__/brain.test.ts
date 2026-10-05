import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { loadBrain } from '../brain.js';

/**
 * G15: the frame cases every reader must read the same way (the canonical
 * parser, the Rust reader and the MCP gate test the same file). The agent
 * loader sends a case's `agent` list when it has one, else its allowed_tools,
 * and refuses to load (throws) only where `agent` is "rejects": a key that looks
 * like a frame key but is not one. Its list may only be narrower than the
 * canonical parser's.
 */
interface SharedFrameCase {
  id: string;
  form?: 'parens' | 'source';
  body: string;
  allowed_tools: string[];
  core?: 'rejects' | string[];
  agent?: 'rejects' | string[];
}
const SHARED_FRAME_CASES = (
  JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        '../../../agent-protocol/src/__tests__/fixtures/frame-allowlist-cases.json'
      ),
      'utf8'
    )
  ) as { cases: SharedFrameCase[] }
).cases;

/** True when a frame with `list` lets `tool` through the MCP gate (exact name or exactly "*"). */
const listPermits = (list: string[], tool: string): boolean =>
  list.includes('*') || list.includes(tool);

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

  // ─── G15: omitted = every tool, [] = no tool (Agent_Frame_Tool_Allowlist_v1) ──
  // This loader is the edge path to the MCP gate, which receives only a list:
  // it must send ["*"] for an omitted list and [] for a written empty one,
  // because the gate cannot tell the two apart afterwards.

  let frameCount = 0;
  async function allowedToolsFor(frameBody: string): Promise<string[] | undefined> {
    const path = join(dir, `g15-frame-${frameCount++}.hsplus`);
    writeFileSync(
      path,
      `#version 6.0.0
brain FramedAgent : @behavior_tree {
  @frame_declaration {
${frameBody}
  }
  identity { domain: "holoscript-language" }
}
`,
      'utf8'
    );
    return (await loadBrain(path)).frameDeclaration?.allowed_tools;
  }

  it('G15: a frame that omits allowed_tools is sent as ["*"], every tool', async () => {
    expect(await allowedToolsFor('    domain: "holoscript-language"')).toEqual(['*']);
  });

  it('G15: a written allowed_tools: [] is sent as [], no tool', async () => {
    expect(await allowedToolsFor('    allowed_tools: []')).toEqual([]);
  });

  it('G15: allowed_tools: ["*"] is sent as ["*"], and a named list as written', async () => {
    expect(await allowedToolsFor('    allowed_tools: ["*"]')).toEqual(['*']);
    expect(await allowedToolsFor('    allowed_tools: ["parse_hs"]')).toEqual(['parse_hs']);
  });

  it('G15: a written value this loader cannot read as a list fails closed to []', async () => {
    expect(await allowedToolsFor('    allowed_tools: "parse_hs"')).toEqual([]);
    expect(await allowedToolsFor('    allowed_tools: ["parse_hs"')).toEqual([]);
  });

  it('G15: a space before the colon is still a written list, not an omitted one', async () => {
    expect(await allowedToolsFor('    allowed_tools : ["parse_hs"]')).toEqual(['parse_hs']);
  });

  it('G15: a comment inside the frame can neither widen nor stand in for the list', async () => {
    expect(
      await allowedToolsFor(
        '    // allowed_tools: ["*"] would allow every tool\n    allowed_tools: ["parse_hs"]'
      )
    ).toEqual(['parse_hs']);
    expect(await allowedToolsFor('    /* allowed_tools: ["*"] */\n    allowed_tools: []')).toEqual(
      []
    );
    expect(
      await allowedToolsFor('    // allowed_tools: []\n    domain: "holoscript-language"')
    ).toEqual(['*']);
    expect(await allowedToolsFor('    domain: "a//b"\n    allowed_tools: ["parse_hs"]')).toEqual([
      'parse_hs',
    ]);
  });

  it('G15: a frame whose comment or string never closes permits no tool', async () => {
    expect(
      await allowedToolsFor('    /* old: allowed_tools: ["*"]\n    allowed_tools: ["parse_hs"]')
    ).toEqual([]);
    expect(await allowedToolsFor('    domain: "holoscript\n    allowed_tools: ["*"]')).toEqual([]);
  });

  async function frameFromSourceBrain(source: string) {
    const path = join(dir, `g15-frame-${frameCount++}.hsplus`);
    writeFileSync(path, source, 'utf8');
    return await loadBrain(path);
  }

  async function frameFromSource(source: string) {
    return (await frameFromSourceBrain(source)).frameDeclaration;
  }

  it.each(SHARED_FRAME_CASES.map((c) => [c.id, c] as const))(
    'G15: shared frame case %s reads as every reader must',
    async (_id, c) => {
      const frame =
        c.form === 'source'
          ? c.body
          : c.form === 'parens'
            ? `@frame_declaration(${c.body})`
            : `@frame_declaration {\n${c.body}\n}`;
      const source = `#version 6.0.0\nbrain FramedAgent : @behavior_tree {\n  ${frame}\n  identity { domain: "holoscript-language" }\n}\n`;
      if (c.agent === 'rejects') {
        await expect(frameFromSource(source)).rejects.toThrow(/is not a frame key but looks like/);
        return;
      }
      const sent = (await frameFromSource(source))?.allowed_tools;
      const expected = Array.isArray(c.agent) ? c.agent : c.allowed_tools;
      expect(sent).toEqual(expected);

      // Never wider than the canonical parser, wherever that parser reads the case.
      if (c.core !== 'rejects') {
        const canonical = Array.isArray(c.core) ? c.core : c.allowed_tools;
        const probes = [...new Set([...expected, ...canonical, 'read', 'a_tool_nobody_named'])];
        const wider = probes.filter((t) => listPermits(expected, t) && !listPermits(canonical, t));
        expect(wider, 'tools the agent would permit that the canonical frame denies').toEqual([]);
      }
    }
  );

  // ─── Review 2 (claude3): the frame is read from the brain's code, not its prompt ───
  // A brain's prompt is the free text above its first column-0 section line (the rule of
  // core's AGENT_BRAIN_SECTION_START, PR #481). An example frame shown there used to be
  // read as a frame: a frameless brain then got no tool, and prose such as
  // "frame_declaration (it's enforced)" narrowed a real ["read"] frame to [].

  it('G15: an example frame in the prompt gives a frameless brain no frame', async () => {
    const brain = await frameFromSourceBrain(`You teach HoloScript.
Show users @frame_declaration { allowed_tools: [] } for an agent that may call no tool.
#version 6.0.0
brain Teacher : @behavior_tree {
  identity { domain: "holoscript-language" }
}
`);
    expect(brain.frameDeclaration).toBeUndefined();
    expect(brain.systemPrompt).toContain('@frame_declaration { allowed_tools: [] }');
  });

  it('G15: an example frame or a mention in the prompt leaves the real frame as written', async () => {
    const brain =
      await frameFromSourceBrain(`Never call a tool outside your frame_declaration (it's enforced by the server).
A locked agent writes @frame_declaration { allowed_tools: [] }.
#brain Reader
#version 6.0.0
identity { domain: "holoscript-language" }
@frame_declaration {
  allowed_tools: ["read"]
}
`);
    expect(brain.frameDeclaration?.allowed_tools).toEqual(['read']);
  });

  it('G15: a brain with no column-0 section line is read whole, so its frame is never dropped', async () => {
    const frame = await frameFromSource(`brain Locked : @behavior_tree {
  @frame_declaration {
    allowed_tools: []
  }
}
`);
    expect(frame?.allowed_tools).toEqual([]);
  });

  it('G15: a look-alike frame key refuses the brain and names the key and the file', async () => {
    const path = join(dir, `g15-frame-${frameCount++}.hsplus`);
    writeFileSync(
      path,
      '#version 6.0.0\nbrain Typo : @behavior_tree {\n  @frame_declaration {\n    allowedTools: []\n  }\n}\n',
      'utf8'
    );
    await expect(loadBrain(path)).rejects.toThrow(
      `[brain] ${path}: @frame_declaration has the key "allowedTools", which is not a frame key but looks like "allowed_tools".`
    );
  });

  it('G15: a stale agent-protocol build stops a framed brain loudly instead of sending [undefined]', async () => {
    const path = join(dir, `g15-frame-${frameCount++}.hsplus`);
    writeFileSync(
      path,
      '#version 6.0.0\nbrain Framed : @behavior_tree {\n  @frame_declaration {\n    allowed_tools: ["read"]\n  }\n}\n',
      'utf8'
    );
    vi.resetModules();
    // What a build from before G15 gives this loader: the frame exports are undefined.
    vi.doMock('@holoscript/agent-protocol', () => ({
      FRAME_ALLOW_ALL_TOOLS: undefined,
      frameKeyLookalike: undefined,
      describeFrameKeyLookalike: undefined,
    }));
    try {
      const { loadBrain: loadWithStaleProtocol } = await import('../brain.js');
      await expect(loadWithStaleProtocol(path)).rejects.toThrow(
        /agent-protocol is older than this agent.*pnpm --filter @holoscript\/agent-protocol build/
      );
      // A brain with no frame does not need the frame exports, and still loads.
      const unframed = join(dir, `g15-frame-${frameCount++}.hsplus`);
      writeFileSync(unframed, MINI_BRAIN, 'utf8');
      expect((await loadWithStaleProtocol(unframed)).frameDeclaration).toBeUndefined();
    } finally {
      vi.doUnmock('@holoscript/agent-protocol');
      vi.resetModules();
    }
  });

  it('G15: a frame header inside a line comment or a string is not the frame', async () => {
    const commented = await frameFromSource(`#version 6.0.0
brain FramedAgent : @behavior_tree {
  // unlike TrustedAnalyst's @frame_declaration { allowed_tools: ["*"] }
  @frame_declaration {
    allowed_tools: []
  }
}
`);
    expect(commented?.allowed_tools).toEqual([]);

    const quoted = await frameFromSource(`#version 6.0.0
brain FramedAgent : @behavior_tree {
  description: "copy @frame_declaration { allowed_tools: [\\"*\\"] } from the docs"
  @frame_declaration {
    allowed_tools: ["parse_hs"]
  }
}
`);
    expect(quoted?.allowed_tools).toEqual(['parse_hs']);
  });

  it('G15: when a file names more than one frame, the agent gets only what every one permits', async () => {
    const frame =
      await frameFromSource(`Use @frame_declaration { allowed_tools: ["*"] } to open every tool.
#version 6.0.0
brain FramedAgent : @behavior_tree {
  @frame_declaration {
    allowed_tools: ["parse_hs", "validate_holoscript"]
    denied_domains: ["finance"]
  }
  @frame_declaration {
    allowed_tools: ["parse_hs", "compile_holoscript"]
    denied_domains: ["medical-advice"]
  }
}
`);
    expect(frame?.allowed_tools).toEqual(['parse_hs']);
    expect(frame?.denied_domains).toEqual(['finance', 'medical-advice']);
  });

  it('G15: a frame block that never closes permits no tool', async () => {
    const frame = await frameFromSource(`#version 6.0.0
brain FramedAgent : @behavior_tree {
  @frame_declaration {
    allowed_tools: ["parse_hs"]
`);
    expect(frame?.allowed_tools).toEqual([]);
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

// @posture — shared operating posture reaching the live system prompt.
//
// Doctrine reached the markdown agent families through one shared file plus a
// pointer per family contract, and reached the sovereign fleet not at all: a
// .hsplus brain was a single self-contained file with no way to reference one,
// so 44 brains carried no shared posture. These tests pin the resolution and,
// more importantly, pin that a declared-but-broken posture REFUSES to boot
// rather than silently producing a seat with no posture.
describe('loadBrain @posture', () => {
  let pdir: string;
  beforeAll(() => {
    pdir = mkdtempSync(join(tmpdir(), 'brain-posture-'));
  });
  afterAll(() => {
    rmSync(pdir, { recursive: true, force: true });
  });

  const brainWith = (body: string) =>
    [body, '', '#version 6.0.0', 'identity { domain: "x" }', ''].join('\n');

  it('substitutes the referenced posture in place, keeping surrounding lines', async () => {
    writeFileSync(
      join(pdir, 'posture.md'),
      'Open by finding what exists.\nClose by fixing what the session proved wrong.',
      'utf8'
    );
    const path = join(pdir, 'a.hsplus');
    writeFileSync(
      path,
      brainWith(
        ['You are an edge seat.', '@posture "./posture.md"', 'Never skip the board.'].join('\n')
      ),
      'utf8'
    );

    const brain = await loadBrain(path);
    expect(brain.systemPrompt).toBe(
      [
        'You are an edge seat.',
        'Open by finding what exists.',
        'Close by fixing what the session proved wrong.',
        'Never skip the board.',
      ].join('\n')
    );
  });

  it('resolves posture that itself references more posture', async () => {
    writeFileSync(join(pdir, 'inner.md'), 'INNER', 'utf8');
    writeFileSync(join(pdir, 'outer.md'), ['OUTER', '@posture "./inner.md"'].join('\n'), 'utf8');
    const path = join(pdir, 'nested.hsplus');
    writeFileSync(path, brainWith('@posture "./outer.md"'), 'utf8');

    expect((await loadBrain(path)).systemPrompt).toBe('OUTER\nINNER');
  });

  // The load-bearing case. A seat that boots without posture it declared is the
  // silent-inert failure this whole feature exists to end.
  it('REFUSES to load when a declared posture file is missing', async () => {
    const path = join(pdir, 'missing.hsplus');
    writeFileSync(path, brainWith('@posture "./not-here.md"'), 'utf8');

    await expect(loadBrain(path)).rejects.toThrow(/does not resolve/);
  });

  it('REFUSES a posture cycle instead of recursing forever', async () => {
    writeFileSync(join(pdir, 'ping.md'), '@posture "./pong.md"', 'utf8');
    writeFileSync(join(pdir, 'pong.md'), '@posture "./ping.md"', 'utf8');
    const path = join(pdir, 'cycle.hsplus');
    writeFileSync(path, brainWith('@posture "./ping.md"'), 'utf8');

    await expect(loadBrain(path)).rejects.toThrow(/cycle/);
  });

  it('REFUSES an absolute posture path (not portable across seats)', async () => {
    const path = join(pdir, 'abs.hsplus');
    // A leading slash is absolute on win32 as well as posix, so this asserts the
    // same rejection on both without hand-mangling separators.
    writeFileSync(path, brainWith('@posture "/shared/posture.md"'), 'utf8');

    await expect(loadBrain(path)).rejects.toThrow(/must be a relative path/);
  });

  // The posture file's maintainer notes address whoever edits it, not the
  // model. Shipping them was 26% of the payload, and included the note saying
  // to keep such notes in a comment.
  it('strips HTML comments from included posture so they never reach the prompt', async () => {
    writeFileSync(
      join(pdir, 'commented.md'),
      ['REAL POSTURE LINE', '', '<!-- Maintainers: this note must never reach the model. -->'].join(
        '\n'
      ),
      'utf8'
    );
    const path = join(pdir, 'commented.hsplus');
    writeFileSync(path, brainWith('@posture "./commented.md"'), 'utf8');

    const brain = await loadBrain(path);
    expect(brain.systemPrompt).toContain('REAL POSTURE LINE');
    expect(brain.systemPrompt).not.toContain('Maintainers:');
    expect(brain.systemPrompt).not.toContain('<!--');
  });

  it('leaves a brain with no @posture directive byte-identical', async () => {
    const path = join(pdir, 'plain.hsplus');
    writeFileSync(path, brainWith(['You are an agent.', 'Do the work.'].join('\n')), 'utf8');

    expect((await loadBrain(path)).systemPrompt).toBe('You are an agent.\nDo the work.');
  });
});
