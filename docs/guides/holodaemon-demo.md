# HoloDaemon 5-Minute Demo

HoloDaemon is an autonomous self-improvement loop for the HoloScript codebase. On each cycle it reads a Behavior Tree composition, picks type-error candidates, asks an LLM to generate fixes, validates them, and commits the ones that reduce error count.

---

## Prerequisites

1. An API key for your chosen provider
2. Node.js 18+ and `pnpm` installed
3. A clean working tree (daemon commits via `git`)

Set environment variables (add to `.env` at repo root):

```bash
# Required: choose one provider
HOLODAEMON_PROVIDER=openai        # or anthropic / xai / ollama
HOLODAEMON_MODEL=gpt-4.1         # or claude-sonnet-4-6 / grok-3

# Provider API keys
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# XAI_API_KEY=...
```

---

## Single Cycle (Dry Run)

Run one cycle in trial mode — no commits, verbose output:

```bash
npx tsx packages/core/src/cli/holoscript-runner.ts daemon \
  compositions/self-improve-daemon.hsplus \
  --cycles 1 \
  --provider openai \
  --focus typefix \
  --debug
```

What you'll see:

- `[daemon] API key validated` — confirms the key works
- `[daemon] Established type error baseline: NNNN` — first run sets baseline
- BT action logs: `diagnose → read_candidate → generate_fix → verify_compilation → ...`
- `[daemon] Cycle 1 done in Xs | N ticks | BT: success | quality: 0.NNN`

---

## Single Cycle with Commit

Once confident, enable commits:

```bash
npx tsx packages/core/src/cli/holoscript-runner.ts daemon \
  compositions/self-improve-daemon.hsplus \
  --cycles 1 \
  --provider openai \
  --focus typefix \
  --commit
```

A successful commit shows:

```text
[daemon] Committed fix: packages/core/src/...
[daemon] Cycle 1 done in 45.2s | 187 ticks | BT: success | quality: 0.012
```

Check it with `git log --oneline -1`.

---

## Check Daemon Status

After any cycle run, inspect accumulated state:

```bash
npx tsx packages/core/src/cli/holoscript-runner.ts daemon status
```

Output:

```text
HoloDaemon Status  ○ IDLE
  State dir: /path/to/.holoscript

Session
  Total cycles:  3
  Last focus:    typefix
  Last cycle:    7/1/2025, 2:30:00 PM

Quality
  Best:      0.018
  Last:      0.015
  Baseline:  3610 type errors

Cost
  Total:      $0.0842
  Tokens in:  18,000
  Tokens out: 6,200

Files
  Committed:   4
  Quarantined: 1
  Wisdom:      12 entries

Recent Ledger Entries (last 5)
  7/1/2025, 2:30:00 PM  SomeFile.ts  committed (a1b2c3d)  focus:typefix
```

---

## Multi-Cycle Always-On Mode

Run indefinitely, sleeping 60 seconds between cycles:

```bash
npx tsx packages/core/src/cli/holoscript-runner.ts daemon \
  compositions/self-improve-daemon.hsplus \
  --provider openai \
  --commit \
  --always-on \
  --cycle-interval-sec 60
```

Stop it with `Ctrl+C` — the daemon writes a lock file (`.holoscript/daemon.lock`) and cleans it up on exit.

---

## Focus Modes

Override the auto-rotation with a specific focus:

| Focus              | What it fixes                           |
| ------------------ | --------------------------------------- |
| `typefix`          | TypeScript type errors (`tsc --noEmit`) |
| `lint`             | ESLint violations                       |
| `coverage`         | Low-coverage code paths                 |
| `docs`             | Missing JSDoc / outdated docs           |
| `target-sweep`     | Compiler target output correctness      |
| `trait-sampling`   | Trait registration and validation       |
| `runtime-matrix`   | HeadlessRuntime integration tests       |
| `absorb-roundtrip` | Absorb pipeline parse/emit consistency  |
| `all`              | Everything in one pass                  |

```bash
# Fix lint errors for 3 cycles
npx tsx packages/core/src/cli/holoscript-runner.ts daemon \
  compositions/self-improve-daemon.hsplus \
  --cycles 3 --commit --focus lint
```

---

## State Files

All state lives in `.holoscript/` at the repo root:

| File                      | Contents                                                       |
| ------------------------- | -------------------------------------------------------------- |
| `daemon-state.json`       | Cycle count, quality scores, cost totals, focus index          |
| `daemon-file-state.json`  | Committed files, quarantined files (too many failures)         |
| `fix-ledger.json`         | Full provenance for every committed/rolled-back fix (last 200) |
| `accumulated-wisdom.json` | LLM-distilled lessons learned from past cycles                 |
| `daemon.lock`             | PID + heartbeat — proves daemon is alive                       |
| `inbox.jsonl`             | External task injection (one JSON task per line)               |
| `outbox.jsonl`            | Completed task results                                         |

Delete them to start fresh:

```bash
Remove-Item .holoscript\daemon-state.json, .holoscript\daemon-file-state.json -Force
```

---

## Troubleshooting

**`[daemon] API key validation failed`**  
→ Check your provider key is exported: `echo $env:OPENAI_API_KEY`

**`[daemon] Another daemon is running`**  
→ Remove the stale lock: `Remove-Item .holoscript\daemon.lock -Force`

**Cycle exits immediately with `BT: unknown`**  
→ Add `--debug` to see which BT action failed; check that `git` is on your PATH

**Quality stays at 0.000**  
→ Type errors may already be zero for chosen files, or the LLM model is too small. Try `--model gpt-4.1` or `--focus lint`.
