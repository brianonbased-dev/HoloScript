# `@motivation` trait — compiler annotation spec (draft)

**Status:** Design-only — no runtime requirement in this revision.  
**Goal:** Let authors declare **why** an agent or scene-driven actor acts, in a way the compiler and tooling can **separate ends from means**.

---

## Problems addressed

1. **Reward hacking ambiguity:** Flat “reward” fields mix long-term outcomes with short-term tactics; auditors and trainers cannot see what must never be traded away.
2. **Explainability:** Downstream systems (VR dashboards, governance, eval harnesses) need a stable vocabulary for *terminal* vs *instrumental* motivation.
3. **Composition:** Multiple traits may imply conflicting objectives; `@motivation` provides a single place to declare precedence and overrides.

---

## Definitions

| Term | Meaning |
|------|--------|
| **Terminal goal** | An outcome valued **for its own sake** in this composition. If all instrumental sub-goals fail, the agent should still optimize toward the terminal goal where physically possible. |
| **Instrumental sub-goal** | A **means** toward the terminal goal. It may be dropped, reordered, or substituted by planners; it must not be optimized at the expense of the terminal goal unless explicitly marked `relaxable`. |
| **Constraint** | Hard bounds (safety, policy) that apply regardless of goals — expressed elsewhere (`@policy`, physics, etc.); `@motivation` may **reference** them but does not replace them. |

---

## Surface syntax (proposed)

Attach to **objects**, **agents**, or **behaviors** that participate in AI motivation / RL-style loops.

```holo
object "GuideBot" {
  @agent
  @motivation(
    terminal: "Help the visitor complete the museum tour safely and on time",
    instrumental: [
      { goal: "Keep the visitor in the main path", relaxable: true },
      { goal: "Answer factual questions about exhibits", relaxable: false }
    ],
    priority: "terminal-wins"
  )
  ...
}
```

### Fields

| Field | Type | Required | Notes |
|-------|------|----------|------|
| `terminal` | string or identifier | yes | Human-readable; compiler may hash to stable ID for telemetry. |
| `instrumental` | list of `{ goal: string, relaxable: bool }` | no (default `[]`) | Order is **documentation order**, not execution order unless `order: "sequential"` is added in a future revision. |
| `priority` | enum | no | `terminal-wins` (default) \| `instrumental-balanced` (future; requires planner hooks). |

**Reserved:** Future keys (`weights`, `discount`, `horizon`, `sdtslot` for Self-Determination Theory tags) must be ignored by compilers that do not implement them — forward compatibility.

---

## Compiler behavior (normative for tooling)

1. **Parse & validate:** `terminal` non-empty; each instrumental entry has `goal`; `relaxable` boolean defaults `false`.
2. **IR emission:** Lower to a structured metadata node (e.g. `MotivationAnnotation`) attached to the entity’s symbol table entry — **no** change to physics or render pipeline unless a downstream pass consumes it.
3. **Diagnostics:**
   - **Warning:** Instrumental list empty — intentional for “pure terminal” agents; suppressible.
   - **Error:** Duplicate `@motivation` on the same entity without explicit merge rule (future: `@motivation.merge`).
4. **Cross-trait:** If `@motivation` conflicts with an explicit `@reward` or policy trait, **report** conflict at compile time; resolution order: **policy > safety > terminal > instrumental** (documented default).

---

## Examples

### Minimal

```holo
object "Patrol" {
  @motivation(terminal: "Maintain perimeter integrity")
}
```

### Instrumental with mixed relaxability

```holo
object "CuratorAI" {
  @motivation(
    terminal: "Preserve artifacts and visitor safety",
    instrumental: [
      { goal: "Minimize crowd density near fragile cases", relaxable: true },
      { goal: "Never disable fire alarms for convenience", relaxable: false }
    ]
  )
}
```

---

## Non-goals (this draft)

- No claim of **automatic** reward shaping or RL reward functions — only **annotation**.
- No requirement that all agents in a scene have `@motivation`; it is **opt-in** for explainability and evaluation.

---

## References

- Source research track: *what-motivates-ai* (board harvest).
- Related docs: `docs/strategy/identity-statements.md` (positioning); trait catalogs in `@holoscript/core` (implementation when scheduled).
