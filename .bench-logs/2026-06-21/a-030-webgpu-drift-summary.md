# A-030 WebGPU Bench Re-capture - 2026-06-21

Task: `task_1780920804266_6czd`

Local hardware gate:

- `pnpm --dir C:/Users/josep/.ai-ecosystem check:codex-hardware` passed.
- `node C:/Users/josep/.ai-ecosystem/scripts/codex-hardware-audit.mjs --probe-browser --browser chrome --agent codex-hardware` passed.
- Browser probe: headless Chrome 149 reported `navigator.gpu`, returned an adapter, and created a WebGPU device.
- Host GPU inventory included `NVIDIA GeForce RTX 3060 Laptop GPU` and `Intel(R) UHD Graphics`.

Capture command pattern:

```powershell
$env:HOLOSCRIPT_HW_TIER = 'H1'
$env:HOLOSCRIPT_HW_LABEL = 'H1 Windows local Chrome (RTX 3060 Laptop GPU)'
$env:HOLOSCRIPT_HW_GPU = 'NVIDIA GeForce RTX 3060 Laptop GPU'
$env:WEBGPU_PROBE_HEADLESS = '1'
node scripts/webgpu-capture/capture-bench.mjs <config> --out .bench-logs/2026-06-21/<name>-h1-win-localchrome.json
node scripts/webgpu-capture/verify-atomic-commutativity.mjs --trials 50 --out .bench-logs/2026-06-21/pairwise-atomic-commutativity-h1-win-localchrome.json
```

## Receipts

| Receipt | New median `results[0].median_us` | Prior local-Chrome evidence | Drift |
| --- | ---: | --- | --- |
| `smoke-h1-win-localchrome.json` | 3300.000004 | none found in `.bench-logs-evidence` | new H1/local-Chrome baseline |
| `tvcg-saxpy-h1-win-localchrome.json` | 3500.000000 | none found in `.bench-logs-evidence` | new H1/local-Chrome baseline |
| `tvcg-spmv-vector-h1-win-localchrome.json` | 3500.000000 | none found in `.bench-logs-evidence` | new H1/local-Chrome baseline |
| `tvcg-vec-copy-h1-win-localchrome.json` | 3500.000000 | none found in `.bench-logs-evidence` | new H1/local-Chrome baseline |
| `tvcg-vec-zero-h1-win-localchrome.json` | 3500.000000 | none found in `.bench-logs-evidence` | new H1/local-Chrome baseline |
| `paper-3-replay-determinism-500-h1-win-localchrome.json` | 3399.999999 | 3799.999982 from `.bench-logs-evidence/paper-3-replay-determinism-500-h1-win-localchrome.json` | -10.53 percent, faster |
| `pairwise-atomic-commutativity-h1-win-localchrome.json` | n/a | prior noncommutative pair count: 21 | current count: 21, stable |

## Verdict

No A-030 drift alarm from this run.

The only directly comparable H1/local-Chrome performance receipt, Paper 3 replay determinism, improved relative to the May 29 evidence. The pairwise atomic verifier reproduced the same noncommutative-pair count as the May 29 evidence. The smoke and TVCG receipts are useful as new H1/local-Chrome baselines; prior `.bench-logs-evidence` entries for those names were H3 GTX/Vast captures, which are not comparable to this local laptop run.

## Files Written

- `.bench-logs/2026-06-21/smoke-h1-win-localchrome.json`
- `.bench-logs/2026-06-21/tvcg-saxpy-h1-win-localchrome.json`
- `.bench-logs/2026-06-21/tvcg-spmv-vector-h1-win-localchrome.json`
- `.bench-logs/2026-06-21/tvcg-vec-copy-h1-win-localchrome.json`
- `.bench-logs/2026-06-21/tvcg-vec-zero-h1-win-localchrome.json`
- `.bench-logs/2026-06-21/paper-3-replay-determinism-500-h1-win-localchrome.json`
- `.bench-logs/2026-06-21/pairwise-atomic-commutativity-h1-win-localchrome.json`
