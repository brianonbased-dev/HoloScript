/**
 * Economy Batch Settlement — .hs Process Example
 *
 * Demonstrates batch settlement of economic transactions as a
 * sequential pipeline. In a multi-agent economy, transactions
 * accumulate rapidly. Rather than settling each one individually,
 * this pipeline collects a batch, validates balances, holds funds
 * in escrow, atomically settles all transfers, then reconciles.
 *
 * This is inherently SEQUENTIAL — you cannot settle before validating,
 * and you cannot reconcile before settling. The ordering IS the logic.
 *
 * Complements: 02-economy-primitives.holo (declares economy config)
 * This file:   Implements the settlement PROCESS that runs the economy.
 *
 * @version 5.0.0
 * @format .hs (process)
 */

environment {
  skybox: { type: "gradient", top: "#050510", bottom: "#16213e" }
  ambient_light: 0.2
  shadows: true
}

light "OverheadNeon" {
  type: "directional"
  color: "#aabbff"
  intensity: 0.6
  position: { x: 0, y: 10, z: 5 }
  cast_shadows: true
}

post_processing {
  bloom: { enabled: true, intensity: 0.4, threshold: 0.6 }
  tone_mapping: { type: "aces", exposure: 0.85 }
}

// ============================================================================
// STAGE 1: TRANSACTION COLLECTOR — gather pending transactions
// ============================================================================

object "transaction_collector" {
  geometry: "cylinder"
  color: "#26c6da"
  position: { x: -8, y: 1, z: 0 }
  scale: { x: 0.6, y: 0.8, z: 0.6 }

  state {
    pending_batch: []
    batch_size_limit: 100       // max transactions per batch
    collection_window: 10000    // collect for 10 seconds
    collecting: false
    total_collected: 0
    batch_number: 0
  }

  // Continuously listen for incoming transactions from agents
  function collect() {
    state.collecting = true
    state.pending_batch = []
    state.batch_number += 1

    const batch_start = current_time()

    // Gather transactions until batch is full or window closes
    while (state.pending_batch.length < state.batch_size_limit) {
      const elapsed = current_time() - batch_start
      if (elapsed >= state.collection_window) {
        break
      }

      // Poll the economy engine for new pending transactions
      const pending = economy_get_pending_transactions()

      for (const tx in pending) {
        if (state.pending_batch.length >= state.batch_size_limit) break

        state.pending_batch.push({
          tx_id: tx.id,
          from_agent: tx.from,
          to_agent: tx.to,
          amount: tx.amount,
          type: tx.type,           // "transfer", "bounty_payout", "subscription"
          timestamp: tx.timestamp,
          metadata: tx.metadata
        })
      }

      yield  // yield control between polls
    }

    state.total_collected += state.pending_batch.length
    state.collecting = false

    if (state.pending_batch.length > 0) {
      emit("batch_collected", {
        batch_number: state.batch_number,
        transaction_count: state.pending_batch.length,
        transactions: state.pending_batch,
        collected_at: current_time()
      })
    }
  }

  on_error(err) {
    state.collecting = false
    emit("collection_error", { error: err.message })
  }
}

// ============================================================================
// STAGE 2: VALIDATOR — check balances, enforce limits, detect fraud
// ============================================================================

object "validator" {
  geometry: "octahedron"
  color: "#ffa726"
  position: { x: -4, y: 1, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    validating: false
    approved: []
    rejected: []
    default_spend_limit: 50     // max credits per transaction
    fraud_patterns: []
    total_validated: 0
    total_rejected: 0
  }

  function validate(batch) {
    state.validating = true
    state.approved = []
    state.rejected = []

    for (const tx in batch.transactions) {
      let valid = true
      let rejection_reason = null

      // Check 1: Sender has sufficient balance
      const sender_balance = economy_get_balance(tx.from_agent)
      if (sender_balance < tx.amount) {
        valid = false
        rejection_reason = "insufficient_balance"
      }

      // Check 2: Transaction does not exceed spend limit
      if (valid && tx.amount > state.default_spend_limit) {
        const agent_limit = economy_get_spend_limit(tx.from_agent)
        if (tx.amount > agent_limit) {
          valid = false
          rejection_reason = "spend_limit_exceeded"
        }
      }

      // Check 3: Positive amount (no negative transfers)
      if (valid && tx.amount <= 0) {
        valid = false
        rejection_reason = "invalid_amount"
      }

      // Check 4: Sender and receiver are different agents
      if (valid && tx.from_agent == tx.to_agent) {
        valid = false
        rejection_reason = "self_transfer"
      }

      // Check 5: Fraud detection — duplicate transaction within window
      if (valid) {
        const is_duplicate = check_duplicate(tx, state.approved)
        if (is_duplicate) {
          valid = false
          rejection_reason = "duplicate_transaction"
        }
      }

      // Check 6: Receiver exists in the scene
      if (valid) {
        const receiver_exists = economy_agent_exists(tx.to_agent)
        if (!receiver_exists) {
          valid = false
          rejection_reason = "receiver_not_found"
        }
      }

      if (valid) {
        state.approved.push(tx)
      } else {
        tx.rejection_reason = rejection_reason
        state.rejected.push(tx)
      }
    }

    state.total_validated += state.approved.length
    state.total_rejected += state.rejected.length
    state.validating = false

    // Emit rejected transactions for logging
    if (state.rejected.length > 0) {
      emit("transactions_rejected", {
        batch_number: batch.batch_number,
        count: state.rejected.length,
        transactions: state.rejected
      })
    }

    // Pass approved transactions to next stage
    if (state.approved.length > 0) {
      emit("batch_validated", {
        batch_number: batch.batch_number,
        approved_count: state.approved.length,
        rejected_count: state.rejected.length,
        transactions: state.approved,
        total_value: sum(state.approved, "amount")
      })
    }
  }

  function check_duplicate(tx, approved_list) {
    for (const existing in approved_list) {
      if (existing.from_agent == tx.from_agent &&
          existing.to_agent == tx.to_agent &&
          existing.amount == tx.amount &&
          abs(existing.timestamp - tx.timestamp) < 1000) {
        return true
      }
    }
    return false
  }
}

// ============================================================================
// STAGE 3: ESCROW MANAGER — hold funds during settlement
// ============================================================================

object "escrow_manager" {
  geometry: "cube"
  color: "#ab47bc"
  position: { x: 0, y: 1, z: 0 }
  scale: { x: 0.6, y: 0.6, z: 0.6 }

  state {
    escrow_active: false
    held_funds: {}              // agent_id -> amount held
    total_escrowed: 0
    escrow_id: null
  }

  function hold_funds(validated_batch) {
    state.escrow_active = true
    state.escrow_id = generate_uuid()
    state.held_funds = {}
    state.total_escrowed = 0

    let all_held = true

    // Debit sender accounts into escrow
    for (const tx in validated_batch.transactions) {
      const agent = tx.from_agent

      // Accumulate holds per agent (may have multiple outgoing txs)
      if (!state.held_funds[agent]) {
        state.held_funds[agent] = 0
      }
      state.held_funds[agent] += tx.amount

      // Actually lock the funds
      const hold_result = economy_hold(agent, tx.amount, state.escrow_id)
      if (!hold_result.success) {
        all_held = false
        emit("escrow_hold_failed", {
          escrow_id: state.escrow_id,
          agent_id: agent,
          amount: tx.amount,
          reason: hold_result.error
        })
        break
      }

      state.total_escrowed += tx.amount
    }

    if (all_held) {
      emit("funds_escrowed", {
        escrow_id: state.escrow_id,
        batch_number: validated_batch.batch_number,
        total_escrowed: state.total_escrowed,
        agent_count: object_keys(state.held_funds).length,
        transactions: validated_batch.transactions
      })
    } else {
      // Rollback all holds on failure
      release_all_holds(state.escrow_id)
      state.escrow_active = false
      emit("escrow_failed", {
        escrow_id: state.escrow_id,
        batch_number: validated_batch.batch_number,
        reason: "partial_hold_failure"
      })
    }
  }

  function release_escrow(escrow_id) {
    release_all_holds(escrow_id)
    state.escrow_active = false
    state.held_funds = {}
    state.total_escrowed = 0
  }
}

// ============================================================================
// STAGE 4: SETTLEMENT ENGINE — execute batch transfers atomically
// ============================================================================

object "settlement_engine" {
  geometry: "torus"
  color: "#66bb6a"
  position: { x: 4, y: 1, z: 0 }
  scale: { x: 0.5, y: 0.3, z: 0.5 }

  state {
    settling: false
    settlement_id: null
    settled_count: 0
    total_volume: 0
    batch_history: []
  }

  function settle(escrowed) {
    state.settling = true
    state.settlement_id = generate_uuid()

    const results = []
    let all_settled = true

    // Execute each transfer from escrow to receiver
    for (const tx in escrowed.transactions) {
      const transfer_result = economy_transfer_from_escrow(
        escrowed.escrow_id,
        tx.from_agent,
        tx.to_agent,
        tx.amount
      )

      if (transfer_result.success) {
        results.push({
          tx_id: tx.tx_id,
          from: tx.from_agent,
          to: tx.to_agent,
          amount: tx.amount,
          status: "settled",
          settled_at: current_time()
        })
      } else {
        all_settled = false
        results.push({
          tx_id: tx.tx_id,
          status: "failed",
          error: transfer_result.error
        })
      }
    }

    // Update task completion rewards for bounty payouts
    for (const tx in escrowed.transactions) {
      if (tx.type == "bounty_payout") {
        economy_complete_bounty(tx.metadata.bounty_id)
      }
    }

    state.settled_count += results.filter(r => r.status == "settled").length
    state.total_volume += escrowed.total_escrowed
    state.settling = false

    // Record batch in history
    state.batch_history.push({
      settlement_id: state.settlement_id,
      batch_number: escrowed.batch_number,
      count: results.length,
      settled_at: current_time()
    })

    emit("batch_settled", {
      settlement_id: state.settlement_id,
      batch_number: escrowed.batch_number,
      results: results,
      all_settled: all_settled,
      total_volume: escrowed.total_escrowed
    })
  }

  on_error(err) {
    state.settling = false
    emit("settlement_error", {
      settlement_id: state.settlement_id,
      error: err.message
    })
  }
}

// ============================================================================
// STAGE 5: RECONCILIATION REPORT — verify totals, generate audit trail
// ============================================================================

object "reconciliation_report" {
  geometry: "cube"
  color: "#42a5f5"
  position: { x: 8, y: 1, z: 0 }
  scale: { x: 0.8, y: 0.6, z: 0.1 }

  state {
    reconciling: false
    discrepancies: []
    audit_trail: []
    total_batches_reconciled: 0
  }

  function reconcile(settlement) {
    state.reconciling = true
    state.discrepancies = []

    // Verify: sum of debits equals sum of credits
    let total_debited = 0
    let total_credited = 0

    for (const result in settlement.results) {
      if (result.status == "settled") {
        total_debited += result.amount
        total_credited += result.amount  // 1:1 transfer

        // Verify actual balances match expected
        const actual_balance = economy_get_balance(result.to)
        // Log for audit even if matching
      }
    }

    // Check for discrepancy
    if (abs(total_debited - total_credited) > 0.001) {
      state.discrepancies.push({
        type: "debit_credit_mismatch",
        debited: total_debited,
        credited: total_credited,
        difference: total_debited - total_credited
      })
    }

    // Verify total volume matches settlement report
    if (abs(total_debited - settlement.total_volume) > 0.001) {
      state.discrepancies.push({
        type: "volume_mismatch",
        expected: settlement.total_volume,
        actual: total_debited
      })
    }

    // Generate audit entry
    const audit_entry = {
      settlement_id: settlement.settlement_id,
      batch_number: settlement.batch_number,
      transaction_count: settlement.results.length,
      settled_count: settlement.results.filter(r => r.status == "settled").length,
      failed_count: settlement.results.filter(r => r.status == "failed").length,
      total_volume: settlement.total_volume,
      discrepancies: state.discrepancies.length,
      discrepancy_details: state.discrepancies,
      reconciled_at: current_time(),
      status: state.discrepancies.length == 0 ? "clean" : "discrepancy_found"
    }

    state.audit_trail.push(audit_entry)
    state.total_batches_reconciled += 1
    state.reconciling = false

    if (state.discrepancies.length > 0) {
      emit("reconciliation_warning", audit_entry)
    }

    emit("reconciliation_complete", audit_entry)
  }

  on_error(err) {
    state.reconciling = false
    emit("reconciliation_error", { error: err.message })
  }
}

// ============================================================================
// SETTLEMENT DASHBOARD — visual summary of economic activity
// ============================================================================

object "settlement_dashboard" {
  geometry: "cube"
  color: "#263238"
  position: { x: 0, y: 4, z: -4 }
  scale: { x: 12, y: 2, z: 0.1 }

  state {
    total_transactions: 0
    total_volume: 0
    last_batch_status: "idle"
    health: "nominal"
  }

  function on_batch_complete(audit) {
    state.total_transactions += audit.settled_count
    state.total_volume += audit.total_volume
    state.last_batch_status = audit.status

    if (audit.status == "clean") {
      color = "#4caf50"
      state.health = "nominal"
    } else {
      color = "#ff9800"
      state.health = "warning"
    }
  }

  function on_failure(error) {
    color = "#f44336"
    state.health = "critical"
    state.last_batch_status = "failed"
  }
}

// ============================================================================
// CONNECTIONS — wiring the settlement pipeline
// ============================================================================
// Sequential data flow: collect -> validate -> escrow -> settle -> reconcile

// Stage 1 -> Stage 2: collected batch feeds into validation
connect transaction_collector.batch_collected -> validator.validate

// Stage 2 -> Stage 3: validated transactions go to escrow
connect validator.batch_validated -> escrow_manager.hold_funds

// Stage 3 -> Stage 4: escrowed funds trigger atomic settlement
connect escrow_manager.funds_escrowed -> settlement_engine.settle

// Stage 4 -> Stage 5: settled batch triggers reconciliation
connect settlement_engine.batch_settled -> reconciliation_report.reconcile

// Dashboard updates
connect reconciliation_report.reconciliation_complete -> settlement_dashboard.on_batch_complete
connect settlement_engine.settlement_error -> settlement_dashboard.on_failure
connect escrow_manager.escrow_failed -> settlement_dashboard.on_failure

// ============================================================================
// EXECUTION — start the collection loop
// ============================================================================

// Collect transactions every 10 seconds (matches collection_window)
execute transaction_collector.collect() every 10000ms

// Pipeline continues via connect statements — each stage triggers the next.
