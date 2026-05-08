# Phase 2(a) Cutover Prep — Gap Report (live vs emitted)

**Date**: 2026-05-07
**Status**: Cutover NOT YET SAFE — gap memo + vocabulary v3 enrichment plan below
**Source**: `compositions/founder-core.hs` (62 traits, 11 objects)
**Emit**: `dist/founder-skill-emitted.md` (15,235 chars / 249 lines)
**Live**: `~/.claude/skills/founder/SKILL.md` (396 lines; hand-edited)
**Companion**: `docs/founder-skill-self-host-iteration-1.md` (Iteration 1 PROOF status — ALL G-3 vocabulary v2 slices closed)

## TL;DR

Cutover would NARROW the live founder skill by ~37% (147 lines lost). At least one loss is **functional, not cosmetic** — the `$ARGUMENTS` injection point that makes `/founder [question]` invocations work is not in vocabulary v2 yet. Cutover blocked on vocabulary v3 enrichment, NOT on more G-3 trait slices.

## What survives the cutover (already covered by vocabulary v1+v2)

Section structure parity is high — 13 of 14 live sections have a vocabulary v2 equivalent:

| Live section | Vocabulary v2 trait | Cutover status |
|---|---|---|
| Authority order | `@authority_order` | ✅ structural parity |
| The Four Refusals | `@refusal` × 4 | ✅ structural parity |
| Date discipline (W.317) | `@date_discipline` | ✅ structural parity (G-3 second slice) |
| Known founder defaults | `@default` × 8 | ⚠️ count narrowed (live has ~25 rows) |
| Domain preferences | `@domain_preference` × 6 | ✅ row parity |
| Self-edit + tier-write authority (Track B) | `@authority` | ✅ structural parity (G-3 codex slice) |
| Vision pillars | `@vision_pillar` × 4 | ⚠️ count narrowed (live has more) |
| Production-only rule | `@production_rule` | ✅ structural parity |
| Papers program | `@editorial_default` + `@research_default` | ✅ structural parity (G-3 codex slice) |
| Citation discipline | `@citation_rule` | ✅ structural parity |
| Output shape | `@output_shape` | ✅ structural parity |
| Invocation modes | `@invocation_mode` × 3 | ✅ row parity |
| Escape hatch | `@escalation` | ✅ structural parity (renamed "Escalation") |
| Embodied projection | `@embodied_projection` × 2 | ✅ structural parity (G-3 codex slice) |

## What gets LOST on cutover (vocabulary v3 enrichment targets)

### Loss-1 (FUNCTIONAL): `$ARGUMENTS` injection point — **CLOSED 2026-05-07**

Live skill line 22 declares `**Command**: $ARGUMENTS` — the Claude Code convention that injects the user's `/founder [question]` text into the skill body. Emitted SKILL.md had no equivalent.

**Impact (pre-fix)**: cutover would BREAK explicit invocation. Users typing `/founder [question]` would see the skill fire but the `[question]` text wouldn't reach the rule-application body.

**Vocabulary v3 fix (LANDED)**: `ContextIdentity.commandTemplate?: string` optional field. When source declares `command_template: "$ARGUMENTS"`, the skill_md emitter renders `**Command**: $ARGUMENTS` after the identity blockquote and before the first `## Authority order` section. Other emitters (claude_md, agents_md, cursor_rules) skip the line — surface-specific argument injection only matters for skill_md. ContextCompiler tests at 130/130 (123 prior + 7 new for this slice). Round-trip via `scripts/compile-founder-skill.mjs` now emits the Command line; verified 2026-05-07.

### Loss-2 (FUNCTIONAL): "You ARE the founder" rhetorical opening

Live skill line 24 establishes the agent's posture before any rule applies:

> You are not representing the founder. You are not "checking what the founder would say." You ARE the founder for the duration of this decision. Decide, cite, and move. Joseph reviews at the architecture level and on Quest 3 daily — he does not want to be the bottleneck on calls the system already has enough information to make. Stalling for a founder ping when the answer is encoded in GOLD + NORTH_STAR + CLAUDE.md + the 17-paper program is itself a failure mode.

This is the **frame-setter** for the entire skill — without it, agents reading the emitted SKILL.md may treat refusals/defaults as advisory rather than mandatory.

**Vocabulary v3 fix**: add `@narrative_opening` trait with `posture` + `reason` fields. Emits as a top-level prose block right after the identity blockquote, before the first `## Authority order` section.

### Loss-3 (CONTENT): verbose `description:` frontmatter

Live description enumerates concrete trigger phrases:
- "propose a workaround/mock/fallback/'simpler version for now'/.skip()/@ts-ignore/as any"
- "reach for a local/dev/mocked service where production exists"
- "post '@joseph' on the team feed"
- "make a call on the 17 program papers (TVCG, UIST, NeurIPS, AAMAS, CHI), anchoring, revision bundles, or the CAEL/SimulationContract/Algebraic-Trust narrative"
- "If in doubt whether it applies — it applies. Undertriggering this skill is how projects get bandaided into slop."

Emitted description is shorter and generic. Skill discovery still works, but the trigger-phrase concreteness that makes auto-fire reliable is lost.

**Vocabulary v3 fix**: extend `ContextIdentity.description` to support multi-paragraph YAML folded scalar (already works) AND add `@trigger_phrase` × N traits that emit into the description. Keeps the structured trait shape while preserving concrete trigger guidance.

### Loss-4 (CONTENT): per-section verification prose

Many live sections have prose AFTER the structured list. Examples:
- Authority order: "If you cite the wrong GOLD ID, you failed. Verify IDs before quoting them (F.023). Run `python D:/GOLD/graduate.py list` or `cat D:/GOLD/INDEX.md` when in doubt..."
- Date discipline: detailed Martinis-quantum-engineering rationale paragraphs
- Self-edit Track B: prose around the mutable-targets table about backup discipline
- Gap = build: full section is prose-driven, not list-driven

Emitted SKILL.md has only the structured list — the prose is gone.

**Vocabulary v3 fix**: each load-bearing section trait gains an optional `prose?: string[]` field (paragraph list) that emits AFTER the structured rendering. OR add a sibling `@prose_after` trait that targets a section by name and emits paragraphs into it.

### Loss-5 (COSMETIC): decorative banner

Live skill has `━━━━━━━━━━` separators with the "FOUNDER — YOU ARE ANSWERING AS JOSEPH" banner. Emitted has a YAML frontmatter only. Cosmetic but the banner reinforces the rhetorical opening (Loss-2).

**Vocabulary v3 fix**: bundle into the `@narrative_opening` fix.

### Loss-6 (COUNT): more @vision_pillar / @default rows in live

Live has more vision pillars and more known-default rows than `compositions/founder-core.hs` declares. Cutover narrows both lists.

**Fix**: enrich `compositions/founder-core.hs` directly with the missing rows. No vocabulary change needed; just transcribe the live skill's content into .hs traits.

## Section header drift (cosmetic; pick a convention)

Live ↔ Emitted title differences:

| Live | Emitted |
|---|---|
| `## The Four Refusals` | `## The Refusals` |
| `## Known founder defaults (answer immediately)` | `## Known defaults (answer immediately - do not re-litigate)` |
| `## Production-only rule (no dev, no mock, no localhost)` | `## Production-only rule` |
| `## Output shape — SILENT-TO-JOSEPH, LOUD-TO-THE-AGENT` | `## Output shape` |
| `## Domain preferences (beyond engineering)` | `## Domain preferences` |
| `## Vision pillars (follow; do not drift)` | `## Vision pillars (follow; do not drift)` *(matches)* |
| `## Date discipline (W.317)` | `## Date discipline` |
| `## Invocation modes (Track D)` | `## Invocation modes` |
| `## Papers program (research + editorial decisions)` | `## Papers program defaults` |
| `## Escape hatch` | `## Escalation` |

**Fix**: pick whichever convention is canonical (live or emitted) and align the other. Per the founder skill's own self-narrative, the live conventions are more specific and informative — recommend updating ContextCompiler emitter section labels to match the live conventions exactly.

## Recommended cutover sequence (NOT autonomy default — needs founder ratification)

1. **Vocabulary v3 expansion** — file 5 traits per losses 1-4 above:
   - `command_template` field on `ContextInvocationMode` or `ContextIdentity`
   - `@narrative_opening` trait
   - `@trigger_phrase` traits to enrich description
   - Optional `prose?: string[]` field on every load-bearing section trait
   - Section-header label alignment in all 4 emitters
2. **Enrich `compositions/founder-core.hs`** — transcribe live skill prose, additional vision pillars, additional defaults into .hs traits.
3. **Re-run round-trip** — `node scripts/compile-founder-skill.mjs`. Diff emitted vs live. Iterate until diff is acceptable (no functional losses; cosmetic differences ratified).
4. **Backup live skill** — per Track-B mutation contract: `node ~/.ai-ecosystem/scripts/founder-evolve.mjs backup ~/.claude/skills/founder/SKILL.md`.
5. **Cutover** — copy emitted SKILL.md to `~/.claude/skills/founder/SKILL.md`. Test `/founder [question]` invocation. If broken, rollback via `founder-evolve.mjs rollback <backup-path>`.
6. **Track-B contract extension** — add `compositions/founder-core.hs` to the Mutable Targets table as a `skill-edit` action type (per the Iteration 1 memo's Iteration 2 plan step 4).
7. **Validate** — founder ratification works through the cutover skill exactly as before.

## Why this needs founder ratification

Per the `/founder` skill's own Refusal #4 ("refuse the wait-for-founder"): the answer is supposed to come from authority order without stalling. But cutover REPLACES the load-bearing skill governing every agent's decision making in the ecosystem. Replacing it narrows the rule surface available to every future invocation of the skill.

That crosses **all three** founder-gate conditions:

1. **Irreversible at ecosystem scope**: skill governs every agent's behavior; narrowing it is felt across the whole agent fleet, not just the local clone.
2. **Real external resources**: paper-program editorial defaults reference TVCG/UIST/NeurIPS submissions — narrowing the editorial-defaults section before vocabulary v3 lands risks losing reviewer-survivability hooks.
3. **Trezor/treasury/Tier-2 boundary**: the Track-B mutable-targets table includes GOLD-write, gold-promote, ceiling-change actions — replacing the skill that authorizes these is a Tier-2 custody crossing.

Recommend: file the vocabulary v3 work as Iteration 3 follow-ups; defer cutover until Iteration 3 closes the functional gaps.
