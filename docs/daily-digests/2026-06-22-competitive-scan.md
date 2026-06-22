# Competitive Scan - 2026-06-22

## Red / Amber alerts

- Amber: [Cursor 3.8 Automations](https://cursor.com/changelog) shipped on June 18, 2026 with `/automate`, GitHub and Slack triggers, marketplace automation templates, and computer use for cloud agents. This tightens Cursor's AI-IDE distribution advantage and was added to the Cursor rows.
- Yellow: [Babylon.js 9.13.0](https://github.com/BabylonJS/Babylon.js/releases/tag/9.13.0) shipped on June 18, 2026 with continued Gaussian Splatting streaming/LOD work and GPU picker depth/normal support. This refreshes the Babylon release-feed evidence but does not change severity/status.
- Yellow: [VRChat 2026.2.2](https://docs.vrchat.com/docs/vrchat-202622) is the current live release source, replacing the prior 2026.2.1 citation in the HoloLand matrix. The update adds group-instance announcements, VRC+ gifting leaderboard, Google Account login, and GPU runtime texture compression.
- Red alerts: none this week.

## Tier 1 signals

- Babylon.js: latest release feed now shows 9.13.0; updated HoloScript published matrix evidence.
- Three.js: [r184](https://github.com/mrdoob/three.js/releases) remains the latest official release; no new agent/MCP/spatial threat since the prior scan.
- A-Frame: [v1.7.1](https://github.com/aframevr/aframe/releases) remains the latest official release; no new row change.
- LangGraph: [1.2.6](https://github.com/langchain-ai/langgraph/releases) shipped June 18, 2026 as a patch/reliability release; no matrix posture change.
- Cursor marketplace: [Cursor Marketplace](https://cursor.com/marketplace) now foregrounds plugins plus automations; no HoloScript listing appears on the official page, so the existing Cursor marketplace action remains live.
- Unreal, World Labs, and Vercel: official 2026-06-21 row updates were rechecked; no additional change beyond the prior scan.

## Tier 2 signals

- Pricing: [Cursor pricing](https://cursor.com/pricing) remained aligned with the June 21 row evidence; no pricing-triggered alert.
- HoloLand / social VR: [Rec Room shutdown](https://blog.recroom.com/posts/schools-out-for-rec-room) and [Spatial creator-platform sunset](https://www.spatial.io/blog/spatial-creator-platform-sunsetting) still validate the portability/economics wedge. VRChat was the only HoloLand source row requiring a refresh today.
- Platform watch: [Roblox CubePart](https://about.roblox.com/newsroom/2026/05/cubepart-roblox-open-vocabulary-part-controllable-3d-generator), Meta Horizon developer posts, and [Android XR](https://www.android.com/xr/) were checked; no new JSON row changes were needed.

## Matrix updates

- Updated `C:/Users/josep/Documents/GitHub/HoloScript/docs/strategy/competitor-gap-matrix.json` and rendered markdown for Babylon 9.13.0 and Cursor 3.8 Automations evidence.
- Updated `C:/Users/josep/.ai-ecosystem/docs/strategy/competitor-gap-matrix.json`, generated shards, and `C:/Users/josep/.ai-ecosystem/config/competitors.json` for Cursor 3.8 Automations plus the refreshed Babylon release source registry entry.
- Updated `C:/Users/josep/.ai-ecosystem/docs/strategy/hololand-competitor-gap-matrix.json` and generated shards for the VRChat 2026.2.2 source refresh.
- Did not roll every P1/P2 `nextReviewBy`: the existing weekly windows were already fresh, and only facts that changed received row/source evidence updates.

## Validation

- `pnpm run render:competitor-gap-matrix` in `C:/Users/josep/Documents/GitHub/HoloScript` -> passed
- `pnpm run render:competitor-gap-matrix` in `C:/Users/josep/.ai-ecosystem` -> passed with 0 errors / 0 warnings
- `pnpm run render:hololand-matrix` in `C:/Users/josep/.ai-ecosystem` -> passed with 0 errors / 0 warnings
- `git diff --check` in both repos -> passed

## Action items

- No new board follow-ups filed. Existing Cursor/HoloScript marketplace and Cursor-ready preset actions remain the right response path.
- Next scan should recheck Cursor marketplace for HoloScript/MCP listing changes, Babylon MCP adoption beyond the 9.11-9.13 line, and VRChat 2026.2.3 moving from open beta to live.
