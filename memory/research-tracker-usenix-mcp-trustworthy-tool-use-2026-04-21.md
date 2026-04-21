# Research tracker — MCP trustworthy tool use (USENIX Sec Dec 2026)

**Board:** `task_1776383022431_pb78`  
**Venue:** USENIX Security (Dec 2026) — *living draft, pre-submission*  
**Checklist discipline:** `docs/paper-program/D011_FOUR_GATE_CHECKLIST.md` · `docs/NUMBERS.md`.

## D.011 criteria — status (rolling)

| Criterion | Notes |
|-----------|--------|
| Run the product like a user (Studio, MCP with real OAuth scopes) | Capture token scope sets and denied tool paths **honestly** (no “we have auth” without mapping). |
| Refresh benchmarks (hardware + code drift) | Latency of gate chain + policy checks — date any numbers tied to CI or manual runs. |
| Recorded full-loop demo | Show tool call denied → allowed after scope upgrade; redact secrets. |
| Absorb / pipeline re-run as models change | Less central than GraphRAG paper; still note MCP server semver when citing behavior. |
| Preempt reviewers | Map narrative to **implemented** gates (prompt validation, OAuth scopes, StdlibPolicy) — distinguish from aspirational “fully formal verified.” |

## Codebase anchors (enforcement, not slogans)

| Layer | Path | Role |
|-------|------|------|
| Triple gate (prompt → scope → downstream policy) | `packages/mcp-server/src/security/gates.ts` | `gate1ValidateRequest`, `authorizeToolCall` path, `gate3EnforcePolicy`, `runTripleGate` |
| Per-tool OAuth 2.1 scopes | `packages/mcp-server/src/security/tool-scopes.ts` | `TOOL_SCOPE_MAP`, `authorizeToolCall`, `getToolScopes` |
| OAuth / token shapes | `packages/mcp-server/src/security/oauth21.ts` | Introspection + scope types |
| Tenant / GitHub auth (as applicable) | `packages/mcp-server/src/security/tenant-auth.ts`, `github-auth.ts` | Identity binding for hosted MCP |
| Audit trail | `packages/mcp-server/src/security/audit-log.ts` | Forensics story for “who invoked what” |
| Bypass / abuse detection | `packages/mcp-server/src/security/bypass-detection.ts` | Complement to positive authorization |

## Paper posture (draft)

- **Threat model:** spell out which gates cover **prompt injection** vs **over-privileged tool** vs **downstream exfiltration** (Gate 3 `StdlibPolicy`).
- **Trustworthy tool use** = **refuse-by-default** scope map + explicit policy — cite `tool-scopes.ts` + `gates.ts` APIs, not generic MCP marketing.

## Next steps (child tasks when funded)

1. USENIX — table of **tools × required scopes × risk tier** exported from code (or generated from `TOOL_SCOPE_MAP` + `TOOL_RISK_MAP`).
2. USENIX — short video / script: one denied call + one allowed call with same user story.
3. Close this tracker when a `docs/paper-program/*` draft cites this file.
