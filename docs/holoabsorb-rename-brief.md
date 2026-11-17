# HoloAbsorb rename brief — for the build lanes

**Directive:** Joseph, 2026-11-17 — "It needs to be renamed to HoloAbsorb."
**Author:** Harbor (coordination anchor), at Joseph's direction.
**Status:** Brief only. No rename has been executed. The executing lane works
against this map — the rename is a mapped change, not a find-and-replace slew.

## Why

The product lineup is Studio, HoloLand, HoloMesh, **HoloAbsorb**. The product
already calls itself HoloAbsorb in its own README ("HoloScript's sovereign
codebase-intelligence product"); only the technical identity still says
"absorb-service," which reads as plumbing. The technical identity is being
brought up to the product name.

## Identifier map

| Surface | From | To |
|---|---|---|
| npm package | `@holoscript/absorb-service` | `@holoscript/holoabsorb` |
| Repo path | `packages/absorb-service/` | `packages/holoabsorb/` |
| Deployment slug | `absorb-service` | `holoabsorb` |
| Host | `absorb.holoscript.net` | `holoabsorb.holoscript.net` |
| Infra files | `Dockerfile.absorb-service`, `railway.absorb-host.toml` | `Dockerfile.holoabsorb`, `railway.holoabsorb-host.toml` |
| Docs | `docs/packages/absorb-service.md` | `docs/packages/holoabsorb.md` |

**Unchanged (already correct):** the manifest/CLI surface —
`holo_absorb_manifest`, `holoscript holoabsorb --json`, the `holo_*` tools.
**Aliased, not renamed:** the `absorb_*` MCP tool names (see rules).

## Verified inventory (Harbor, 2026-11-17 — GitHub tree, code search, npm registry)

- **491 repo paths** contain `absorb-service` (the package tree, Dockerfile,
  docs, one in-flight changeset).
- **466 files** reference the string `absorb-service` in content.
- **63 files** reference `absorb.holoscript.net`.
- npm: `@holoscript/absorb-service` is **published — latest 6.1.5, 8 versions**.
  External consumers exist or may; the alias rules below are not optional.
- npm: `@holoscript/holoabsorb` is **unclaimed** (registry 404, checked
  2026-11-17). Re-verify at execution time; names can be taken.

## Alias rules — the compatibility contract

The package README declares the package name, service slug, and existing
tools "stable compatibility contracts." This rename honors that by aliasing,
never by breaking:

1. **npm:** publish `@holoscript/holoabsorb`; then publish a final compat
   release under the old name that re-exports the new package, and deprecate
   the old name with a pointer message. Never unpublish the old name.
2. **Host:** `holoabsorb.holoscript.net` goes live first;
   `absorb.holoscript.net` redirects (301) or dual-serves for at least one
   full release cycle.
3. **MCP tools:** `absorb_*` names keep working as aliases of the same
   implementations. New documentation uses HoloAbsorb naming.
4. **Repo:** internal imports move to the new package name in one pass via
   the workspace tooling (changesets). No mixed state left behind.

## Sequencing — each step verified before the next

1. The executing lane re-runs this inventory; numbers must match or be
   explained in the PR.
2. Rename inside the repo (paths, package name, imports, docs, infra files)
   with the full test suite green.
3. Publish `@holoscript/holoabsorb`; publish the old-name compat release;
   deprecate the old name with the pointer.
4. **Host cutover last, and only after the Railway account migration is
   verified stable.** Joseph, 2026-11-17: the old Railway is down and the new
   one runs through his personal account. Do not compound a rename cutover
   with an account migration.
5. Changelog + README announcement. The old README gets a pointer, not a
   deletion.

**Coordination note:** `.changeset/holoscript-mcp-api-key-readers-b3-absorb-service.md`
is in flight and references the old name (it belongs to the MCP API-key
thread). Coordinate with that work; do not collide with it.

## Done-bar — fault-first; the rename is not done until all of these pass

- Clean install of `@holoscript/holoabsorb` works: fresh directory, the
  documented quickstart runs.
- Clean install of `@holoscript/absorb-service` **still works** via the
  compat path. This is the fault test: the rename is fed a real consumer of
  the old name, and the consumer survives.
- `holoabsorb.holoscript.net` serves; `absorb.holoscript.net` redirects or
  answers.
- `holoscript holoabsorb --json` and the ownership manifest answer under the
  new identity; the `absorb_*` MCP tools still respond.
- The package test suite and benchmarks run green on the renamed package.
- A repo-wide search for `absorb-service` returns only intentional
  compatibility references (the alias package, deprecation notes, changelog
  history) — each one explainable in the PR.

## Out of scope

- Any change to what the service does. This is a rename, not a refactor.
- Renaming the `absorb_*` tool verbs beyond the alias rule above.
- The HoloScript MCP key work (separate thread).

## Open for Joseph

- Host-cutover timing vs the Railway migration (this brief recommends: after
  the new Railway is verified stable).
- Whether `docs/architecture/absorb-intelligence-spine.md` also renames its
  path (cosmetic; its title already says HoloAbsorb).
