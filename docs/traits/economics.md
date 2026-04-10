# Economics / Web3 Traits

HoloScript ships a complete suite of blockchain-native traits that bring decentralised economics directly into spatial scenes. Mint NFTs, gate access by token ownership, connect wallets, run on-chain marketplaces, and issue coins — all declaratively.

---

## Trait Reference

### `@wallet`

Connects an object or avatar to a Web3 wallet. Triggers authentication and exposes `.wallet.address`, `.wallet.balance`, and `.wallet.tokens`.

```hsplus
object "Player" @wallet {
  onWalletConnect: {
    ui.toast("Connected: " + this.wallet.address)
  }
}
```

### `@nft_asset`

Marks an object as a mintable/owned NFT. Serialises scene-graph state to ERC-1155 metadata and supports provenance tracking.

```hsplus
object "RareSword" @nft_asset {
  geometry: "model/sword.glb"
  nft: {
    contract: "0xABC..."
    tokenId: 42
    standard: "ERC-1155"
    metadata_uri: "ipfs://Qm..."
  }

  onGrab: {
    if (!user.wallet.owns(this.nft)) {
      ui.toast("You don't own this item")
      this.release()
    }
  }
}
```

### `@token_gated`

Restricts access to an object, zone, or portal based on token ownership. Supports ERC-20, ERC-721, and ERC-1155, plus multi-chain.

```hsplus
object "VIPRoom" @token_gated {
  token_gate: {
    contract: "0xDEF..."
    standard: "ERC-721"
    required_balance: 1
    chain: "ethereum"
    fallback_scene: "lobby"
  }
}
```

### `@marketplace`

Enables peer-to-peer item trading within a scene. Supports listing, bidding, and instant-buy flows.

```hsplus
object "TradePost" @marketplace {
  marketplace: {
    currency: "ETH"
    fee_bps: 250        // 2.5% platform fee
    escrow: true        // hold funds until both parties confirm
  }

  onTradeComplete(item, buyer, price) {
    audio.play("coin_jingle.mp3")
    ui.toast(buyer.name + " bought " + item.name)
  }
}
```

### `@zora_coins`

Issues ERC-20 coins through the Zora Coins protocol. Spatial objects can mint, trade, and burn coins.

```hsplus
object "CoinDispenser" @zora_coins {
  coin: {
    name: "HoloGold"
    symbol: "HGLD"
    initial_supply: 1000000
  }

  onGrab: {
    this.coin.mint(user.wallet.address, 10)
  }
}
```

### `@economy_primitive`

Generic building block for custom in-world economies. Wraps a ledger of credits, inventory slots, and transaction history without requiring a blockchain.

```hsplus
object "ShopKeeper" @economy_primitive {
  economy: {
    currency: "credits"
    starting_balance: 100
  }

  action sell(item, buyer) {
    if (buyer.economy.balance >= item.price) {
      buyer.economy.deduct(item.price)
      buyer.inventory.push(item)
    }
  }
}
```

---

## Compiler Targets

| Trait          | Compiler                                                 |
| -------------- | -------------------------------------------------------- |
| `@nft_asset`   | [NFT Marketplace Compiler](../compilers/nft-marketplace) |
| `@token_gated` | [NFT Marketplace Compiler](../compilers/nft-marketplace) |
| `@marketplace` | [NFT Marketplace Compiler](../compilers/nft-marketplace) |
| `@wallet`      | Browser Web3 (MetaMask / WalletConnect)                  |
| `@zora_coins`  | Zora Protocol SDK                                        |

---

## Related

- [NFT Marketplace Compiler](../compilers/nft-marketplace)
- [IoT / Integration Traits](./iot)
- [Security / ZK Traits](./security)
