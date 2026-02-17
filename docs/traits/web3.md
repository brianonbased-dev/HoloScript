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


## See Also
- [Social Traits](/traits/social)
- [IoT Traits](/traits/iot)
- [API Reference](/api/)
