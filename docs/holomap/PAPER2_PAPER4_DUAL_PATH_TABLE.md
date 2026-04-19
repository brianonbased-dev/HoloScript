# Dual-path ingest — Paper 2 / Paper 4 figure scaffold (R5)

**Option C:** identical scene semantics across `marble`, `holomap`, and `both`. Harness entrypoints: [INGEST_PATH_ENTRYPOINTS.md](./INGEST_PATH_ENTRYPOINTS.md).

## Markdown table (draft)

| Ingest path | Scene hash stable | Replay fingerprint (HoloMap) | Anchor hash (OTS / Base) | Notes |
|-------------|-------------------|------------------------------|----------------------------|--------|
| `marble` | ✓ (compat) | — (Marble manifest) | — | Baseline for reviewer trust |
| `holomap` | ✓ | ✓ `computeHoloMapReplayFingerprint` | ✓ when manifest merged via `mergeAnchoredProvenance` | Native path |
| `both` | ✓ | Side-by-side rows | HoloMap column only | **Paper figure** default |

## LaTeX `tabular` snippet (paste into Paper 2 or 4)

```latex
\begin{table}[t]
\caption{Dual-path scene ingest (Marble vs HoloMap native). HoloMap exposes replay fingerprint and optional external anchors; Marble compatibility path omits anchor columns by design.}
\label{tab:dual-ingest}
\begin{tabular}{lccc}
\toprule
Path & Deterministic replay ID & Anchor hash (OTS/Base) \\
\midrule
\texttt{marble} & --- & --- \\
\texttt{holomap} & \checkmark & \checkmark (when anchored) \\
\texttt{both} & HoloMap column only & HoloMap column only \\
\bottomrule
\end{tabular}
\end{table}
```

**Measurement protocol:** Run `paper-snn-navigation.test.ts` and `adversarial-holo.test.ts` with `HOLOSCRIPT_INGEST_PATH` set per row; capture logs + manifest JSON for the supplement.
