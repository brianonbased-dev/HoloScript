# Alpha-Acceptance-Rate Measurement Protocol for Tier-2 LLM-Speculative Dispatch

**Date:** 2026-05-12
**Class:** security-instinct
**Status:** seed
**Repository:** HoloScript
**Source context:** research/2026-05-10_alpha-measurement-protocol.md
**Archive score:** 31
**Archive signals:** next steps:1, phase:6, agent:3, runtime:3, robot:1, brittney:1

## What Might Be Valuable

| Near-OOD | @grabbable in scenes with 610 interaction traits, physics overrides (gravity, mass), or networked multiplayer | examples/multiplayer/authority-demo.holo | | Far-OOD | @grabbable in non-standard contexts: robotics URDF, medical anatomy, IoT smart-factory, or VRChat-specific hooks | examples/robotics/robot-arm-simulation.holo, examples/iot/smart-factory-twin.holo | | Adversarial | Deliberately malformed or contradictory configurations (e.g., @grabbable + @static + @kinematic) | Synthesized stress-test rows | Rationale: Tier-2 LLM speculative dispatch is most valuable when the LLM proposes refinements to a known trait configuration. In near-OOD and far-OOD scenarios, the LLM has no reliable training signal and should demote to Tier-3. The protocol must measure whether the alpha tracker correctly reflects this.

## Why Not Now

This came from an archive. Treat it as historical, incomplete, or superseded until a current owner verifies the idea against today's HoloScript/HoloLand direction.

## Smallest Next Experiment

Open the source archive, extract one current claim or feature idea, and decide whether it should become a build task, research artifact, paper row, or remain dormant.

## Reopen Trigger

Reopen when current roadmap, paper work, HoloLand product planning, runtime cleanup, or tool development touches the same theme.

## Do Not Preserve

Do not revive the archived implementation wholesale. Preserve the idea only if it survives current source contracts, product direction, and validation requirements.

## Links

- research/2026-05-10_alpha-measurement-protocol.md
