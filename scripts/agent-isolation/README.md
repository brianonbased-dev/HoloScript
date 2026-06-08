# Agent isolation — Phase 0 of the substrate fix (W.GOLD.546 / MEMORY D.068)

**Doctrine:** shared-central-write is the winning coordination model; fix the _data structure_, never abandon the model. For code the concurrent-write-native structure is git's commit-DAG + **per-agent isolated working copy** + commit-straight-to-main. The shared working tree/index is the single-writer structure that collides (stranded commits, stash/index races). See `research/2026-05-26_agent-substrate-architecture-fix.md`.

These scripts are **drafted, not activated.** Activation changes every running agent's environment, so it is fleet-coordinated.

## Scripts

| Script              | Purpose                                                                                                                                            | Safe to run now?                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `isolate-spawn.mjs` | SessionStart enforcement: if an agent starts in the frozen primary, provision/reuse an isolated worktree and emit "work here, not in the primary". | Side-effecting (creates a worktree). Run only when testing activation. |
| `worktree-gc.mjs`   | Conservative GC: prune `.scratch` worktrees that are merged + clean + stale (TTL). Dry-run by default.                                             | Yes — dry-run is read-only. `--commit` to prune.                       |

## Activation (the coordinated step — do NOT do unilaterally)

1. **Coordinate with the running fleet** (don't change startup mid-operation for ~10 live agents).
2. Wire `isolate-spawn.mjs` into `.claude/settings.json` SessionStart:
   ```json
   {
     "hooks": [
       {
         "type": "command",
         "command": "node C:/Users/Josep/.ai-ecosystem/hooks/run-hook.mjs sessionstart/agent-isolation-spawn.mjs"
       }
     ]
   }
   ```
   (Place the hook where `run-hook.mjs` resolves it, mirroring the existing `room-connect.mjs` wiring.)
3. Schedule `worktree-gc.mjs` (e.g. daily) once isolation is producing per-agent worktrees.
4. **Then** unfreeze main (remove the `pre-push` freeze + the `frozen-primary` commit guard) so agents commit straight to main with rebase-retry — the doctrine's code path. This **retires** the bandaid hook family (`frozen-primary`, W.082 multi-scope block, W.082b index-race detector, `safe-commit-parity`): with per-agent isolation they have nothing to detect.

## What this retires (once active)

The detection-bandaid hooks exist only because N agents share one mutable tree. Per-agent isolation removes that condition, so those hooks become dead code. The win is the _swap_ (doctrine-enforcement replaces symptom-detection), not adding another layer.
