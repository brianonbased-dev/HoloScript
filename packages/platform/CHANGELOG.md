# @holoscript/platform

## 6.1.6

### Patch Changes

- Record the version already published to npm on 2026-09-06. Git had no matching version bump; the published tarball matches 6.1.5 except the version field and the publish-time workspace dependency rewrite. Source dependencies stay `workspace:`.

## 6.1.3

### Patch Changes

- Remove the runtime dependency on `@holoscript/core` and the upward optional peers for engine/mesh so cold consumers do not resolve a package-family cycle.
- Declare the Node >=20 runtime requirement at the package level for fleet installs.

## 6.1.0

### Changed

- Align release metadata with the HoloScript 6.x line. See the root CHANGELOG for the outward-facing release narrative.
