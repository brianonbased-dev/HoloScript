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

## Related

- [TTFHW measurement protocol](./time-to-first-hologram-wow.md)
- [Marketplace publication readiness](../distribution/marketplace-publication-readiness.md)
- [Integration Hub](../../packages/studio/INTEGRATION_HUB.md) (connector APIs)
- [NUMBERS.md](../NUMBERS.md) — verification commands
