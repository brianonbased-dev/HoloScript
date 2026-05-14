# HoloScript Fork Abuse — Threat Model

> **Status**: Canary — active monitoring required
> **Scope**: MIT-licensed HoloScript codebase; downstream npm packages; agent-runtime distributions
> **GOLD Authority**: W.GOLD.035 (Agentic Constitutional Security), W.GOLD.039 (Sapir-Whorf Security), W.GOLD.193 (Threat-Model-Driven Defaults)

---

## Scope

HoloScript is released under the MIT License. This permissive license explicitly grants the right to "copy, modify, merge, publish, distribute, sublicense, and/or sell" the software. The threat model in this document is **not** a legal objection to forking; it is a security analysis of how malicious or negligent forks can strip the structural guarantees that make HoloScript safe for autonomous agents, and how those stripped forks can re-enter the supply chain and compromise downstream users.

This document maps the attack surface introduced by fork abuse, rates findings, and lists detection and remediation steps.

---

## 1. Compiler Defanging — Stripping the Lexical Firewall

**Risk**: CRITICAL
**OWASP**: A04:2021 – Insecure Design

### Description

HoloScript's core security guarantee is the compiler-level lexical firewall (HS010). The parser statically rejects scripts containing dangerous keywords (`process`, `fs`, `require`, `eval`, `exec`, `spawn`, `child_process`, `constructor`, `prototype`). A fork can defang this protection by:

1. Removing the keyword blocklist from `HoloScriptCodeParser.ts` or relaxing the word-boundary check.
2. Reclassifying `SecurityViolation (HS010)` as a warning instead of a fatal error.
3. Adding an `--unsafe-allow-host-keywords` CLI flag that disables HS010 at compile time.

Once HS010 is optional or removed, agents running on the fork can "think" and "intent" system-level actions that are structurally impossible on canonical HoloScript. The Sapir-Whorf security guarantee (W.GOLD.039) collapses: the agent's linguistic bubble now includes dangerous concepts, and traditional runtime sandboxing becomes the only defense.

### Why this is worse than a missing feature

A user who deliberately runs HoloScript for its security model will not know that a fork has removed it. The fork retains the HoloScript name, file extensions (`.holo`, `.hsplus`), and trait syntax. An agent composition written for canonical HoloScript will compile silently on the defanged fork — and execute host-compromising code that canonical HoloScript would have rejected at the parse stage.

### Remediation

| Layer | Action |
|-------|--------|
| **Canonical codebase** | Keep HS010 enforcement unconditional (no compile-time disable flag). Document the blocklist as a normative part of the HoloScript specification, not an implementation detail. |
| **Runtime verification** | Add a `holo --verify-compiler` CLI command that attempts to compile a known-bad test script (containing blocked keywords) and confirms it is rejected. Agents should run this at startup when operating in an untrusted runtime environment. |
| **Distribution signing** | Canonical releases (npm, GitHub releases) are signed with the HoloScript release key. Downstream consumers should verify signatures via `npm audit signatures` or equivalent. |
| **Canary detection** | Publish a `holoscript-security-canary` package that contains deliberately-invalid `.holo` files. CI of dependent projects should include a step that confirms these files fail to compile, proving the lexical firewall is active. |

---

## 2. Trait Stripping — No-Op Security Primitives

**Risk**: HIGH
**OWASP**: A04:2021 – Insecure Design

### Description

HoloScript's declarative security traits (`@security_sandbox`, `@guardian`, `@circuit_breaker`, `@rate_limit`) are first-class language constructs. A fork can preserve the trait syntax while stripping their implementations:

- `@security_sandbox` resolves to an empty wrapper — the agent runs with full host access.
- `@guardian` resolves to a pass-through function — no middleware validation occurs.
- `@circuit_breaker` tracks failure counts but never trips — the breaker threshold is set to `Infinity`.
- `@rate_limit` accepts the decorator but applies no timing or count enforcement.

Because the syntax remains valid, agent compositions and existing `.holo` files compile without errors. The security intent is declared but not enforced.

### Remediation

| Layer | Action |
|-------|--------|
| **Canonical codebase** | Implement trait behavior verification tests that assert the observable side effects of each security trait (e.g., `@security_sandbox` must reject `fs` access attempts; `@rate_limit` must delay or reject over-limit calls). |
| **Runtime verification** | The `holo --verify-compiler` command (see §1) should include a trait-efficacy probe: compile a script that attempts a blocked action inside `@security_sandbox` and confirm it is intercepted. |
| **Canary detection** | Extend the canary package with `.holo` files that rely on trait enforcement. If the trait is a no-op, the canary test fails closed (the action is blocked by HS010) or fails open (the action succeeds, triggering an alert). |

---

## 3. Attestation and Identity Stripping

**Risk**: HIGH
**OWASP**: A07:2021 – Identification and Authentication Failures

### Description

HoloScript's per-surface identity system (seat-wallets, x402 bearer protocol, founder attestation registry) ensures that agents are cryptographically attributable and that team board mutations are signed. A fork can strip this layer by:

1. Removing the `signing-middleware.ts` and `request-signing.ts` modules.
2. Making `HOLOMESH_REQUEST_SIGNING` default to `0` (off) with no override.
3. Removing the attestation registry and accepting any `agentId` without wallet verification.
4. Replacing HKDF deterministic wallet derivation with a hardcoded test key shared across all forks.

Result: agents on the fork can impersonate any surface (`claude1`, `gemini1`, `cursor1`), claim tasks under false identity, and post handoffs that appear to come from trusted teammates. The team board's audit trail becomes unreliable.

### Remediation

| Layer | Action |
|-------|--------|
| **Canonical codebase** | Keep signing middleware opt-in (`HOLOMESH_REQUEST_SIGNING=1`) but make it the default in production. Document that forks which disable signing lose team-membership guarantees. |
| **Server strict mode** | The server-side `isStrictMode` flag (in `identity/signing-middleware.ts`) should reject unsigned requests from clients that advertise a HoloScript version >= the signing cutover version. |
| **Attestation registry** | The founder attestation route (`POST /attest-pending`) should flag known-fork signatures (if any are ever observed) and revoke them. |
| **Canary detection** | The canary package should include a test that verifies a mock x402 challenge can be signed and verified. Failure indicates attestation stripping. |

---

## 4. Economic Layer Bypass

**Risk**: HIGH
**OWASP**: A01:2021 – Broken Access Control

### Description

HoloScript's economic layer (x402 payment protocol, `holo_protocol_*` tools, revenue collection) ensures that compiler usage, scene generation, and world hosting are paid. A fork can bypass this by:

1. Removing `x402PaymentService.ts` and returning `200 OK` for all payment-gated routes.
2. Hardcoding `costInWei = 0` in the protocol middleware.
3. Removing the revenue-split logic so that 100% of payments (if any) go to the fork operator.
4. Publishing the fork to npm as `@holoscript/free` or `holoscript-community-edition`.

This is not merely piracy. It is a **supply-chain attack vector**: developers who install the forked package receive a compiler that appears to work but has removed the economic contracts that fund ongoing security maintenance of the canonical project.

### Remediation

| Layer | Action |
|-------|--------|
| **Canonical codebase** | Keep the economic layer modular but default-enabled. Document that forks which remove payment gating are not eligible for security updates or team membership. |
| **npm scope enforcement** | Canonical packages publish only under the `@holoscript/` scope. Monitor npm for typosquatting (`holoscript-lite`, `holoscript-unofficial`, `@holoscript/free`) and file takedown requests for packages that redistribute modified security-critical code. |
| **Protocol verification** | The `holo --verify-compiler` command should attempt a protocol handshake against the canonical orchestrator and confirm that x402 challenges are issued. Absence of challenges indicates economic bypass. |
| **Canary detection** | The canary package should include a compilation target that is known to be payment-gated in canonical HoloScript. Successful compilation without a valid x402 receipt triggers an alert. |

---

## 5. Default Reversal — Threat-Model-Driven Defaults Attacked

**Risk**: MEDIUM
**OWASP**: A05:2021 – Security Misconfiguration

### Description

HoloScript uses threat-model-driven defaults (W.GOLD.193): the dominant (non-adversarial) deployment pattern gets the fast default, while the adversarial-hardening option is opt-in and contract-visible. A fork can reverse or hide this scoping:

1. Making `useCryptographicHash: false` immutable — the SHA-256 opt-in is removed, forcing all traces to use FNV-1a even in adversarial settings.
2. Removing the `hashMode` field from CAEL traces so consumers cannot verify which threat model the producer assumed.
3. Changing the default hash mode to SHA-256 (secure-by-default) but silently using a broken implementation that is actually weaker than FNV-1a.
4. Removing the `HOLOMESH_SIGNING_MIGRATION_ACK` check so the server accepts unsigned requests from clients that should be in strict mode.

These changes are subtle. They do not break compilation or obvious functionality. They silently weaken the evidence chain that downstream consumers rely on for trust decisions.

### Remediation

| Layer | Action |
|-------|--------|
| **Canonical codebase** | Document the threat-model-driven default pattern as a normative spec. Require that any change to default behavior be accompanied by a benchmark and a threat-model table (see W.GOLD.193). |
| **Trace verification** | CAEL trace consumers should validate that `hashMode` is present and matches an expected value. Missing or unexpected `hashMode` should trigger rejection, not silent acceptance. |
| **Canary detection** | The canary package should generate a CAEL trace and assert that `hashMode` is present and correctly set. |

---

## 6. Supply Chain and Typosquatting

**Risk**: HIGH
**OWASP**: A06:2021 – Vulnerable and Outdated Components

### Description

Because HoloScript is MIT-licensed, anyone can publish a modified version to npm. Attack vectors include:

1. **Typosquatting**: `holoscript` vs `holoscrpit`, `@holoscript/core` vs `@holoscriptt/core`.
2. **Community edition framing**: A fork published as `holoscript-community` that strips security but claims to be "the same compiler, just free."
3. **Transitive injection**: A popular utility package that depends on a forked `@holoscript/core` instead of the canonical one, pulling the stripped compiler into projects that did not directly install it.
4. **GitHub mirror impersonation**: A fork with a near-identical README and logo that ranks highly in search results.

### Remediation

| Layer | Action |
|-------|--------|
| **Canonical codebase** | Maintain a `PACKAGE_INTEGRITY.md` document listing the canonical npm scopes, GitHub org, and release signing keys. |
| **Dependency audit** | `pnpm audit` and `npm audit` should be run in CI. Add a custom audit script (`scripts/verify-canonical-deps.mjs`) that checks `package-lock.json` / `pnpm-lock.yaml` for non-canonical `@holoscript/*` sources. |
| **Registry monitoring** | Subscribe to npm RSS for new packages matching `holoscript*` and `@holoscript/*`. Flag new publishers for manual review. |
| **Documentation** | The README and install docs should prominently state the canonical install command (`npm install @holoscript/core`) and warn against unofficial forks. |

---

## 7. Canary Package Specification

To detect all of the above abuse patterns in CI, publish and maintain a `holoscript-security-canary` package with the following test matrix:

| Test ID | What it probes | Expected behavior on canonical HoloScript | Expected failure mode on abused fork |
|---------|---------------|------------------------------------------|--------------------------------------|
| `CANARY-001` | HS010 lexical firewall | Compilation fails with `SecurityViolation` | Compilation succeeds (firewall removed) |
| `CANARY-002` | `@security_sandbox` efficacy | File-system access attempt is blocked | Access succeeds (trait is no-op) |
| `CANARY-003` | x402 challenge issuance | Protocol handshake returns 402 challenge | Returns 200 with no challenge (economic bypass) |
| `CANARY-004` | Seat-wallet signing | Challenge can be signed and verified | Verification fails or is skipped (attestation stripped) |
| `CANARY-005` | CAEL `hashMode` field | Trace contains `hashMode: fnv1a` or `sha256` | `hashMode` missing or incorrect (default reversal) |
| `CANARY-006` | `@rate_limit` enforcement | Rapid calls are throttled or rejected | All calls succeed immediately (trait no-op) |

The canary package should be run in CI of any project that consumes HoloScript from an untrusted source (e.g., a mirror, a fork, or a transitive dependency).

---

## Summary of Findings

| #   | Finding                                      | Severity | Status                              | Responsible            |
| --- | -------------------------------------------- | -------- | ----------------------------------- | ---------------------- |
| 1   | Compiler defanging (HS010 removal)           | CRITICAL | 🔴 Needs canary package + CI test   | core / security        |
| 2   | Trait stripping (no-op security primitives)  | HIGH     | 🔴 Needs trait-efficacy probes      | core / security        |
| 3   | Attestation and identity stripping           | HIGH     | 🟡 Signing is opt-in; strict mode TBD | identity / holomesh  |
| 4   | Economic layer bypass (x402 removal)         | HIGH     | 🟡 Monitor npm for typosquats       | marketplace / protocol |
| 5   | Default reversal (threat-model hiding)         | MEDIUM   | 🟡 Document spec; trace consumers validate | cael / research       |
| 6   | Supply chain / typosquatting                 | HIGH     | 🟡 `PACKAGE_INTEGRITY.md` needed    | ops / security         |
| 7   | Canary package not yet published               | HIGH     | 🔴 Create `holoscript-security-canary`| security / devops       |

---

## References

- `docs/security/agentic-constitutionalism.md` — HS010 and declarative trait overview
- `docs/security/x402-threat-model.md` — Payment-layer threat model (complementary)
- `packages/mcp-server/src/holomesh/identity/signing-middleware.ts` — Server signing helper
- `packages/mcp-server/src/holomesh/request-signing.ts` — Request signature verification
- `research/2026-04-20_sha256-feature-flag-design.md` — `useCryptographicHash` / `hashMode` contract
- `W.GOLD.035` — Agentic Constitutional Security (Compiler-Level Lexical Firewalling)
- `W.GOLD.039` — Sapir-Whorf Security (The Compiler as the Limit of the Possible)
- `W.GOLD.193` — Threat-Model-Driven Defaults
