# HoloScript Knowledge Entry Format — Canonical

**Status:** Canonical for the HoloScript knowledge layer.
**Lineage:** Adopts the uAA2 W/P/G format specification
(2026-02-21, AI_Workspace `uAA2++_Protocol/3.COMPRESS/research/`)
reconciled with the `@holoscript/memory` entry contract. Where the
two disagreed, this document is the ruling.

An entry exists in two equivalent forms: a **file form** (markdown
with YAML frontmatter — what humans and agents author, review, and
diff) and a **stored form** (a row written through
`@holoscript/memory`'s `SovereignMemoryStore`). The frontmatter maps
1:1 onto `MemoryEntryInput`; the body maps onto `content`.

### 3.1 Frontmatter (the stored metadata)

```yaml
---
id: G.GAPS.07            # required — the entry's identity (§3.3)
type: gotcha             # required — wisdom | pattern | gotcha
section: G               # required — the type initial: W | P | G
domain: physics          # required — subject token, free text
confidence: 0.99         # optional — 0..1; omit if unassessed
tags: [crdt, physics]    # optional — default []
author: ai-ecosystem     # required at store time (author_agent)
provenance: "source: gaps-physics.md; federated_from: ai-ecosystem; federated_at: 2026-03-30T04:38:55.442Z"  # optional
---
```

Field rules:

- `id` — the primary key. Never renumber an existing entry;
  renumbering creates a different entry.
- `type` / `section` — `section` is always the type's initial.
- `domain` — carried verbatim from the entry's origin; do not
  "clean it up" during a move. New entries should use a short
  subject token (the ID category, §3.3, is derived from it).
- `confidence` — omit rather than invent. If omitted, the store's
  default (0.8) applies at write time and is understood to mean
  "unassessed," not "assessed at 0.8."
- `author` — the agent or source system that produced the entry.
  Required by the store; if an entry's origin has no attribution,
  say so in the entry's landing notes rather than guessing.
- `provenance` — a free string preserving origin facts (source
  file, federation source and time). It maps to the store's
  `provenance_hash` column, which in practice holds provenance
  strings; never fabricate a hash to fill it.

### 3.2 Body (the fixed fields)

The body opens with a heading carrying the ID and title, then the
type's fixed fields as bold-labeled lines. A field with no content
is written as `**Field:** MISSING — <reason>` during migrations;
new entries should simply not be created until their required
fields exist.

**Wisdom** — `### W.<…>: Title`

```markdown
**Source:** [file/URL/system the wisdom originated from]
**Learning:** [the core insight — what was learned]
**Pattern:** [how it manifests in practice — when/where you see it]
**Gotcha:** [the related common mistake or anti-pattern]
**Implementation:** [code example or concrete application]
```

**Pattern** — `### P.<…>: Name`

```markdown
**Description:** [what this pattern does]
**Pattern:** [code example or structure]
**Why:** [why it works / when to use it]
**When:** [specific use cases]
**Result:** [expected outcome]
```

**Gotcha** — `### G.<…>: Name`

```markdown
**Symptom:** [what you observe when this happens]
**Cause:** [root cause]
**Fix:** [step-by-step solution]
**Prevention:** [how to avoid it in the future]
**Severity:** [optional — low | medium | high | critical; also
  carried as a `severity:<level>` tag]
**Status:** [optional — e.g. "Remediated (Cycle 68)", "Open";
  added by the reconciliation, not in the 2026-02-21 spec]
```

### 3.3 ID scheme

```
W.<CATEGORY>.<SEQ>     P.<CATEGORY>.<SEQ>     G.<CATEGORY>.<SEQ>
```

- `CATEGORY` — uppercase alphanumeric domain token, **max 8
  characters** (the constraint comes from `@holoscript/memory`'s
  ID generator; IDs that respect it stay valid under both
  caller-supplied and generated keying). Examples: `BRAIN`,
  `GAPS`, `ARCH`.
- `SEQ` — zero-padded sequence within the category, minimum 2
  digits (`07`, `016`). Read the next number from the knowledge
  layer's `REGISTRY.md`; never skip, never reuse.
- **Legacy IDs** — entries whose IDs predate this scheme (notably
  the random-suffix form `W.BRAIN.0ef71e06` produced by the memory
  ID generator) remain valid identities forever. They are not
  renumbered and are not a template for new entries.
- The 2026-02-21 spec's numeric category bands (001–999) are
  retired in favor of mnemonic categories.

### 3.4 The three forms — which to use

From the spec's decision tree, unchanged:

```
Need full traceability (source, learning, pattern, gotcha, code)?
  YES → Standard form (this document, §3.1–3.2)
Embedding in code or a specification?
  YES → Pipe-delimited form
Storage optimization critical (thousands of entries)?
  YES → Ultra-compressed form
Default → Standard form
```

**Pipe-delimited form** (kept verbatim from the spec):

```
CONCEPT.NAME│detail1│detail2│detail3◓
```

`.` builds the namespace hierarchy, `│` separates details, `◓`
terminates — always. UPPERCASE marks key terms,
`lowercase.with.dots` marks technical specifics. Use it in code
comments and inline specs, never as an entry's stored form.

**Ultra-compressed form** (kept verbatim from the spec):

```
W.XXX: One-line summary of the wisdom.
- Optional single-sentence elaboration.
```

One line under ~200 chars, at most one dash elaboration, no
sections. A *derived* form: an ultra-compressed line always
derives from a standard-form entry with the same ID, never the
other way round.

### 3.5 Filled example

```markdown
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
```

*(This is a real entry — one of the four hand-carried in §4 of the
adoption draft, shown there with its full flag list.)*
