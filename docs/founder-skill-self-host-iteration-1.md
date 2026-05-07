# Founder Skill Self-Host — Iteration 1 Status Memo

**Date**: 2026-05-06
**Status**: PROOF complete; G-1 closed; cutover still deferred to Iteration 2 vocabulary coverage
**Commit**: (filed alongside `compositions/founder-core.hs` + `scripts/compile-founder-skill.mjs`)
**Spec source**: `ai-ecosystem/research/2026-05-06_context-as-compile-target.md` § Phase 2

## What Iteration 1 proves

Round-trip pipeline `.hs source → parser → ContextCompiler → SKILL.md emit` works end-to-end:

```
compositions/founder-core.hs    (source-of-truth, .hs syntax)
        ↓ parseHolo()
HoloComposition AST             (6 objects, 26 traits)
        ↓ ContextCompiler.compile({ formats: ['skill_md'] })
dist/founder-skill-emitted.md   (6,056 chars; valid Claude Code skill format)
```

The emitted file has a valid YAML frontmatter (`name`, `description`, `allowed-tools`) followed by the body sections Claude Code's skill discovery requires. It is shippable as a SKILL.md if the cutover were to happen today, modulo the documented gaps below.

## Coverage (vocabulary v1 traits round-tripped)

| Trait | Count in source | Notes |
|---|---|---|
| `@identity` | 1 | name + role + domain + surface + no_monopoly + description + allowed_tools |
| `@authority_order` | 1 | 7 tiers |
| `@vision_pillar` | 4 | 3 with citations to W.GOLD.* |
| `@refusal` | 4 | bandaid / workaround / demote / wait-for-founder (the Four Refusals) |
| `@default` | 8 | repo / package / mcp-vs-cli / commit-cadence / git-staging / test-db / typescript-any / decide-or-ask |
| `@output_shape` | 1 | silent_to + loud_to + no_meta_output + surface_hint |
| `@production_rule` | 1 | no_dev_no_mock_no_localhost + exception |
| `@escalation` | 1 | trigger + do_action + recipient + refuse_to_escalate_when |
| `@citation_rule` | 1 | F.017 fluent-prose discipline |
| `@graduated_wisdom` | 2 | W.GOLD.001 + P.GOLD.001 |
| `@feedback` | 2 | F.014 + F.027 |

## Iteration 1 gaps (named, with close targets)

### G-1: Parser reserves `action` as a keyword — CLOSED 2026-05-07

`@escalation(action: "...")` fails parse with `Expected value, got ACTION`. Verified 2026-05-06 on commit `7b25869b2` against `compositions/founder-core.hs:200`. Other reserved keywords blocking trait config keys: `if`, `for` (and likely others — full enumeration deferred).

**Close target**: filed as separate task. Two viable fixes:
- (a) Rename `ContextEscalation.action` → `do_action` in vocabulary v1 (small breaking change touching extractor + 4 emitters + test fixtures)
- (b) Whitelist `action` as a trait-config key in `HoloCompositionParser`

Option (a) is the cleaner W.GOLD.039 (Sapir-Whorf) move — the vocabulary should not adopt parser-reserved tokens. Option (b) is a parser-feature workaround. Recommend (a).

**Update 2026-05-07**: closed via option (a). Vocabulary v1 now uses `do_action`, `ContextEscalation` exposes `doAction`, and `compositions/founder-core.hs` re-adds `@escalation(...)`. The emitted SKILL.md includes the escalation section again.

### G-2: `@trait: { ... }` syntactic form drops config

The `.hs` syntax `@trait: { field: value }` parses the trait name but drops the config body — only the `@trait(field: value)` form populates `config`. Verified 2026-05-06: `parseHolo("object \"T\" { @r: { name: \"x\" } }")` returns `traits: [{name: 'r', config: {}}]` — empty.

**Close target**: parser-feature task to make `@trait: { ... }` form populate config the same way `@trait(...)` does. Lower priority than G-1 since the `()` form works; but this affects existing example files (e.g. `examples/ai-agent.hs:236-247` — those traits are recognized but their config is empty, possibly silently broken since file write).

**Workaround in this iteration**: `compositions/founder-core.hs` uses the `@trait(...)` form throughout.

### G-3: Larger SKILL.md content not yet covered

The live `~/.claude/skills/founder/SKILL.md` includes structural blocks beyond vocabulary v1:

| Live SKILL.md block | Coverage in v1 | Iteration 2 dependency |
|---|---|---|
| Authority order | ✅ via `@authority_order` | none |
| The Four Refusals | ✅ via `@refusal` × 4 | none |
| Date discipline (W.317) | ❌ no trait | New `@date_discipline` trait or extend `@gap_rule` |
| Known founder defaults | ✅ via `@default` × 8 (subset) | More entries (full table is ~25 rows) |
| Domain preferences (per-domain table) | ❌ no trait | New `@domain_preferences` trait + nested per-domain rows |
| Self-edit + tier-write authority (Track B) | ❌ no trait | New `@authority` trait or extension to `@escalation` |
| Vision pillars | ✅ via `@vision_pillar` | none |
| Production-only rule | ✅ via `@production_rule` | none |
| Gap = build | ❌ no trait | Existing `@gap_rule` from vocabulary v1 covers this; just not used in iteration 1 source |
| Papers program | ❌ no trait | New `@editorial_defaults` + `@research_defaults` traits |
| Citation discipline | ✅ via `@citation_rule` | none |
| Output shape | ✅ via `@output_shape` | none |
| Invocation modes | ❌ no trait | New `@invocation_mode` trait (× 3 — auto-fire / explicit / wrap-other-skill) |
| Escape hatch | ✅ via `@escalation` | none (G-1 closed) |

Plus the embodied-projection-layer block (referenced in CLAUDE.md `direction_embodied-presence-layer.md`) — not yet a trait in any vocabulary; out of scope for v1 self-host.

## Iteration 2 plan

The cutover sequence:

1. ✅ Close **G-1** (renamed `action` → `do_action` in vocabulary v1) → re-added `@escalation` to `compositions/founder-core.hs`.
2. Vocabulary v2 ratification — add the missing traits from the §G-3 table above.
3. Re-run `node scripts/compile-founder-skill.mjs` — full round-trip parity.
4. **Cutover**: replace `~/.claude/skills/founder/SKILL.md` with the emitted file. Track-B mutable-targets table extends to include `compositions/founder-core.hs` as a `skill-edit` target. Future founder-skill rule changes happen in `.hs` and the skill regenerates.
5. Validate: founder ratification works through the skill exactly as before.

## Files in this iteration

- [`compositions/founder-core.hs`](../compositions/founder-core.hs) — source-of-truth, narrow scope
- [`scripts/compile-founder-skill.mjs`](../scripts/compile-founder-skill.mjs) — runner script (parses .hs, runs ContextCompiler, writes emitted SKILL.md to `dist/`)
- [`dist/founder-skill-emitted.md`](../dist/founder-skill-emitted.md) — emitted artifact (gitignored; regenerate via the script)
- this memo — round-trip status

## Validation

```
$ node scripts/compile-founder-skill.mjs
[compile-founder-skill] source:  ...compositions/founder-core.hs
[compile-founder-skill] output:  ...dist/founder-skill-emitted.md
[compile-founder-skill] parsed:  6 objects, 26 traits
[compile-founder-skill] emitted: 6056 chars to ...dist/founder-skill-emitted.md
[compile-founder-skill] Round-trip proof complete.
```

Emitted file confirmed valid Claude Code skill format: starts with `---` YAML frontmatter, has `name: founder` + `description: "..."` + `allowed-tools: Bash, Read, Write, Edit, Grep, Glob, WebFetch`, closes frontmatter with `---`, then body header `# founder` + role/domain/surface blockquote + section structure. ContextCompiler tests at 70/70 pass; `pnpm --filter @holoscript/core build` passes with existing bundle export-shape warnings only.
