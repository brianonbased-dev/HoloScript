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
utility currently required by that lane. It also fails when an app does not map
its utilities through declared utility bands or omits the public-consumption
contract.

## Utility Bands

Utility bands are the public vocabulary for hardware. They keep product docs
from listing raw packages while still grounding every claim in manifest-backed
utilities.

| Utility band                  | Hardware purpose                                                          | Public role                                                                  |
| ----------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Public Tool Gateway           | One authenticated HoloScript tool doorway instead of many loose APIs.     | MCP/HoloKey tool access, HoloMesh coordination, and fleet dispatch control.  |
| Headless Agent Runtime        | Keep the machine working when no browser or IDE is open.                  | Unattended HoloMesh agent process and portable execution worker.             |
| Local Language Runtime        | Parse, validate, run, and compile HoloScript source locally.              | HoloScript CLI plus core parser, AST, compiler, and trait substrate.         |
| Sovereign AI Serving          | Turn owned hardware into a model-serving node when runtime assets exist.  | HoloLlama serving plans, launch bundles, lifecycle proofs, and device files. |
| Sovereign Memory And Identity | Keep memory and identity portable across local, edge, and fleet contexts. | Identity-keyed shared memory client for sibling agent families.              |
| Semantic Proof Harness        | Give the machine a receipt-producing semantic validation lane.            | uAAL semantic gates, cognitive-cycle primitives, and recovery receipts.      |
| XR Embodiment Runtime         | Let hardware participate in spatial presence, not only backend jobs.      | Shared locomotion, avatar substrate, and WebXR/agent embodiment support.     |
| Python Science Runtime        | Support scientific, robotics, and notebook-adjacent use.                  | Python HoloScript bindings for scripts, robotics, and scientific utilities.  |
| Python Trait Inference        | Run model-backed trait classification only on lanes that declare it.      | Trait inference CLI and GPU-capable Python model utility.                    |
| GPU Fleet Dispatch            | Move expensive or accelerated work through preview-first fleet controls.  | HoloCI, world-render, and paid simulation dispatch receipts.                 |

## Public Consumption Contract

Every envelope must now declare:

- `capabilityBands`: the utility bands the app exposes.
- `publicConsumption.persona`: who the app is for.
- `publicConsumption.primaryInstallSurface`: the first install or access
  surface a public user should understand.
- `publicConsumption.onboardingGoal`: the first successful outcome.
- `publicConsumption.mustNotClaim`: claims that remain blocked without live
  receipts, credentials, weights, or spend authority.

## Canonical Envelopes

| Envelope              | Hardware lane                   | What it encompasses                                                                                                                                         |
| --------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HoloShell Workstation | Founder laptop / workstation    | Local custody, reasoning, validation, Studio access, HoloMesh/HoloShell actions, HoloLlama planning, memory, uAAL, XR, Python runtime, and trait inference. |
| Jetson Node City      | Jetson owned-metal edge node    | Always-on HoloShell/Brittney ingress, HoloLlama serving, edge MCP, source projection, memory, uAAL, XR, and Python runtime.                                 |
| Vast GPU Worker       | Vast.ai Linux GPU node          | HoloCI, render, paid simulation dispatch, model workloads, HoloLlama planning, trait inference, memory, uAAL, and package/runtime tools.                    |
| Hosted Coordinator    | Hosted MCP/orchestrator service | Authenticated MCP gateway, HoloCI dispatch, world render dispatch, and paid simulation dispatch.                                                            |

## Public Entry Shape

| Envelope              | Public user                           | First surface                                        | First proof                                                             |
| --------------------- | ------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| HoloShell Workstation | Local builder and verifier            | Desktop launcher plus local API/MCP custody          | HoloShell access/message-route receipts and package consumption matrix. |
| Jetson Node City      | Edge-node owner or lab operator       | Systemd appliance with HoloShell/HoloLlama endpoints | Jetson runtime appliance, node-home, and HoloLlama lifecycle receipts.  |
| Vast GPU Worker       | GPU worker operator                   | Fleet worker bootstrap                               | Free-first preflight, HoloCI/render/simulation dispatch receipts.       |
| Hosted Coordinator    | Public API consumer/fleet coordinator | Hosted MCP/orchestrator service                      | MCP health, package stewardship, and preview-first dispatch receipts.   |

## Boundary Rules

1. Add a fleet utility before adding it to an app envelope.
2. Add package consumption before claiming a hardware lane installs the package.
3. Add or reuse a utility band before making a public hardware capability claim.
4. An envelope must include every utility required by its consumer lane unless a
   future manifest field records an explicit exclusion with owner and reason.
5. Live hardware checks remain separate from repo-only checks. The repo proves
   the package/app mold; HoloShell, Jetson, Vast, and hosted checks prove the
   actual machine or service.
6. Public docs should name the envelope first, then its utility bands, then its
   installed packages.

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
