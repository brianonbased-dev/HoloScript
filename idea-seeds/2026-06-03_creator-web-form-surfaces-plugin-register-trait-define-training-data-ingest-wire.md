# Creator web-form surfaces (plugin register / trait define / training-data ingest) wired to REAL systems

**Date:** 2026-06-03
**Class:** deleted-work
**Status:** seed
**Repository:** HoloScript
**Source context:** HoloScript removed pages: app/workspace/plugins/new, app/workspace/traits/new, app/training-data/new (commit pending)

## What Might Be Valuable

Three polished form UIs (zod schema + react-hook-form + embedded HoloScriptEditor/AIGeneratorWizard) for creator onboarding: register a plugin, define a semantic trait, ingest a training dataset. The *front-end* work is genuinely good and reusable. If/when the team wants browser-based creator onboarding, these are a head start on the form layer — recover from git history (the removing commit) rather than rebuilding the UI.

## Why Not Now

They POST to endpoints that never existed (`/api/plugins/register`, `/api/traits/define`, `/api/training-data/ingest`) and redirect to non-existent list pages (`/plugins`, `/traits`, `/training-data`) — dead UI handed to users. Removed (task_1780197... studio-half-built-forms) rather than papered over. Building thin backends just to make them resolve would create Pattern-B stubs (a "trait definition" record with no runtime is a stub /stub-audit flags). The REAL mechanisms already exist and are not web-form-shaped: plugin publish via MCP `holomesh_publish_tool` / `install_domain_plugin` / marketplace; traits are `.hsplus` code under StdlibPolicy (founder-governed), not a 4-field form; training data flows through the fleet + brittney-vs-baselines apparatus.

## Smallest Next Experiment

Pick ONE (training-data ingest is the most web-form-shaped): wire `/api/training-data/ingest` to persist dataset metadata into the existing workspace knowledge store / fleet ingest path, add a real `/training-data` list page reading it back, and recover the form UI from git. Ship it end-to-end with a test before touching the other two.

## Reopen Trigger

A product decision to offer browser-based creator onboarding (plugin/trait/dataset) to non-CLI/non-MCP users — e.g. the Studio-Earn / marketplace creator funnel needs a no-code entry point, or HoloLand creators need to publish without the MCP toolchain.

## Do Not Preserve

- The `console.warn('endpoint may not exist yet') + router.push(404)` submit pattern — it's the exact dishonesty this removal fixed.
- A standalone trait-"define" form that contradicts the `.hsplus`/StdlibPolicy code-as-trait architecture.
- Any backend that stores a manifest record without a real runtime/compilation/persistence behind it (Pattern-B stub).

## Links

- Removed pages (recover UI here): `app/workspace/plugins/new/page.tsx`, `app/workspace/traits/new/page.tsx`, `app/training-data/new/page.tsx` @ the removing commit
- Real systems to wire to: MCP `holomesh_publish_tool`, `install_domain_plugin`, `holomesh_marketplace_search`; fleet/brittney training apparatus (`packages/studio/src/__benchmarks__/brittney-vs-baselines`)
- StdlibPolicy / traits-are-code constraint
