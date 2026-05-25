# Embodied Fleet Handoff Capsule

> Date: 2026-05-25
> Task: `task_1779744793933_frav`
> Status: planning memo
> Scope: cold handoff schema for a HoloLand-embodied HoloScript agent.

## Purpose

INTENT says a sibling must be able to act cold: it needs the goal, gathered context, worth-tested intent, done definition, and first next action without re-deriving the whole session. The product meaning of fleet raises the bar: a fleet member is not just a GPU worker. It is a native HoloScript agent embodied in a world, identity-bearing, sharing the D.040 trait library, operating in HoloLand as the D.050 testbed, and carrying receipts.

An embodied handoff therefore needs more than a text summary. It must bind context and intent to a durable identity, a world/zone anchor, spatial scope, trait-library version, prior receipts, and the exact first action the embodied agent may take.

## Falsifiable Invariant

A capsule missing any required field is rejected before the agent acts.

In executable terms, a validator must return `rejected-missing-field` before any world delta, avatar command, tool call, receipt anchor, or public message if a required field is absent, empty, stale, or outside the declared world/zone scope.

## Required Schema

```yaml
schema: "holoscript.embodiedFleetHandoff.v1"
capsuleId: "efh-YYYYMMDD-slug"
createdAt: "ISO-8601"
expiresAt: "ISO-8601"
source:
  roomTaskId: ""
  sourceAgentId: ""
  sourceAgentHandle: ""
  sourceCommitOrReceipt: ""

identityBinding:
  # Required by the ant-with-a-megaphone receipt spine: accountability binds to
  # durable wallet + handle, not a disposable session map.
  walletAddress: ""
  handle: ""
  participantId: ""
  seatId: ""
  signature: ""

embodiment:
  runtime: "hololand"
  worldId: ""
  zoneId: ""
  portalPresence:
    representation: "semantic | rendered | dual"
    grantedScopes: ["read-only"]
    maxScopes: ["read-only"]
  avatarId: ""
  spawnAnchor:
    position: [0, 0, 0]
    rotation: [0, 0, 0, 1]
    coordinateFrame: "world"

traitLibrary:
  version: "D.040"
  package: "@holoscript/core"
  commit: ""
  requiredTraits:
    - "@verbalFingerprint"
    - "@autonomousAgenda"
    - "@reputationLedger"
    - "@vocabularyRegister"
    - "@speechAwareEncounter"
    - "@avatarIntent"

intent:
  rawGoal: ""
  worthTest:
    criticalPath: false
    nonSubstitutable: false
    verifiable: false
    accountable: false
  worthTestDecision: "accept | reject"
  distilledIntent: ""
  doneDefinition: ""
  nonGoals: []

context:
  filesOrArtifactsRead: []
  decisionsAlreadyMade: []
  openQuestions: []
  blockersOrSuppressors: []
  coordinationNotes: []

receipts:
  priorReceipts: []
  requiredNextReceipt:
    type: ""
    subject: ""
    mustBindToWalletAndHandle: true

firstNextAction:
  actionType: "observe | speak | move | mutate-zone | call-tool"
  command: ""
  allowedScope: "read-only"
  expectedReceipt: ""
  stopCondition: ""
```

## Required Field Groups

| Group | Why it is required | Reject if |
| --- | --- | --- |
| `source` | Prevents orphan context and lets peers trace the task, commit, or receipt that created the handoff. | Task ID, source agent, or source proof is missing. |
| `identityBinding` | D.064/D.065 scale-asymmetry rule: amplified reach is only safe when accountable to durable wallet plus handle. | `walletAddress`, `handle`, `participantId`, or `signature` is missing. |
| `embodiment` | An embodied agent needs a world, zone, representation mode, avatar, and spatial permission boundary. | `worldId`, `zoneId`, `portalPresence`, `avatarId`, or `spawnAnchor` is missing. |
| `traitLibrary` | D.040 requires HoloMesh teammates, HoloLand NPCs, and services to share one trait substrate. | Version, package commit, or required trait list is missing or stale. |
| `intent` | Cold action requires worth-tested intent, not only a task title. | Worth-test decision is not `accept`, or done definition is empty. |
| `context` | Prevents re-derivation and peer collisions. | Prior files/artifacts, decisions, or blockers are omitted. |
| `receipts` | The first embodied action must know what provenance it must emit next. | Prior receipt chain or required next receipt is missing. |
| `firstNextAction` | Cold handoff must be immediately executable and bounded. | Action, scope, expected receipt, or stop condition is missing. |

## Validation Flow

1. Parse the capsule and check `schema == "holoscript.embodiedFleetHandoff.v1"`.
2. Reject expired capsules before reading intent.
3. Verify `identityBinding.signature` over the capsule hash using the wallet-bound identity for `handle`.
4. Resolve `participantId` against the shared trait-library identity spine.
5. Verify the agent is admitted to `worldId` and `zoneId`.
6. Verify `portalPresence.grantedScopes` does not exceed `maxScopes`.
7. Verify D.040 trait-library package and commit are available to the target runtime.
8. Reject if `worthTestDecision != "accept"`.
9. Require at least one prior receipt or explicit "genesis" receipt reference.
10. Execute only `firstNextAction`, then emit `requiredNextReceipt` before further action.

## Worked Capsule Example

```yaml
schema: "holoscript.embodiedFleetHandoff.v1"
capsuleId: "efh-20260525-knowledge-mountain-archivist"
createdAt: "2026-05-25T22:40:00Z"
expiresAt: "2026-05-26T02:40:00Z"
source:
  roomTaskId: "task_1779744793933_frav"
  sourceAgentId: "agent_1778102670927_5r0p"
  sourceAgentHandle: "codex-hardware"
  sourceCommitOrReceipt: "room-claim-receipt:task_1779744793933_frav"

identityBinding:
  walletAddress: "0xagentwallet..."
  handle: "hololand-archivist-01"
  participantId: "participant:wallet:0xagentwallet..."
  seatId: "hololand-archivist-01:slot-1"
  signature: "sig:capsule-hash..."

embodiment:
  runtime: "hololand"
  worldId: "knowledge-mountain"
  zoneId: "summit-archive"
  portalPresence:
    representation: "dual"
    grantedScopes: ["read-only", "drive-avatar"]
    maxScopes: ["read-only", "drive-avatar"]
  avatarId: "archivist-avatar"
  spawnAnchor:
    position: [12.0, 4.5, -8.0]
    rotation: [0.0, 0.707, 0.0, 0.707]
    coordinateFrame: "world"

traitLibrary:
  version: "D.040"
  package: "@holoscript/core"
  commit: "18730eb35"
  requiredTraits:
    - "@verbalFingerprint"
    - "@autonomousAgenda"
    - "@reputationLedger"
    - "@vocabularyRegister"
    - "@speechAwareEncounter"
    - "@avatarIntent"

intent:
  rawGoal: "Guide the next visitor to the receipt that explains why one knowledge entry is still ungraduated."
  worthTest:
    criticalPath: true
    nonSubstitutable: true
    verifiable: true
    accountable: true
  worthTestDecision: "accept"
  distilledIntent: "Act as an embodied archivist for one knowledge-mountain zone and surface the receipt chain behind the selected entry."
  doneDefinition: "Visitor receives the selected entry id, current verdict, receipt pointer, and next safe action without the agent mutating the zone."
  nonGoals:
    - "Do not rewrite knowledge entries."
    - "Do not grant broader portal scopes."

context:
  filesOrArtifactsRead:
    - "docs/definitions/09-fleet-room-paper.md"
    - "packages/core/src/traits/PortalPresenceTrait.ts"
    - "packages/core/src/traits/pillar/PillarRegistry.ts"
  decisionsAlreadyMade:
    - "Fleet means native agents embodied in worlds, not raw compute."
    - "The first action is read-only plus avatar guidance; zone mutation is out of scope."
  openQuestions:
    - "Which receipt renderer should become the default HoloLand panel?"
  blockersOrSuppressors:
    - "No public brand posture change without founder approval."
  coordinationNotes:
    - "If the visitor requests mutation, stop and request a new capsule with mutate-zone scope."

receipts:
  priorReceipts:
    - "room-claim-receipt:task_1779744793933_frav"
    - "world-state-hash:knowledge-mountain:latest"
  requiredNextReceipt:
    type: "hololand.embodied-action.v1"
    subject: "archivist-avatar:read-entry"
    mustBindToWalletAndHandle: true

firstNextAction:
  actionType: "speak"
  command: "Tell the visitor: this entry is ungraduated; here is the receipt chain and the next safe read-only step."
  allowedScope: "drive-avatar"
  expectedReceipt: "hololand.embodied-action.v1"
  stopCondition: "Stop after one explanation or on any request for mutation outside granted scope."
```

## Implementation Notes

- The capsule is a handoff artifact, not the action receipt itself. The first action consumes the capsule and then emits an action receipt.
- `identityBinding.walletAddress + identityBinding.handle` is the named identity-binding field pair. The running neural map may be disposable; accountability is not.
- `participantId` should align with `PillarContext.participant_id` so HoloMesh agents and HoloLand NPCs that represent the same durable participant share the trait spine.
- `portalPresence` should reuse `@portalPresence` scope vocabulary: `read-only`, `mutate-zone`, and `drive-avatar`.
- `traitLibrary.commit` should be a HoloScript commit or package digest, not a marketing version.
- A capsule can authorize only the first next action. Further actions require either a fresh receipt-bound continuation capsule or a locally emitted receipt that satisfies the declared stop condition.

## Local Anchors

- `docs/definitions/09-fleet-room-paper.md`: fleet product definition is native HoloScript agents embodied in worlds.
- `docs/Definitions.md`: in-repo fleet and room terminology for contributors.
- `packages/core/src/traits/PortalPresenceTrait.ts`: HoloLand portal scopes and zone admission vocabulary.
- `packages/core/src/traits/pillar/PillarRegistry.ts`: `participant_id` as wallet-level identity shared across D.040 populations.
- `packages/hololand-platform/src/npc/jepa-npc-controller.ts`: D.050 HoloLand NPC action loop emits anchored receipts.
- `memory/direction_three-population-trait-library.md`: D.040 six sovereign traits.
- `docs/north-star/00-how-i-think.md`: ant-with-a-megaphone receipt spine, durable wallet plus handle identity, and receipt-before-amplified-action rule.
