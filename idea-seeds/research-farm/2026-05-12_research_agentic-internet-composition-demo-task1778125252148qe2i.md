# Agentic Internet Composition Demo task1778125252148qe2i

**Date:** 2026-05-12
**Class:** paper-instinct
**Status:** seed
**Repository:** HoloScript
**Source context:** research/2026-05-06_agentic-internet-composition-demo.md
**Archive score:** 43
**Archive signals:** next steps:1, phase:4, agent:3, hologram:12, vr:5, brittney:3

## What Might Be Valuable

1. SpatialMCPContext (jira 57fae81ba+ed284b32f+e134ee1c6) VR user emits a 3D-context payload (gaze + hands + room geometry). Validator enforces version='0.1', frame='tracking-space-y-up-meters', unit gaze direction. pickPlacement resolves the gaze-hit point so downstream tools know where to put the answer. 2. Mesh tool registry / holomeshinvoketool (yqll e9942dc9e+1419cce6d) the responder agent (Brittney chat) publishes an alphafoldfetchstructure manifest with capability tags. The VR user discovers it via discoverMeshTools('hologram alphafold'). Attestation hash is verified before invocation; tampering with capabilityTags after publish flips the attestation. 3. Agent negotiation (xsp6 cbdab1387) createNegotiation opens the cycle, advanceNegotiation('quote') by responder, advanceNegotiation('accept') by initiator, advanceNegotiation('execute') by responder, settleNegotiation co-signs the receipt. Wrong-actor transitions (responder accepting their own quote) are rejected. 4. Vault lease registry (u8q2 16f5014be) mid-negotiation, Brittney needs ALPHAFOLDAPIKEY. issueLease binds the credential to (taskId, agentId) for 24h. resolveSecret enforces scope; out-of-scope refs return leasescopeviolation. G.GOLD.016 invariant: wallet refs are permanently unleasable env:HOLOMESHWALLETKEY returns walletunleasable and never persists state. 5. HologramMcpResponse (zp7u 642ab1d75) the executor (Brittney) returns the rendered structure as application/holoscript+holo contenttype. wrapHologramMcpEnvelope produces the MCP dispatch envelope; the chat client's detectHologramContent picks it up and routes to /hologram. Plain text envelopes return null from the detector chat-only fallback works without breaking hologram-aware clients.

## Why Not Now

This came from an archive. Treat it as historical, incomplete, or superseded until a current owner verifies the idea against today's HoloScript/HoloLand direction.

## Smallest Next Experiment

Open the source archive, extract one current claim or feature idea, and decide whether it should become a build task, research artifact, paper row, or remain dormant.

## Reopen Trigger

Reopen when current roadmap, paper work, HoloLand product planning, runtime cleanup, or tool development touches the same theme.

## Do Not Preserve

Do not revive the archived implementation wholesale. Preserve the idea only if it survives current source contracts, product direction, and validation requirements.

## Links

- research/2026-05-06_agentic-internet-composition-demo.md
