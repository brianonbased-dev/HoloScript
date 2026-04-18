# HoloScript — Live Numbers

> **This is the single source of truth for all ecosystem metrics.**
> Every other doc references this file. No doc should hardcode counts.
> Re-verify before citing — numbers change with every deploy.

## How to get live numbers

| Metric | Command | Notes |
|--------|---------|-------|
| MCP tools | `curl mcp.holoscript.net/health` → `tools` | Production count |
| Compilers | `find packages/core/src -name "*Compiler.ts" -not -name "CompilerBase*" -not -name "*.test.*" \| wc -l` | Sovereign + bridge |
| Export targets | `ExportTarget` type in `packages/core/src/compiler/CircuitBreaker.ts` | Enum members |
| Trait files | `find packages/core/src/traits -name "*.ts" -not -name "*.test.*" \| wc -l` | Individual definitions |
| Trait inventory (Paper 11) | `pnpm --filter @holoscript/core exec vitest run src/traits/constants/__tests__/paper-trait-inventory.test.ts` → `.bench-logs/paper-trait-inventory.json` | Do not hardcode counts in TeX; cite JSON + `benchmark-results-2026-04-18-paper-11-trait-harnesses.md` |
| Trait conflict census (Paper 11) | `pnpm --filter @holoscript/core exec vitest run src/traits/constants/__tests__/paper-trait-conflict-census.test.ts` → `.bench-logs/paper-trait-conflict-census.json` | Pairwise mode counts; see same benchmark markdown |
| Trait categories | `ls -d packages/core/src/traits/*/` | Category directories |
| Domain plugins | `ls -d packages/plugins/*/ \| grep -v template \| wc -l` | Excludes template |
| Packages | `ls -d packages/*/ \| wc -l` | Workspace packages |
| Tests | `pnpm test` → summary line | Expensive — cache CI output |
| Knowledge entries | `curl mcp-orchestrator-production-45f9.up.railway.app/health` → `knowledge_entries` | Orchestrator |
| R3F renderers | `ls packages/r3f-renderer/src/components/ \| wc -l` | Production components |
| Absorb tools | `curl absorb.holoscript.net/health` → `tools` | May be down — check first |
| npm packages | `npm search @holoscript 2>/dev/null \| wc -l` | Published @holoscript/* + create-holoscript |
| PyPI package | `pip3 show holoscript` | Core + 6 domain bridge extras (medical, alphafold, astronomy, robotics, scientific, all) |
| Store packages | `curl store.holoscript.net/-/v1/search?text=holoscript` → `total` | Verdaccio registry |

## Policy

1. **Active docs** (`docs/`, `README.md`, `FULL_README.md`) must never hardcode ecosystem counts. Reference this file or the verification command.
2. **Archive docs** (`docs/archive/`, `docs/_archive/`) stay frozen with a date stamp at the top. They are historical records.
3. **Marketing docs** (`docs/marketing/`) may snapshot numbers with a verification date: `"158 MCP tools (verified 2026-04-13)"`. Must re-verify before posting.
4. **Strategy docs** (`docs/strategy/`) may use counts if dated. The ROADMAP.md is authoritative for version-specific milestones.
5. **Demo files** (`docs/demos/`) should reference live endpoints where possible.

## Why

Every hardcoded number becomes a lie within weeks. The MCP server had 34 tools, then 82, then 88, then 122, then 158 — and every doc that pinned a number is now wrong. The compilers went from 15 to 24 to 28 to 44. The traits went from 1,800 to 3,300+. Tests went from 2,460 to 44,000+.

The fix is not "update the number." The fix is "stop hardcoding the number."
