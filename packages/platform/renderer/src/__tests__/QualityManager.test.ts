import { describe, it, expect } from 'vitest';
import {
  QualityManager,
  DEFAULT_QUALITY_POLICY,
} from '../QualityManager';

describe('QualityManager', () => {
  it('starts in cool state with full budget', () => {
    const qm = new QualityManager();
    expect(qm.getCurrentState()).toBe('cool');
    expect(qm.getGaussianBudget()).toEqual(DEFAULT_QUALITY_POLICY.cool.gaussian);
    expect(qm.getLODPolicy().disabledFeatures).toEqual([]);
  });

  it('applies warm policy with reduced budget and disabled features', () => {
    const qm = new QualityManager();
    qm.applyThermalPolicy('warm');
    expect(qm.getCurrentState()).toBe('warm');
    expect(qm.getGaussianBudget().maxSplats).toBe(500_000);
    expect(qm.shouldShedFeature('reflections')).toBe(true);
    expect(qm.shouldShedFeature('shadows')).toBe(false);
  });

  it('applies hot policy with aggressive LOD and feature shedding', () => {
    const qm = new QualityManager();
    qm.applyThermalPolicy('hot');
    expect(qm.getCurrentState()).toBe('hot');
    expect(qm.getLODPolicy().biasDelta).toBe(0.5);
    expect(qm.getLODPolicy().maxLevelOverride).toBe(2);
    expect(qm.shouldShedFeature('shadows')).toBe(true);
    expect(qm.shouldShedFeature('postProcessing')).toBe(true);
  });

  it('applies critical policy with minimal budget and maximum shedding', () => {
    const qm = new QualityManager();
    qm.applyThermalPolicy('critical');
    expect(qm.getCurrentState()).toBe('critical');
    expect(qm.getGaussianBudget().maxSplats).toBe(10_000);
    expect(qm.getGaussianBudget().maxMemoryMB).toBe(64);
    expect(qm.getLODPolicy().biasDelta).toBe(1.0);
    expect(qm.getLODPolicy().maxLevelOverride).toBe(3);
    expect(qm.shouldShedFeature('ambientOcclusion')).toBe(true);
    expect(qm.shouldShedFeature('antiAliasing')).toBe(true);
  });

  it('returns immutable feature lists', () => {
    const qm = new QualityManager();
    qm.applyThermalPolicy('hot');
    const policy = qm.getLODPolicy();
    policy.disabledFeatures.push('shadows');
    const policy2 = qm.getLODPolicy();
    expect(policy2.disabledFeatures).toEqual(DEFAULT_QUALITY_POLICY.hot.disabledFeatures);
  });

  it('returns immutable Gaussian budget objects', () => {
    const qm = new QualityManager();
    const budget = qm.getGaussianBudget();
    budget.maxSplats = 999;
    expect(qm.getGaussianBudget().maxSplats).toBe(1_000_000);
  });

  it('computes effective budget ratio', () => {
    const qm = new QualityManager();
    expect(qm.getEffectiveBudgetRatio()).toBe(1);
    qm.applyThermalPolicy('critical');
    expect(qm.getEffectiveBudgetRatio()).toBe(10_000 / 1_000_000);
  });

  it('allows custom policy overrides', () => {
    const qm = new QualityManager({
      cool: { ...DEFAULT_QUALITY_POLICY.cool, gaussian: { maxSplats: 2_000_000, maxMemoryMB: 1024 } },
    });
    expect(qm.getGaussianBudget().maxSplats).toBe(2_000_000);
  });

  it('does not shed feature in cool state', () => {
    const qm = new QualityManager();
    expect(qm.shouldShedFeature('shadows')).toBe(false);
    expect(qm.shouldShedFeature('reflections')).toBe(false);
    expect(qm.shouldShedFeature('particles')).toBe(false);
    expect(qm.shouldShedFeature('postProcessing')).toBe(false);
    expect(qm.shouldShedFeature('ambientOcclusion')).toBe(false);
    expect(qm.shouldShedFeature('antiAliasing')).toBe(false);
  });
});
