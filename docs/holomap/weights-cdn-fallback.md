# HoloMap weights — distribution, CDN, and fallback

**Audience:** Operators shipping HoloMap in production.  
**Goal:** Repeatable story for **where weights live**, how to **fail over**, and how to stay **deterministic** per [CHARTER.md](./CHARTER.md).

## Principles

1. **Content-addressed identity:** Prefer `weightCid` (or equivalent) in HoloMap config so manifests can pin exact bytes (see MCP tool `config` on `holo_reconstruct_from_video` in `holomap-mcp-tools.ts`).
2. **Same build, same fingerprint:** Charter requires stable replay fingerprints for fixed (model hash, seed, video hash, weight strategy).
3. **No silent swaps:** If fallback weights differ from primary, treat as a **new trust tier** and log explicitly.

## Production pattern (recommended)

| Layer | Responsibility |
|-------|----------------|
| **Primary CDN** | Versioned URL per release; immutable object names (hash in path). |
| **Geo / second origin** | Optional second CDN or bucket; same content hashes. |
| **Offline / air-gap bundle** | Tarball or OCI layer shipped with the HoloMap build; path recorded in deployment manifest. |

## Fallback order (example)

1. Try primary URL from env / config.
2. On 404/timeout, try secondary base URL (if configured).
3. On continued failure, use **bundled local path** (container image or volume) if present.
4. If all fail: **fail closed** with structured error — do not substitute an unverified weight set.

Document the exact env vars and URLs in your **internal** runbook; keep this repo doc pattern-based only.

## CDN invalidation

- Prefer **immutable** assets so “invalidation” is rarely needed.
- If you must purge: purge only the **versioned** prefix; avoid purging `latest` aliases used by clients.

## Observability

- Log: weight source (primary, secondary, bundle), latency, byte size or hash after load.
- Correlate with `[HoloMap]` JSON logs (`HOLOMAP_LOG` — see [RUNBOOK_PAPER_HARNESSES.md](./RUNBOOK_PAPER_HARNESSES.md)).

## Related

- [Operator runbook](../ops/RUNBOOK.md)
- [HoloMap README hub](./README.md)
