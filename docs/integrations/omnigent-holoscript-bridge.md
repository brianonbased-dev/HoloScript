# Omnigent / HoloScript Bridge Contract

**Classification**: BRIDGE
**Status**: Export target implemented in `compile_to_omnigent_agent_yaml`
**Snapshot consumed**: `omnigent-ai/omnigent` `15c6460c8f967c3dc7755bc70b3fa686296ed776` on 2026-06-27

## One-line

HoloScript agent compositions compile to Omnigent agent YAML when an external meta-harness is the desired runtime, and Omnigent sessions import back as HoloMesh receipts.

## Why This Exists

Omnigent is an external meta-harness for running agent sessions across multiple coding-agent families, local or hosted execution environments, policies, terminals, MCP tools, and sub-agents. That overlaps with HoloScript's agent-facing surface, but it is not the semantic source of truth for this ecosystem.

The bridge rule is:

- HoloScript owns durable intent, agent semantics, policy meaning, receipts, and regeneration.
- Omnigent YAML is a deploy/run projection for a runtime that already has useful harness coverage.
- Omnigent session output returns to HoloMesh as receipts, not as a private memory or task lane.

If deleting the generated Omnigent YAML would lose meaning that cannot be regenerated from `.holo`, `.hs`, or `.hsplus`, the bridge is incomplete.

## Absorb Workflow

Use the local HoloShell snapshot adapter because hosted MCP cannot see Windows paths directly.
The adapter emits a `LocalCodebaseSnapshotReceipt.v1` with replayable `sourceFiles`; pass it
to `holo_absorb_repo` as `localCodebaseSnapshotReceipt` so absorb-service verifies the
declared hashes before scanning.

```powershell
node scripts/holoshell-local-codebase-absorb-bundle.mjs --self-test

node scripts/holoshell-local-codebase-absorb-bundle.mjs `
  --roots C:/Users/josep/.ai-ecosystem/.scratch/omnigent-inspect/omnigent `
  --chunk-dir .scratch/omnigent-core-absorb-YYYY-MM-DD `
  --chunk-prefix omnigent-core `
  --max-files 120 `
  --max-bytes 1048576 `
  --max-file-bytes 131072 `
  --max-chunks 6 `
  --post-mcp
```

Run `holo_graph_status` before trusting cache-backed graph answers. If the graph receipt reports a root mismatch, use its `localAdapter.command` or refresh through `localCodebaseSnapshotReceipt` rather than `rootDir`.

The adapter must enforce three caps before posting to MCP:

- `--max-files`: total files per sourceFiles payload.
- `--max-bytes`: total UTF-8 content bytes per sourceFiles payload.
- `--max-file-bytes`: per-file content cap so one large file does not trip hosted MCP argument-length gates.

## Export Mapping

| HoloScript source concept                 | Omnigent YAML projection                              | Bridge rule                                                                                    |
| ----------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Agent composition in `.hsplus` or `.holo` | `name`, `prompt`, or `instructions`                   | Prefer `instructions` when the prompt is long or shared across tools.                          |
| Runtime target metadata                   | `executor.harness`, `executor.model`, `executor.auth` | Keep auth as environment/provider references; never inline secrets.                            |
| HoloScript MCP connector contract         | `tools.<name>.type: mcp`                              | Preserve tool allowlists and headers as generated projection data.                             |
| Typed local tool contract                 | `tools.<name>.type: function`                         | Only project tools that have a HoloScript-owned schema.                                        |
| HoloMesh child-agent role                 | `tools.<name>.type: agent`                            | Child-agent harness/model may differ from the parent, but the role intent stays in HoloScript. |
| Policy trait or governance frame          | `policies.<name>`                                     | Generated policy entries must point back to a receipt or source frame.                         |
| Local execution policy                    | `os_env` and `terminals`                              | Mark Windows native sandboxing as degraded when isolation is only process-tree containment.    |
| Async/cancel/timer affordances            | `async`, `cancellable`, `timers`                      | Treat as runtime affordances, not agent identity.                                              |

## Import Mapping

| Omnigent event/source                             | HoloScript / HoloMesh receipt                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Session start, fork, attach, or host registration | `ExternalHarnessSessionReceipt` with harness, model, host, and workspace identity.                       |
| Tool call and tool result                         | MCP tool receipt with target name, arguments hash, result hash, duration, and policy verdict.            |
| Policy `ALLOW`, `DENY`, or `ASK`                  | `PolicyDecisionReceipt` with phase, actor, target, reason, and state updates.                            |
| Sub-agent session                                 | Child-agent receipt linked to the parent HoloMesh task/session.                                          |
| Terminal launch                                   | External resource receipt with sandbox backend, cwd, command hash, and degraded-mode flag when relevant. |
| Cost or routing decision                          | Cost/routing receipt linked to the model selector event.                                                 |

The import side should be append-only. Never rewrite HoloMesh history from Omnigent state; supersede with a new receipt.

## Compiler Target Shape

Implemented target: `compile_to_omnigent_agent_yaml`.

Minimum output:

```json
{
  "agentYaml": "name: ...\nexecutor:\n  harness: codex\n",
  "receipt": {
    "source": "agent.holo-or-hsplus",
    "target": "omnigent-agent-yaml",
    "sourceHash": "sha256:...",
    "projectionHash": "sha256:...",
    "warnings": []
  }
}
```

Required warnings:

- Secret-bearing auth was requested instead of provider/env references.
- Windows native runtime requested a sandbox guarantee that Omnigent documents as unavailable.
- A function tool lacks a HoloScript-owned schema.
- A policy handler cannot be traced back to a HoloScript governance frame or receipt.

## Round-trip Gate

1. Generate Omnigent YAML from HoloScript source.
2. Validate that the YAML has no inline secrets and only uses allowed provider/env references.
3. Run an Omnigent smoke prompt when the CLI is available:

   ```bash
   omnigent run generated-agent.yaml -p "Say hello"
   ```

4. Import the session events as HoloMesh receipts.
5. Recompile the same HoloScript source and confirm the generated YAML hash is stable unless source or target options changed.

## Non-goals

- Do not make Omnigent YAML the durable authoring format for HoloScript agents.
- Do not bypass HoloMesh board, presence, knowledge, or receipt surfaces with Omnigent-native state.
- Do not assume Omnigent sandbox claims transfer across operating systems without a recorded backend.
- Do not compile arbitrary Python policy handlers from HoloScript unless the handler is already a declared bridge dependency.

## Implementation Receipt

`compile_to_omnigent_agent_yaml` is an export-only compiler target that accepts a HoloScript agent composition and emits:

- Omnigent YAML.
- A projection receipt.
- A warning list for inline secrets, degraded Windows sandboxing, missing policy provenance, and unowned function-tool schemas.

Primary implementation:

- `packages/core/src/compiler/OmnigentAgentYamlCompiler.ts`
- `packages/mcp-server/src/compiler-tools.ts`
