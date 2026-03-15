# RFC: DAO Governance v1 - First-Class Primitives for On-Chain Spatial Governance

## Status

Proposed

## Authors

- @JoeCoolProduce (initial draft via Grok collaboration)
- Open for community input

## Summary

Introduce a v1 governance stack as first-class traits and compiler outputs to enable decentralized autonomous organizations (DAOs) for spatial assets in HoloScript. This builds on existing Web3 primitives (for example, economics traits and NFT marketplace compiler outputs) by adding standardized governance flows without central servers. Key goals: token-gated collaboration, on-chain voting for scene/state changes, and EVM-compatible contracts for metaverse ownership.

This addresses a high-leverage gap: while NFT and Solidity artifacts exist, there is no complete end-to-end DAO standardization in examples and guides. It can differentiate HoloScript in spatial computing by enabling community-driven worlds (for example, collaborative VR builds and asset governance).

## Motivation

- Leverage existing foundations: extend economics traits and Web3 targets (Solidity and EVM) to layer governance with lower adoption friction.
- Use cases: token-gated editing in shared worlds, community proposals for trait additions, treasury management for agent swarms.
- Differentiation: inspired by metaverse governance patterns and modular DAO systems, but trait-native for HoloScript's declarative style.
- Risk mitigation: optional quadratic voting support and execution timelocks.

## Design

### Minimal .holo Proof of Concept

```holo
composition "DAO Collaborative Plaza" {
  object "TownHall" {
    @proposal
    @vote
    @quorum
    @execution_guard

    proposal: {
      description: "Add community gallery wing"
      target: "GalleryZone"
      changes: { add_object: "GalleryWing" }
      proposer: "0xabc123"
    }

    quorum: {
      minParticipation: 50
      minApproval: 60
    }

    execution_guard: {
      timelock: "24h"
    }
  }
}
```

### New Traits (@dao Category)

- `@proposal`: Defines a governance action (for example, scene change, trait addition).
  - Properties: `description` (string), `target` (entity ref), `changes` (JSON-like diff), `proposer` (address)
- `@vote`: Token-weighted or quadratic vote.
  - Properties: `weight` (token balance), `option` (yes/no/abstain), `voter` (address), `mode` (linear/quadratic)
- `@quorum`: Threshold for passage.
  - Properties: `minParticipation` (percent), `minApproval` (percent)
- `@treasury_guard`: Protects treasury assets and release conditions.
  - Properties: `asset` (token/NFT ref), `releaseCondition` (vote ID)
- `@execution_guard`: Applies approved actions after timelock.
  - Properties: `timelock` (duration), `executor` (optional address), `action` (script ref)

Traits are composable. For example, `@proposal` can be attached to a spatial entity for in-world governance interactions.

### Events and Lifecycle

Flow: Propose -> Vote -> Timelock -> Execute

1. User submits composition with `@proposal`.
2. Compiler emits governance payload to contract interface.
3. Token holders vote with wallet integration.
4. If quorum and approval pass, timelock starts.
5. `@execution_guard` executes scene/state diff post-timelock.

Recommended runtime events:

- `ProposalCreated`
- `VoteCast`
- `ProposalQueued`
- `ProposalExecuted`
- `ProposalCanceled`

### Compiler Outputs

- Add EVM governance profile that compiles DAO traits to Solidity contracts (Governor-style architecture).
- Emit runtime bridge artifacts so approved proposals can map to scene/state diffs.
- Provide optional absorb path for importing existing governance contracts into `.hsplus` adapters.

### Testing and Security

- Add `@script_test` scenarios for deterministic vote and execution simulation.
- Security baseline checks:
  - Reentrancy protection
  - Timelock bypass prevention
  - Flash-loan voting resistance hooks
  - Role and permission boundary validation

## Implementation Plan

- Phase 1: Add trait specs and docs (`@proposal`, `@vote`, `@quorum`, `@treasury_guard`, `@execution_guard`).
- Phase 2: Add EVM governance compiler profile and runtime bridge.
- Phase 3: Add end-to-end reference example (for example, `examples/dao-collaborative-world.holo`).
- Target timeline: 4-6 weeks for v1 scope.

## Alternatives Considered

- Full off-chain governance (for example, chat or forum voting): lower integrity, weaker automation.
- External DAO-only integration without first-class traits: faster initial integration, weaker semantic consistency across targets.

## Open Questions

- Should default voting mode be linear or quadratic?
- Should x402 incentives be integrated for participation and execution rewards?
- Should proposal execution support batched scene diffs in v1 or v1.1?
