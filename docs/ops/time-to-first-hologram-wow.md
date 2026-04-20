# Time-to-first-hologram-wow (TTFHW) — measurement protocol

**Purpose:** Repeatable way to answer “how long until a **new** person sees a believable hologram in HoloScript?” Aligns with board work to **measure** cold-start UX.

## Roles

| Role | Responsibility |
|------|----------------|
| **Facilitator** | Times steps, records notes, no coaching beyond printed script |
| **Participant** | Must **not** have edited HoloScript in the last 90 days |

## Environment

- **Machine:** Document OS, browser, GPU tier (integrated vs discrete).
- **Build:** Record git SHA or release version of Studio / CLI.
- **Network:** Online vs offline (affects weight/CDN paths).

## Script (read verbatim)

1. “You will try to get a 3D hologram-style scene on screen. Use only what you see in the app unless stuck for **three minutes**.”
2. Open Studio at `/playground` (or the documented cold-start path you are testing).
3. Participant drops **one** provided sample image (PNG, &lt; 2 MB) into the drop zone and clicks generate if shown.
4. Stop timer when participant says **“done”** or the preview clearly shows the displaced/hologram treatment **and** they express satisfaction.

## Timestamps to log

| Marker | Start | Stop |
|--------|-------|------|
| T0 | First page interactive | — |
| T1 | First media dropped / generate clicked | — |
| T2 | HoloScript visible in editor | — |
| T3 | Preview shows hologram treatment | — |

**TTFHW (strict):** `T3 - T0`  
**TTFHW (generate-only):** `T3 - T1` (isolates media → wow)

## Minimum sample size

- **n ≥ 5** participants for directional read; **n ≥ 12** if comparing two flows (e.g. with/without `/playground`).

## Reporting

- Median + P90 for TTFHW.
- Qualitative: where participants hesitated (navigation, trust, performance).
- Link results to `docs/NUMBERS.md` verification row when publishing.

## Related

- [Marketplace publication readiness](../distribution/marketplace-publication-readiness.md)
- [Operator runbook](./RUNBOOK.md)
