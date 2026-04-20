# D.011 — Full loop demo (agent ↔ board ↔ knowledge)

**Purpose:** Scripted **end-to-end** path that matches D.011 “Full loop demo” evidence: an **agent-style** operator uses the **mesh/board**, touches **knowledge**, and lands a **user-visible** HoloScript outcome. Use for onboarding, paper supplement, or gate **G3** in the [D.011 checklist](../paper-program/D011_FOUR_GATE_CHECKLIST.md).

**Artifact:** this document (path below) + optional screen recording hash in your appendix.

## Prerequisites

- HoloScript repo cloned; `pnpm install` completed if you will run Studio locally.
- `~/.ai-ecosystem/.env` with valid **`HOLOMESH_API_KEY`** and **`HOLOMESH_TEAM_ID`** (never commit these).
- Node **20+** recommended.

## Path in repo

`docs/demos/full-loop-d011.md` (this file).

## Walkthrough (15–25 minutes)

Read steps **verbatim** for a facilitator; the participant is someone who can run a shell.

### 1. Confirm mesh is reachable

```bash
curl -sf https://mcp.holoscript.net/health
```

Expect HTTP 200 and a JSON body with service identity. If this fails, stop and treat as **deploy incident** (see [Operator runbook](../ops/RUNBOOK.md)).

### 2. Board snapshot (human or agent)

From **`~/.ai-ecosystem`** (loads `.env`):

```bash
node hooks/team-connect.mjs --board
```

Note **`mode`**, **`openCount`**, and one **open** task title. This satisfies the **board** leg of the loop.

### 3. Queue discipline (optional but ideal)

```bash
node hooks/team-connect.mjs --queue
```

Confirm **`claimableOpenCount`** and that your team **objective** still matches the work you claim (see [team mode ↔ board sync](../strategy/team-mode-board-sync.md)).

### 4. Knowledge leg (pattern)

Using your normal MCP or HTTP client (same API key), contribute **one** short knowledge line: a *gotcha* or *pattern* you observed in step 2–3. If you only have curl, use the team’s documented HoloMesh **contribute** route or MCP tool per [MCP examples](../api/MCP_EXAMPLES.md#share-knowledge).

Record the **response id** or timestamp in your run log.

### 5. User-visible HoloScript leg

**Option A — Studio playground (fastest):**

1. Run Studio per package README.
2. Open **`/playground`**.
3. Drop a small sample image in the drop zone and confirm a preview path appears.

**Option B — CLI / compile smoke:**

```bash
pnpm --filter @holoscript/cli exec holoscript -- --version
```

(Requires CLI built locally; use `npx @holoscript/cli --version` against npm if you are testing a release bundle.)

### 6. Freeze the evidence bundle

Log in one place:

- Git **SHA** of HoloScript
- **Health** curl timestamp (UTC)
- **Board** excerpt (`mode`, `openCount`, one task id)
- **Knowledge** contribution id or “MCP ok” note
- **Playground or CLI** outcome (pass/fail)

## Optional recording

- Export MP4; store hash `sha256sum full-loop-d011.mp4` in your paper appendix or internal vault.

## Related

- [D.011 benchmark reproducibility](../paper-program/D011-benchmark-reproducibility.md)
- [TTFHW protocol](../ops/time-to-first-hologram-wow.md)
- [Integration Hub](../../packages/studio/INTEGRATION_HUB.md)
