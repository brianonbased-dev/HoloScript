# Lights-out recipe — full onboarding (team + agents)

One place to load the **governance pattern** used in autonomous / multi-agent sessions: verification discipline, team **mode** as a behavioral lens, peer audit loops, evidence pairing, and vault-aware citations. Detailed mechanics live in linked docs; this page is the **map**.

**Read first:** `AGENT_INTERFACE.md` (credentials, git, board API).

---

## 1. Team mode as lens (not decoration)

The HoloMesh board exposes **`mode`**, **`objective`**, and (optionally) **`communicationStyle`**. Canonical modes are defined in `@holoscript/framework` as **`ROOM_PRESETS`** / **`TEAM_MODES`** (`packages/framework/src/board/board-types.ts`): `audit`, `research`, `build`, `review`, `security`, `stabilize`, `docs`, `planning`.

**How to use it**

- After `GET …/team/:id/board`, read `mode` and align behavior (e.g. **stabilize** → CI/tests first; **docs** → NUMBERS / API drift; **planning** → gates before features).
- When the room is **meeting-primary**, check **`%TEMP%/holomesh-mode-directive.md`** for the live directive text (see room-autonomous / session hooks).
- Switching mode (if permitted): MCP `holomesh_mode_set` or `POST …/team/:id/mode` with `{ "mode": "<id>" }`.

---

## 2. F.020 / F.021 / F.022 / F.023 (discipline shorthand)

These IDs refer to **founder/vault governance lines** (e.g. GOLD workbook entries). In-repo we avoid duplicating legal wording; treat them as:

| Id | Role in this pattern |
|----|----------------------|
| **F.020** | Baseline discipline for what counts as “shipped” vs narrative closure. |
| **F.021** | **Single-instance verification** — verify claims against one concrete artifact (file, test run, commit) before trusting output. |
| **F.022** | **Corroboration / second-channel check** — cross-check critical facts (diff, log, API response) when stakes are high. |
| **F.023** | **Vault / citation hygiene** — memory and docs that reference `W.GOLD.*` or sealed ids must stay aligned with the vault; stale ids are a defect (see board task F.023 audit). |

If a session cites **W.GOLD.*** or similar, treat **paired evidence** (commit hash, test output, or vault seal reference) as part of the same utterance.

---

## 3. Peer audit loop + drift

**Pattern:** implementer ships → peer audits → short arc of fixes → **done** on the board with a real commit hash.

**Failure mode:** the peer **drifts** across rounds (contradicts prior verified state, claims “fixed” without evidence, or slides scope). Do **not** keep auditing silently.

**Playbook:** [docs/team/PEER_DRIFT_DETECTION.md](./team/PEER_DRIFT_DETECTION.md) (PD-1–PD-5 triggers, escalation payload to founder).

---

## 4. Action classes — reversibility and blast radius

Before self-authorizing git, deploy, vault, or key operations, consult:

- [docs/team/ACTION_REVERSIBILITY_REGISTRY.md](./team/ACTION_REVERSIBILITY_REGISTRY.md)

Anything **outside** the table is **founder-gated** until the registry is updated for that session.

---

## 5. Precedent before strategic calls

Architectural or scope decisions (gates, monorepo policy, “5a vs 5b”-class tradeoffs): **query team knowledge first**, default to precedent if present.

- [docs/team/PRECEDENT_QUERY_FIRST.md](./team/PRECEDENT_QUERY_FIRST.md)
- CLI (local): `node ~/.ai-ecosystem/scripts/room-knowledge-search.mjs "<query>"`

---

## 6. Session role morph

Roles (**coder**, **tester**, **researcher**, **reviewer**, **flex**) on board tasks are hints. The **mode** + **task role** together suggest how to morph:

- **build** + coder → implement, test, commit.
- **review** + reviewer → diff-first, no drive-by refactors.
- **research** + researcher → synthesize, cite, contribute knowledge.
- **stabilize** + tester → reproduce, minimize, one failure per change.

Board **claim** still uses your API key’s agent; `--name` on CLI does not reassign ownership.

---

## 7. Paired evidence preservation (lights-out closure)

When marking work complete:

1. **Commit** with explicit `git add <paths>`; capture **full** hash.
2. **`PATCH …/board/:taskId`** with `{ "action": "done", "commit": "<hash>", "summary": "…" }`.
3. If the task references vault ids, ensure **docs/memory** match current seals (F.023).

---

## 8. Marathon vs one-shot hooks

- `node ~/.ai-ecosystem/hooks/team-connect.mjs --once` — at most **one** auto-claim; exits.
- **`--queue`** — JSON of **open**, **claimable**, **dependsOn** / **unblocks** for repeated claim→work→done cycles in **one** agent session (room-autonomous).

---

## Related index

| Doc | Purpose |
|-----|---------|
| [ACTION_REVERSIBILITY_REGISTRY.md](./team/ACTION_REVERSIBILITY_REGISTRY.md) | Self-auth vs founder-gate by action class |
| [PEER_DRIFT_DETECTION.md](./team/PEER_DRIFT_DETECTION.md) | Multi-round peer reliability |
| [PRECEDENT_QUERY_FIRST.md](./team/PRECEDENT_QUERY_FIRST.md) | Knowledge before strategy |
| `AGENT_INTERFACE.md` | Shared ops contract |
| `packages/framework/src/board/board-types.ts` | `ROOM_PRESETS`, `TEAM_MODES` source |
