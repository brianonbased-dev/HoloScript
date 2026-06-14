# BrittneyVoiceFrontDoor  voice ASR front-door for Founder Console next-actions (Brittney reads + listens for ordinal/label)

**Date:** 2026-06-09
**Class:** deleted-work
**Status:** seed
**Repository:** HoloScript
**Source context:** packages/studio/src/components/quest/BrittneyVoiceFrontDoor.tsx (commit a1832fea8 N4, deleted N3 cutover 2026-06-09)

## What Might Be Valuable

A voice ASR front-door that lets Brittney read the current Founder Console state aloud and listen for ordinal or label utterances ("number 3", "deploy", "cancel") as the trigger input. This is the D.073 perception-action loop expressed through speech — a hands-free operator surface for the Quest 3 context where typing is friction. The ordinal-matching pattern is reusable: any console panel could accept voice-ordinal selection.

## Why Not Now

Removed in the N3 cutover (2026-06-09). The voice ASR pipeline it depended on is not yet a stable HoloShell service. Rebuilding before the speech service is reliable would recreate the same deletion cycle.

## Smallest Next Experiment

A standalone 10-line React hook `useVoiceOrdinal(choices)` using `window.SpeechRecognition` that matches a spoken digit or label against a provided list. No Brittney dependency. Validate in a single Studio panel before re-attaching to any front-door.

## Reopen Trigger

D.073 Phase 2 (capture+VLM+router live) and a speech modality is needed for the Quest 3 operate surface, OR a board task for "hands-free console" appears.

## Do Not Preserve

The original implementation was tightly coupled to a specific Brittney chat session model and N3 component tree. Extract only the ordinal-matching and ASR hook pattern — do not revive the file as-is.

## Links

- Source: packages/studio/src/components/quest/BrittneyVoiceFrontDoor.tsx (deleted N3 cutover 2026-06-09, sha a1832fea8)
- CI gate that surfaced this: holo-ci/render-surface, workload ci-875511b2-mq78b1y3
- Direction: D.073 (live perception-action fabric), D.081 (Studio = operate surface)
