/**
 * @fileoverview Economic Primitives - Runtime math and types for virtual economy self-regulation
 * @module @holoscript/std/economic
 *
 * Provides the mathematical building blocks for composable economic behaviors in HoloScript.
 * These primitives implement research-proven mechanisms from control theory, DeFi AMMs,
 * and progressive taxation -- adapted for spatial computing economies.
 *
 * References:
 * - P.030.01: Dual-Loop PID Economy Controller (Alter Aeon model)
 * - P.030.02: Bonding Curve Marketplace (DeFi AMM adaptation)
 * - P.030.03: Progressive Wealth Recycling (logarithmic tax + UBI)
 * - W.031: Faucet-Sink Ratio Is the Master Variable
 * - W.032: Dual-Loop Feedback Control Solves Long-Term Stability
 * - W.034: Wealth Tax > Income Tax for Virtual Gini Reduction
 * - W.035: Bonding Curves Provide Intrinsic Price Discovery
 *
 * @version 1.0.0
 * @category economic
 */

// =============================================================================
// CORE TYPES
// =============================================================================

/**
 * Represents an in-world currency amount. Always positive.
 * Uses number to stay compatible with HoloScript's numeric system.
 */
export type Currency = number;

/**
 * An agent identifier (player, NPC, or system account).
 */
export type AgentID = string;

/**
 * Result type for economic operations that can fail.
 */
export type EconomicResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: EconomicError };

/**
 * Economic error codes.
 */
export type EconomicError =
  | 'INSUFFICIENT_FUNDS'
  | 'UNAUTHORIZED'
  | 'INVALID_AMOUNT'
  | 'BELOW_MINIMUM'
  | 'ABOVE_MAXIMUM'
  | 'ITEM_DESTROYED'
  | 'TRANSFER_BLOCKED'
  | 'CURVE_EXHAUSTED'
  | 'PID_DIVERGED'
  | 'TAX_EXEMPT'
  | 'INVALID_PARAMETER';

/**
 * RBAC permission categories needed for economic operations.
 * These map to the existing HoloScript RBAC system (RBACTrait.ts).
 */
export type EconomicPermission =
  | 'economy.trade'        // Transfer items/currency between agents
  | 'economy.mint'         // Create new currency (faucet operation)
  | 'economy.burn'         // Destroy currency (sink operation)
  | 'economy.set_price'    // Modify prices on bonding curves
  | 'economy.tax'          // Levy and collect taxes
  | 'economy.redistribute' // Distribute collected tax proceeds
  | 'economy.tune_pid'     // Modify PID controller parameters
  | 'economy.audit'        // View economic state and logs
  | 'economy.*';           // Full economic authority

// =============================================================================
// TRADEABLE PRIMITIVES
// =============================================================================

/**
 * Ownership record for a tradeable entity.
 */
export interface OwnershipRecord {
  /** Current owner */
  owner: AgentID;
  /** Transfer history (most recent first, capped at last 50) */
  history: TransferRecord[];
  /** Whether transfers are currently locked */
  locked: boolean;
  /** Optional lock reason */
  lockReason?: string;
}

/**
 * A single transfer event in the ownership history.
 */
export interface TransferRecord {
  from: AgentID;
  to: AgentID;
  price: Currency;
  timestamp: number;
  /** Transaction hash for integrity verification (P.030.04) */
  txHash: string;
}

/**
 * Generate a transaction hash from transfer details.
 * Uses a simple deterministic hash for in-engine verification.
 * NOT cryptographically secure -- server authority provides integrity (W.037).
 */
export function generateTxHash(
  from: AgentID,
  to: AgentID,
  price: Currency,
  timestamp: number
): string {
  // Simple FNV-1a style hash for fast deterministic ID generation
  let hash = 2166136261;
  const input = `${from}:${to}:${price}:${timestamp}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Execute a trade (transfer ownership for a price).
 * Returns a new OwnershipRecord if successful.
 */
export function executeTrade(
  record: OwnershipRecord,
  buyer: AgentID,
  price: Currency,
  timestamp: number
): EconomicResult<OwnershipRecord> {
  if (record.locked) {
    return { ok: false, error: 'TRANSFER_BLOCKED' };
  }
  if (price < 0) {
    return { ok: false, error: 'INVALID_AMOUNT' };
  }

  const txHash = generateTxHash(record.owner, buyer, price, timestamp);

  const transfer: TransferRecord = {
    from: record.owner,
    to: buyer,
    price,
    timestamp,
    txHash,
  };

  // Keep history capped at 50 entries
  const history = [transfer, ...record.history].slice(0, 50);

  return {
    ok: true,
    value: {
      owner: buyer,
      history,
      locked: false,
    },
  };
}

// =============================================================================
// DEPRECIATION PRIMITIVES
// =============================================================================

/**
 * Configuration for asset depreciation (hard sink mechanic).
 */
export interface DepreciationConfig {
  /** Per-second decay rate (0.0 - 1.0). E.g., 0.001 = 0.1% per second */
  decayRate: number;
  /** Current condition (0.0 = destroyed, 1.0 = mint condition) */
  condition: number;
  /** Minimum condition before the item is considered destroyed */
  destroyThreshold: number;
  /** Whether repairs are allowed */
  repairable: boolean;
  /** Cost multiplier for repairs (relative to original value) */
  repairCostMultiplier: number;
}

/**
 * Default depreciation configuration.
 */
export const DEFAULT_DEPRECIATION: DepreciationConfig = {
  decayRate: 0.0001,         // 0.01% per second (~36% per hour)
  condition: 1.0,
  destroyThreshold: 0.01,
  repairable: true,
  repairCostMultiplier: 0.5,
};

/**
 * Calculate the current condition of an asset after elapsed time.
 * Uses exponential decay: condition(t) = condition(0) * e^(-rate * elapsed)
 */
export function calculateDepreciation(
  initialCondition: number,
  decayRate: number,
  elapsedSeconds: number
): number {
  if (decayRate <= 0) return initialCondition;
  if (elapsedSeconds <= 0) return initialCondition;
  return initialCondition * Math.exp(-decayRate * elapsedSeconds);
}

/**
 * Calculate the effective value of an asset based on condition.
 * Value scales linearly with condition.
 */
export function depreciatedValue(baseValue: Currency, condition: number): Currency {
  return baseValue * Math.max(0, Math.min(1, condition));
}

/**
 * Check if an asset has been destroyed by depreciation.
 */
export function isDestroyed(condition: number, threshold: number): boolean {
  return condition <= threshold;
}

/**
 * Calculate repair cost to restore an asset to full condition.
 */
export function calculateRepairCost(
  baseValue: Currency,
  currentCondition: number,
  repairCostMultiplier: number
): Currency {
  const conditionDeficit = 1.0 - Math.max(0, Math.min(1, currentCondition));
  return baseValue * conditionDeficit * repairCostMultiplier;
}

// =============================================================================
// BONDING CURVE PRIMITIVES
// =============================================================================

/**
 * Bonding curve types with different economic properties.
 *
 * - linear: P = R * S (gentle, predictable)
 * - exponential: P = R * S^n (early-adopter reward)
 * - logarithmic: P = R * ln(S + 1) (stability-favoring)
 * - sigmoid: P = R * S^n / (K^n + S^n) (bounded with plateau)
 */
export type BondingCurveType = 'linear' | 'exponential' | 'logarithmic' | 'sigmoid';

/**
 * Configuration for a bonding curve marketplace.
 */
export interface BondingCurveConfig {
  /** Curve type */
  curveType: BondingCurveType;
  /** Reserve ratio (base price multiplier) */
  reserveRatio: number;
  /** Curve steepness (n in P = R * S^(1/n)) */
  curveSteepness: number;
  /** Current supply */
  currentSupply: number;
  /** Reserve pool balance (collateral backing the curve) */
  reserveBalance: Currency;
  /** Transaction fee percentage (hard sink, 0-1) */
  transactionFee: number;
  /** Half-saturation constant for sigmoid curves */
  sigmoidK: number;
  /** Optional spatial distance factor for VR marketplaces */
  spatialDistanceFactor: number;
}

/**
 * Default bonding curve configuration.
 */
export const DEFAULT_BONDING_CURVE: BondingCurveConfig = {
  curveType: 'exponential',
  reserveRatio: 1.0,
  curveSteepness: 2.0,
  currentSupply: 0,
  reserveBalance: 0,
  transactionFee: 0.02, // 2% hard sink
  sigmoidK: 100,
  spatialDistanceFactor: 0.0,
};

/**
 * Calculate the spot price on a bonding curve given current supply.
 *
 * P = R * S^(1/n)  for exponential
 * P = R * S        for linear
 * P = R * ln(S+1)  for logarithmic
 * P = R * S^n / (K^n + S^n)  for sigmoid
 */
export function bondingCurvePrice(
  supply: number,
  reserveRatio: number,
  curveSteepness: number,
  curveType: BondingCurveType = 'exponential',
  sigmoidK: number = 100
): Currency {
  if (supply <= 0) return 0;
  if (reserveRatio <= 0) return 0;

  switch (curveType) {
    case 'linear':
      return reserveRatio * supply;

    case 'exponential':
      return reserveRatio * Math.pow(supply, 1.0 / curveSteepness);

    case 'logarithmic':
      return reserveRatio * Math.log(supply + 1);

    case 'sigmoid': {
      const sn = Math.pow(supply, curveSteepness);
      const kn = Math.pow(sigmoidK, curveSteepness);
      return reserveRatio * (sn / (kn + sn));
    }

    default:
      return reserveRatio * Math.pow(supply, 1.0 / curveSteepness);
  }
}

/**
 * Calculate the cost to buy `amount` tokens on the bonding curve.
 * Integrates the price function from currentSupply to currentSupply + amount.
 */
export function bondingCurveBuyCost(
  config: BondingCurveConfig,
  amount: number
): Currency {
  if (amount <= 0) return 0;

  // Numerical integration using Simpson's rule (good enough for game economies)
  const n = Math.max(10, Math.ceil(amount));
  const h = amount / n;
  let sum = 0;
  const s0 = config.currentSupply;

  for (let i = 0; i <= n; i++) {
    const s = s0 + i * h;
    const p = bondingCurvePrice(
      s, config.reserveRatio, config.curveSteepness, config.curveType, config.sigmoidK
    );

    if (i === 0 || i === n) {
      sum += p;
    } else if (i % 2 === 1) {
      sum += 4 * p;
    } else {
      sum += 2 * p;
    }
  }

  const cost = (h / 3) * sum;
  return cost * (1 + config.transactionFee); // Include fee
}

/**
 * Calculate the refund for selling `amount` tokens on the bonding curve.
 */
export function bondingCurveSellRefund(
  config: BondingCurveConfig,
  amount: number
): Currency {
  if (amount <= 0) return 0;
  if (amount > config.currentSupply) return 0;

  const n = Math.max(10, Math.ceil(amount));
  const h = amount / n;
  let sum = 0;
  const s0 = config.currentSupply - amount;

  for (let i = 0; i <= n; i++) {
    const s = s0 + i * h;
    const p = bondingCurvePrice(
      s, config.reserveRatio, config.curveSteepness, config.curveType, config.sigmoidK
    );

    if (i === 0 || i === n) {
      sum += p;
    } else if (i % 2 === 1) {
      sum += 4 * p;
    } else {
      sum += 2 * p;
    }
  }

  const refund = (h / 3) * sum;
  return refund * (1 - config.transactionFee); // Deduct fee
}

/**
 * Apply spatial distance factor to a bonding curve price.
 * P_spatial = P_bonding * (1 + distance_factor * distance)
 * Creates emergent trade routes in VR economies (P.030.02 ENRICHED).
 */
export function spatialPrice(
  basePrice: Currency,
  distanceToHub: number,
  distanceFactor: number
): Currency {
  if (distanceFactor <= 0 || distanceToHub <= 0) return basePrice;
  return basePrice * (1 + distanceFactor * distanceToHub);
}

// =============================================================================
// TAXABLE WEALTH PRIMITIVES
// =============================================================================

/**
 * Configuration for progressive wealth taxation.
 */
export interface WealthTaxConfig {
  /** Wealth threshold below which no tax is levied */
  threshold: Currency;
  /** Base tax rate (multiplied by log of excess wealth) */
  baseRate: number;
  /** Maximum effective tax rate cap (prevents punishing engagement) */
  maxEffectiveRate: number;
  /** Tax collection interval description */
  collectionInterval: 'hourly' | 'daily' | 'weekly';
  /** Whether to redistribute to lowest quintile */
  enableRedistribution: boolean;
  /** Fraction of collected tax that goes to redistribution (remainder is burned as hard sink) */
  redistributionFraction: number;
}

/**
 * Default wealth tax configuration.
 */
export const DEFAULT_WEALTH_TAX: WealthTaxConfig = {
  threshold: 10000,
  baseRate: 0.01,           // 1% base
  maxEffectiveRate: 0.05,   // 5% cap
  collectionInterval: 'daily',
  enableRedistribution: true,
  redistributionFraction: 0.7, // 70% redistributed, 30% burned as hard sink
};

/**
 * Calculate the effective tax rate for a given wealth level.
 * Uses logarithmic scaling: rate = min(maxRate, log(wealth/threshold) * baseRate)
 * Returns 0 if wealth is below threshold (W.034).
 */
export function calculateTaxRate(
  wealth: Currency,
  threshold: Currency,
  baseRate: number,
  maxEffectiveRate: number
): number {
  if (wealth <= threshold) return 0;
  if (threshold <= 0) return 0;

  const rate = Math.log(wealth / threshold) * baseRate;
  return Math.min(rate, maxEffectiveRate);
}

/**
 * Calculate the tax amount owed for a given wealth level.
 */
export function calculateTaxAmount(
  wealth: Currency,
  config: WealthTaxConfig
): Currency {
  const rate = calculateTaxRate(
    wealth,
    config.threshold,
    config.baseRate,
    config.maxEffectiveRate
  );
  return wealth * rate;
}

/**
 * Calculate redistribution amounts from a tax pool.
 * Returns the per-recipient amount and the amount burned as a hard sink.
 */
export function calculateRedistribution(
  totalTaxCollected: Currency,
  recipientCount: number,
  redistributionFraction: number
): { perRecipient: Currency; burned: Currency } {
  if (recipientCount <= 0 || totalTaxCollected <= 0) {
    return { perRecipient: 0, burned: totalTaxCollected };
  }

  const redistributed = totalTaxCollected * redistributionFraction;
  const burned = totalTaxCollected - redistributed;
  const perRecipient = redistributed / recipientCount;

  return { perRecipient, burned };
}

// =============================================================================
// PID CONTROLLER PRIMITIVES
// =============================================================================

/**
 * Configuration for a PID controller (P.030.01).
 */
export interface PIDConfig {
  /** Proportional gain */
  kp: number;
  /** Integral gain */
  ki: number;
  /** Derivative gain */
  kd: number;
  /** Target setpoint (e.g., target money supply) */
  setpoint: number;
  /** Output limits [min, max] */
  outputMin: number;
  outputMax: number;
  /** Anti-windup integral limit */
  integralLimit: number;
}

/**
 * Internal state of a PID controller.
 */
export interface PIDState {
  /** Previous error (for derivative term) */
  previousError: number;
  /** Accumulated integral */
  integral: number;
  /** Last output value */
  lastOutput: number;
  /** Whether the controller has ever been updated */
  initialized: boolean;
}

/**
 * Default PID configuration for economy flow control.
 */
export const DEFAULT_PID: PIDConfig = {
  kp: 0.5,
  ki: 0.01,
  kd: 0.1,
  setpoint: 0,
  outputMin: -1.0,
  outputMax: 1.0,
  integralLimit: 10.0,
};

/**
 * Create initial PID state.
 */
export function createPIDState(): PIDState {
  return {
    previousError: 0,
    integral: 0,
    lastOutput: 0,
    initialized: false,
  };
}

/**
 * Update the PID controller with a new measurement.
 *
 * Returns the control output (e.g., faucet rate multiplier).
 * Positive output means increase faucet rate, negative means decrease.
 *
 * @param config PID configuration
 * @param state Current PID state (mutated in place for performance)
 * @param measurement Current measured value (e.g., total money supply)
 * @param dt Time delta in seconds
 * @returns The control output value
 */
export function updatePID(
  config: PIDConfig,
  state: PIDState,
  measurement: number,
  dt: number
): number {
  if (dt <= 0) return state.lastOutput;

  const error = config.setpoint - measurement;

  // Proportional term
  const p = config.kp * error;

  // Integral term with anti-windup
  state.integral += error * dt;
  state.integral = Math.max(
    -config.integralLimit,
    Math.min(config.integralLimit, state.integral)
  );
  const i = config.ki * state.integral;

  // Derivative term (skip on first update to avoid spike)
  let d = 0;
  if (state.initialized) {
    d = config.kd * ((error - state.previousError) / dt);
  }

  // Compute output with clamping
  let output = p + i + d;
  output = Math.max(config.outputMin, Math.min(config.outputMax, output));

  // Update state
  state.previousError = error;
  state.lastOutput = output;
  state.initialized = true;

  return output;
}

/**
 * Dual-loop PID controller configuration (P.030.01).
 *
 * Inner loop: Per-source faucet adjustment (fast response)
 * Outer loop: Global money supply targeting (slow response, adjusts inner setpoint)
 */
export interface DualLoopPIDConfig {
  /** Inner loop PID (fast: adjusts faucet rates) */
  innerLoop: PIDConfig;
  /** Outer loop PID (slow: adjusts inner loop setpoint based on total supply) */
  outerLoop: PIDConfig;
  /** Target total money supply */
  targetMoneySupply: number;
  /** Active player count (for per-capita targeting) */
  activePlayerCount: number;
  /** Per-capita money supply target */
  perCapitaTarget: number;
}

/**
 * State for the dual-loop PID controller.
 */
export interface DualLoopPIDState {
  innerState: PIDState;
  outerState: PIDState;
  /** Current effective faucet rate multiplier (0.0 - 2.0, where 1.0 = normal) */
  faucetMultiplier: number;
}

/**
 * Create initial dual-loop PID state.
 */
export function createDualLoopPIDState(): DualLoopPIDState {
  return {
    innerState: createPIDState(),
    outerState: createPIDState(),
    faucetMultiplier: 1.0,
  };
}

/**
 * Update the dual-loop PID controller.
 *
 * @param config Dual-loop configuration
 * @param state Current state (mutated in place)
 * @param totalMoneySupply Current total money supply
 * @param currentFaucetRate Current inflow rate
 * @param dt Time delta in seconds
 * @returns The new faucet rate multiplier
 */
export function updateDualLoopPID(
  config: DualLoopPIDConfig,
  state: DualLoopPIDState,
  totalMoneySupply: number,
  currentFaucetRate: number,
  dt: number
): number {
  // Outer loop: adjust target based on total money supply vs. target
  const targetSupply = config.perCapitaTarget * config.activePlayerCount;
  const outerConfig = { ...config.outerLoop, setpoint: targetSupply };
  const outerOutput = updatePID(outerConfig, state.outerState, totalMoneySupply, dt);

  // Outer output adjusts inner loop setpoint (desired faucet rate)
  const desiredFaucetRate = currentFaucetRate * (1 + outerOutput * 0.1);

  // Inner loop: adjust faucet multiplier to achieve desired rate
  const innerConfig = { ...config.innerLoop, setpoint: desiredFaucetRate };
  const innerOutput = updatePID(innerConfig, state.innerState, currentFaucetRate, dt);

  // Convert inner output to faucet multiplier (0.0 - 2.0 range)
  state.faucetMultiplier = Math.max(0, Math.min(2, 1 + innerOutput));

  return state.faucetMultiplier;
}

// =============================================================================
// FAUCET-SINK TRACKING
// =============================================================================

/**
 * Tracks the faucet/sink ratio -- the master variable for economy health (W.031).
 */
export interface FaucetSinkMetrics {
  /** Total currency created in the current period */
  totalFaucet: Currency;
  /** Total currency destroyed in the current period */
  totalSink: Currency;
  /** Current faucet/sink ratio (target: ~1.0) */
  ratio: number;
  /** Velocity of money (transactions per unit per period) */
  velocity: number;
  /** Period start timestamp */
  periodStart: number;
  /** Historical ratio samples */
  ratioHistory: number[];
}

/**
 * Create initial faucet-sink metrics.
 */
export function createFaucetSinkMetrics(timestamp: number): FaucetSinkMetrics {
  return {
    totalFaucet: 0,
    totalSink: 0,
    ratio: 1.0,
    velocity: 0,
    periodStart: timestamp,
    ratioHistory: [],
  };
}

/**
 * Record a faucet event (currency creation).
 */
export function recordFaucet(metrics: FaucetSinkMetrics, amount: Currency): void {
  metrics.totalFaucet += amount;
  metrics.ratio = metrics.totalSink > 0
    ? metrics.totalFaucet / metrics.totalSink
    : metrics.totalFaucet > 0 ? Infinity : 1.0;
}

/**
 * Record a sink event (currency destruction).
 */
export function recordSink(metrics: FaucetSinkMetrics, amount: Currency): void {
  metrics.totalSink += amount;
  metrics.ratio = metrics.totalSink > 0
    ? metrics.totalFaucet / metrics.totalSink
    : metrics.totalFaucet > 0 ? Infinity : 1.0;
}

/**
 * Reset metrics for a new period, archiving the current ratio.
 */
export function resetMetricsPeriod(
  metrics: FaucetSinkMetrics,
  timestamp: number
): void {
  // Archive current ratio
  if (metrics.totalFaucet > 0 || metrics.totalSink > 0) {
    metrics.ratioHistory.push(metrics.ratio);
    // Keep last 100 periods
    if (metrics.ratioHistory.length > 100) {
      metrics.ratioHistory.shift();
    }
  }

  metrics.totalFaucet = 0;
  metrics.totalSink = 0;
  metrics.ratio = 1.0;
  metrics.velocity = 0;
  metrics.periodStart = timestamp;
}
