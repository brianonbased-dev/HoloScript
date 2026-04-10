# Security / ZK Traits

HoloScript provides cryptographic and privacy-first traits for building trustless spatial applications. Add zero-knowledge proofs, field-level encryption, tamper-evident audit logs, and automated vulnerability scanning — all as declarative object annotations.

---

## Trait Reference

### `@zero_knowledge_proof`

Attaches a ZK circuit to an object that produces verifiable proofs without revealing private inputs. Supports Groth16 (snarkjs) and PLONK out of the box.

```hsplus
object "AgeGate" @zero_knowledge_proof {
  zk: {
    circuit: "circuits/age_check.circom"
    system: "groth16"
    verification_key: "keys/age_check_vk.json"
  }

  onInteract: {
    const proof = await zk.requestProof(user, {
      claim: "age >= 18",
      public_inputs: ["threshold"]
    })

    if (zk.verify(proof)) {
      this.scene.transition("adult_lounge")
    }
  }
}
```

### `@zk_private`

Marks object state fields as ZK-private — they are provably committed on-chain but never revealed to other players or the server.

```hsplus
object "SecretInventory" @zk_private {
  @zk_private items: []     // other players can't see your items
  @zk_private balance: 0    // but trades are still trustless

  action trade(other, item) {
    // Generates a ZK proof that `item` is in `items`
    // without revealing the full inventory
    const proof = zk.proveOwnership(this.items, item)
    other.zk.verify(proof)
  }
}
```

### `@rsa_encrypt`

Encrypts object properties at rest and in transit using RSA-OAEP (2048-bit or 4096-bit). Keys can be managed externally (HSM, cloud KMS) or locally.

```hsplus
object "SecureMessage" @rsa_encrypt {
  encryption: {
    algorithm: "RSA-OAEP"
    key_size: 4096
    key_id: "my-app/prod/message-key"  // references cloud KMS
  }

  @encrypted content: ""   // encrypted field

  onGrab: {
    const decrypted = crypto.decrypt(this.content, user.publicKey)
    ui.show(decrypted)
  }
}
```

### `@vulnerability_scanner`

Attaches a runtime security scanner to an object or composition. Reports potential issues: reentrancy, access control violations, unvalidated inputs.

```hsplus
composition "SecureShop" @vulnerability_scanner {
  scanner: {
    level: "strict"                // "basic" | "standard" | "strict"
    checks: ["reentrancy", "access_control", "input_validation"]
    report_endpoint: "/api/security-events"
    block_on_critical: true        // halt execution on CRITICAL findings
  }

  object "PurchaseButton" @clickable {
    onClick: {
      // scanner validates this action before execution
      shop.purchase(user, selected_item)
    }
  }
}
```

### `@audit_log`

Produces a tamper-evident, append-only log of all interactions with an object. Log entries are SHA-256 chained — any modification invalidates the chain.

```hsplus
object "AdminPanel" @audit_log {
  audit: {
    storage: "ipfs"          // "local" | "ipfs" | "arweave" | "s3"
    include: ["onGrab", "onRelease", "state.*"]
    hash_algorithm: "sha256"
    sign_with: "agent_private_key"
  }
}
```

---

## ZK Circuit Compilation

HoloScript compiles `@zero_knowledge_proof` and `@zk_private` traits, targeting snarkjs/circom workflows:

```bash
# Compile circuits and generate proving/verification keys
holo compile my-scene.hsplus --target zkp --out ./circuits/

# Generates:
# circuits/age_check.circom
# circuits/age_check_vk.json
# circuits/age_check_pk.zkey
```

---

## Security Best Practices

1. **Never expose private keys in `.hsplus` files** — use environment variables or cloud KMS key references
2. **`@vulnerability_scanner` in CI** — add `holo scan --strict` to your pipeline
3. **Pair `@token_gated` with `@zero_knowledge_proof`** for privacy-preserving access control
4. **Use `@audit_log` on all admin objects** — builds a verifiable history for compliance

---

## Related

- [Economics / Web3 Traits](./economics)
- [AI Behavior Traits](./ai-behavior)
- [NFT Marketplace Compiler](../compilers/nft-marketplace)
