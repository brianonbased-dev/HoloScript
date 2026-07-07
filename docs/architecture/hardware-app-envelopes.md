# Hardware App Envelopes

The public-consumption shape should be app-first, not package-first. A piece of
hardware should install or run one canonical HoloScript app envelope that
includes the packages, commands, receipts, custody rules, and caveats needed for
that lane.

The app envelope is not another product name. It is the mold over existing
package and fleet utility surfaces.

## Source Of Truth

- App envelopes: `scripts/holo-ci/hardware-app-envelopes-manifest.json`
- Envelope verifier: `node scripts/holo-ci/check-hardware-app-envelopes.mjs`
- Fleet utilities: `scripts/holo-ci/fleet-utilities-manifest.json`
- Package consumption: `scripts/holo-ci/package-consumption-manifest.json`
- Package stewardship: `scripts/holo-ci/package-stewardship-manifest.json`

The verifier fails when an app claims a hardware consumer lane but omits a
utility currently required by that lane.

## Canonical Envelopes

| Envelope              | Hardware lane                   | What it encompasses                                                                                                                                         |
| --------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HoloShell Workstation | Founder laptop / workstation    | Local custody, reasoning, validation, Studio access, HoloMesh/HoloShell actions, HoloLlama planning, memory, uAAL, XR, Python runtime, and trait inference. |
| Jetson Node City      | Jetson owned-metal edge node    | Always-on HoloShell/Brittney ingress, HoloLlama serving, edge MCP, source projection, memory, uAAL, XR, and Python runtime.                                 |
| Vast GPU Worker       | Vast.ai Linux GPU node          | HoloCI, render, paid simulation dispatch, model workloads, HoloLlama planning, trait inference, memory, uAAL, and package/runtime tools.                    |
| Hosted Coordinator    | Hosted MCP/orchestrator service | Authenticated MCP gateway, HoloCI dispatch, world render dispatch, and paid simulation dispatch.                                                            |

## Boundary Rules

1. Add a fleet utility before adding it to an app envelope.
2. Add package consumption before claiming a hardware lane installs the package.
3. An envelope must include every utility required by its consumer lane unless a
   future manifest field records an explicit exclusion with owner and reason.
4. Live hardware checks remain separate from repo-only checks. The repo proves
   the package/app mold; HoloShell, Jetson, Vast, and hosted checks prove the
   actual machine or service.
5. Public docs should name the envelope first, then its installed packages.

## Why This Matters

Without app envelopes, public consumption devolves into a matrix of packages:
CLI here, MCP there, HoloLlama somewhere else, Python extras elsewhere, plus
HoloShell receipts in another repo. That is workable for agents but poor for
hardware owners.

With app envelopes, the hardware owner gets one answer:

```text
What should this machine be?
  -> HoloShell Workstation, Jetson Node City, Vast GPU Worker, or Hosted Coordinator.

What proves it is ready?
  -> the envelope verifier plus its listed live validation receipts.
```

## Validation

```bash
node scripts/holo-ci/check-hardware-app-envelopes.mjs
node scripts/holo-ci/check-hardware-app-envelopes.mjs --self-test
corepack pnpm run check:fleet-utilities
corepack pnpm run check:package-architecture
corepack pnpm run check:package-stewardship
```

Run hardware/live checks from the relevant environment before making a
public-readiness claim. Examples include HoloShell access/message-route, Jetson
runtime/node-home, free-first preflight for paid GPU, and hosted MCP health.
