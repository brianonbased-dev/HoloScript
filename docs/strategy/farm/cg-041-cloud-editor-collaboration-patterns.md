# CG-041 Pattern Harvest: Cloud Editor Collaboration

**Date**: 2026-05-21
**Task**: task_1779333040283_lhoe
**Source**: `docs/strategy/competitor-gap-matrix.json` CG-041
**Competitor row**: PlayCanvas, with Spline included because the room task title
names Spline as the pattern source.

---

## Summary

CG-041 is a watch/pattern-harvest row, not a build request. The useful pattern is
not "clone Spline" or "match PlayCanvas feature-for-feature." The pattern worth
absorbing is the cloud-first collaboration loop around a 3D scene:

1. A browser-openable project is the default unit.
2. Presence is visible in the spatial workspace, not hidden in an activity log.
3. Permissions are understandable at file, project, and workspace scope.
4. Feedback is anchored to the thing being discussed in the scene.
5. The editor can ship, preview, or hand off work without leaving the workspace.

For HoloScript Studio, the sovereign version is a collaboration layer over
semantic `.holo` artifacts, HoloMesh rooms, receipts, and Git-compatible history.
That is different from a proprietary cloud-only scene editor.

## Source Reconciliation

The matrix row says PlayCanvas because PlayCanvas has a cloud editor with
real-time collaboration, browser access, editor APIs, version control, and
hosting. The board task says Spline, which is also relevant because Spline
packages designer-friendly collaboration, workspace permissions, file sharing,
3D comments, and web exports into a simple product surface.

This note treats both as pattern inputs:

- **Spline**: best reference for designer-facing collaboration affordances.
- **PlayCanvas**: best reference for engine/editor collaboration mechanics.

## Patterns To Absorb

### 1. Spatial Presence As A First-Class Primitive

Spline shows active users in the editor, displays other users' pointers and
labels on the canvas, and uses autosaved shared files so collaborators do not
manually pass versions around. PlayCanvas exposes similar real-time presence
through a presence bar, user colors, viewport camera frustums, and selection
indicators.

**Studio implication**: add a presence overlay that is scoped to scene objects,
camera position, selected AST node, and current HoloMesh room member. Presence
should be traceable to a real agent/user identity and should degrade to a
read-only activity marker when live sync is unavailable.

### 2. Role And Link Permissions Before Full Multi-Edit

Spline's collaboration surface is easy to reason about: invited people or link
holders can be viewers or editors, and workspaces add owner/editor/viewer roles.
PlayCanvas similarly presents team management and access rights as editor
features, not administrator-only infrastructure.

**Studio implication**: implement the permission ladder before unrestricted
live editing:

- Viewer: inspect scene, comments, receipts, and replay evidence.
- Reviewer: add anchored comments without changing scene state.
- Editor: change semantic scene state and create signed checkpoints.
- Admin/Owner: manage project membership, publish targets, and retention.

### 3. Anchored Feedback In 3D Space

Spline comments can be placed in the viewport and stick to objects. PlayCanvas
uses in-editor chat plus visible selection and camera context. The shared lesson
is that collaboration feedback should carry spatial context instead of forcing a
teammate to translate "the red cube near the left wall" into a scene query.

**Studio implication**: anchor comments to stable semantic IDs:

- object ID
- trait path
- AST span
- camera pose at comment time
- receipt/checkpoint hash

This keeps comments reviewable after scene refactors and allows HoloMesh tasks
to cite the exact object or behavior contract under discussion.

### 4. Browser-First Project Shell

Spline and PlayCanvas both reduce collaboration friction by making the project
open from a browser session. PlayCanvas also emphasizes cloud autosave,
zero-install access, live preview, and device testing.

**Studio implication**: the roadmap target is a browser-first project shell that
can reopen a signed `.holo` workspace, show current room/presence state, and
launch previews from the same surface. The first milestone can be read-only
shared review plus signed checkpoints; simultaneous mutation can wait until the
semantic merge model is proven.

### 5. Editor Automation Hooks

PlayCanvas exposes REST and Editor APIs, and its product page now advertises an
MCP server for AI-assisted editor automation. Spline exposes embeddable web
outputs and code exports. HoloScript should not treat collaboration as only a
human UI feature.

**Studio implication**: keep the collaboration layer toolable:

- HoloMesh room events should be queryable from Studio.
- Agents should be able to add comments, propose scene patches, and attach
verification evidence.
- Studio should expose stable event names for "presence joined", "comment
added", "checkpoint signed", "preview launched", and "publish requested".

## Not Product Work Yet

Do not start these from CG-041:

- A Spline clone or general-purpose browser modeling suite.
- A proprietary HoloScript cloud editor that bypasses Git, HoloMesh, or signed
  `.holo` artifacts.
- Full simultaneous geometric editing before conflict semantics exist.
- A public CDN/hosting business line just because PlayCanvas includes hosting.
- External posting, paid partnerships, marketplace submissions, or founder-gated
  marketing.

## Roadmap Slice

The safe Studio roadmap response is:

1. Add shared-review mode: browser-openable project snapshot, viewer/reviewer
   permissions, HoloMesh room presence, and anchored comments.
2. Add signed checkpoints: autosave snapshots with receipt hashes and visual diff
   entry points.
3. Add semantic edit mode: editor role can mutate `.holo` state through
   conflict-aware operations.
4. Add agent automation: HoloMesh agents can comment, propose patches, and attach
   validation evidence through Studio APIs.

This sequence absorbs the collaboration pattern without demoting Studio into a
generic cloud 3D editor.

## Sources

- Spline real-time collaboration in 3D:
  https://docs.spline.design/sharing-collaboration-and-workspaces/real-time-collaboration-in-3-d
- Spline file sharing:
  https://docs.spline.design/sharing-collaboration-and-workspaces/file-sharing
- Spline comments and feedback in 3D:
  https://docs.spline.design/sharing-collaboration-and-workspaces/comments-feedback-in-3-d
- Spline workspaces:
  https://docs.spline.design/sharing-collaboration-and-workspaces/workspaces
- PlayCanvas editor overview:
  https://developer.playcanvas.com/user-manual/editor/
- PlayCanvas real-time collaboration:
  https://developer.playcanvas.com/user-manual/editor/realtime-collaboration/
- PlayCanvas editor product page:
  https://playcanvas.com/products/editor

## Verification

- Documentation-only change.
- Path and whitespace check: `git diff --check -- docs/strategy/farm/cg-041-cloud-editor-collaboration-patterns.md`

---

Farm slice for task_1779333040283_lhoe. No external posting, spending, or
founder-gated work performed.
