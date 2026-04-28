# A-009 Gap-Seed JSON Schema

## Overview

**A-009** is the "Example Freshness + Artist Stress-Test" routine. It runs daily (cloud-based) and stress-tests HoloScript compositions against the current compiler, runtime, and trait system. When stress-tests fail or artists request traits that don't exist, A-009 emits gap-seed JSON files into `gaps-pending/`.

## File Format

**Name pattern**: `A-009-<UTC-timestamp>-<combo-id>.json`

Example: `A-009-2026-04-27T22-01-04Z-stress-abc123.json`

## Schema

```json
{
  "routine_id": "trig_012VRZzHoo268yWEnwaa14Ep",
  "routine_name": "A-009 Example freshness + artist stress-test",
  "fired_at": "2026-04-27T22:01:04Z",
  "gaps": [
    {
      "title": "Compiler: trait combo cloth+water+softbody fails",
      "description": "Stress-test combo errored during compilation. Error log: ...",
      "priority": "high",
      "tags": [
        "auto-filed-by-A-009",
        "example-driven",
        "compiler-bug"
      ],
      "dedup_key": "a009-stress-abc123-combo-1"
    },
    {
      "title": "Artist requested @holographic_mesh trait (not in compiler)",
      "description": "Reiterate studio run requested this trait for a procedural fashion demo.",
      "priority": "medium",
      "tags": [
        "auto-filed-by-A-009",
        "example-driven",
        "trait-request",
        "studio"
      ],
      "dedup_key": "a009-stress-abc123-trait-holographic-mesh"
    }
  ]
}
```

### Field Definitions

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `routine_id` | string | Yes | Unique identifier for this A-009 run (trigger ID). |
| `routine_name` | string | Yes | Display name; should be "A-009 Example freshness + artist stress-test". |
| `fired_at` | string (ISO 8601) | Yes | UTC timestamp when A-009 ran. |
| `gaps` | array | Yes | Array of gap/issue objects. Empty array → no file created. |

### Gap Object Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | string | Yes | <60 characters. Concise description of the gap. |
| `description` | string | No | <900 characters. Detailed explanation, error logs, context. |
| `priority` | string | No | `"high"`, `"medium"`, `"low"`. Default: `"medium"`. |
| `tags` | string[] | No | Array of tags. Should include `"auto-filed-by-A-009"`. Common: `"example-driven"`, `"compiler-bug"`, `"trait-request"`, `"studio"`, `"runtime"`. |
| `dedup_key` | string | Yes | Unique key for deduplication. Format: `a009-<run-id>-<combo-id>-<gap-index>`. Server deduplicates on title + dedup_key. |

## Pipeline

1. **A-009 (cloud, daily)**
   - Runs artist stress-test against current HoloScript main
   - On compile failure or trait-request event, emits one JSON file per batch
   - Commits + pushes JSON files to `HoloScript/research/audit-reports/gaps-pending/`
   - Naming: `A-009-<UTC>-<combo-id>.json`

2. **Local Session-Start Hook** (`~/.ai-ecosystem/hooks/sessionstart/ingest-a009-gaps.mjs`)
   - Triggered on every VS Code session start
   - Reads all `A-009-*.json` files from `gaps-pending/`
   - Parses each file (skips malformed ones)
   - POSTs each gap to HoloMesh `/api/holomesh/team/{teamId}/board`
   - On success: moves file from `gaps-pending/` to `gaps-consumed/` (local only, no commit)
   - On error: file stays in `gaps-pending/` for retry next session
   - Idempotent: server-side dedup (F.025) handles re-submissions

3. **Board Tasks**
   - Each gap becomes a board task with:
     - `title` from gap
     - `description` from gap (or empty)
     - `priority` from gap
     - `tags` including `"auto-filed-by-A-009"`, `"example-driven"`
     - `metadata.dedup_key` for server-side dedup
   - Engineers see tasks labeled `#auto-filed-by-A-009` on the board

## Acceptance Criteria (Task 1777252324838_xi2c)

- [ ] A-009 is updated to emit JSON gaps when stress-tests fail
- [ ] A-009 commits + pushes JSON to `HoloScript/research/audit-reports/gaps-pending/`
- [ ] Local hook (already implemented) successfully ingests JSON and files tasks
- [ ] Server-side dedup prevents duplicate tasks from re-fires
- [ ] Next A-009 run with failing combo -> JSON lands in HoloScript main -> local session start -> tasks appear on board

## Development Notes

### How to Test the Hook Locally

1. Create a test JSON seed file in `HoloScript/research/audit-reports/gaps-pending/A-009-<UTC>-test.json`
1. Set env vars:

```bash
export HOLOSCRIPT_ROOT="C:/Users/Josep/Documents/GitHub/HoloScript"
export HOLOMESH_API_KEY="..." # from ~/.ai-ecosystem/.env
export HOLOMESH_TEAM_ID="..." # from ~/.ai-ecosystem/.env
```

1. Run the hook manually:

```bash
node ~/.ai-ecosystem/hooks/sessionstart/ingest-a009-gaps.mjs
```

1. Check board for new tasks (should have `#auto-filed-by-A-009` tag)

### A-009 Integration Checklist

- [ ] A-009 prompt includes JSON emission logic
- [ ] JSON payload structure matches this schema
- [ ] Error scenario: emit gap with priority=high, tags include "compiler-bug"
- [ ] Trait-request scenario: emit gap with tags include "trait-request", "studio"
- [ ] File naming: `A-009-<ISO-UTC-timestamp>-<combo-id>.json`
- [ ] Commit message: `"audit: A-009 gap seeds from stress-test run <combo-id>"`
- [ ] Push to HoloScript main
- [ ] Next-day test: check board for ingested tasks

## References

- Task: task_1777252324838_xi2c (A-009 example->codebase task pipeline)
- Hook implementation: `~/.ai-ecosystem/hooks/sessionstart/ingest-a009-gaps.mjs`
- Hook tests: `~/.ai-ecosystem/hooks/sessionstart/__tests__/ingest-a009-gaps.test.mjs`
- Dedup rule: F.025 (server-side title normalization)
