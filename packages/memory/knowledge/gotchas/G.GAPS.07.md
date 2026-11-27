---
id: G.GAPS.07
type: gotcha
section: G
domain: physics
confidence: 0.99
tags: [crdt, physics, critical]
author: ai-ecosystem
provenance: "source: gaps-physics.md; federated_from: ai-ecosystem; federated_at: 2026-03-30T04:38:55.442Z"
---

### G.GAPS.07: Never Use CRDT for Particle Data
**Symptom:** MISSING — the source states the rule and its cause
without an observed-symptom narrative.
**Cause:** CRDTs are too slow for high-frequency particle updates.
**Fix:** Use a binary protocol for particle data.
**Prevention:** MISSING — not stated separately in the source;
the rule itself is the prevention.

---

## Carry notes and source record (adoption draft §4.3)

The canonical entry above is the whole entry. What follows is the
adoption draft's audit trail for the carry — flags raised during the
conversion and the entry's complete original text — kept so the
carry stays auditable and lossless. It is not part of the entry.

Flags:

- ⚠ `author: ai-ecosystem` — inferred from `federated_from`, as
  in §4.1.
- The source body is a single sentence; the Cause/Fix split is a
  faithful parse of that sentence ("CRDTs are too slow for
  high-frequency particle updates. Use binary protocol."), not
  added content. The heading title is the sentence's own opening
  clause.
- The ID already conforms to the canonical scheme (§3.3).

### Source record (verbatim)

```markdown
---
id: 'G.GAPS.07'
type: 'gotcha'
domain: 'physics'
confidence: 0.99
source: 'gaps-physics.md'
tags: ['crdt', 'physics', 'critical']
federated_from: 'ai-ecosystem'
federated_at: '2026-03-30T04:38:55.442Z'
---

NEVER Use CRDT for Particle Data: CRDTs are too slow for high-frequency particle updates. Use binary protocol.
```
