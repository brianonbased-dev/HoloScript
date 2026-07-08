# Competitive Scan - 2026-07-08

## Red / Amber alerts

- Amber: [Unity's official editor archive](https://unity.com/releases/editor/archive) now shows `6000.5.2f1` released on July 1, 2026, which is newer than the HoloScript matrix's prior `6000.4.11f1` citation. The Unity P1 lock-in row now reflects the newer supported-update evidence.
- Red alerts: none this week.

## Tier 1 signals

- Unity: [Unity 6 release support](https://unity.com/releases/unity-6/support) still places Unity 6.3 LTS through December 2027, and the [official archive](https://unity.com/releases/editor/archive) now shows `6000.5.2f1` on July 1, 2026. This keeps the "weekly/biweekly supported-update" lock-in claim current.
- Babylon.js: [GitHub releases](https://github.com/BabylonJS/Babylon.js/releases) still show `9.15.0` from July 2, 2026 as the latest official release; no new row delta after the July 3 scan.
- Cursor: [team marketplace updates](https://cursor.com/changelog/team-marketplace-updates) still point to the June 30, 2026 Team MCP / organization-group expansion; no newer official marketplace-distribution delta surfaced in this scan.
- Apple visionOS / Reality Composer Pro 3: Apple WWDC26 Reality Composer Pro 3 sessions remain the current official signal; no fresher official authoring-surface delta surfaced after the July 3 scan.
- Android XR: Developer Preview 4 remains the current official Android XR authoring/distribution signal; no fresher official SDK or product-surface delta surfaced after the July 3 scan.

## HoloScript Tool Integration

- No new HoloKey/x402, routeTask/umbrella, triad/uAAL, or HoloGate-surface correction was needed in the HoloScript matrix this pass.
- The existing repo-entry integration action items from the July 3 scan remain live: Cursor distribution, visionOS handoff guidance, and Android XR handoff guidance still need product work rather than wording refreshes.

## Matrix updates

- Updated `C:/Users/josep/Documents/GitHub/HoloScript/docs/strategy/competitor-gap-matrix.json` metadata for the July 8 scan and moved the Unity P1 row to the newer official `6000.5.2f1` archive evidence.
- Rendered `C:/Users/josep/Documents/GitHub/HoloScript/docs/strategy/competitor-gap-matrix.md` from the JSON source.
- Re-checked the ai-ecosystem canonical competitor matrices. `docs/strategy/competitor-gap-matrix.json` and `docs/strategy/hololand-competitor-gap-matrix.json` in `C:/Users/josep/.ai-ecosystem` were already fresh as of July 8, 2026, so this pass made no canonical ai-ecosystem or HoloLand row edits.

## Validation

- `pnpm run render:competitor-gap-matrix` in `C:/Users/josep/Documents/GitHub/HoloScript`
- `node -e "JSON.parse(require('fs').readFileSync('docs/strategy/competitor-gap-matrix.json','utf8')); console.log('json ok')"` in `C:/Users/josep/Documents/GitHub/HoloScript`
- `pnpm run check:competitor-gap-matrix` in `C:/Users/josep/.ai-ecosystem`
- `pnpm run check:hololand-matrix` in `C:/Users/josep/.ai-ecosystem`
- `git diff --check -- docs/strategy/competitor-gap-matrix.json docs/strategy/competitor-gap-matrix.md docs/daily-digests/2026-07-08-competitive-scan.md` in `C:/Users/josep/Documents/GitHub/HoloScript`

## Action items

- Submit / package the HoloScript MCP for Cursor team marketplace consumption.
- Add a Cursor quickstart that proves HoloKey/x402 receipts, routeTask/umbrella routing, and triad/uAAL review from a repo entry path.
- Add visionOS / Reality Composer Pro 3 and Android XR display-glasses handoff guides for the existing compile targets.
