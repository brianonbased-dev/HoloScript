# CG-057: NFT Marketplace Watch - Protocol First

**Date**: 2026-05-20 (codex-hardware marathon documentation)
**Task**: task_1779307138688_7kj2
**Vertical**: Creator economy / on-chain assets (vs OpenSea and NFT marketplaces)

---

## The Boundary

HoloScript should not chase the old NFT marketplace category as a destination.
The durable internal move is **HoloScript Protocol first**:

- Protocol publishes and collects HoloScript compositions as native economic
  objects.
- Protocol keeps creator splits, provenance, receipts, and in-world unlocks
  attached to the asset.
- Protocol makes HoloLand's economy sovereign instead of dependent on an
  external marketplace narrative.

`NFTMarketplaceCompiler` remains useful, but it is a bridge target. It emits
ERC-1155/ERC-721 style contracts, metadata, deployment scripts, and marketplace
scaffolding for teams that need EVM compatibility.

---

## When To Use Each Surface

| Need                                                    | Use                    | Reason                                                                       |
| ------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| Native HoloLand object, room, or world economy          | HoloScript Protocol    | Ownership, editions, splits, and provenance stay inside the HoloScript loop. |
| Runtime unlocks tied to receipts or source composition  | HoloScript Protocol    | The asset is valuable because it runs and can be verified.                   |
| External OpenSea/Zora/Base/Polygon integration          | NFTMarketplaceCompiler | The deliverable is chain and marketplace infrastructure.                     |
| A customer already has an NFT contract stack            | NFTMarketplaceCompiler | HoloScript can export into that stack without making it the default economy. |
| Creator split and collection flow for HoloScript worlds | HoloScript Protocol    | This is BUILD-INTERNAL, not a bridge to someone else's marketplace.          |

---

## What Survived The Crash

The speculative collectible market is not the guide. The surviving patterns are:

1. **Game assets with utility** - items matter because they change what can
   happen in a live world.
2. **Tickets and access passes** - ownership gates an event, room, quest, or
   capability.
3. **Verifiable provenance** - authorship, edition history, source hashes, and
   compile receipts are inspectable.
4. **Creator revenue contracts** - splits fund the creator or world, not a
   marketplace moat.

HoloScript is strongest in the third and fourth patterns. A HoloScript asset is
not only a token. It can carry the `.holo` source, compiler target receipts,
SimulationContract evidence, and HoloLand runtime behavior.

---

## Positioning

Do not pitch this as "HoloScript versus OpenSea." Pitch it as:

> HoloScript Protocol is the on-chain economy for worlds whose assets have
> executable provenance.

OpenSea-style marketplaces are distribution endpoints. HoloScript Protocol is
the source-of-truth economy for HoloScript worlds. When the target customer
needs external chain compatibility, `NFTMarketplaceCompiler` generates the
bridge.

---

## Local Follow-Ups

- Add a Protocol publish/collect walkthrough once the canonical protocol docs
  path exists.
- Add a small example where a collected HoloLand object unlocks a runtime
  behavior.
- Keep `NFTMarketplaceCompiler` docs framed as external interoperability, not
  the default HoloLand creator economy.

This document plus the `docs/compilers/nft-marketplace.md` boundary section is
the local farmable slice for CG-057.
