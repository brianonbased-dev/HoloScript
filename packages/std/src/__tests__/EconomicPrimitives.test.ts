import { describe, it, expect } from 'vitest';
import {
  generateTxHash,
  executeTrade,
  calculateDepreciation,
  depreciatedValue,
  isDestroyed,
  calculateRepairCost,
  bondingCurvePrice,
  bondingCurveBuyCost,
  bondingCurveSellRefund,
  spatialPrice,
  calculateTaxRate,
  calculateTaxAmount,
  calculateRedistribution,
  createPIDState,
  updatePID,
  createDualLoopPIDState,
  updateDualLoopPID,
  createFaucetSinkMetrics,
  recordFaucet,
  recordSink,
  resetMetricsPeriod,
  DEFAULT_DEPRECIATION,
  DEFAULT_BONDING_CURVE,
  DEFAULT_WEALTH_TAX,
  DEFAULT_PID,
} from '../traits/EconomicPrimitives.js';
import type {
  OwnershipRecord,
  BondingCurveConfig,
  WealthTaxConfig,
  PIDConfig,
  DualLoopPIDConfig,
} from '../traits/EconomicPrimitives.js';

// =============================================================================
// TRADEABLE PRIMITIVES
// =============================================================================

describe('Tradeable Primitives', () => {
  describe('generateTxHash', () => {
    it('should produce deterministic hash from inputs', () => {
      const hash1 = generateTxHash('alice', 'bob', 100, 1000);
      const hash2 = generateTxHash('alice', 'bob', 100, 1000);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = generateTxHash('alice', 'bob', 100, 1000);
      const hash2 = generateTxHash('alice', 'carol', 100, 1000);
      const hash3 = generateTxHash('alice', 'bob', 200, 1000);
      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });

    it('should return an 8-character hex string', () => {
      const hash = generateTxHash('alice', 'bob', 100, 1000);
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe('executeTrade', () => {
    const baseRecord: OwnershipRecord = {
      owner: 'alice',
      history: [],
      locked: false,
    };

    it('should transfer ownership to buyer', () => {
      const result = executeTrade(baseRecord, 'bob', 100, Date.now());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.owner).toBe('bob');
      }
    });

    it('should add transfer record to history', () => {
      const result = executeTrade(baseRecord, 'bob', 100, 1000);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.history).toHaveLength(1);
        expect(result.value.history[0].from).toBe('alice');
        expect(result.value.history[0].to).toBe('bob');
        expect(result.value.history[0].price).toBe(100);
        expect(result.value.history[0].txHash).toBeDefined();
      }
    });

    it('should fail if record is locked', () => {
      const locked: OwnershipRecord = { ...baseRecord, locked: true };
      const result = executeTrade(locked, 'bob', 100, Date.now());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('TRANSFER_BLOCKED');
      }
    });

    it('should fail for negative price', () => {
      const result = executeTrade(baseRecord, 'bob', -10, Date.now());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('INVALID_AMOUNT');
      }
    });

    it('should cap history at 50 entries', () => {
      const longHistory: OwnershipRecord = {
        owner: 'alice',
        history: Array.from({ length: 55 }, (_, i) => ({
          from: `agent-${i}`,
          to: `agent-${i + 1}`,
          price: 10,
          timestamp: i,
          txHash: `hash-${i}`,
        })),
        locked: false,
      };
      const result = executeTrade(longHistory, 'bob', 100, Date.now());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.history.length).toBeLessThanOrEqual(50);
      }
    });

    it('should allow zero-price trade (gift)', () => {
      const result = executeTrade(baseRecord, 'bob', 0, Date.now());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.owner).toBe('bob');
        expect(result.value.history[0].price).toBe(0);
      }
    });
  });
});

// =============================================================================
// DEPRECIATION PRIMITIVES
// =============================================================================

describe('Depreciation Primitives', () => {
  describe('calculateDepreciation', () => {
    it('should return initial condition when no time has elapsed', () => {
      const result = calculateDepreciation(1.0, 0.001, 0);
      expect(result).toBe(1.0);
    });

    it('should decay over time with exponential curve', () => {
      const result = calculateDepreciation(1.0, 0.001, 100);
      expect(result).toBeLessThan(1.0);
      expect(result).toBeGreaterThan(0.0);
      // e^(-0.001 * 100) = e^(-0.1) ~ 0.9048
      expect(result).toBeCloseTo(0.9048, 3);
    });

    it('should return initial condition for zero decay rate', () => {
      const result = calculateDepreciation(1.0, 0, 1000);
      expect(result).toBe(1.0);
    });

    it('should approach zero for large elapsed time', () => {
      const result = calculateDepreciation(1.0, 0.01, 10000);
      expect(result).toBeCloseTo(0, 5);
    });

    it('should handle negative elapsed time by returning initial', () => {
      const result = calculateDepreciation(1.0, 0.001, -10);
      expect(result).toBe(1.0);
    });

    it('should scale proportionally with initial condition', () => {
      const full = calculateDepreciation(1.0, 0.001, 100);
      const half = calculateDepreciation(0.5, 0.001, 100);
      expect(half).toBeCloseTo(full * 0.5, 6);
    });
  });

  describe('depreciatedValue', () => {
    it('should return full value at condition 1.0', () => {
      expect(depreciatedValue(1000, 1.0)).toBe(1000);
    });

    it('should return zero value at condition 0.0', () => {
      expect(depreciatedValue(1000, 0.0)).toBe(0);
    });

    it('should return half value at condition 0.5', () => {
      expect(depreciatedValue(1000, 0.5)).toBe(500);
    });

    it('should clamp condition to [0, 1]', () => {
      expect(depreciatedValue(1000, 1.5)).toBe(1000);
      expect(depreciatedValue(1000, -0.5)).toBe(0);
    });
  });

  describe('isDestroyed', () => {
    it('should return true when condition is at threshold', () => {
      expect(isDestroyed(0.01, 0.01)).toBe(true);
    });

    it('should return true when condition is below threshold', () => {
      expect(isDestroyed(0.005, 0.01)).toBe(true);
    });

    it('should return false when condition is above threshold', () => {
      expect(isDestroyed(0.5, 0.01)).toBe(false);
    });
  });

  describe('calculateRepairCost', () => {
    it('should cost nothing to repair full condition item', () => {
      expect(calculateRepairCost(1000, 1.0, 0.5)).toBe(0);
    });

    it('should cost half of value to fully repair from 0 at 0.5 multiplier', () => {
      expect(calculateRepairCost(1000, 0.0, 0.5)).toBe(500);
    });

    it('should scale with condition deficit', () => {
      const cost = calculateRepairCost(1000, 0.5, 0.5);
      // deficit = 0.5, cost = 1000 * 0.5 * 0.5 = 250
      expect(cost).toBe(250);
    });
  });

  describe('DEFAULT_DEPRECIATION', () => {
    it('should have reasonable default values', () => {
      expect(DEFAULT_DEPRECIATION.decayRate).toBeGreaterThan(0);
      expect(DEFAULT_DEPRECIATION.condition).toBe(1.0);
      expect(DEFAULT_DEPRECIATION.destroyThreshold).toBeGreaterThan(0);
      expect(DEFAULT_DEPRECIATION.destroyThreshold).toBeLessThan(1);
      expect(DEFAULT_DEPRECIATION.repairable).toBe(true);
    });
  });
});

// =============================================================================
// BONDING CURVE PRIMITIVES
// =============================================================================

describe('Bonding Curve Primitives', () => {
  describe('bondingCurvePrice', () => {
    it('should return 0 for zero supply', () => {
      expect(bondingCurvePrice(0, 1.0, 2.0, 'exponential')).toBe(0);
    });

    it('should return 0 for zero reserve ratio', () => {
      expect(bondingCurvePrice(100, 0, 2.0, 'exponential')).toBe(0);
    });

    it('should increase price as supply increases (exponential)', () => {
      const p1 = bondingCurvePrice(10, 1.0, 2.0, 'exponential');
      const p2 = bondingCurvePrice(100, 1.0, 2.0, 'exponential');
      expect(p2).toBeGreaterThan(p1);
    });

    it('should scale linearly for linear curve', () => {
      const p1 = bondingCurvePrice(10, 1.0, 2.0, 'linear');
      const p2 = bondingCurvePrice(20, 1.0, 2.0, 'linear');
      expect(p2).toBeCloseTo(p1 * 2, 6);
    });

    it('should calculate exponential: P = R * S^(1/n)', () => {
      // R=1, S=100, n=2 -> P = 1 * 100^(1/2) = 10
      const price = bondingCurvePrice(100, 1.0, 2.0, 'exponential');
      expect(price).toBeCloseTo(10, 6);
    });

    it('should calculate logarithmic: P = R * ln(S+1)', () => {
      const price = bondingCurvePrice(100, 1.0, 2.0, 'logarithmic');
      expect(price).toBeCloseTo(Math.log(101), 6);
    });

    it('should calculate sigmoid with plateau', () => {
      const lowSupply = bondingCurvePrice(10, 1.0, 2.0, 'sigmoid', 100);
      const highSupply = bondingCurvePrice(1000, 1.0, 2.0, 'sigmoid', 100);
      // Sigmoid should plateau
      expect(highSupply).toBeGreaterThan(lowSupply);
      expect(highSupply).toBeLessThanOrEqual(1.0); // Bounded by R
    });

    it('should scale with reserve ratio', () => {
      const p1 = bondingCurvePrice(100, 1.0, 2.0, 'exponential');
      const p2 = bondingCurvePrice(100, 2.0, 2.0, 'exponential');
      expect(p2).toBeCloseTo(p1 * 2, 6);
    });
  });

  describe('bondingCurveBuyCost', () => {
    it('should return 0 for buying 0 amount', () => {
      expect(bondingCurveBuyCost(DEFAULT_BONDING_CURVE, 0)).toBe(0);
    });

    it('should increase with amount bought', () => {
      const config: BondingCurveConfig = {
        ...DEFAULT_BONDING_CURVE,
        reserveRatio: 1.0,
        currentSupply: 10,
      };
      const cost1 = bondingCurveBuyCost(config, 1);
      const cost10 = bondingCurveBuyCost(config, 10);
      expect(cost10).toBeGreaterThan(cost1);
    });

    it('should include transaction fee', () => {
      const noFee: BondingCurveConfig = {
        ...DEFAULT_BONDING_CURVE,
        reserveRatio: 1.0,
        currentSupply: 10,
        transactionFee: 0,
      };
      const withFee: BondingCurveConfig = {
        ...noFee,
        transactionFee: 0.02,
      };
      const costNoFee = bondingCurveBuyCost(noFee, 5);
      const costWithFee = bondingCurveBuyCost(withFee, 5);
      expect(costWithFee).toBeGreaterThan(costNoFee);
      expect(costWithFee).toBeCloseTo(costNoFee * 1.02, 1);
    });
  });

  describe('bondingCurveSellRefund', () => {
    it('should return 0 for selling 0 amount', () => {
      expect(bondingCurveSellRefund(DEFAULT_BONDING_CURVE, 0)).toBe(0);
    });

    it('should return 0 when selling more than supply', () => {
      const config: BondingCurveConfig = {
        ...DEFAULT_BONDING_CURVE,
        currentSupply: 5,
      };
      expect(bondingCurveSellRefund(config, 10)).toBe(0);
    });

    it('should return less than buy cost (spread from fees)', () => {
      const config: BondingCurveConfig = {
        ...DEFAULT_BONDING_CURVE,
        reserveRatio: 1.0,
        currentSupply: 100,
        transactionFee: 0.02,
      };
      const sellRefund = bondingCurveSellRefund(config, 10);
      // Same config but from supply=90 for buy comparison
      const buyConfig = { ...config, currentSupply: 90 };
      const buyCost = bondingCurveBuyCost(buyConfig, 10);
      expect(sellRefund).toBeLessThan(buyCost);
    });
  });

  describe('spatialPrice', () => {
    it('should return base price when distance factor is 0', () => {
      expect(spatialPrice(100, 50, 0)).toBe(100);
    });

    it('should return base price when distance is 0', () => {
      expect(spatialPrice(100, 0, 0.01)).toBe(100);
    });

    it('should increase price with distance', () => {
      const near = spatialPrice(100, 10, 0.01);
      const far = spatialPrice(100, 100, 0.01);
      expect(far).toBeGreaterThan(near);
    });

    it('should calculate: P_spatial = P_bonding * (1 + factor * distance)', () => {
      const result = spatialPrice(100, 50, 0.01);
      // 100 * (1 + 0.01 * 50) = 100 * 1.5 = 150
      expect(result).toBeCloseTo(150, 6);
    });
  });
});

// =============================================================================
// TAXABLE WEALTH PRIMITIVES
// =============================================================================

describe('Taxable Wealth Primitives', () => {
  describe('calculateTaxRate', () => {
    it('should return 0 for wealth below threshold', () => {
      expect(calculateTaxRate(5000, 10000, 0.01, 0.05)).toBe(0);
    });

    it('should return 0 for wealth equal to threshold', () => {
      expect(calculateTaxRate(10000, 10000, 0.01, 0.05)).toBe(0);
    });

    it('should return positive rate for wealth above threshold', () => {
      const rate = calculateTaxRate(20000, 10000, 0.01, 0.05);
      // log(20000/10000) * 0.01 = log(2) * 0.01 ~ 0.00693
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeCloseTo(Math.log(2) * 0.01, 4);
    });

    it('should cap at max effective rate', () => {
      const rate = calculateTaxRate(10000000, 100, 0.1, 0.05);
      expect(rate).toBe(0.05);
    });

    it('should handle zero threshold', () => {
      expect(calculateTaxRate(1000, 0, 0.01, 0.05)).toBe(0);
    });

    it('should increase with wealth (logarithmic, W.034)', () => {
      const r1 = calculateTaxRate(20000, 10000, 0.01, 0.05);
      const r2 = calculateTaxRate(100000, 10000, 0.01, 0.05);
      expect(r2).toBeGreaterThan(r1);
    });
  });

  describe('calculateTaxAmount', () => {
    it('should return 0 for wealth below threshold', () => {
      const amount = calculateTaxAmount(5000, DEFAULT_WEALTH_TAX);
      expect(amount).toBe(0);
    });

    it('should return positive amount for wealth above threshold', () => {
      const config: WealthTaxConfig = {
        ...DEFAULT_WEALTH_TAX,
        threshold: 10000,
        baseRate: 0.01,
      };
      const amount = calculateTaxAmount(50000, config);
      expect(amount).toBeGreaterThan(0);
    });
  });

  describe('calculateRedistribution', () => {
    it('should split tax between redistribution and burn', () => {
      const result = calculateRedistribution(1000, 10, 0.7);
      expect(result.perRecipient).toBeCloseTo(70, 6); // 700 / 10
      expect(result.burned).toBeCloseTo(300, 6);
    });

    it('should burn everything when no recipients', () => {
      const result = calculateRedistribution(1000, 0, 0.7);
      expect(result.perRecipient).toBe(0);
      expect(result.burned).toBe(1000);
    });

    it('should handle zero tax collected', () => {
      const result = calculateRedistribution(0, 10, 0.7);
      expect(result.perRecipient).toBe(0);
      expect(result.burned).toBe(0);
    });

    it('should burn all when redistribution fraction is 0', () => {
      const result = calculateRedistribution(1000, 10, 0);
      expect(result.perRecipient).toBe(0);
      expect(result.burned).toBe(1000);
    });

    it('should redistribute all when fraction is 1.0', () => {
      const result = calculateRedistribution(1000, 10, 1.0);
      expect(result.perRecipient).toBeCloseTo(100, 6);
      expect(result.burned).toBeCloseTo(0, 6);
    });
  });
});

// =============================================================================
// PID CONTROLLER PRIMITIVES
// =============================================================================

describe('PID Controller Primitives', () => {
  describe('createPIDState', () => {
    it('should initialize with zero state', () => {
      const state = createPIDState();
      expect(state.previousError).toBe(0);
      expect(state.integral).toBe(0);
      expect(state.lastOutput).toBe(0);
      expect(state.initialized).toBe(false);
    });
  });

  describe('updatePID', () => {
    const config: PIDConfig = {
      kp: 1.0,
      ki: 0.1,
      kd: 0.01,
      setpoint: 100,
      outputMin: -1.0,
      outputMax: 1.0,
      integralLimit: 10.0,
    };

    it('should produce positive output when measurement is below setpoint', () => {
      const state = createPIDState();
      const output = updatePID(config, state, 50, 1.0);
      expect(output).toBeGreaterThan(0);
    });

    it('should produce negative output when measurement is above setpoint', () => {
      const state = createPIDState();
      const output = updatePID(config, state, 150, 1.0);
      expect(output).toBeLessThan(0);
    });

    it('should produce zero output when measurement equals setpoint', () => {
      const state = createPIDState();
      const output = updatePID(config, state, 100, 1.0);
      expect(output).toBeCloseTo(0, 6);
    });

    it('should clamp output to [min, max]', () => {
      const state = createPIDState();
      const output = updatePID(config, state, 0, 1.0);
      expect(output).toBeLessThanOrEqual(config.outputMax);
      expect(output).toBeGreaterThanOrEqual(config.outputMin);
    });

    it('should return last output for dt <= 0', () => {
      const state = createPIDState();
      state.lastOutput = 0.5;
      const output = updatePID(config, state, 50, 0);
      expect(output).toBe(0.5);
    });

    it('should converge toward setpoint over iterations', () => {
      const state = createPIDState();
      let measurement = 50;
      const outputs: number[] = [];

      for (let i = 0; i < 20; i++) {
        const output = updatePID(config, state, measurement, 0.1);
        outputs.push(output);
        // Simulate system responding to control output
        measurement += output * 5;
      }

      // Measurement should approach setpoint
      expect(measurement).toBeGreaterThan(50);
    });

    it('should apply anti-windup to integral term', () => {
      const state = createPIDState();
      // Drive integral high by persistent error
      for (let i = 0; i < 1000; i++) {
        updatePID(config, state, 0, 1.0);
      }
      expect(Math.abs(state.integral)).toBeLessThanOrEqual(config.integralLimit);
    });
  });

  describe('Dual-Loop PID', () => {
    it('should create initial state with multiplier 1.0', () => {
      const state = createDualLoopPIDState();
      expect(state.faucetMultiplier).toBe(1.0);
    });

    it('should decrease faucet multiplier when supply is above target', () => {
      const config: DualLoopPIDConfig = {
        innerLoop: { ...DEFAULT_PID },
        outerLoop: { ...DEFAULT_PID, kp: 0.3, ki: 0.005, kd: 0.05 },
        targetMoneySupply: 100000,
        activePlayerCount: 100,
        perCapitaTarget: 1000,
      };
      const state = createDualLoopPIDState();

      // Supply is double the target
      const multiplier = updateDualLoopPID(config, state, 200000, 100, 1.0);
      // Should reduce faucet since there is too much money
      expect(multiplier).toBeLessThan(1.0);
    });

    it('should increase faucet multiplier when supply is below target', () => {
      const config: DualLoopPIDConfig = {
        innerLoop: { ...DEFAULT_PID },
        outerLoop: { ...DEFAULT_PID, kp: 0.3, ki: 0.005, kd: 0.05 },
        targetMoneySupply: 100000,
        activePlayerCount: 100,
        perCapitaTarget: 1000,
      };
      const state = createDualLoopPIDState();

      // Supply is half the target
      const multiplier = updateDualLoopPID(config, state, 50000, 100, 1.0);
      expect(multiplier).toBeGreaterThan(1.0);
    });

    it('should keep multiplier in [0, 2] range', () => {
      const config: DualLoopPIDConfig = {
        innerLoop: { ...DEFAULT_PID },
        outerLoop: { ...DEFAULT_PID },
        targetMoneySupply: 100000,
        activePlayerCount: 100,
        perCapitaTarget: 1000,
      };
      const state = createDualLoopPIDState();

      for (let i = 0; i < 100; i++) {
        const m = updateDualLoopPID(config, state, 0, 100, 1.0);
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThanOrEqual(2);
      }
    });
  });
});

// =============================================================================
// FAUCET-SINK TRACKING
// =============================================================================

describe('Faucet-Sink Metrics', () => {
  describe('createFaucetSinkMetrics', () => {
    it('should initialize with ratio 1.0', () => {
      const metrics = createFaucetSinkMetrics(1000);
      expect(metrics.ratio).toBe(1.0);
      expect(metrics.totalFaucet).toBe(0);
      expect(metrics.totalSink).toBe(0);
    });
  });

  describe('recordFaucet', () => {
    it('should accumulate faucet amount', () => {
      const metrics = createFaucetSinkMetrics(1000);
      recordFaucet(metrics, 100);
      expect(metrics.totalFaucet).toBe(100);
      recordFaucet(metrics, 50);
      expect(metrics.totalFaucet).toBe(150);
    });

    it('should update ratio when sinks exist', () => {
      const metrics = createFaucetSinkMetrics(1000);
      recordSink(metrics, 100);
      recordFaucet(metrics, 200);
      expect(metrics.ratio).toBeCloseTo(2.0, 6);
    });

    it('should set ratio to Infinity when no sinks', () => {
      const metrics = createFaucetSinkMetrics(1000);
      recordFaucet(metrics, 100);
      expect(metrics.ratio).toBe(Infinity);
    });
  });

  describe('recordSink', () => {
    it('should accumulate sink amount', () => {
      const metrics = createFaucetSinkMetrics(1000);
      recordSink(metrics, 50);
      expect(metrics.totalSink).toBe(50);
    });

    it('should update ratio correctly', () => {
      const metrics = createFaucetSinkMetrics(1000);
      recordFaucet(metrics, 100);
      recordSink(metrics, 100);
      expect(metrics.ratio).toBeCloseTo(1.0, 6);
    });
  });

  describe('resetMetricsPeriod', () => {
    it('should archive current ratio to history', () => {
      const metrics = createFaucetSinkMetrics(1000);
      recordFaucet(metrics, 200);
      recordSink(metrics, 100);
      resetMetricsPeriod(metrics, 2000);
      expect(metrics.ratioHistory).toHaveLength(1);
      expect(metrics.ratioHistory[0]).toBeCloseTo(2.0, 6);
    });

    it('should reset counters after period reset', () => {
      const metrics = createFaucetSinkMetrics(1000);
      recordFaucet(metrics, 200);
      recordSink(metrics, 100);
      resetMetricsPeriod(metrics, 2000);
      expect(metrics.totalFaucet).toBe(0);
      expect(metrics.totalSink).toBe(0);
      expect(metrics.ratio).toBe(1.0);
    });

    it('should cap history at 100 entries', () => {
      const metrics = createFaucetSinkMetrics(0);
      for (let i = 0; i < 110; i++) {
        recordFaucet(metrics, 100);
        recordSink(metrics, 50);
        resetMetricsPeriod(metrics, i + 1);
      }
      expect(metrics.ratioHistory.length).toBeLessThanOrEqual(100);
    });

    it('should not archive if no activity', () => {
      const metrics = createFaucetSinkMetrics(1000);
      resetMetricsPeriod(metrics, 2000);
      expect(metrics.ratioHistory).toHaveLength(0);
    });
  });
});
