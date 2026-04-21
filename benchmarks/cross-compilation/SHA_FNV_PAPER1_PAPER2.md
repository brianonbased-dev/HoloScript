# SHA-256 vs FNV-1a — in-repo microbenchmark (Papers 1, 2, 3 + CAEL)

Replaces off-repo “order of magnitude” estimates for TeX `\\todo{}` rows in
`paper-1-mcp-trust-usenix` and `paper-2-snn-neurips` (provenance / build-cache
key path) with **measured** ratios on a single host, same **Node.js** process
and sync APIs as the CAEL / contract-hash decision bench.

## Source of truth (code)

- Implementation: `packages/engine/src/simulation/__tests__/fnv1a-vs-sha256.bench.test.ts`
- FNV-1a matches `CAELTrace` / `SimulationContract` byte hashing; native SHA-256
  uses `node:crypto` `createHash('sha256')`; pure-JS path is the Path 3 universal
  deployment cost.

## Reproduce

```bash
cd packages/engine
pnpm exec vitest run src/simulation/__tests__/fnv1a-vs-sha256.bench.test.ts
```

Warmup and iteration counts are **inside the test** (decision bench, not a CI gate).

## Captured run (regenerate when updating papers)

| Field | Value |
|-------|--------|
| **Host OS** | win32 x64 |
| **Node** | v22.22.0 |
| **Captured** | 2026-04-21 (local; replace when re-running) |

### Paper-1 / Paper-2 / Paper-3 — UTF-8 source (computeContentHash-style)

Scenario — median **μs** per call; **nat-×** = native SHA-256 / FNV-1a; **pjs-×** = pure-JS SHA-256 / FNV-1a.

| Scenario | FNV-1a (μs) | Native SHA-256 (μs) | Pure-JS SHA-256 (μs) | nat-× | pjs-× |
|----------|-------------|----------------------|------------------------|-------|------|
| single-object snippet (0.5 KB) | 1.009 | 3.605 | 18.827 | 3.57× | 18.66× |
| medium composition (5 KB) | 11.010 | 13.571 | 120.291 | 1.23× | 10.93× |
| large composition (50 KB) | 124.752 | 78.675 | 1119.388 | 0.63× | 8.97× |
| full-project manifest (200 KB) | 451.911 | 322.853 | 4386.195 | 0.71× | 9.71× |

**Takeaway for prose:** for small snippets (0.5 KB), **pure-JS** SHA-256 is ~**19×** FNV-1a on this run; for larger sources the gap narrows because OpenSSL- backed native SHA-256 wins on bulk but Path 3 (pure-JS) remains ~**9–10×** FNV-1a at 50–200 KB.

For CAEL **binary** payload and **state-vector** tables, see the same `vitest` run stdout (sections “Paper-3 CAEL” and “Paper-3 §7.5”).

## Related

- Design memo: `~/.ai-ecosystem/research/2026-04-20_sha256-feature-flag-design.md` (if present in your checkout)
