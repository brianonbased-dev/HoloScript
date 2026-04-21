# ADR: @holoscript/crdt stays on 1.x (not platform-v7)

**Status:** Accepted (2026-04-21)  
**Context:** `@holoscript/crdt` ships substantial paper-3 / CAEL work while `scripts/version-policy.json` places it in the **services-v1** lane (`targetMajor: 1`). Platform packages moved to **major 7**.

**Decision:** Keep **independent 1.x semver** for `@holoscript/crdt`. Do **not** align its major with platform-v7.

**Rationale**

- Consumers may embed **only** the CRDT package; tying its major to the full platform would force churn unrelated to CRDT API changes.
- `services-v1` in `version-policy.json` already encodes this lane; the policy gate is **major 1**, not 6/7.
- Platform releases (core, engine, mcp-server) can roll without forcing a CRDT major bump unless the CRDT public API or wire format requires it.

**Review:** Revisit if CRDT exposes a breaking ABI to the same semver surface as `@holoscript/core` in a way that confuses consumers.
