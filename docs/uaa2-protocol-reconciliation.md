# Protocol Reconciliation Note — uAA2++ (Integration Move 3)

Prepared 2026-11-22. Resolves, on paper, the four-generation conflict in
integration map §3.1. HoloScript side verified firsthand this date against
`brianonbased-dev/HoloScript` @ main (both packages v8.10.0) and
AI_Workspace's `uAA2++_Core.ts`. This note rules on naming and source of
truth only; it changes no code.

## Rulings

- **Code home:** `@holoscript/uaal` (execution — the bytecode VM) +
  `@holoscript/agent-protocol` (contract — the type spec). Agent
  implementations live in `@holoscript/framework`, per agent-protocol's
  own package description.
- **Spec/research source:** AI_Workspace's uAA2++ **V4.1** documents —
  the research record the code descends from, not a competing spec.
- **Superseded generations, named as such:** AI_Workspace's 6-phase code
  fringe (`uAA2++_Core.ts`, whose own header runs INTAKE → REFLECT →
  EXECUTE → COMPRESS → GROW → EVOLVE — V4.1 minus RE-INTAKE and
  AUTONOMIZE, plus the `∞.<PHASE>.ts` files for phases 0–4 only), and
  the external `uaa2-service` V3.0.9PHASE+, which is in neither repo and
  is source of truth for nothing new.

## Phase mapping — V4.1's 8 ↔ HoloScript

| V4.1 (AI_Workspace docs) | agent-protocol `ProtocolPhase` | uaal VM cycle | Verdict |
|---|---|---|---|
| 0. INTAKE | INTAKE (0) | `0x10` | kept |
| 1. REFLECT | REFLECT (1) | `0x11` | kept |
| 2. EXECUTE | EXECUTE (2) | `0x14` | kept |
| 3. COMPRESS | COMPRESS (3) | `0x12` | kept |
| 4. GROW | GROW (5) | `0x16` | kept, one step later |
| 5. RE-INTAKE | REINTAKE (4), display name **DREAMING** | `0x15` REINTAKE | kept, display-renamed, one step earlier |
| 6. EVOLVE | EVOLVE (6) | `0x17` | kept |
| 7. AUTONOMIZE | AUTONOMIZE (7) | — no opcode | in the spec; outside the VM cycle |

## The RE-INTAKE question

The census hypothesized the 7-vs-8 delta was RE-INTAKE. The evidence
corrects that: **RE-INTAKE was never dropped.** It survives as canonical
enum name `REINTAKE` (agent-protocol `src/index.ts`, `PHASE_NAMES`) and
opcode `0x15`, with **DREAMING** as its display name
(`PHASE_DISPLAY_NAMES`; both READMEs' tables). Two real changes: it is
display-renamed, and it moved — V4.1 runs COMPRESS → GROW → RE-INTAKE
(enrich, then re-absorb); HoloScript runs COMPRESS → RE-INTAKE →
GROW (validate the compressed knowledge, then learn from it).

The phase the count actually omits is **AUTONOMIZE**, and only in the
VM: `buildFullCycle` compiles one HALT-terminated cycle of phases 0–6.
AUTONOMIZE — self-directed goal synthesis — is a property of the
hosting runtime deciding what runs next, not a step inside a single
bytecode cycle. The spec keeps it (AUTONOMIZE = 7); the VM scopes it
out. So the protocol is **8-phase**; the VM execution cycle is
**7-phase**. "7-Phase Protocol" as a blanket label conflates the two
scopes — that conflation, not a missing phase, is the defect.

**Deliberate, not lag.** (1) `uaal/src/opcodes.ts` comments the rename
directly: "ABI name retained; agent-facing display phase is DREAMING."
(2) agent-protocol's source header describes itself as "8-phase
(INTAKE->…->DREAMING[REINTAKE]->…->AUTONOMIZE)" and its README
boundary section says "7/8-phase protocol contracts" — both counts are
known and scoped by the authors. (3) Enum, compiler, and both READMEs
encode the same order and alias at v8.10.0. Honest residue: the
reorder's *rationale* is recorded nowhere (changelogs are version-group
boilerplate), and agent-protocol's README header still says "7-Phase"
over an "8-Phase" table — labeling sloppiness its own limitations note
already flags for correction.

**Recommendation: adopt the HoloScript form as canonical, delta
documented** (this note is that documentation). Do not restore V4.1's
order — validate-then-learn is encoded in the compiled cycle and the
type contract, and reversing it would be a behavior change dressed as
a cleanup. Do not add an AUTONOMIZE opcode — the VM cannot execute
self-directed goal synthesis inside a cycle that ends at HALT; it
belongs to the runtime, where the spec already holds its place.
Estate wording going forward: the *protocol* is 8-phase; *uaal's
cycle* is 7-phase; RE-INTAKE's display name is DREAMING.

## "MESH" — three systems, three names (map §3.5)

- **uaa2 job mesh** — AI_Workspace `AI_Tools/Services/MESH/`, the
  "Multi-Entity Service Hub" (job registry, credits, cron) belonging
  to the external uaa2-service.
- **`@holoscript/mesh`** — HoloScript's network-layer package.
- **HoloMesh** — the agent fleet / proof-based social network.

Rule for estate documents: never write bare "mesh."

## What this note does NOT decide

- Any change to uaal's implementation (an AUTONOMIZE opcode, a phase
  reorder) — Joseph's call, and not recommended above.
- Whether AUTONOMIZE gets a real implementation: agent-protocol's
  README documents `GoalSynthesizer`, but its own limitations note
  says it is not currently exported. Building it is a build decision.
- The package-description wording fixes this note recommends
  ("7-Phase Protocol" → scoped wording) — ordinary lane work under
  the approved integration, executed later, not by this note.
- HoloScript's separate scene-agent lifecycle in
  `docs/agents/uaa2-protocol.md` (Initialize…Implement), which already
  distinguishes itself from `ProtocolPhase` in its own text.
