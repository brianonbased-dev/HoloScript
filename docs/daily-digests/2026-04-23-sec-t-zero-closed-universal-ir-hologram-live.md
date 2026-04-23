# Milestone digest — 2026-04-23

* **Program / theme:** SEC-T-Zero closure (x402 challenge-verified /register) + HoloGram push layer LIVE on v7.0.0 + Universal-IR coverage matrix (Wave B Stream 3 landing)
* **PR / commit:** Chain `a479462ec` → `fd6bb45c6` → `1ccd12504` → `8da2ece0e` → `efed5d79a` → `d1fecc2dd`; HoloScript `@holoscript/core` v7.0.0 deployed to `mcp.holoscript.net`

## Three bullets

1. **What shipped:** (a) SEC-T-Zero x402 challenge-verified `/register` flow — client generates wallet locally, signs EIP-712 typed data, server verifies via viem `verifyTypedData`, response has NO `private_key` field (134/134 tests pass); (b) chain of 4 unblocker commits fixed 24h of Railway deploy failures by committing 32 untracked sibling files (2 safeJsonParse + 2 hologram + 27 engine-traits + 1 studio, 8162 LOC); (c) pre-commit hook `check-untracked-sibling-imports.js` prevents recurrence; (d) retro-rotation complete for both compromised seat wallets via x402 flow (`cursor-claude-x402` 0xb3dC75…, `claudecode-claude-x402` 0x346126…); (e) HoloGram push layer verified LIVE on v7.0.0 with 6 tools (`holo_hologram_from_media` / `_compile_quilt` / `_compile_mvhevc` / `_render` / `_publish_feed` / `_send`); (f) `docs/universal-ir-coverage.md` published consolidating 14 integration memos into 13-tool matrix.
2. **Proof:** 134/134 tests passing `http-routes.test.ts` including 9 new x402 register tests (happy-no-privkey, malformed, 409-duplicate, no-proof 400, bad-sig 401, replay, wallet-mismatch, legacy-deprecated); 11/11 hologram-mcp-tools tests; `/register/challenge=409` on burn address (correct x402 rejection); deployed `/.well-known/mcp` lists all 6 HoloGram tools on v7.0.0 with uptime 41+ ks; CRDT 121/121 clean. Bundle: `research/2026-04-21_seat-wallets-adr.md` (amended Tier 1 to x402), `scripts/provision-seat-wallets-x402.mjs`, `scripts/reconcile-seat-wallets.mjs`, 4 new audit tasks (GHCR PAT, team-knowledge asymmetry, team-capacity cleanup, git-signing ed25519).
3. **Constraint / risk:** Three-dimensional identity collapse only PARTIALLY resolved — (1) HoloMesh API attribution: x402 seats exist but blocked from joining HoloScript Core team by 5-seat cap + 3 cruft slots (`test-agent-123`, `board-test-cleanup`, `antigravity`) from 2026-04-13 bootstrap; (2) git commit signing: all agents still sign as `brianonbased-dev` (U.001 founder never writes code but all agent commits inherit founder git config); (3) board `claimedBy` server-side still shared via same HOLOMESH_API_KEY→agentId collapse. Founder clarification 2026-04-22: "i dont know everything is in .env folders and GOLD" — operational credentials live in infra, not founder head. Pre-commit hook prevents next untracked-sibling deploy break, but human/agent discipline gap (peer shipping imports without committing files) is a recurring class — see `task_1776834752275_pwux` follow-on.

## Mirror

Paste this block into Team Connect / HoloMesh handoff so the repo and the room stay aligned.

**Release surface**: `@holoscript/mcp-server` deployed v7.0.0 on Railway (uptime 11+ h stable post-chain). `docs/universal-ir-coverage.md` newly public under the HoloScript repo — positions HoloScript as semantic layer above glTF/USD/FBX/VRM and beside URDFormer/Scenethesis/Marble/Genie 3.

**Board state**: 83 tasks, `task_1776824795959_phtk` (SEC-T-Zero) + `task_1776834752275_pwux` (pre-commit hook) closed this cycle. 3 new P1 audit tasks seeded (GHCR PAT plaintext, team-knowledge write-read asymmetry, team capacity cleanup). Board attribution still collapsed to `antigravity-seed` pending per-surface key rollout.

**Vault / memory**: W.076 (identity-confusion-at-API-key-surface), W.078 (untracked-sibling-imports pattern), W.078b (x402 challenge-verified /register LIVE + ROTATED), W.079 (three-dimensional identity collapse) added. Knowledge store: 1179 → 1182 entries. GOLD: 183 entries (4 Diamond, 4 Platinum, 175 Gold) unchanged this cycle.
