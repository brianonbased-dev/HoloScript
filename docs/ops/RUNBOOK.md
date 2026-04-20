# Operator runbook — deployment, troubleshooting, incidents

**Audience:** People on call for **HoloScript production surfaces** (MCP mesh, Studio-adjacent APIs, absorb/orchestrator where applicable).  
**Goal:** Repeatable checks, common failures, and rollback posture — not a substitute for provider-specific Railway/AWS docs.

---

## 1. System map (typical production)

| Surface | Role | Health |
|--------|------|--------|
| `mcp.holoscript.net` | MCP HTTP + tool mesh | `GET /health` |
| Orchestrator (example) | Registry, federation | Team-specific `/health` URL |
| Absorb | Codebase intelligence | `GET /health` on absorb host |
| Studio | Next.js app | App `/` + API routes under `/api/*` |

Exact hostnames change by environment — store **canonical URLs** in the team vault or internal wiki; this file stays pattern-based.

---

## 2. Deployment (Railway / container pattern)

1. **Pre-deploy:** CI green; no secrets in diff; version tag recorded.
2. **Deploy:** Use the project’s standard pipeline (e.g. Railway GitHub integration or `railway up`).
3. **Post-deploy smoke:**
   - `curl -sf https://mcp.holoscript.net/health | jq .` — expect `ok` / tool count present.
   - Hit one **read-only** MCP tool or public JSON endpoint if available.
4. **Config:** Confirm env vars for the service (API keys, CORS, rate limits) match the last known good release.

---

## 3. Health checks

| Check | Pass criteria |
|-------|----------------|
| MCP `/health` | HTTP 200; JSON includes service identity and `tools` or equivalent |
| Latency | p95 within SLO (define per team; e.g. &lt; 3s for health) |
| WASM / heavy paths | Sample compile or parse route returns within timeout budget |

Automate these in uptime monitoring; page when **two regions** or **two consecutive** checks fail.

---

## 4. Common failures

| Symptom | Likely cause | First actions |
|---------|--------------|----------------|
| 502 / upstream errors | Process crash, OOM, bad deploy | Check logs; roll back to last image; scale memory if OOM |
| Tool timeouts | Cold start, deadlock, downstream API | Increase timeout temporarily; isolate tool; disable noisy tool via feature flag |
| WASM init errors | Missing asset, wrong `Content-Type`, version skew | Verify static asset deploy; match CLI/runtime versions |
| Auth / 401 from MCP | Rotated key, clock skew | Rotate keys in vault; sync NTP; verify `Authorization` header path |
| Stale graph / cache | CDN or edge cache | Purge cache for affected paths; bump cache-bust query if used |

---

## 5. Incident response

1. **Declare** severity (user-visible outage = SEV1; degraded = SEV2).
2. **Mitigate:** Roll back deploy or toggle feature flag before root-cause deep dive.
3. **Communicate:** Post to team board / status channel with **ETA** and **workaround** (e.g. “use stdio MCP instead of HTTP”).
4. **Resolve:** Document timeline, root cause, and follow-up issue links.
5. **Postmortem (SEV1):** Blameless notes within 5 business days.

### Rollback

- Revert to **previous Railway deployment** or **previous container digest**.
- Invalidate CDN if static assets drifted.

### Cache invalidate

- Purge edge cache for `mcp.holoscript.net` (or provider equivalent) after bad JSON or WASM served.

---

## 6. Resource expectations (baseline)

- **MCP service:** CPU for parse/compile bursts; memory for WASM and graph workloads — start from provider metrics, not guesses.
- **DB / Redis (if any):** Connection limits and eviction policy documented per environment.

---

## 7. Monitoring

- **Logs:** Structured JSON preferred; include `request_id`, `tool`, `duration_ms`.
- **Metrics:** RPS, error rate, p95 latency per route; saturation (CPU, memory).
- **Alerts:** Error rate spike, health check failure, certificate expiry.

---

## 8. On-call handoff template

```
Window: <UTC start> – <UTC end>
Services owned: MCP / Studio / Absorb / …
Open incidents: <links or none>
In-flight deploys: <none | link>
Known risks: <e.g. DB migration tonight>
Escalation: <name + phone/slack>
```

---

## 9. Strategic team mode and board objective (operator checklist)

When the team shifts how it works (audit vs build vs stabilize, etc.), **mode** and **objective** on the HoloMesh board must stay in sync so autonomous agents and humans do not chase stale goals.

**Canonical detail (SSOT):** [Strategic team modes and board objective sync](../strategy/team-mode-board-sync.md) — mode names, biases, and objective rules.

**After changing mode, verify:**

1. **Board** — `GET /api/holomesh/team/{teamId}/board` shows the expected `mode` and a short `objective` that matches that mode (not leftover text from last week).
2. **IDE directive** — Session hooks or `team-connect` may write a mode summary for the IDE:
   - Windows: `%TEMP%\holomesh-mode-directive.md`
   - macOS/Linux: `$TMPDIR/holomesh-mode-directive.md` (see also [REST examples — Local IDE integration](../api/REST_EXAMPLES.md#local-ide-agent-integration)).
3. **Control plane** — Use one of:
   - HTTP: `POST /api/holomesh/team/{teamId}/mode` with `{"mode":"<mode>","objective":"<short string>"}` (team permissions required).
   - MCP: `holomesh_mode_set` with `team_id`, `mode`, and optional `objective` — [MCP examples](../api/MCP_EXAMPLES.md#set-team-mode).

If mode and objective disagree, fix them in the **same** change so the next board marathon or `team-connect --queue` run reflects reality.

---

---

## 10. Railway-specific operations

### Services managed via `deploy-railway.yml`

| Service | Path filter | Railway service name |
| ------- | ----------- | -------------------- |
| MCP Server | `packages/mcp-server/**` | `mcp-server` |
| Studio | `packages/studio/**` | `studio` |
| Marketplace API | `packages/marketplace-api/**` | `marketplace-api` |
| Export API | `services/export-api/**` | `export-api` |
| LLM Service | `services/llm-service/**` | `llm-service` |
| Absorb Service | `packages/absorb-service/**` | `absorb-service` |

### Manual deploy via GitHub Actions

Actions → **Deploy to Railway** → Run workflow

- `service`: choose specific service or `all`
- `skip_preflight`: use for emergency deploys only (bypasses heavy build checks)

### MCP Server boot modes

| Mode | Command | Use case |
| ---- | ------- | -------- |
| stdio | `pnpm start` in `packages/mcp-server` | Local IDE/Cursor MCP clients |
| HTTP | `node dist/http-server.js` | Railway prod, remote agents, `/health` |

### `/health` response schema

```json
{
  "status": "healthy | degraded | unhealthy",
  "uptime": 12345,
  "timestamp": "2026-04-19T...",
  "checks": {
    "registry": { "status": "ok", "agentCount": 8 },
    "telemetry": { "status": "ok", "totalSpans": 42, "activeSpans": 1, "totalEvents": 100 },
    "tools": { "status": "ok", "toolCount": 118 }
  },
  "version": "6.x.x"
}
```

### Required environment variables (mcp-server)

```bash
HOLOSCRIPT_API_KEY    # MCP auth + knowledge store
HOLOMESH_API_KEY      # HoloMesh gossip + board
DATABASE_URL          # Postgres (token store, audit log)
# SEC-T09: If Postgres uses a private CA, set one of:
#   PG_SSL_CA=/path/to/ca.pem   or   PG_SSL_CA_B64=<base64 of PEM>
# Managed cloud DBs with public roots need neither.
NODE_ENV=production
```

### Resource baseline (mcp-server)

- **RAM:** 512 MB min — WASM parser peaks at ~200 MB
- **CPU:** 0.5 vCPU — burst for parse/compile; steady-state is IO-bound

### Rollback via Railway UI

1. Railway dashboard → Project → Service → **Deployments**
2. Find last green deployment
3. Click **⋯ → Redeploy**

### Rollback via git revert

```bash
git revert <bad-commit-sha> --no-edit
git push origin main   # CI auto-deploys
```

---

## Related

- [Strategic team modes and board objective sync](../strategy/team-mode-board-sync.md)
- [TTFHW measurement protocol](./time-to-first-hologram-wow.md)
- [Marketplace publication readiness](../distribution/marketplace-publication-readiness.md)
- [Integration Hub](../../packages/studio/INTEGRATION_HUB.md) (connector APIs)
- [NUMBERS.md](../NUMBERS.md) — verification commands
- [Dependency Audit](../../DEPENDENCY-AUDIT.md) — monthly npm/Rust audit results
