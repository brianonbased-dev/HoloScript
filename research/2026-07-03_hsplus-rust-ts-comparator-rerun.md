# .hsplus Rust-vs-TS Comparator Rerun

Date: 2026-07-03
Verifier: Codex/OpenAI local seat
Repo HEAD before verifier commit: `99a21d9eaa07ca7e49ac2dee4a6114dde6bd2d69`
Board task: `task_1783078367059_s8oy`

## Claim Checked

The same-session claim that the Rust `.hsplus` parser was near a 98% pass rate
needed an uninvolved rerun before external citation. This rerun verifies the
current figure against a checked-in corpus manifest and records the exact
methodology.

I did not author the original comparator or the Rust grammar-fix lane that
created the earlier figure. The harness patch in this verifier pass only adds
manifest selection, corpus hashing, and explicit TS/Rust pass-rate fields; it
does not change the TS parser call, Rust parser call, per-file pass/fail bucket
logic, or baseline regression gate.

## Fixed Corpus

- Manifest: `scripts/lang-audit/hsplus-corpus-manifest-2026-07-03.json`
- Corpus root: `packages/`
- Extension: `.hsplus`
- File count: `2299`
- Manifest SHA-256: `0bc1405a01de2d655563b29a1ef338f344ceacd652d280d28c53b6d18a004054`
- Result file: `scripts/lang-audit/shadow-compare-results-2026-07-03-codex.json`

## Commands

```powershell
node --check scripts\lang-audit\shadow-compare-rust-ts.mjs
node scripts\lang-audit\shadow-compare-rust-ts.mjs --write-corpus-manifest scripts\lang-audit\hsplus-corpus-manifest-2026-07-03.json
node scripts\lang-audit\shadow-compare-rust-ts.mjs --corpus-manifest scripts\lang-audit\hsplus-corpus-manifest-2026-07-03.json --baseline scripts\lang-audit\shadow-compare-results-2026-07-02.json --json-out scripts\lang-audit\shadow-compare-results-2026-07-03-codex.json
```

## Results

| Metric             |       Count |     Rate |
| ------------------ | ----------: | -------: |
| Rust pass          | `2255/2299` | `98.09%` |
| TS pass            |   `20/2299` |  `0.87%` |
| Both pass          |    `3/2299` |  `0.13%` |
| Both fail          |   `27/2299` |  `1.17%` |
| TS pass, Rust fail |   `17/2299` |  `0.74%` |
| TS fail, Rust pass | `2252/2299` | `97.96%` |
| Overall agreement  |   `30/2299` |  `1.30%` |
| TS newline drift   |    `0/2299` |  `0.00%` |
| Rust newline drift |    `0/2299` |  `0.00%` |

The baseline regression gate also passed: `0` files that Rust parsed correctly
in `scripts/lang-audit/shadow-compare-results-2026-07-02.json` regressed to
Rust failure in this rerun, across `2240` baseline Rust-pass files.

## Citation Guidance

The rough "98%" Rust `.hsplus` pass-rate claim is confirmed for the checked-in
manifest as `98.09%`, not as an uncited floating number. Cite it only with the
manifest path and SHA-256 above.

This is a Rust parser pass-rate measurement, not a semantic equivalence claim
between the TS and Rust parsers. The overall agreement rate is `1.30%` because
the TS parser remains flat at `0.87%` on this corpus while Rust accepts most
files. External docs should say "Rust validates 98.09% of the manifest-backed
`.hsplus` corpus; TS validates 0.87%" rather than implying parser parity.
