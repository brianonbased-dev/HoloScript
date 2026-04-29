# Hand-curated baselines — Lotus Gate 3

Each `<sha>.baseline.json` is a hand-curated mapping of `paper_id -> bloom-state`
derived by reading the `git show <sha>:research/paper-audit-matrix.md` row directly
and applying the bloom-state rules from
`packages/studio/src/lib/brittney/lotus/derive-bloom-state.ts`:

```
1. retracted -> wilted
2. anchorMismatch + no surviving anchor -> wilted
3. !hasDraft -> sealed
4. stubCount > 0 -> budding
5. benchmarkTodoCount > 0 (and 0 stubs) -> blooming
6. !otsAnchored or !baseAnchored (and 0 stubs, 0 bench-todos) -> blooming
7. dual-anchored, 0 stubs, 0 bench-todos -> full
```

The matrix doesn't surface `\stub{}` markers directly. The parser uses the
Staleness column's `<N> todo` count as the stubCount proxy (W.103 — matrix
captures \todo{} markers, not \stub{}). For human baselines I apply the SAME
proxy: if matrix shows N>0 todos, treat as stubCount=N. The Gate 3 question
isn't whether the proxy is *correct* — it's whether the *parser implements
the same proxy as a human reader would*.

For older 11-column snapshots (pre-2026-04-19) there is no Staleness column
and stubCount falls back to 0; the baseline applies the same fallback.

For `trust-by-construction` (TVCG, off-matrix): default per fixture _note —
`blooming` (drafted, intentionally not anchored per I.009).

For Paper 7 / `p2-1-ik`: 2026-04-24+ matrix marks it RETIRED -> wilted.
Pre-2026-04-24: skeleton (LOC=252) but draft exists -> bloom rule says
budding only if stubCount>0; with no Staleness column, stubCount=0 ->
benchmarkTodoCount=1 (skeleton, no bench) -> blooming.
