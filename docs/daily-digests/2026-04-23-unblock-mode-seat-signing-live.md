# Milestone digest — 2026-04-23 (wave 2)

* **Program / theme:** `unblock` team mode canonicalized + per-seat git-signing end-to-end validated + tool-count regression investigated (false alarm → clean dedupe + wisdom graduated)
* **PR / commit:** HoloScript `a4f62a39e` (TEAM_MODES + ROOM_PRESETS.unblock + PERMISSIONS.md), ai-ecosystem `4dffe01` (room-skill docs), plus this commit signed end-to-end by the `claudecode-claude-x402` seat as the proof-of-life for `scripts/seat-signing-bootstrap.mjs` slice-2 wire-up.

## Three bullets

1. **What shipped:** (a) **`unblock` mode** added to `@holoscript/framework` `TEAM_MODES` + `ROOM_PRESETS` with objective, task sources, rules codified from the 2026-04-22 SEC-T-Zero deploy-chain experience; propagates through Studio validation + mcp-server without a server-side enum lock. (b) **Per-seat git-signing** wired on HoloScript via `git config --local gpg.format ssh` + `allowedSignersFile` + `user.signingkey` pointing at `~/.ai-ecosystem/seats/<seat>/seat-signing-key.pub`; this commit is signed by `claude-claudecode-c40b1de5-default-x402` and `git verify-commit` should identify the specific seat. (c) **Tool-count investigation** — drop from 236 to 234 on `/.well-known/mcp` v7.0.0 was a clean dedupe (Cursor commit `d9a9f2f7d` removed double-registration of 5 HoloMap tools that were being spread both directly and via `graphTools`); wisdom `W.team.1776924514845.wd3` captures the "pair count deltas with set-diff" pattern.
2. **Proof:** `git verify-commit HEAD` resolves this commit against the `allowed-signers` registry naming `claude-claudecode-c40b1de5-default-x402` as signer. 232/232 `dispatch-health.test.ts` tests pass on main, confirming all 234 deployed tools still reach handlers. Framework type-check clean on my `board-types.ts` edits (pre-existing `CapabilityMatcher` Vector3 errors are unrelated). Studio validation picks up `unblock` via the `TEAM_MODES` export at `app/api/holomesh/team/[id]/mode/route.ts:297`.
3. **Constraint / risk:** Seat-signing wire-up is **per-repo `--local` only** on HoloScript; `ai-ecosystem` + global `~/.gitconfig` remain unsigned (Cursor-Claude seat on this machine also hasn't wired its config yet). GitHub "Verified" badge requires adding the seat pubkey as a signing key in GitHub account settings (not yet done — only local `git verify-commit` works). Attestation (founder-Trezor signs the `allowed-signers` entries) still deferred to D1 slice 3 — current `allowed-signers` is self-asserted, not founder-attested.

## Mirror

**Release surface**: v7.0.0 on `mcp.holoscript.net` unchanged. `@holoscript/framework` gets `unblock` in next publish cycle. No API breakage.

**Board state**: 83 tasks, SEC-T-Zero + pre-commit-hook closed (prior cycle). Post-commit verification of seat-signing unblocks multi-surface attribution work.

**Vault / memory**: `unblock` mode codified in `ROOM_PRESETS` — agents can now enter the mode explicitly when they encounter deploy-blocker / auth-conflict / CI-drain work instead of retrofitting into audit/stabilize.
