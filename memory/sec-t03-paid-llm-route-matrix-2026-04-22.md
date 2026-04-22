# SEC-T03 — Paid LLM API routes (Studio)

Matrix: **auth** → **body / input cap** → **per-route rate limit** → **credit check + debit** (Absorb operation).

| Route | Auth (`requireAuth`) | Size cap | Rate limit | Credits |
|-------|----------------------|----------|------------|---------|
| `POST /api/generate` | yes | `readJsonBody` 32KB + `MAX_PROMPT_CHARS` 4K | 10/min (`generate`) | `checkCredits` / `deductCredits` → `studio_generate` |
| `POST /api/autocomplete` | yes | route-specific + body helper | yes | `studio_autocomplete` |
| `POST /api/material/generate` | yes | yes | yes | `studio_material` |
| `POST /api/brittney` | yes | `readJsonBody` 32KB + per-message 4K | 20/min (`brittney`) | `studio_chat` (check before stream; debit once before first `messages.create`) |
| `POST /api/voice-to-holo` | yes | `readJsonBody` + `MAX_UTTERANCE_CHARS` 4K | 15/min (`voice-to-holo`) | `studio_voice_to_holo` (check before LLM; debit on successful validated response) |

**Not LLM spend:** `GET /api/generate` (templates only), `GET/POST /api/health` (env probes).

**Pricing:** `packages/absorb-service/src/credits/pricing.ts` — `studio_voice_to_holo` added 2026-04-22 for voice route metering.
