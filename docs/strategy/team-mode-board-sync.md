# Strategic team modes and board objective sync

**Purpose:** Align **how the team works** (`mode` on the HoloMesh board) with **what tasks get prioritized**, without editing code for every process tweak. Supports *Team process — strategic modes + board objective sync*.

## Canonical modes

Defined in `@holoscript/framework` as `TEAM_MODES`:

`audit`, `research`, `build`, `review`, `security`, `stabilize`, `docs`, `planning`

Source: `packages/framework/src/board/board-types.ts`.

## How mode should influence the board

| Mode | Bias |
|------|------|
| **audit** | Evidence, traceability, gap reports; prefer tasks with verification commands |
| **research** | Hypothesis-driven tasks; tolerate longer exploration |
| **build** | Shippable slices; integration and user-visible outcomes |
| **review** | Readiness, PR/CI hygiene, consolidation |
| **security** | Threat model, secrets, sandboxing, auth paths |
| **stabilize** | CI, regressions, flake reduction, perf SLOs |
| **docs** | SSOT docs, NUMBERS alignment, onboarding |
| **planning** | Roadmap gates, dependencies, sequencing |

## Objective sync

- The board should expose a short **`objective`** string (per team API) that matches the current mode (e.g. stabilize → “CI green + zero flaky holomap MCP tests”).
- When mode changes, **update objective** in the same action so agents do not optimize on stale goals.
- Optional: `communicationStyle` or meeting directives (see team peer protocol if your org uses it).

## Changing mode (operators)

Use your team’s supported control plane (examples):

- HoloMesh MCP / HTTP: `POST /api/holomesh/team/{teamId}/mode` with `{"mode":"docs"}` (permissions required).
- Session hooks may mirror mode into `%TEMP%/holomesh-mode-directive.md` for IDE context.

## Related

- [Identity statements](./identity-statements.md)
- [ROADMAP.md](./ROADMAP.md)
- Room autonomous skill in `~/.cursor/skills/room-autonomous/SKILL.md` (marathon loop + mode alignment)
