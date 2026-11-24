---
id: G.ARCH.016
type: gotcha
section: G
domain: uAA2++ Orchestration
tags: [severity:high]
author: MISSING
provenance: MISSING
---

### G.ARCH.016: Fragmented Dogfooding Surfaces
**Symptom:** Decoupling the high-level Mesh Control/Telemetry UI
from the user-facing Workspace UI. When system-level agents
(HoloDaemon) and user-level agents (Absorb) operate on isolated
UI routes, it destroys the cognitive link of "Agents dogfooding
the Agent System" and creates unnecessary navigational friction.
**Cause:** MISSING — the source describes the decoupling decision
and its effects, but names no root cause separate from the
decision itself.
**Fix:** Unified the surfaces by embedding the native HoloScript
WebGL surface (`HoloSurfaceRenderer`) and the SSE job pollers
(`useDaemonJobPoller`) directly inside the active `AbsorbPage`
dashboard tab as a `HoloDaemonSubPanel` fragment. Server-side
redirected the old standalone route (`/holodaemon`) directly to
`/absorb`.
**Prevention:** MISSING — not stated in the source.
**Severity:** high
**Status:** Remediated (Cycle 68)

---

## Carry notes and source record (adoption draft §4.4)

The canonical entry above is the whole entry. What follows is the
adoption draft's audit trail for the carry — flags raised during the
conversion and the entry's complete original text — kept so the
carry stays auditable and lossless. It is not part of the entry.

Flags:

- **MISSING `author`** — the source has no author and no
  federation fields; there is no evidence to attribute from.
  Proposed placeholder for the landing lane to confirm or replace:
  `ai-workspace` (the repo it was found in). It is deliberately
  *not* written into the frontmatter above.
- **MISSING `provenance`** — the source frontmatter carries no
  source/federation fields at all.
- **MISSING `confidence`** — not present in the source. Left unset
  per §3.1: the store will default it to 0.8 at write time, where
  it means "unassessed." Writing 0.8 into the entry here would
  fabricate an assessment.
- ⚠ `domain: uAA2++ Orchestration` — carried verbatim, spaces and
  all. It is a valid stored string (IDs are caller-supplied, so
  the store's ID generator never runs on it), but note that a
  *generated* ID derived from this domain would collapse it to
  `UAA2ORCH`. New entries should use the token form.
- `severity` and `Status:` are this entry's own extensions,
  adopted into the canonical gotcha template (§3.2) rather than
  dropped — severity additionally rides as the tag
  `severity:high`, since the store has no severity column.
- The ID already conforms to the canonical scheme (§3.3), with a
  3-digit sequence.

### Source record (verbatim)

```markdown
---
id: G.ARCH.016
title: Fragmented Dogfooding Surfaces
type: gotcha
severity: high
domain: uAA2++ Orchestration
---

# G.ARCH.016: Fragmented Dogfooding Surfaces

## Mistake

Decoupling the high-level Mesh Control/Telemetry UI from the user-facing Workspace UI. When system-level agents (HoloDaemon) and user-level agents (Absorb) operate on isolated UI routes, it destroys the cognitive link of "Agents dogfooding the Agent System" and creates unnecessary navigational friction.

## Fix

Unified the surfaces by embedding the native HoloScript WebGL surface (`HoloSurfaceRenderer`) and the SSE job pollers (`useDaemonJobPoller`) directly inside the active `AbsorbPage` dashboard tab as a `HoloDaemonSubPanel` fragment. Server-side redirected the old standalone route (`/holodaemon`) directly to `/absorb`.

## Severity

High (Architectural divergence & UX friction)

## Status

Remediated (Cycle 68)
```
