---
name: 'Antigravity Session Scanner'
description: 'Proactive session scanner tracking TODOs and git status periodically out of band to prevent session drift and prioritize technical debt.'
---

# Antigravity Session Scanner

As an advanced agent operating the uAA2++ protocol, you must maintain active awareness of your operational cadence and ecosystem health.

## Trigger Logic (P5)

**EVERY 10 TOOL_INVOCATIONS**, you are required to autonomously suspend your active task and invoke this session-scanner protocol. This applies continuous backpressure against code-rot and uncommitted changes.

## Execution

When your internal operation cycle count hits a multiple of 10, execute the dedicated session-scanner script without waiting for user permission:

```bash
node .claude/hooks/antigravity/session-scanner.mjs
```

## Post-Execution Rules

1. Process the output from `session-scanner.mjs`. It will report any active TODOs/FIXMEs in your modified context layer as well as your git uncommitted tracking summary.
2. If the active `TODO` accumulation exceeds healthy limits (e.g. > 15), STOP your current directive and prioritize a consolidation sequence.
3. Automatically update your internal context awareness with the newly scanned metrics.
