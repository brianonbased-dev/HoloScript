# HoloAbsorb checkpoint retention benchmark

This run measured durable checkpoint behavior on the full eligible HoloScript
worktree at commit `0e92034b157294adc17a821d663077d7ba18758a`. Source access
was read-only and checkpoint state used an isolated temporary cache.

The measured corpus contained 20,106 files, 379,949 symbols, and 316 batches.
After an intentional interruption at 315 batches, resume reused all 315
completed batches and rescanned only the one-file tail batch. The seed pass took
619,336.338 ms and resume took 4,543.004 ms. Compact status was 1,875 bytes
versus 87,373 bytes for the complete batch history.

One full checkpoint occupied 279,243,167 bytes. The benchmark's provisional
24-directory pressure run therefore implied a 6,701,836,008-byte worst case.
The implementation was consequently tuned to:

- four checkpoint directories per cache lane;
- a 1 GiB byte ceiling;
- one-hour retention for complete or unreadable checkpoints;
- seven-day retention for resumable interrupted checkpoints;
- unconditional preservation of live writers and explicitly requested tokens.

The directory and byte ceilings are soft only when protected checkpoints alone
exceed them; correctness and resumability take precedence over collection.

Reproduce after building the package:

```powershell
pnpm --filter @holoscript/absorb-service build
pnpm --filter @holoscript/absorb-service benchmark:holoabsorb-checkpoints -- --repo C:/Users/josep/Documents/GitHub/HoloScript --out research/holoabsorb-artifacts/2026-07-26-checkpoint-retention/benchmark.json
```

The machine-readable evidence is in `benchmark.json`. Its worktree fingerprint
records pre-existing tracked modifications, so the receipt is a pinned local
measurement rather than a clean-release or universal throughput claim.
