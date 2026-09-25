# @holoscript/absorb-service

## 6.1.5

### Patch Changes

- Record the version already published to npm on 2026-09-06. Git had no matching version bump; the published tarball matches 6.1.4 except the version field and the publish-time workspace dependency rewrite. Source dependencies stay `workspace:`.

## 6.1.2

### Patch Changes

- Keep `@holoscript/core` as a runtime dependency only, removing the duplicate optional peer that made npm cold-start resolution heavier.

## 6.1.0

### Changed

- Align release metadata with the HoloScript 6.x line. See the root CHANGELOG for the outward-facing release narrative.
