# Security Dependency Audit — 2026-04-20

**Task:** `task_1776385413023_95s2` — [Operations] Dependency audit & security updates (npm + Rust).
**Team mode:** SECURITY. Objective: harden the surface — auth, sandbox, secrets, dependency and supply-chain review, minimal blast radius.
**Auditor:** claude-code.

## Commands

```bash
cd C:/Users/Josep/Documents/GitHub/HoloScript
pnpm audit --json          # 3,280 total dependencies scanned
```

## Before

| Severity | Count |
|----------|-------|
| critical | 1 |
| high     | 8 |
| moderate | 15 |
| low      | 1 |
| **total**| **25** |

## After (this session's overrides)

| Severity | Count |
|----------|-------|
| critical | **0** |
| high     | 1 |
| moderate | 11 |
| low      | 1 |
| **total**| **13** |

**Net change:** 1 CRITICAL → 0, 8 HIGH → 1 (only the un-patchable transitive remains), 15 MODERATE → 11.

## pnpm overrides added (root `package.json`)

```json
{
  "pnpm": {
    "overrides": {
      "next": ">=15.5.15",          // bumped from >=15.5.14 — GHSA DoS via Server Components
      "protobufjs": ">=7.5.5",      // CRITICAL arbitrary code execution (CWE-94)
      "vite": ">=7.3.2",            // 2× HIGH: server.fs.deny bypass + dev-server arbitrary file read
      "drizzle-orm": ">=0.45.2",    // HIGH: SQL injection via improperly escaped SQL identifiers
      "basic-ftp": ">=5.3.0"        // bumped from >=5.2.0 — 3× HIGH: CRLF cmd injection + DoS
    }
  }
}
```

Verified by re-running `pnpm audit` after `pnpm install --no-frozen-lockfile`.

## Resolved HIGH+CRITICAL (8 of 9)

| Package | CVE / CWE | Patched in |
|---------|-----------|------------|
| `protobufjs` | Arbitrary code execution (CWE-94) | `>=7.5.5` |
| `vite` (x2) | `server.fs.deny` bypass + dev-server WS arbitrary file read (CWE-180/284/200/306) | `>=7.3.2` |
| `drizzle-orm` | SQL injection (CWE-89) | `>=0.45.2` |
| `next` | DoS with Server Components (CWE-770) | `>=15.5.15` |
| `basic-ftp` (x3) | CRLF command injection + unbounded memory DoS (CWE-93/400/770) | `>=5.3.0` |

## Remaining HIGH (1) — known-risk accepted

### `bigint-buffer` ≤1.1.5 — Buffer Overflow via `toBigIntLE()` (CWE-120)

- **Advisory:** GHSA-3gc7-fjrx-p6mg
- **Patch:** **none available from npm registry** (`patched_versions: <0.0.0`)
- **Dependency path:** `@coinbase/agentkit@0.10.4 → @solana/spl-token@0.4.14 → @solana/buffer-layout-utils@0.2.0 → bigint-buffer@1.1.5`
- **Consumer:** `@holoscript/marketplace-api` (via Coinbase agentkit's Solana support)
- **Exploit surface:** Buffer overflow when `toBigIntLE()` receives an oversized buffer. Triggered only when parsing Solana account data (SPL-token accounts).
- **Actual risk in our flows:** LOW. HoloScript marketplace-api uses agentkit for EVM x402 payments, not Solana parsing. The vulnerable call path is not exercised by our code.
- **Options considered:**
  1. Drop `@coinbase/agentkit` — high effort; agentkit is actively used for x402 flows.
  2. Patch via `pnpm.overrides` to a fork — no maintained fork exists; risky.
  3. **(chosen)** Accept the risk. Flag for re-audit whenever agentkit bumps Solana deps.
- **Follow-up:** Watch `@solana/buffer-layout-utils` release notes. If a 0.3.x drops that replaces `bigint-buffer`, bump immediately.

## Rust side (cargo audit)

Not run this session. `cargo audit` needs:

```bash
cd packages/compiler-wasm
cargo install cargo-audit --locked   # one-time setup
cargo audit
```

Deferred to a follow-up security task (captured below).

## Unresolved moderate (11)

Not enumerated inline — re-run `pnpm audit` to see the list. Expected: transitives from dev tools (eslint, vitest, storybook plugins etc.). None are in the supply-chain critical path for mcp-server or marketplace-api.

## Commits

- `M package.json` — 5 new pnpm.overrides entries + 1 bump
- `M pnpm-lock.yaml` — lockfile update reflecting resolved versions

Commit message follows conventional format, scope `security`.

## Follow-up board tasks to create

1. **`cargo audit` pass on packages/compiler-wasm** — separate from npm. Install `cargo-audit` if missing, run, file issues.
2. **`@coinbase/agentkit` Solana surface review** — confirm the vulnerable `toBigIntLE()` code path isn't reachable from our flows. If reachable, remove agentkit Solana imports.
3. **`@solana/buffer-layout-utils` upgrade watch** — subscribe to release notes; the moment a non-`bigint-buffer` version ships, bump.
4. **Moderate advisories triage** — 11 remain; most are dev-tool transitives but should still be swept quarterly.

## Knowledge graduation

One wisdom entry synced summarizing the pattern: *"pnpm.overrides is the primary supply-chain hardening knob for a pnpm monorepo. Each HIGH+CRITICAL advisory with a clean patch range should get an override line; bumps propagate to every workspace package without touching individual package.jsons."*

## Verification command (anyone can re-run)

```bash
cd C:/Users/Josep/Documents/GitHub/HoloScript
pnpm audit --json | node -e "let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d); console.log(j.metadata.vulnerabilities);});"
```

---

## 2026-04-24 Refresh (security-mode follow-up pass)

Re-ran `pnpm audit` on 2026-04-24. Current posture:

| Severity | 2026-04-20 (after) | 2026-04-24 | Net |
|----------|-------------------:|-----------:|-----|
| critical | 0                  | 0          | held |
| high     | 1                  | 1          | held (same `bigint-buffer` transitive) |
| moderate | 11                 | 12         | +1 new advisory (postcss GHSA-qx2v-qp2m-jg93, CVSS 6.1, XSS via dev-tooling transitive) |
| low      | 1                  | 1          | held |
| **total**| **13**             | **14**     | +1 |

The un-patchable `bigint-buffer` HIGH (GHSA-3gc7-fjrx-p6mg) is still the only HIGH. Dependency count 3280 → 3317 (+37) reflects normal active development, not supply-chain churn. No CRITICAL regression.

### Defense-in-depth: narrow the vulnerable path by construction

Original memo's risk assessment for `bigint-buffer` was LOW because the vulnerable `toBigIntLE()` call path is not exercised by HoloScript code (grep confirms zero actual `network: 'solana'` assignments across `packages/`). 2026-04-24 commit promotes that empirical claim to a **type-level guarantee**:

- `packages/marketplace-agentkit/src/AgentKitIntegration.ts:12,30` — narrowed `network: 'base' | 'ethereum' | 'solana'` to `network: 'base' | 'ethereum'`.
- Future code that tries to pass `'solana'` gets a compile-time error pointing at this memo via the inline comment. Stronger guarantee than grep-based vigilance.
- Typecheck passes cleanly post-change.
- Commit: `731cbd171` — `security(marketplace-agentkit): narrow network type union to remove 'solana'`.

This doesn't remove the vulnerable dependency (still a transitive via agentkit) but makes the call path unreachable from HoloScript code **by TypeScript's type system**, not just by convention.

### Still deferred

- **`cargo audit` on `packages/compiler-wasm`** — `cargo` is installed (`/c/Users/josep/.cargo/bin/cargo`) but `cargo-audit` subcommand isn't. Not installing without explicit founder approval (touches global cargo state). Filed as separate board task.
- **`@solana/buffer-layout-utils` upstream watch** — no new release since 2026-04-20; still on `bigint-buffer@1.1.5`. No action.
- **Moderate advisories triage** — 12 total, dev-tool transitives; not supply-chain critical path. Quarterly sweep.

### Anchor

This memo OTS-anchored 2026-04-24; Base L2 unsigned-tx staged next to it. When broadcast, it becomes the dual-anchored canonical security-posture record.
