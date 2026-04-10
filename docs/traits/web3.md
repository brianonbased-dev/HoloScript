# Web3 & Blockchain Traits

> Part of the HoloScript Traits reference. Browse: [Interaction](/traits/interaction) · [Social](/traits/social) · [All Traits](/traits/)

## Web3/Blockchain Traits

### @token_gated

Token-based access control.

```hsplus
object VIPRoom @token_gated(chain: 'ethereum', min_balance: 1) {
  contract_address: '0x...'
  token_type: 'erc721'
  fallback_behavior: 'blur'
}
```

| Config              | Type   | Default    | Description                           |
| ------------------- | ------ | ---------- | ------------------------------------- |
| `chain`             | string | 'ethereum' | 'ethereum', 'polygon', 'solana', etc. |
| `contract_address`  | string | ''         | Token contract address                |
| `token_id`          | string | ''         | Specific token ID (ERC1155)           |
| `min_balance`       | number | 1          | Required token balance                |
| `token_type`        | string | 'erc721'   | 'erc721', 'erc1155', 'erc20'          |
| `fallback_behavior` | string | 'hide'     | 'hide', 'blur', 'lock', 'message'     |
| `gate_message`      | string | ''         | Message for blocked users             |
| `verify_interval`   | number | 0          | Re-verify interval (ms)               |

**Events:**

- `token_gate_verify` - Verification requested
- `token_gate_balance_result` - Balance check complete
- `token_gate_access_granted` - Access granted
- `token_gate_access_denied` - Access denied

---

### @wallet

Web3 wallet connection.

```hsplus
object ConnectButton @wallet {
  supported_chains: ['ethereum', 'polygon']
  auto_connect: true
}
```

| Config             | Type    | Default      | Description           |
| ------------------ | ------- | ------------ | --------------------- |
| `supported_chains` | Array   | ['ethereum'] | Supported blockchains |
| `auto_connect`     | boolean | false        | Auto-connect on load  |
| `required_chain`   | string  | null         | Force specific chain  |

**State:**

- `isConnected` - Connection status
- `address` - Connected wallet address
- `chainId` - Current chain ID

**Events:**

- `wallet_connect` - Wallet connected
- `wallet_disconnect` - Wallet disconnected
- `wallet_chain_changed` - Chain switched
- `wallet_account_changed` - Account changed

---

### @nft

NFT display and metadata.

```hsplus
object Artwork @nft {
  contract: '0x...'
  token_id: '123'
  chain: 'ethereum'
}
```

| Config            | Type    | Default    | Description      |
| ----------------- | ------- | ---------- | ---------------- |
| `contract`        | string  | ''         | Contract address |
| `token_id`        | string  | ''         | Token ID         |
| `chain`           | string  | 'ethereum' | Blockchain       |
| `auto_load_media` | boolean | true       | Load NFT media   |

**Events:**

- `nft_loaded` - Metadata loaded
- `nft_media_loaded` - Media loaded

---

### @marketplace

In-world marketplace for digital assets.

```hsplus
object Shop @marketplace {
  currency: 'eth'
  fee_percentage: 2.5
}
```

| Config           | Type    | Default | Description      |
| ---------------- | ------- | ------- | ---------------- |
| `currency`       | string  | 'eth'   | Payment currency |
| `fee_percentage` | number  | 0       | Platform fee     |
| `escrow_enabled` | boolean | true    | Use escrow       |

**Events:**

- `marketplace_list` - Item listed
- `marketplace_purchase` - Item purchased
- `marketplace_transfer` - Item transferred

---

---

### @zora_coins

Mint and distribute ERC-20 creator coins on **Base L2** via the Zora Coins protocol. Reward players, gate premium content, and run in-world economies — all on-chain.

```hsplus
object "RewardSystem" @zora_coins(
  api_key: env.ZORA_API_KEY,
  contract_address: "0x...",
  chain_id: 8453
) { }
```

| Config               | Type   | Default      | Description                                      |
| -------------------- | ------ | ------------ | ------------------------------------------------ |
| `api_key`            | string | `""`         | **Required.** Zora API key.                      |
| `contract_address`   | string | `""`         | Deployed coin contract. Auto-deployed if empty.  |
| `chain_id`           | number | `8453`       | Chain ID. `8453` = Base, `1` = Ethereum mainnet. |
| `coin_name`          | string | `"HoloCoin"` | Token name (used when auto-deploying).           |
| `coin_symbol`        | string | `"HOLO"`     | Token ticker.                                    |
| `initial_supply`     | number | `1000000`    | Initial mint supply when auto-deploying.         |
| `creator_reward_bps` | number | `1000`       | Creator royalty in basis points (1000 = 10%).    |

**Events — Incoming:**

| Event            | Payload                        | Description                |
| ---------------- | ------------------------------ | -------------------------- |
| `mint_coins`     | `{ recipient, amount, memo? }` | Mint tokens to a wallet.   |
| `burn_coins`     | `{ holder, amount }`           | Burn tokens from a wallet. |
| `transfer_coins` | `{ from, to, amount }`         | Transfer between wallets.  |

**Events — Outgoing:**

| Event               | Payload                                      | Description              |
| ------------------- | -------------------------------------------- | ------------------------ |
| `coins_minted`      | `{ txHash, recipient, amount, blockNumber }` | Mint confirmed on-chain. |
| `coins_burned`      | `{ txHash, holder, amount }`                 | Burn confirmed.          |
| `coins_transferred` | `{ txHash, from, to, amount }`               | Transfer confirmed.      |
| `balance_updated`   | `{ address, newBalance }`                    | Balance changed.         |
| `zora_error`        | `{ error, operation }`                       | On-chain error.          |

**Example — reward players for collecting items:**

```hsplus
object "Collectible" @grabbable {
  on_grab: {
    emit "mint_coins" {
      recipient: grabber.wallet_address,
      amount: 10,
      memo: "Collected item bonus"
    }
  }
}

logic {
  on_event("coins_minted", event) {
    show_toast(`+${event.amount} HOLO coins sent!`)
  }
}
```

See also: [Render Network Trait](/traits/render-network)

---

## See Also

- [Social Traits](/traits/social)
- [IoT Traits](/traits/iot)
- [Render Network Trait](/traits/render-network)
- [API Reference](/api/)
