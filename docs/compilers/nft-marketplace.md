# NFT Marketplace Compiler

Compiles HoloScript spatial asset definitions to NFT marketplace integrations — generating smart contract configurations, metadata standards, and Web3 wallet interactions for spatial 3D assets.

## Overview

The NFT marketplace compiler (`--target nft-marketplace`) generates the Web3 infrastructure to list, sell, and transfer HoloScript spatial objects as NFTs. A `.holo` file describing a virtual sword, a piece of virtual land, or a 3D wearable becomes a tokenized asset with on-chain provenance.

```bash
holoscript compile items.holo --target nft-marketplace --chain polygon --output ./web3/
```

## Protocol vs Compiler

HoloScript has two on-chain asset surfaces. They solve different jobs.

Use **HoloScript Protocol** as the default for HoloLand-native creator economies:

- Publishing HoloScript compositions, worlds, rooms, objects, and editions.
- Collecting assets whose value depends on HoloScript provenance, receipts, and
  runtime unlocks.
- Creator revenue splits inside a HoloScript or HoloLand economy.
- In-world use where ownership should unlock behavior, access, or replayable
  provenance, not just an external token listing.

Use **NFTMarketplaceCompiler** when the deliverable is EVM marketplace
infrastructure:

- ERC-1155 or ERC-721 compatible contracts.
- OpenSea, Zora, Base, Polygon, or external wallet interoperability.
- Export packages for a team that already operates an NFT marketplace stack.
- Contract, metadata, deployment script, and marketplace UI scaffolding.

The compiler is an interoperability bridge. The Protocol is the sovereign
economy for HoloScript worlds. For HoloLand-native assets, prefer Protocol first
and compile marketplace contracts only when a specific external marketplace,
wallet, or chain deployment requires them.

## What Survived The NFT Crash

Treat speculative collectible drops as a warning label, not as the product
center. The durable patterns are narrower:

- **Game and world assets**: items with live utility in a running world.
- **Tickets and access passes**: ownership unlocks an event, room, quest, or
  capability.
- **Verifiable provenance**: the token anchors authorship, source hashes,
  edition history, and receipts.
- **Creator revenue contracts**: splits and royalty policies that fund the world
  or creator network directly.

HoloScript's advantage is not "another NFT marketplace." It is that the asset
can carry the source composition, compile receipts, SimulationContract evidence,
and runtime behavior that make ownership meaningful inside the world.

## Output Structure

```
web3/
  contracts/
    HoloAsset.sol          # ERC-1155 multi-token contract
    HoloMarketplace.sol    # Marketplace contract
  metadata/
    [id].json              # ERC-721/1155 metadata per asset
    assets/                # IPFS-staged 3D files
  scripts/
    deploy.ts              # Hardhat deploy script
    mint.ts                # Minting interface
  frontend/
    marketplace.tsx        # React marketplace UI
```

## Trait → Web3 Mapping

| HoloScript Trait     | Web3 Behaviour                             |
| -------------------- | ------------------------------------------ |
| `@nft_asset`         | Asset is tokenized as ERC-1155             |
| `@token_gated`       | Requires NFT ownership to spawn/enter      |
| `@marketplace`       | Listed in HoloScript marketplace           |
| `@wallet`            | User wallet connection (MetaMask/Coinbase) |
| `@zora_coins`        | Zora Protocol ERC-20 creator coins         |
| `@economy_primitive` | In-world economy (crafting, trading)       |
| `@persistent`        | State synced to on-chain via IPFS + events |
| `@owned`             | Ownership tracked to wallet address        |

## Example

```holo
composition "VirtualArmoury" {
  template "SpatialSword" {
    @nft_asset
    @grabbable
    @equippable
    @marketplace

    geometry: "model/sword.glb"

    nft: {
      contract: "ERC-1155"
      chain: "polygon"
      royalty: 5          // 5% creator royalty
      editions: 100       // Limited to 100
      price: "0.05 ETH"
    }

    on_equip {
      player.equip(this)
      haptic.feedback("medium")
    }
  }

  object "ExcaliburSword" using "SpatialSword" {
    position: [0, 1, -2]
    nft.editions: 1       // 1/1 unique
    nft.price: "1.0 ETH"
  }
}
```

## ERC-1155 Metadata Output

```json
{
  "name": "Excalibur Sword",
  "description": "A legendary HoloScript spatial asset",
  "image": "ipfs://QmXxx.../preview.png",
  "animation_url": "ipfs://QmXxx.../sword.glb",
  "properties": {
    "holoscript_composition": "ipfs://QmXxx.../armoury.holo",
    "traits": ["nft_asset", "grabbable", "equippable"],
    "geometry": "model/sword.glb",
    "chain": "polygon",
    "editions": 1
  }
}
```

## Supported Chains

| Chain    | Standard     | Gas Optimization                    |
| -------- | ------------ | ----------------------------------- |
| Polygon  | ERC-1155     | `GasOptimizationAnalyzer` runs auto |
| Ethereum | ERC-721      | Estimated gas in output report      |
| Base     | ERC-1155     | OP Stack L2, low gas                |
| Zora     | Zora Creator | Zora coins + creator rewards        |
| Arbitrum | ERC-1155     | OP rollup                           |

## Gas Optimization

The compiler includes `GasOptimizationAnalyzer` which automatically:

- Batches mint operations into multi-mint calls
- Uses `ERC-1155` over `ERC-721` for multiple editions
- Suggests lazy minting for large collections
- Reports gas estimate per operation in the build output

## Compiler Options

| Option                  | Default       | Description                                |
| ----------------------- | ------------- | ------------------------------------------ |
| `--chain`               | `polygon`     | Target blockchain                          |
| `--standard`            | `erc1155`     | Token standard: `erc721` or `erc1155`      |
| `--ipfs-gateway`        | `nft.storage` | IPFS pin service                           |
| `--royalty`             | `5`           | Default creator royalty (%)                |
| `--marketplace-backend` | `hololand`    | Marketplace: `hololand`, `opensea`, `zora` |

## See Also

- [Economics / Web3 Traits](/traits/economics) — `@wallet`, `@nft_asset`, `@zora_coins`
- [Security / ZK Traits](/traits/security) — `@token_gated`, `@zero_knowledge_proof`
- [Integrations](/integrations/) — Hololand marketplace integration
