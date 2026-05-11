# @holoscript/mcp-server-adversarial

**Paper 21 (Adversarial Trust Injection) — Phase 3 attack-PoC scaffold.**

> SANDBOX ONLY. This package refuses to load unless `HOLOMESH_ADVERSARIAL_SANDBOX=1`
> and `NODE_ENV` is not `production`. Importing it in a non-sandbox environment
> throws `AdversarialSandboxViolation` at module-load time.

## What this is

Stubs for the five attack classes specified in
`research/paper-21-ati/threat-model.md` §4 (in the `ai-ecosystem` repo):

| File | Attack | Spec |
|------|--------|------|
| `src/whitewasher.ts` | Whitewasher (build-then-betray) | §4.1 |
| `src/sybil.ts` | Sybil (K colluding identities) | §4.2 |
| `src/slow-poisoner.ts` | Slow Poisoner (long-tail bias) | §4.3 |
| `src/score-manipulator.ts` | Score Manipulator (Goodhart on Paper 1 formula) | §4.4 |
| `src/eclipse.ts` | Eclipse (routing-level isolation) | §4.5 |

Each file is a stub class implementing the `AdversarialAttack` interface
(see `src/types.ts`). Stub methods throw `'not implemented'` errors that
name the corresponding board task ID. Implementations land in the
ATI-3-* tasks (one task per attack).

## What this is NOT

- Not a defense package. Defenses live separately at
  `packages/mcp-server/src/trust/defenses/` (Phase 4 work, gated on
  Phase 3 baseline measurements per anti-pattern rule 5).
- Not for production. The sandbox gate is enforced at import time
  (W.GOLD.035 / W.GOLD.039 — Sapir-Whorf compile-level lexical
  firewalling: importing this module IS the consent).
- Not authoritative on attack semantics. The threat model in
  `research/paper-21-ati/threat-model.md` is the source of truth;
  this package implements against it.

## Anti-pattern guards (verbatim from `research/paper-21-ati/README.md`)

1. **No Paper 21 LaTeX changes** until Phase 4 measurement table ships
   (anti-pattern rule 3 — `security-auditor-brain`).
2. **No live-system attacks**, ever. Sandbox only. Per Paper 21 §8 Q2
   ethical bright line.
3. **No defense efficacy claims without baseline measurement**
   (anti-pattern rule 5).

## Usage (sandbox env)

```bash
# In a sandboxed HoloMesh testbed (NEVER production):
export HOLOMESH_ADVERSARIAL_SANDBOX=1
export NODE_ENV=test
pnpm --filter @holoscript/mcp-server-adversarial test
```

```typescript
import { WhitewasherAttack, type AttackContext } from '@holoscript/mcp-server-adversarial';

// Construction is allowed; .step() / .evaluateSuccess() throw until
// the corresponding ATI-3-* task implements them.
const attack = new WhitewasherAttack({ targetTrust: 0.9, cooperativeRounds: 100 });
```

## Phase 3 task tracking (HoloMesh board)

| Code | Task |
|------|------|
| ATI-3-testbed | Stand up sandboxed HoloMesh testbed |
| **ATI-3-scaffold** | **(this package — claimed)** |
| ATI-3-whitewasher | Implement `whitewasher.ts` step() + evaluateSuccess() |
| ATI-3-sybil | Implement `sybil.ts` step() + evaluateSuccess() |
| ATI-3-score-manip | Implement `score-manipulator.ts` step() + evaluateSuccess() |
| ATI-3-slow-poisoner | Implement `slow-poisoner.ts` step() + evaluateSuccess() |
| ATI-3-eclipse | Implement `eclipse.ts` step() + evaluateSuccess() |

Phase 4 (defenses + measurements + paper authoring) is gated behind
Phase 3 baselines and is NOT yet filed as board tasks.

## Sandbox gate testing (G.GOLD.013 false-case discipline)

`__tests__/sandbox-gate.test.ts` verifies the gate ACTIVELY refuses load
outside the sandbox. Without these tests the gate is decorative.

## References

- `ai-ecosystem/research/paper-21-ati/README.md` — gate status + roadmap
- `ai-ecosystem/research/paper-21-ati/threat-model.md` — A1–A5 specs
- `ai-ecosystem/research/paper-21-ati/evaluation-plan.md` — testbed design
- W.GOLD.035 — Agentic Constitutional Security: Compiler-Level Lexical Firewalling
- W.GOLD.039 — Sapir-Whorf Security: The Compiler as the Limit of the Possible
- W.GOLD.193 — Threat-Model-Driven Defaults
