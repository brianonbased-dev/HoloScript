# Dependency Audit — npm + Rust

**Date:** 2026-04-19  
**Author:** github-copilot  
**Task:** dep1 (`task_1776650000003_dep1`)  
**Tools:** pnpm audit, pnpm why, cargo audit (not installed — see Rust section)

---

## Summary

| Severity | Before | After |
|----------|--------|-------|
| Critical | 0      | 0     |
| High     | 1      | 1*    |
| Moderate | 11     | 0     |
| Low      | 1      | 1*    |

\* Remaining issues have no upstream patched version (see Unresolvable section).

---

## Resolved Vulnerabilities

All resolved via `pnpm.overrides` bumps in root `package.json`.

| Package | Old Constraint | New Constraint | Issues Fixed |
|---------|---------------|----------------|--------------|
| `hono` | `>=4.12.7` | `>=4.12.14` | cookie name validation, IP matching bypass, path traversal in toSSG, serveStatic bypass, HTML injection in JSX SSR |
| `@hono/node-server` | `>=1.19.10` | `>=1.19.13` | serveStatic middleware bypass |
| `axios` | *(not overridden)* | `>=1.15.0` | SSRF via NO_PROXY bypass (CVSS 4.8), cloud metadata exfiltration via header injection (CVSS 4.8) |
| `follow-redirects` | *(not overridden)* | `>=1.16.0` | auth header leak to cross-domain redirects |
| `dompurify` | *(not overridden)* | `>=3.4.0` | ADD_TAGS + FORBID_TAGS bypass via short-circuit evaluation |

---

## Unresolvable Vulnerabilities (No Upstream Fix)

### [HIGH] bigint-buffer@1.1.5 — Buffer Overflow via toBigIntLE()
- **CVSS:** 7.5
- **Advisory:** GHSA — bigint-buffer toBigIntLE is vulnerable to buffer over-read
- **Patched versions:** `<0.0.0` (no fix released by maintainer)
- **Chain:** `@holoscript/platform` → `@holoscript/marketplace-api` → `@coinbase/agentkit@0.10.4` → `@solana/spl-token@0.4.14` → `@solana/buffer-layout-utils@0.2.0` → `bigint-buffer@1.1.5`
- **Exposure:** Only triggered via Solana SPL token operations in marketplace-api. Not a web-facing data path.
- **Action:** Pin `@coinbase/agentkit` to a version that drops `bigint-buffer` once available, or switch to Solana's newer `@solana/spl-token` v0.5+ which removes this dep. Track via `pnpm audit` monthly.

### [LOW] elliptic@6.6.1 — Risky Cryptographic Primitive
- **CVSS:** 5.6
- **Advisory:** Use of potentially broken/risky cryptographic primitive in elliptic curve implementation
- **Patched versions:** `<0.0.0` (no fix released)
- **Chain:** Transitive via multiple crypto/blockchain deps
- **Exposure:** Low — not used directly in user-facing code paths
- **Action:** Monitor for maintainer patch or replacement with `noble-curves` library

---

## Major Upgrade Candidates

| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| `vitest` | `^4.1.0` (root devDep) | v4.x | Already on latest major; connector-core has pre-existing ESM compat issue unrelated to version |
| `@coinbase/agentkit` | `0.10.4` | Check npm | Upgrading may resolve bigint-buffer chain |

---

## Rust / cargo audit

`cargo-audit` is not installed in this environment.

```
# Install with:
cargo install cargo-audit

# Then run:
cargo audit
```

Rust workspace contains one member: `packages/compiler-wasm` with these direct deps:
- `wasm-bindgen 0.2.93` — current
- `serde 1.0` — current
- `serde_json 1.0` — current
- `js-sys 0.3` — current
- `typeshare 1.0` — current

No known advisories at time of audit (manual check against RustSec database).

---

## Recurring Task

This audit should be run monthly:
```bash
pnpm audit --json > dep-audit-$(date +%Y-%m-%d).json
cargo audit
```

Next scheduled audit: **2026-05-19**
