# WorldWatchTrait Event-Trigger Contract

Machine source: `docs/handbooks/world-watch-trait-contract.json`
Checker: `pnpm run check:world-watch-contract`
Source gap: `CG-094`
Phase: contract only

`WorldWatchTrait` declares when world-integrity tools should run. It does not
create webhooks, mutate production branches, spend cloud budget, or depend on a
provider-cloud agent.

External reference surface, verified through the CG-094 receipt:

- [Copilot cloud agent overview](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent)
- [Copilot cloud agent risks and mitigations](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/risks-and-mitigations)
- [Copilot code review concepts](https://docs.github.com/en/copilot/concepts/agents/code-review)
- [Copilot code review how-to](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/copilot-code-review)
- [Use Copilot cloud agent on GitHub](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-github)
- [Copilot automations overview](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-automations)

These links establish the event-triggered agent-action shape. They do not prove
HoloScript adoption, authorize GitHub writes, or make GitHub the scheduler of
record.

## Contract Shape

A world or registry entry may declare:

```json
{
  "id": "fairness-on-world-change",
  "file_pattern": "worlds/**/*.holo",
  "event": "commit",
  "agent_action": "fairness_sweep",
  "mode": "dry_run",
  "receipt_sink": "receipts/world-watch/",
  "enabled": true
}
```

Required fields:

| Field          | Meaning                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `id`           | Stable trigger id for receipts and scheduler state.                                             |
| `file_pattern` | Glob or path expression matched against world files.                                            |
| `event`        | One of `commit`, `push`, `schedule`, or `trait_change`.                                         |
| `agent_action` | One of `validate_holoscript`, `conformance_check_artifact`, `fairness_sweep`, or `holo_critic`. |
| `mode`         | `dry_run` by default; write-capable modes require a later contract.                             |
| `receipt_sink` | Directory, artifact path, or HoloCI receipt handle.                                             |

Optional fields:

| Field          | Meaning                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- |
| `schedule`     | Cron-like or interval descriptor consumed by `SchedulerTrait` or the HoloShell Team registry. |
| `trait_filter` | Trait names that must be present before firing.                                               |
| `threshold`    | Action-specific policy threshold.                                                             |
| `enabled`      | Explicit on/off gate.                                                                         |
| `dry_run`      | Boolean override for tool calls such as `holo_ci_dispatch`.                                   |

## Execution Mapping

| Event          | HoloScript mapping                                                                                  | Boundary                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `schedule`     | `SchedulerTrait` registers a named job via `scheduler:add_job` and emits `scheduler:job_triggered`. | Phase 1 only emits/validates the contract; no background scheduler is installed. |
| `commit`       | HoloCI may preview checks through `holo_ci_dispatch` with `dryRun: true`.                           | Real HoloCI spend requires explicit opt-in outside this contract.                |
| `push`         | Same HoloCI dispatch path as `commit`; receipts must name the source commit.                        | No GitHub webhook mutation is created here.                                      |
| `trait_change` | A future HoloShell Team registry or Studio panel may enqueue a signed board task.                   | This contract defines payload compatibility only.                                |

The HoloShell Team registry is the recurring-work scheduler of record for
ecosystem automation. `WorldWatchTrait` must feed signed board tasks or explicit
HoloCI previews rather than creating a private scheduler lane.

## Action Mapping

| Agent action                 | Tool or surface                          | Expected receipt                                 |
| ---------------------------- | ---------------------------------------- | ------------------------------------------------ |
| `validate_holoscript`        | HoloScript MCP validation tool           | validation status, errors, warnings, source hash |
| `conformance_check_artifact` | Hololand/HoloScript conformance MCP tool | pass/fail, violations, artifact digest           |
| `fairness_sweep`             | Fairness MCP tool                        | cohort/model summary, fairness receipt digest    |
| `holo_critic`                | Critic MCP tool                          | findings, severity, cited target                 |

All actions are advisory in Phase 1. A write, branch, patch, or Studio accept
flow belongs to a later implementation task.

## Receipt Contract

Every trigger evaluation must be able to emit:

```json
{
  "triggerId": "fairness-on-world-change",
  "event": "commit",
  "filePattern": "worlds/**/*.holo",
  "matchedFiles": ["worlds/demo.holo"],
  "agentAction": "fairness_sweep",
  "toolInputs": {},
  "toolOutputs": {},
  "policyDecision": "dry_run_only",
  "status": "pass",
  "startedAt": "2026-06-29T00:00:00.000Z",
  "finishedAt": "2026-06-29T00:00:01.000Z",
  "sourceCommit": "<sha>",
  "worldHash": "<hash>",
  "caelTraceId": "<trace-id>",
  "receiptDigest": "<digest>"
}
```

If the action cannot run, the receipt must say `blocked` or `not_run` and carry
the exact missing credential, adapter, source file, or scheduler surface.

## CG-093 Boundary

CG-093 owns `WorldReviewTrait`: post-compile review, threshold comparison, and
human-reviewable fix planning.

CG-094 owns `WorldWatchTrait`: event declaration, file matching, and deciding
which advisory world-integrity action is eligible to run.

`WorldWatchTrait` may trigger a CG-093 review action after a compile receipt
exists. It must not create a fix branch or apply a production write in Phase 1.

## Non-Goals

- Live webhook mutation.
- Automatic production write.
- Direct GitHub lock-in.
- Provider-cloud dependence.
- Paid cloud spend.
- Local accelerator proof.
- Studio trigger editor.
- WorldReviewTrait fix-branch generation.

## Verification

Run:

```powershell
pnpm run check:world-watch-contract
```

The checker validates the JSON contract, source-file anchors, allowed event and
action names, execution mappings, receipt fields, policy defaults, and non-goals.
