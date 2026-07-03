# Competitive Scan - 2026-07-03

## Red / Amber alerts

- Amber: [Cursor Team Marketplaces](https://cursor.com/changelog/team-marketplace-updates) now support Team MCPs and organization groups. The Cursor row now treats marketplace distribution as a team/org channel, not just an individual MCP listing.
- Amber: [Babylon.js releases](https://github.com/BabylonJS/Babylon.js/releases) advanced from the previous 9.13.0 citation to 9.15.0 on July 2, 2026. The row now records 9.14.0 HTML-in-Canvas and Gaussian Splatting GPU-picking work plus 9.15.0 WebGPU/tree-shaking/geospatial fixes.
- Yellow: [Android XR Developer Preview 4](https://developer.android.com/blog/posts/updates-to-the-android-xr-sdk-introducing-developer-preview-4) reframes the glasses lane as audio glasses and display glasses. The Android row no longer treats "AI Glasses" as the sole current Google naming surface.
- Yellow: [Reality Composer Pro 3](https://developer.apple.com/videos/play/wwdc2026/280/) is a standalone app with live preview, lightmaps, prototype/instance workflows, and an AI assistant. The visionOS row now calls out the missing HoloScript handoff guide.
- Red alerts: none this week.

## Tier 1 signals

- Unity: [Unity 6](https://unity.com/releases/unity-6) now foregrounds Unity 6.3 LTS support through December 2027, and [Unity 6000.4.11f1](https://unity.com/releases/editor/whats-new/6000.4.11f1) shipped June 10, 2026. No severity change, but the Unity lock-in row now has current official release evidence.
- Unreal: [Unreal Engine 5.8](https://www.unrealengine.com/news/unreal-engine-5-8-is-now-available) remains the current official MCP threat citation from the prior scan; no new row change was needed.
- Cursor: The existing 3.8 Automations signal remains live, and the June 30 team marketplace update increases urgency for HoloScript MCP submission and a Cursor-specific quickstart.
- Babylon.js: Latest official release is 9.15.0; update keeps the Babylon MCP / agent-native 3D row current.
- Android XR and Apple visionOS: both official platform authoring lanes moved enough to refresh row evidence.

## HoloScript Tool Integration

- Added the repo-integration gap directly to CG-073: every repo-facing guide, quickstart, skill, and matrix row should check HoloKey/x402 custody, routeTask/umbrella routing, and competitor-paper-codebase triad/uAAL review.
- HoloGate is kept as docs umbrella language only. It must route to concrete HoloKey, routeTask, triad/uAAL, MCP, compiler, or source-level proof rather than being used as runtime evidence.
- This scan did not add a new runtime HoloGate claim and did not revive Corridor language.

## Matrix updates

- Updated `C:/Users/josep/Documents/GitHub/HoloScript/docs/strategy/competitor-gap-matrix.json` for Unity, Babylon.js, Cursor, Apple Reality Composer Pro 3, Android XR, and CG-073 substrate-tool coverage.
- Rendered `C:/Users/josep/Documents/GitHub/HoloScript/docs/strategy/competitor-gap-matrix.md` from the JSON source.
- Checked the ai-ecosystem canonical competitor matrix and HoloLand matrix. The canonical HoloScript ecosystem matrix was already fresh as of July 3, 2026; the HoloLand matrix remains inside its 30-day freshness gate, so no HoloLand JSON row changed in this pass.

## Validation

- `pnpm run render:competitor-gap-matrix` in `C:/Users/josep/Documents/GitHub/HoloScript` -> passed
- `node -e "JSON.parse(require('fs').readFileSync('docs/strategy/competitor-gap-matrix.json','utf8')); console.log('json ok')"` in `C:/Users/josep/Documents/GitHub/HoloScript` -> passed
- `pnpm run check:competitor-gap-matrix` in `C:/Users/josep/.ai-ecosystem` -> passed with 0 errors / 0 warnings
- `pnpm run check:hololand-matrix` in `C:/Users/josep/.ai-ecosystem` -> passed with 0 errors / 0 warnings
- `git diff --check -- docs/strategy/competitor-gap-matrix.json docs/strategy/competitor-gap-matrix.md docs/daily-digests/2026-07-03-competitive-scan.md` -> passed

## Action items

- Submit / package the HoloScript MCP for Cursor team marketplace consumption.
- Add a Cursor quickstart that proves HoloKey/x402 receipts, routeTask/umbrella routing, and triad/uAAL review from a repo entry path.
- Add visionOS / Reality Composer Pro 3 and Android XR display-glasses handoff guides for the existing compile targets.
