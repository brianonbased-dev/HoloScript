---
'@hololand/platform-services': minor
---

Move HoloLand's platform services out of the `@holoscript` scope.

`@holoscript/hololand-platform` was 11,603 lines of HoloLand — cockpit, npc,
world, creator, device-lab, portal-entry, headset-share — published publicly
under the HoloScript scope. HoloScript is a general-purpose language, not
HoloLand's DSL; anyone should be able to build their own platform on it. A
HoloLand package inside the language's own scope teaches the opposite, and it
was not only a doctrine problem.

It was also the direct cause of a real defect. `@holoscript/cli@8.0.18` depends
on `@holoscript/hololand-platform@^6.1.1`, whose published manifest pins
`core@^6.1.2` — it has not been republished since core was v6, though its source
has built against workspace core 8.0.20 for months. So the CLI's published tree
resolved BOTH `core@6.1.4` and `core@8.0.20`, plus `agent-protocol` v6 and v8.
npm installs both, exits 0, and warns about nothing. Republishing under the new
name rewrites `workspace:^` to the current major and collapses that to one line.

Renamed to `@hololand/platform-services`. The directory stays at
`packages/hololand-platform` — it is a Dockerfile COPY path, a build symlink
target and a vitest workspace root, and package names are what people import.

**Receipt provenance is migrated, not rewritten.** This package stamps its name
into the `generatedBy` field of every receipt it produces, and those receipts are
checked into `docs/public/evidence/` and cited by the paper program. Those files
are untouched: they are true records of what generated them, and editing them to
match a rename would falsify provenance rather than update it. New receipts carry
`@hololand/platform-services/*`; the single validator that checks `generatedBy`
now accepts both namespaces via `src/receipt-namespace.ts`, so already published
evidence keeps verifying. `LEGACY_RECEIPT_NAMESPACES` is append-only.

Also fixes the production MCP image: the Dockerfile force-links workspace
packages into `node_modules`, and only `mkdir -p`'d the `@holoscript` scope
directory. The renamed symlink target would have failed the build.

Follow-ups, both deliberately out of scope here:
- `@holoscript/hololand-platform@6.1.1` stays on npm and should be deprecated
  pointing at the new name.
- Whether the HoloScript CLI should carry a HoloLand `trajectory-replay`
  subcommand at all is a product question. Both consumers (cli, mcp-server)
  already load it through guarded dynamic imports, so severing it later is cheap.
