# Claude Code Agent Quickstart

This recipe is for an internal Claude Code seat that needs to work inside a
HoloScript checkout, use HoloScript MCP before editing, coordinate through the
HoloMesh board, and leave enough evidence for another agent to verify the run.

It is scoped as a short first-run path. Do not describe the run as local
hardware, WebGPU, or provider-cloud validation unless the receipt names the
command, adapter, machine, and output artifact that proved it.

## Sources Of Truth

- Client connection snippets: [connect-external-clients.md](./connect-external-clients.md)
  and `scripts/connect.mjs`.
- Tool inventory: live MCP `tools/list`; use [docs/NUMBERS.md](../NUMBERS.md)
  when a doc needs counts.
- Codebase intelligence workflow: [mcp-server.md](./mcp-server.md) and
  [codebase-intelligence.md](./codebase-intelligence.md).
- Team coordination: the HoloMesh room scripts in the local
  `ai-ecosystem` checkout.

## 1. Preflight The Checkout

Run this from the HoloScript repo root:

```powershell
git status --short
node scripts/connect.mjs claude-code
node scripts/connect.mjs --self-test
curl https://mcp.holoscript.net/health
```

If `git status --short` shows existing work, keep your edits and commits scoped
to the files for the claimed task. If files are already staged by another peer,
use `scripts/safe-commit.ps1` or `git commit --only` with explicit paths.

## 2. Add HoloScript MCP To Claude Code

Use the generator as the source of truth:

```powershell
node scripts/connect.mjs claude-code
```

PowerShell form:

```powershell
$env:HOLOSCRIPT_MCP_ACCESS_TOKEN = "<bearer-token>"
claude mcp add --transport http holoscript https://mcp.holoscript.net/mcp --header "Authorization: Bearer $env:HOLOSCRIPT_MCP_ACCESS_TOKEN" --scope project
```

Bash form:

```bash
export HOLOSCRIPT_MCP_ACCESS_TOKEN="<bearer-token>"
claude mcp add --transport http holoscript https://mcp.holoscript.net/mcp --header "Authorization: Bearer ${HOLOSCRIPT_MCP_ACCESS_TOKEN}" --scope project
```

Use `--scope user` instead of `--scope project` only when this seat should use
the same server across every local repo. Do not commit tokens or generated files
that contain tokens.

## 3. Prove MCP Discovery In Claude Code

Ask Claude Code:

```text
Use the HoloScript MCP server. List the available tools related to validation,
compilation, codebase intelligence, and HoloMesh coordination. Do not rely on a
stale static tool list; use live discovery.
```

If discovery fails, refresh the MCP server in Claude Code, re-run the generated
connection command, and verify the token can read the hosted endpoint before
editing code.

## 4. Load Absorb / GraphRAG Before Editing

Ask Claude Code:

```text
Use HoloScript MCP before editing:
1. Call holo_graph_status with {}.
2. If the cache root does not match this repo or the graph is stale, call
   holo_absorb_repo with {"rootDir":"."} and force:false.
3. Call holo_query_codebase with {"query":"where is the source of truth for
   Claude Code MCP connection configuration?"}.
4. Return file references before proposing edits.
```

For local CLI fallback, use:

```powershell
holoscript absorb . --for-agent
holoscript query "where is the source of truth for Claude Code MCP connection configuration?" --json
```

Treat GraphRAG as context, not proof. Read the cited files before changing
them.

## 5. Claim And Close HoloMesh Board Work

Set the local coordination checkout once per shell:

```powershell
$env:HOLOMESH_ROOT = "C:\Users\josep\.ai-ecosystem"
if (!(Test-Path $env:HOLOMESH_ROOT)) { throw "Set HOLOMESH_ROOT to the local ai-ecosystem checkout." }
```

Heartbeat, inspect the queue, and claim:

```powershell
node "$env:HOLOMESH_ROOT\scripts\signed-heartbeat.mjs"
node "$env:HOLOMESH_ROOT\hooks\team-connect.mjs" --queue
node "$env:HOLOMESH_ROOT\scripts\room-patch-task.mjs" claim <task_id>
```

When the work is committed and verified, close with the commit hash and evidence:

```powershell
node "$env:HOLOMESH_ROOT\scripts\room-patch-task.mjs" done <task_id> <commit_hash> --verify "PASS: <command>; PASS: <command>; hardware/provider claims: none" "Shipped <short summary>."
```

If the task required hardware, provider cloud, or fleet evidence, include the
adapter name, machine, receipt path, and teardown state in `--verify`.

## 6. Compile And Validate A Small HoloScript Change

Use MCP tools when Claude Code is connected:

```text
Validate this HoloScript snippet with validate_holoscript, then compile the same
code with compile_holoscript for the threejs target. Return the validation
result and any compiler artifact metadata.

composition "Agent Smoke Scene" {
  object "Marker" {
    @grabbable
    position: [0, 1, -2]
    color: "#00ffff"
  }
}
```

Use local CLI fallback when MCP is unavailable:

```powershell
@'
composition "Agent Smoke Scene" {
  object "Marker" {
    @grabbable
    position: [0, 1, -2]
    color: "#00ffff"
  }
}
'@ | Set-Content -Encoding utf8 .scratch\agent-smoke.holo

holoscript validate .scratch\agent-smoke.holo
holoscript compile .scratch\agent-smoke.holo --target threejs --output .scratch\agent-smoke-threejs
```

Scratch outputs stay under `.scratch/` and should not be committed.

## 7. Example First Agent Workflow

Use this exact shape for a first task:

```text
Goal: update one doc or small source file already named by the board task.

1. Heartbeat and claim the task.
2. Run live MCP discovery.
3. Run holo_graph_status, then holo_absorb_repo only if needed.
4. Query GraphRAG for the named surface and read the cited files.
5. Edit only the task files.
6. Run the narrow validation command and git diff --check for changed docs.
7. Commit explicit paths only.
8. Mark the board task done with command evidence and the commit hash.
```

Closeout evidence template:

```text
PASS: node scripts/connect.mjs --self-test
PASS: git diff --check -- <changed-paths>
PASS: <targeted test or docs check>
commit: <sha>
hardware/provider claims: none
notes: <what this unlocks next>
```

If any line cannot be proven, write `NOT RUN:` or `BLOCKED:` with the exact
reason instead of implying success.
