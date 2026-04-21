# Plugin marketplace security models — external benchmarks for HoloScript

**Board:** `task_1776640937112_naw3`  
**Source audit:** `2026-03-01_holoscript-studio-ide-audit.md`

## Why this matters

HoloScript’s marketplace (`packages/studio/src/lib/marketplace/`) distributes **templates, agents, traits, and MCP-facing assets**. Any “install from community” path must assume **malicious publishers** unless the pipeline enforces **identity, integrity, and least privilege** at install *and* runtime.

## Ecosystem patterns (public references — verify before legal/compliance language)

| Ecosystem | What they optimize for | Representative public discussion |
|-----------|------------------------|-----------------------------------|
| **VS Code Marketplace** | Signed packages, marketplace-as-signer, evolving publisher identity | [Extension publisher signing — VS Code discussions #137](https://github.com/microsoft/vscode-discussions/discussions/137) |
| **npm / Node packages** | Provenance, trusted publishing, registry integrity | [npm documentation — provenance](https://docs.npmjs.com/generating-provenance-statements) |
| **JetBrains Marketplace** | Signed plugins, JetBrains as distributor | [Plugin repositories help — JetBrains](https://plugins.jetbrains.com/docs/marketplace/) (read current policy pages before citing in filings) |
| **Adobe (Creative Cloud / Exchange)** | Partner identity + review-heavy listings | Treat as **manual review + brand gate** analog — not automatable for open OSS at small-team cost. |

## Map to HoloScript (existing controls)

| Risk | Mitigation already in-repo / architecture |
|------|-------------------------------------------|
| Tool execution blast radius | MCP **triple gate** — `packages/mcp-server/src/security/gates.ts` + `tool-scopes.ts` (OAuth scopes per tool) |
| “Fake” listing vs binary | Needs **artifact signing** + immutable release record — align with wallet / seat attestation tracks on the HoloMesh board |
| Supply chain on `pnpm install` | Monorepo hygiene: lockfile, `pnpm audit`, CI — orthogonal to marketplace but required baseline |

## Design principles (draft)

1. **Integrity before popularity** — starred counts ≠ trust; tie installs to **publisher key** + **semver-bound manifest**.
2. **Two layers** — **catalog trust** (who published) vs **runtime trust** (what MCP/tools may execute) — do not collapse.
3. **Open by default, safe by policy** — default deny for high-risk tools unless scope + policy explicitly allow (`StdlibPolicy` in Gate 3).

## Next engineering tasks (not done here)

1. Threat model doc: **Studio marketplace install** → **filesystem** → **MCP bridge** data flow.
2. MVP: publisher pubkey + signature over **manifest + tarball hash** stored alongside listing.
