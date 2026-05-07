# Founder Skill Self-Host — Iteration 1 Status Memo

**Date**: 2026-05-06
**Status**: PROOF complete; G-1/G-2 closed; G-3 slices (`@invocation_mode` + `@date_discipline` + `@domain_preference` + `@embodied_projection` + `@editorial_defaults` + `@research_defaults` + `@authority`) closed; cutover still deferred until the emitted SKILL.md is explicitly ratified
**Commit**: (filed alongside `compositions/founder-core.hs` + `scripts/compile-founder-skill.mjs`)
**Spec source**: `ai-ecosystem/research/2026-05-06_context-as-compile-target.md` § Phase 2

## What Iteration 1 proves

Round-trip pipeline `.hs source → parser → ContextCompiler → SKILL.md emit` works end-to-end:

```text
compositions/founder-core.hs    (source-of-truth, .hs syntax)
        ↓ parseHolo()
HoloComposition AST             (11 objects, 62 traits)
        ↓ ContextCompiler.compile({ formats: ['skill_md'] })
dist/founder-skill-emitted.md   (15,235 chars; valid Claude Code skill format)
```

The emitted file has a valid YAML frontmatter (`name`, `description`, `allowed-tools`) followed by the body sections Claude Code's skill discovery requires. It is shippable as a SKILL.md if the cutover were to happen today, modulo the documented gaps below.

## Coverage (vocabulary v1 + v2 traits round-tripped)

| Trait | Count in source | Notes |
| --- | --- | --- |
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
| `@domain_preference` | 6 | legal / brand / capital / customer-vendor / governance / public-representation |
| `@authority` | 11 | Track-B mutable targets + founder-ratification-required targets |
| `@date_discipline` | 1 | W.317 date refusal contract |
| `@invocation_mode` | 3 | auto-fire / explicit / wrap-other-skill |
| `@embodied_projection` | 2 | Quest 3 interactive review + spatial-photo evidence |
| `@editorial_defaults` | 7 | paper-program editorial defaults |
| `@research_defaults` | 6 | paper-program research-decision defaults |

## Iteration 1 gaps (named, with close targets)

### G-1: Parser reserves `action` as a keyword — CLOSED 2026-05-07

`@escalation(action: "...")` fails parse with `Expected value, got ACTION`. Verified 2026-05-06 on commit `7b25869b2` against `compositions/founder-core.hs:200`. Other reserved keywords blocking trait config keys: `if`, `for` (and likely others — full enumeration deferred).

**Close target**: filed as separate task. Two viable fixes:

- (a) Rename `ContextEscalation.action` → `do_action` in vocabulary v1 (small breaking change touching extractor + 4 emitters + test fixtures)
- (b) Whitelist `action` as a trait-config key in `HoloCompositionParser`

Option (a) is the cleaner W.GOLD.039 (Sapir-Whorf) move — the vocabulary should not adopt parser-reserved tokens. Option (b) is a parser-feature workaround. Recommend (a).

**Update 2026-05-07**: closed via option (a). Vocabulary v1 now uses `do_action`, `ContextEscalation` exposes `doAction`, and `compositions/founder-core.hs` re-adds `@escalation(...)`. The emitted SKILL.md includes the escalation section again.

### G-2: `@trait: { ... }` syntactic form drops config — CLOSED 2026-05-07

The `.hs` syntax `@trait: { field: value }` parses the trait name but drops the config body — only the `@trait(field: value)` form populates `config`. Verified 2026-05-06: `parseHolo("object \"T\" { @r: { name: \"x\" } }")` returns `traits: [{name: 'r', config: {}}]` — empty.

**Update 2026-05-07**: closed in `HoloCompositionParser`. Trait configs now populate for `@trait: { ... }`, scalar colon values such as `@billboard: true`, `@trait { ... }` in unambiguous body contexts, and `object "x" @trait { ... } { ... }` before an object body. The parser keeps existing no-config pre-body traits such as `object "x" @collidable { ... }` distinct from the object body.

The `@trait(...)` form remains supported and `compositions/founder-core.hs` can keep using it until the vocabulary source needs the block form.

### G-3: Larger SKILL.md content not yet covered

The live `~/.claude/skills/founder/SKILL.md` includes structural blocks beyond the original vocabulary v1:

| Live SKILL.md block | Coverage in v1 | Iteration 2 dependency |
| --- | --- | --- |
| Authority order | ✅ via `@authority_order` | none |
| The Four Refusals | ✅ via `@refusal` × 4 | none |
| Date discipline (W.317) | ✅ via `@date_discipline` (G-3 next slice closed) | none — refusal_contract + required_components + shape_template + cross_references all round-trip |
| Known founder defaults | ✅ via `@default` × 8 (subset) | More entries (full table is ~25 rows) |
| Domain preferences (per-domain table) | ✅ via `@domain_preference` × 6 (G-3 third slice closed) | none — list-shaped (one trait per dispatch row) instead of nested rows; matches @vision_pillar/@refusal/@invocation_mode pattern |
| Self-edit + tier-write authority (Track B) | ✅ via `@authority` × 11 (G-3 Track-B slice closed) | none — target / action_type / requires / founder_ratification_required all round-trip |
| Vision pillars | ✅ via `@vision_pillar` | none |
| Production-only rule | ✅ via `@production_rule` | none |
| Gap = build | ❌ no trait | Existing `@gap_rule` from vocabulary v1 covers this; just not used in iteration 1 source |
| Papers program | ✅ via `@editorial_defaults` × 7 + `@research_defaults` × 6 (G-3 paper defaults slice closed) | none — paper_id / paper_phase scoped defaults round-trip |
| Citation discipline | ✅ via `@citation_rule` | none |
| Output shape | ✅ via `@output_shape` | none |
| Invocation modes | ✅ via `@invocation_mode` × 3 (G-3 first slice closed) | none — auto-fire / explicit / wrap-other-skill all round-trip via the founder-core source |
| Embodied projection layer | ✅ via `@embodied_projection` × 2 (G-3 embodied slice closed) | none — interactive Quest 3 review and read-only spatial evidence round-trip through the four Phase 1 emitters |
| Escape hatch | ✅ via `@escalation` | none (G-1 closed) |

Track-B authority now round-trips as list-shaped `@authority` traits. The emitted section splits mutable targets from founder-ratification-required targets and preserves the action type, mutation requirements, ratification boolean, and notes for each row. The remaining work is no longer vocabulary coverage; it is the explicit cutover/ratification step before replacing the live SKILL.md.

## Iteration 2 plan

The cutover sequence:

1. ✅ Close **G-1** (renamed `action` → `do_action` in vocabulary v1) → re-added `@escalation` to `compositions/founder-core.hs`.
2. ✅ Close **G-2** (`@trait: { ... }` now populates config in the parser).
3. Vocabulary v2 ratification — add the missing traits from the §G-3 table above.
   - ✅ `@invocation_mode` (G-3 first slice) — landed via the same parser-keyword fix pattern as G-1 (`behavior` is reserved → field renamed to `effect`).
   - ✅ `@date_discipline` (G-3 second slice) — captures the W.317 refusal contract (open_blockers + matrix_row_staleness + engineering_readiness) plus the literal output shape template; emit places it before Citation discipline.
   - ✅ `@domain_preference` (G-3 third slice) — list-shaped (one trait per dispatch row, 6 rows in founder-core.hs). Captures the legal/brand/capital/customer-vendor/governance/public-representation routing table from the live skill's "## Domain preferences" section. Optional `ceiling` field captures spend caps (e.g. "$5 standing spend cap" for capital).
   - ✅ `@embodied_projection` (G-3 embodied slice) — two rows in founder-core.hs: interactive Quest 3 review and read-only spatial evidence. Captures the embodied projection layer from `NORTH_STAR.md` §0.4.
   - ✅ `@editorial_defaults` + `@research_defaults` (G-3 paper defaults slice) — captures the Papers program editorial defaults and research-decision defaults with optional `paper_id` / `paper_phase` scope.
   - ✅ `@authority` (Track-B) — captures mutable targets and founder-ratification-required targets with `target`, `action_type`, `requires`, and `founder_ratification_required`.
4. Re-run `node scripts/compile-founder-skill.mjs` — full round-trip parity.
5. **Cutover**: replace `~/.claude/skills/founder/SKILL.md` with the emitted file after explicit ratification. Future founder-skill rule changes happen in `.hs` and the skill regenerates.
6. Validate: founder ratification works through the skill exactly as before.

## Files in this iteration

- [`compositions/founder-core.hs`](../compositions/founder-core.hs) — source-of-truth, narrow scope
- [`scripts/compile-founder-skill.mjs`](../scripts/compile-founder-skill.mjs) — runner script (parses .hs, runs ContextCompiler, writes emitted SKILL.md to `dist/`)
- [`dist/founder-skill-emitted.md`](../dist/founder-skill-emitted.md) — emitted artifact (gitignored; regenerate via the script)
- this memo — round-trip status

## Validation

```text
$ pnpm --filter @holoscript/core exec vitest run src/parser/__tests__/TraitConfigBlock.test.ts
✓ 6 tests passed

$ node scripts/compile-founder-skill.mjs
[compile-founder-skill] source:  ...compositions/founder-core.hs
[compile-founder-skill] output:  ...dist/founder-skill-emitted.md
[compile-founder-skill] parsed:  11 objects, 62 traits
[compile-founder-skill] emitted: 15235 chars to ...dist/founder-skill-emitted.md
[compile-founder-skill] Round-trip proof complete.

$ pnpm --filter @holoscript/core test -- ContextCompiler
✓ 123 tests passed

$ pnpm --filter @holoscript/core build
✓ Build passed (existing bundle export-shape warnings only)
```

Emitted file confirmed valid Claude Code skill format: starts with `---` YAML frontmatter, has `name: founder` + `description: "..."` + `allowed-tools: Bash, Read, Write, Edit, Grep, Glob, WebFetch`, closes frontmatter with `---`, then body header `# founder` + role/domain/surface blockquote + section structure. ContextCompiler tests at 123/123 pass; `pnpm --filter @holoscript/core build` passes with existing bundle export-shape warnings only.
