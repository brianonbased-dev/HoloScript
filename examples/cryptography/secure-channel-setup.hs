/**
 * Secure Channel Setup — .hs Process Example
 *
 * Demonstrates cryptographic channel establishment as a sequential
 * process. Two agents negotiate a secure communication channel using
 * post-quantum hybrid cryptography: ML-DSA-65 + Ed25519 for signing,
 * ML-KEM-768 for key encapsulation, and derived shared secrets for
 * symmetric encryption.
 *
 * This is inherently SEQUENTIAL — you must generate keys before
 * exchanging them, exchange before deriving shared secrets, and
 * derive before establishing the channel. Cryptographic protocols
 * ARE sequential processes by definition.
 *
 * Uses: Post-quantum crypto algorithms (ML-DSA-65, ML-KEM-768, Ed25519)
 * Complements: 01-hybrid-crypto-signing.holo (declares crypto config)
 * This file:   Implements the channel setup PROCESS step by step.
 *
 * @version 5.0.0
 * @format .hs (process)
 */

environment {
  skybox: "void"
  ambient_light: 0.3
  fog: { color: "#000a14", density: 0.008 }
}

// ============================================================================
// STAGE 1: KEY GENERATOR — generate hybrid keypairs
// ============================================================================

object "key_generator" {
  geometry: "octahedron"
  color: "#00e5ff"
  position: { x: -10, y: 2, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    generating: false
    local_agent_id: "agent_alpha"
    // Keypair storage
    signing_keypair: null       // ML-DSA-65 (post-quantum signing)
    classical_keypair: null     // Ed25519 (classical signing, hybrid fallback)
    kem_keypair: null           // ML-KEM-768 (key encapsulation mechanism)
    keys_generated_at: null
    key_version: 0
  }

  function generate_keys() {
    state.generating = true
    state.key_version += 1

    // Step 1: Generate ML-DSA-65 signing keypair (post-quantum)
    // ML-DSA-65 (formerly Dilithium) provides quantum-resistant signatures
    const ml_dsa = crypto_keygen("ML-DSA-65", {
      security_level: 3,        // NIST level 3
      purpose: "signing"
    })

    if (!ml_dsa.success) {
      state.generating = false
      emit("keygen_failed", { algorithm: "ML-DSA-65", error: ml_dsa.error })
      return
    }

    state.signing_keypair = {
      algorithm: "ML-DSA-65",
      public_key: ml_dsa.public_key,
      private_key: ml_dsa.private_key,
      key_id: generate_uuid()
    }

    // Step 2: Generate Ed25519 classical signing keypair (hybrid backup)
    // Classical signatures remain for backwards compatibility and hybrid security
    const ed25519 = crypto_keygen("Ed25519", {
      purpose: "signing"
    })

    if (!ed25519.success) {
      state.generating = false
      emit("keygen_failed", { algorithm: "Ed25519", error: ed25519.error })
      return
    }

    state.classical_keypair = {
      algorithm: "Ed25519",
      public_key: ed25519.public_key,
      private_key: ed25519.private_key,
      key_id: generate_uuid()
    }

    // Step 3: Generate ML-KEM-768 key encapsulation keypair
    // ML-KEM-768 (formerly Kyber) provides quantum-resistant key exchange
    const ml_kem = crypto_keygen("ML-KEM-768", {
      security_level: 3,
      purpose: "key_exchange"
    })

    if (!ml_kem.success) {
      state.generating = false
      emit("keygen_failed", { algorithm: "ML-KEM-768", error: ml_kem.error })
      return
    }

    state.kem_keypair = {
      algorithm: "ML-KEM-768",
      public_key: ml_kem.public_key,
      private_key: ml_kem.private_key,
      key_id: generate_uuid()
    }

    state.keys_generated_at = current_time()
    state.generating = false

    emit("keys_generated", {
      agent_id: state.local_agent_id,
      key_version: state.key_version,
      // Only export PUBLIC keys — never expose private keys
      signing_public_key: state.signing_keypair.public_key,
      signing_algorithm: "ML-DSA-65",
      classical_public_key: state.classical_keypair.public_key,
      classical_algorithm: "Ed25519",
      kem_public_key: state.kem_keypair.public_key,
      kem_algorithm: "ML-KEM-768",
      generated_at: state.keys_generated_at
    })
  }

  on_error(err) {
    state.generating = false
    emit("keygen_error", { error: err.message })
  }
}

// ============================================================================
// STAGE 2: KEY EXCHANGER — exchange public keys, verify signatures
// ============================================================================

object "key_exchanger" {
  geometry: "torus"
  color: "#ffab40"
  position: { x: -6, y: 2, z: 0 }
  scale: { x: 0.5, y: 0.3, z: 0.5 }

  state {
    exchanging: false
    local_keys: null
    remote_keys: null
    remote_agent_id: "agent_beta"
    relay_url: "ws://localhost:4200/portal"
    exchange_timeout: 15000     // 15 seconds
    verified: false
  }

  function exchange(local_keys) {
    state.exchanging = true
    state.local_keys = local_keys
    state.verified = false

    // Step 1: Sign our public key bundle with both algorithms (hybrid)
    const key_bundle = {
      agent_id: local_keys.agent_id,
      signing_public_key: local_keys.signing_public_key,
      classical_public_key: local_keys.classical_public_key,
      kem_public_key: local_keys.kem_public_key,
      timestamp: current_time(),
      nonce: generate_nonce(32)
    }

    // Dual-sign: ML-DSA-65 (PQ) + Ed25519 (classical) = hybrid
    const pq_signature = crypto_sign(key_bundle, "ML-DSA-65", local_keys.signing_public_key)
    const classical_signature = crypto_sign(key_bundle, "Ed25519", local_keys.classical_public_key)

    const signed_bundle = {
      bundle: key_bundle,
      pq_signature: pq_signature,
      classical_signature: classical_signature
    }

    // Step 2: Send our signed bundle to remote agent via portal
    const send_result = portal_send({
      type: "key_exchange_offer",
      target_agent: state.remote_agent_id,
      payload: signed_bundle
    }, state.exchange_timeout)

    if (!send_result.success) {
      state.exchanging = false
      emit("exchange_failed", {
        reason: "send_failed",
        error: send_result.error
      })
      return
    }

    // Step 3: Wait for remote agent's signed key bundle
    const response = wait_for_event("key_exchange_response", {
      from_agent: state.remote_agent_id,
      timeout: state.exchange_timeout
    })

    if (!response) {
      state.exchanging = false
      emit("exchange_failed", { reason: "timeout" })
      return
    }

    // Step 4: Verify remote agent's signatures (BOTH must pass for hybrid)
    const pq_valid = crypto_verify(
      response.bundle,
      response.pq_signature,
      "ML-DSA-65",
      response.bundle.signing_public_key
    )

    const classical_valid = crypto_verify(
      response.bundle,
      response.classical_signature,
      "Ed25519",
      response.bundle.classical_public_key
    )

    if (!pq_valid || !classical_valid) {
      state.exchanging = false
      emit("exchange_failed", {
        reason: "signature_verification_failed",
        pq_valid: pq_valid,
        classical_valid: classical_valid
      })
      return
    }

    // Step 5: Check replay protection — nonce must be fresh
    if (response.bundle.timestamp < current_time() - state.exchange_timeout) {
      state.exchanging = false
      emit("exchange_failed", { reason: "stale_nonce" })
      return
    }

    state.remote_keys = response.bundle
    state.verified = true
    state.exchanging = false

    emit("keys_exchanged", {
      local_agent: local_keys.agent_id,
      remote_agent: state.remote_agent_id,
      remote_kem_public_key: response.bundle.kem_public_key,
      local_kem_public_key: local_keys.kem_public_key,
      pq_verified: pq_valid,
      classical_verified: classical_valid,
      exchanged_at: current_time()
    })
  }
}

// ============================================================================
// STAGE 3: SHARED SECRET DERIVER — ML-KEM-768 encapsulation
// ============================================================================

object "shared_secret_deriver" {
  geometry: "sphere"
  color: "#e040fb"
  position: { x: -2, y: 2, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    deriving: false
    shared_secret: null
    ciphertext: null
    secret_version: 0
  }

  function derive(exchange_data) {
    state.deriving = true
    state.secret_version += 1

    // Step 1: Encapsulate a shared secret using remote agent's KEM public key
    // ML-KEM-768 produces a ciphertext + shared secret pair
    const encapsulation = crypto_kem_encapsulate(
      "ML-KEM-768",
      exchange_data.remote_kem_public_key
    )

    if (!encapsulation.success) {
      state.deriving = false
      emit("derive_failed", {
        reason: "encapsulation_failed",
        error: encapsulation.error
      })
      return
    }

    state.ciphertext = encapsulation.ciphertext
    const kem_secret = encapsulation.shared_secret

    // Step 2: Derive the final channel key using HKDF
    // Combine KEM shared secret with both agent IDs for domain separation
    const channel_key = crypto_hkdf({
      algorithm: "SHA-256",
      input_key: kem_secret,
      salt: exchange_data.local_agent + ":" + exchange_data.remote_agent,
      info: "holoscript-channel-v5.0",
      output_length: 32     // 256-bit symmetric key
    })

    if (!channel_key.success) {
      state.deriving = false
      emit("derive_failed", {
        reason: "hkdf_failed",
        error: channel_key.error
      })
      return
    }

    state.shared_secret = channel_key.derived_key
    state.deriving = false

    // Step 3: Send ciphertext to remote agent so they can derive same secret
    portal_send({
      type: "kem_ciphertext",
      target_agent: exchange_data.remote_agent,
      ciphertext: state.ciphertext,
      secret_version: state.secret_version
    })

    emit("secret_derived", {
      local_agent: exchange_data.local_agent,
      remote_agent: exchange_data.remote_agent,
      secret_version: state.secret_version,
      algorithm: "ML-KEM-768 + HKDF-SHA-256",
      key_length_bits: 256,
      // NEVER emit the actual secret — only metadata
      ciphertext_sent: true,
      derived_at: current_time()
    })
  }
}

// ============================================================================
// STAGE 4: CHANNEL ESTABLISHER — create encrypted channel
// ============================================================================

object "channel_establisher" {
  geometry: "cube"
  color: "#69f0ae"
  position: { x: 2, y: 2, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    establishing: false
    channel_id: null
    cipher_suite: "AES-256-GCM"   // symmetric encryption for channel
    channel_active: false
    messages_sent: 0
    messages_received: 0
  }

  function establish(secret_data) {
    state.establishing = true
    state.channel_id = generate_uuid()

    // Step 1: Configure cipher suite for the channel
    const channel_config = {
      channel_id: state.channel_id,
      cipher: state.cipher_suite,
      key_algorithm: secret_data.algorithm,
      key_version: secret_data.secret_version,
      local_agent: secret_data.local_agent,
      remote_agent: secret_data.remote_agent,
      // Perfect forward secrecy: each session uses unique derived key
      session_key_derivation: "per_session_hkdf",
      // Replay protection
      sequence_numbers: true,
      max_sequence_gap: 100,
      // Message integrity
      mac_algorithm: "HMAC-SHA-256",
      // Channel lifetime
      max_lifetime_ms: 3600000,  // 1 hour before rekeying required
      created_at: current_time()
    }

    // Step 2: Register the channel
    const register_result = register_secure_channel(channel_config)

    if (!register_result.success) {
      state.establishing = false
      emit("channel_failed", {
        reason: "registration_failed",
        error: register_result.error
      })
      return
    }

    // Step 3: Send channel confirmation to remote agent
    const confirm_result = portal_send({
      type: "channel_established",
      target_agent: secret_data.remote_agent,
      channel_id: state.channel_id,
      cipher_suite: state.cipher_suite,
      session_id: generate_uuid()
    })

    // Step 4: Wait for remote confirmation
    const ack = wait_for_event("channel_acknowledged", {
      channel_id: state.channel_id,
      timeout: 10000
    })

    if (!ack) {
      state.establishing = false
      deregister_secure_channel(state.channel_id)
      emit("channel_failed", { reason: "remote_did_not_acknowledge" })
      return
    }

    state.channel_active = true
    state.establishing = false

    emit("channel_established", {
      channel_id: state.channel_id,
      local_agent: secret_data.local_agent,
      remote_agent: secret_data.remote_agent,
      cipher_suite: state.cipher_suite,
      key_algorithm: secret_data.algorithm,
      established_at: current_time()
    })
  }

  on_error(err) {
    state.establishing = false
    if (state.channel_id) {
      deregister_secure_channel(state.channel_id)
    }
    emit("channel_error", { error: err.message })
  }
}

// ============================================================================
// STAGE 5: ROTATION SCHEDULER — rotate keys on timer
// ============================================================================

object "rotation_scheduler" {
  geometry: "torus"
  color: "#ffd740"
  position: { x: 6, y: 2, z: 0 }
  scale: { x: 0.4, y: 0.2, z: 0.4 }

  state {
    rotation_interval: 3600000   // rotate every hour
    last_rotation: 0
    rotation_count: 0
    max_key_age_ms: 7200000      // force rotation after 2 hours regardless
    channel_id: null
  }

  function check_rotation() {
    const now = current_time()
    const key_age = now - state.last_rotation

    // Check if rotation is needed
    let needs_rotation = false
    let reason = null

    if (state.last_rotation == 0) {
      // First rotation — set baseline, no action needed
      state.last_rotation = now
      return
    }

    if (key_age >= state.rotation_interval) {
      needs_rotation = true
      reason = "scheduled_rotation"
    }

    if (key_age >= state.max_key_age_ms) {
      needs_rotation = true
      reason = "max_key_age_exceeded"
    }

    if (needs_rotation) {
      state.rotation_count += 1
      state.last_rotation = now

      emit("rotation_required", {
        reason: reason,
        rotation_number: state.rotation_count,
        key_age_ms: key_age,
        timestamp: now
      })
    }
  }

  // External trigger for immediate rotation (e.g., suspected compromise)
  on_detect(trigger) {
    if (trigger.type == "compromise_suspected") {
      state.rotation_count += 1
      state.last_rotation = current_time()

      emit("rotation_required", {
        reason: "compromise_suspected",
        rotation_number: state.rotation_count,
        immediate: true,
        timestamp: current_time()
      })
    }
  }
}

// ============================================================================
// STAGE 6: AUDIT LOGGER — log all crypto operations for compliance
// ============================================================================

object "audit_logger" {
  geometry: "cylinder"
  color: "#90a4ae"
  position: { x: 10, y: 2, z: 0 }
  scale: { x: 0.4, y: 0.6, z: 0.4 }

  state {
    log_entries: []
    max_log_size: 10000
    total_logged: 0
    // Compliance: never log private keys or shared secrets
    redacted_fields: ["private_key", "shared_secret", "derived_key", "session_key"]
  }

  function log_event(event_name, event_data) {
    // Redact sensitive fields before logging
    const safe_data = deep_clone(event_data)
    for (const field in state.redacted_fields) {
      if (safe_data[field]) {
        safe_data[field] = "[REDACTED]"
      }
    }

    const entry = {
      entry_id: generate_uuid(),
      event: event_name,
      data: safe_data,
      timestamp: current_time(),
      sequence: state.total_logged
    }

    state.log_entries.push(entry)
    state.total_logged += 1

    // Trim log if too large
    if (state.log_entries.length > state.max_log_size) {
      // Archive old entries before trimming
      emit("audit_archive_needed", {
        entries_to_archive: state.log_entries.slice(0, 1000).length
      })
      state.log_entries = state.log_entries.slice(1000)
    }

    emit("audit_logged", {
      entry_id: entry.entry_id,
      event: event_name,
      sequence: entry.sequence
    })
  }

  // Convenience handlers for each crypto lifecycle event
  function on_keygen(data) {
    log_event("key_generation", data)
  }

  function on_exchange(data) {
    log_event("key_exchange", data)
  }

  function on_derive(data) {
    log_event("secret_derivation", data)
  }

  function on_channel(data) {
    log_event("channel_established", data)
  }

  function on_rotation(data) {
    log_event("key_rotation_triggered", data)
  }

  function on_failure(data) {
    log_event("crypto_failure", data)
  }
}

// ============================================================================
// CHANNEL STATUS DISPLAY
// ============================================================================

object "channel_status" {
  geometry: "cube"
  color: "#263238"
  position: { x: 0, y: 5, z: -3 }
  scale: { x: 16, y: 1.5, z: 0.1 }

  state {
    stage: "idle"
    channel_secure: false
    rotation_count: 0
  }

  function update_stage(stage_name) {
    state.stage = stage_name
    if (stage_name == "generating") color = "#00e5ff"
    if (stage_name == "exchanging") color = "#ffab40"
    if (stage_name == "deriving") color = "#e040fb"
    if (stage_name == "establishing") color = "#69f0ae"
    if (stage_name == "secure") {
      color = "#00e676"
      state.channel_secure = true
    }
    if (stage_name == "rotating") color = "#ffd740"
    if (stage_name == "failed") {
      color = "#f44336"
      state.channel_secure = false
    }
  }
}

// ============================================================================
// CONNECTIONS — wiring the crypto channel pipeline
// ============================================================================
// Sequential: keygen -> exchange -> derive -> establish
// Plus: rotation loop and audit logging at every stage

// Main pipeline
connect key_generator.keys_generated -> key_exchanger.exchange
connect key_exchanger.keys_exchanged -> shared_secret_deriver.derive
connect shared_secret_deriver.secret_derived -> channel_establisher.establish

// Rotation triggers re-keying (loops back to key_generator)
connect rotation_scheduler.rotation_required -> key_generator.generate_keys

// Status display
connect key_generator.keys_generated -> channel_status.update_stage("generating")
connect key_exchanger.keys_exchanged -> channel_status.update_stage("exchanging")
connect shared_secret_deriver.secret_derived -> channel_status.update_stage("deriving")
connect channel_establisher.channel_established -> channel_status.update_stage("secure")
connect rotation_scheduler.rotation_required -> channel_status.update_stage("rotating")

// Audit logging — every crypto operation is logged
connect key_generator.keys_generated -> audit_logger.on_keygen
connect key_exchanger.keys_exchanged -> audit_logger.on_exchange
connect shared_secret_deriver.secret_derived -> audit_logger.on_derive
connect channel_establisher.channel_established -> audit_logger.on_channel
connect rotation_scheduler.rotation_required -> audit_logger.on_rotation

// Error paths -> audit + status
connect key_generator.keygen_failed -> audit_logger.on_failure
connect key_exchanger.exchange_failed -> audit_logger.on_failure
connect shared_secret_deriver.derive_failed -> audit_logger.on_failure
connect channel_establisher.channel_failed -> audit_logger.on_failure

connect key_generator.keygen_failed -> channel_status.update_stage("failed")
connect key_exchanger.exchange_failed -> channel_status.update_stage("failed")
connect shared_secret_deriver.derive_failed -> channel_status.update_stage("failed")
connect channel_establisher.channel_failed -> channel_status.update_stage("failed")

// ============================================================================
// EXECUTION — start the crypto lifecycle
// ============================================================================

// Initial key generation kicks off the entire pipeline
execute key_generator.generate_keys() repeat forever

// Check for key rotation every hour (3600000ms)
execute rotation_scheduler.check_rotation() every 3600000ms
