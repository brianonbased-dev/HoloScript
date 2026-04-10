import { describe, it, expect, vi } from 'vitest';
import { MitosisSwarm, SwarmConfig } from './MitosisSwarm';

describe('MitosisSwarm execution pipeline', () => {
  function makeConfig(overrides?: Partial<SwarmConfig>): SwarmConfig {
    return {
      count: 2,
      template: 'Miner',
      commanderId: 'AlphaCommander',
      agentFactory: (i, commanderId) => ({
        id: `Miner_${i}`,
        parentId: commanderId,
        position: [i * 2 - 1, 0, 5] as [number, number, number],
        initialState: {
          target_resource: i === 0 ? 'Gold' : 'Iron',
        },
      }),
      timeoutMs: 5000,
      ...overrides,
    };
  }

  // --------------------------------------------------------------------------
  // Spawning
  // --------------------------------------------------------------------------

  it('should spawn agents with configurable count and behavior', async () => {
    const swarm = new MitosisSwarm(makeConfig({ count: 3 }));
    const spawnedIds = await swarm.spawn();

    expect(spawnedIds).toHaveLength(3);
    expect(spawnedIds).toEqual(['Miner_0', 'Miner_1', 'Miner_2']);
    expect(swarm.getAgentCount()).toBe(3);
    expect(swarm.getAgentStatus('Miner_0')).toBe('running');
    expect(swarm.getAgentStatus('Miner_1')).toBe('running');
    expect(swarm.getAgentStatus('Miner_2')).toBe('running');
  });

  it('should emit agent_spawned for each agent', async () => {
    const spawnSpy = vi.fn();
    const swarm = new MitosisSwarm(makeConfig());
    swarm.on('agent_spawned', spawnSpy);

    await swarm.spawn();

    expect(spawnSpy).toHaveBeenCalledTimes(2);
    expect(spawnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ childId: 'Miner_0', parentId: 'AlphaCommander' })
    );
    expect(spawnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ childId: 'Miner_1', parentId: 'AlphaCommander' })
    );
  });

  it('should prevent double-spawn', async () => {
    const swarm = new MitosisSwarm(makeConfig());
    await swarm.spawn();
    await expect(swarm.spawn()).rejects.toThrow('already running');
  });

  it('should prevent spawn after shutdown', async () => {
    const swarm = new MitosisSwarm(makeConfig());
    swarm.shutdown();
    await expect(swarm.spawn()).rejects.toThrow('Cannot spawn after shutdown');
  });

  // --------------------------------------------------------------------------
  // Sync reports
  // --------------------------------------------------------------------------

  it('should collect sync reports from agents', async () => {
    const swarm = new MitosisSwarm(makeConfig());
    await swarm.spawn();

    swarm.reportSync('Miner_0', { resource: 'Gold', quantity: 50 });
    swarm.reportSync('Miner_1', { resource: 'Iron', quantity: 50 });

    const reports = swarm.getSyncReports();
    expect(reports).toHaveLength(2);
    expect(reports[0].childId).toBe('Miner_0');
    expect(reports[0].result).toEqual({ resource: 'Gold', quantity: 50 });
    expect(reports[1].childId).toBe('Miner_1');
    expect(reports[1].result).toEqual({ resource: 'Iron', quantity: 50 });
  });

  it('should emit agent_synced for each report', async () => {
    const syncSpy = vi.fn();
    const swarm = new MitosisSwarm(makeConfig());
    swarm.on('agent_synced', syncSpy);
    await swarm.spawn();

    swarm.reportSync('Miner_0', { resource: 'Gold', quantity: 50 });
    swarm.reportSync('Miner_1', { resource: 'Iron', quantity: 50 });

    expect(syncSpy).toHaveBeenCalledTimes(2);
  });

  it('should mark agents as complete after sync', async () => {
    const swarm = new MitosisSwarm(makeConfig());
    await swarm.spawn();

    expect(swarm.getAgentStatus('Miner_0')).toBe('running');
    swarm.reportSync('Miner_0', { quantity: 50 });
    expect(swarm.getAgentStatus('Miner_0')).toBe('complete');
  });

  it('should ignore sync reports after shutdown', async () => {
    const swarm = new MitosisSwarm(makeConfig());
    await swarm.spawn();
    swarm.shutdown();

    // Should not throw, but should be ignored
    swarm.reportSync('Miner_0', { quantity: 50 });
    expect(swarm.getSyncReports()).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // Aggregation
  // --------------------------------------------------------------------------

  it('should aggregate numeric fields from all sync reports', async () => {
    const swarm = new MitosisSwarm(makeConfig());
    await swarm.spawn();

    swarm.reportSync('Miner_0', { quantity: 50, quality: 0.8 });
    swarm.reportSync('Miner_1', { quantity: 50, quality: 0.9 });

    const report = swarm.aggregate();
    expect(report.parentId).toBe('AlphaCommander');
    expect(report.totalReports).toBe(2);
    expect(report.aggregatedState.quantity).toBe(100);
    expect(report.aggregatedState.quality).toBeCloseTo(1.7);
  });

  it('should produce total_resources >= 100 in the demo scenario', async () => {
    const swarm = new MitosisSwarm(makeConfig());
    const spawnSpy = vi.fn();
    const syncSpy = vi.fn();

    swarm.on('agent_spawned', spawnSpy);
    swarm.on('agent_synced', syncSpy);

    await swarm.spawn();

    // Simulate the two miners completing their work
    swarm.reportSync('Miner_0', { resource: 'Gold', quantity: 50 });
    swarm.reportSync('Miner_1', { resource: 'Iron', quantity: 50 });

    expect(spawnSpy).toHaveBeenCalledTimes(2);
    expect(syncSpy).toHaveBeenCalledTimes(2);

    const aggregated = swarm.aggregate();
    expect(aggregated.aggregatedState.quantity).toBeGreaterThanOrEqual(100);
  });

  // --------------------------------------------------------------------------
  // Completion / waitForCompletion
  // --------------------------------------------------------------------------

  it('should detect when all agents are complete', async () => {
    const swarm = new MitosisSwarm(makeConfig());
    await swarm.spawn();

    expect(swarm.allComplete()).toBe(false);
    swarm.reportSync('Miner_0', { quantity: 50 });
    expect(swarm.allComplete()).toBe(false);
    swarm.reportSync('Miner_1', { quantity: 50 });
    expect(swarm.allComplete()).toBe(true);
  });

  it('should emit swarm_complete when all agents finish', async () => {
    const completeSpy = vi.fn();
    const swarm = new MitosisSwarm(makeConfig());
    swarm.on('swarm_complete', completeSpy);
    await swarm.spawn();

    swarm.reportSync('Miner_0', { quantity: 50 });
    expect(completeSpy).not.toHaveBeenCalled();
    swarm.reportSync('Miner_1', { quantity: 50 });
    expect(completeSpy).toHaveBeenCalledTimes(1);
  });

  it('should resolve waitForCompletion when all agents finish', async () => {
    const swarm = new MitosisSwarm(makeConfig());
    await swarm.spawn();

    // Report in next tick to simulate async work
    setTimeout(() => {
      swarm.reportSync('Miner_0', { quantity: 50 });
      swarm.reportSync('Miner_1', { quantity: 50 });
    }, 50);

    const report = await swarm.waitForCompletion();
    expect(report.totalReports).toBe(2);
    expect(report.aggregatedState.quantity).toBe(100);
  });

  it('should resolve waitForCompletion immediately if already complete', async () => {
    const swarm = new MitosisSwarm(makeConfig());
    await swarm.spawn();
    swarm.reportSync('Miner_0', { quantity: 50 });
    swarm.reportSync('Miner_1', { quantity: 50 });

    const report = await swarm.waitForCompletion();
    expect(report.totalReports).toBe(2);
  });

  // --------------------------------------------------------------------------
  // Failure handling
  // --------------------------------------------------------------------------

  it('should handle agent failures', async () => {
    const failSpy = vi.fn();
    const swarm = new MitosisSwarm(makeConfig());
    swarm.on('agent_failed', failSpy);
    await swarm.spawn();

    swarm.reportFailure('Miner_0', 'mining equipment broke');
    expect(swarm.getAgentStatus('Miner_0')).toBe('failed');
    expect(failSpy).toHaveBeenCalledWith(
      expect.objectContaining({ childId: 'Miner_0', error: 'mining equipment broke' })
    );
  });

  it('should count failed agents toward completion', async () => {
    const swarm = new MitosisSwarm(makeConfig());
    await swarm.spawn();

    swarm.reportFailure('Miner_0', 'error');
    swarm.reportSync('Miner_1', { quantity: 50 });
    expect(swarm.allComplete()).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Graceful shutdown
  // --------------------------------------------------------------------------

  it('should gracefully shut down and return final report', async () => {
    const shutdownSpy = vi.fn();
    const swarm = new MitosisSwarm(makeConfig());
    swarm.on('swarm_shutdown', shutdownSpy);
    await swarm.spawn();

    swarm.reportSync('Miner_0', { quantity: 50 });
    // Miner_1 still running when we shut down

    const report = swarm.shutdown();
    expect(swarm.getIsShutdown()).toBe(true);
    expect(swarm.getIsRunning()).toBe(false);
    expect(swarm.getAgentStatus('Miner_1')).toBe('failed'); // force-failed on shutdown
    expect(report.totalReports).toBe(1);
    expect(shutdownSpy).toHaveBeenCalledTimes(1);
  });

  it('should be idempotent on double shutdown', async () => {
    const swarm = new MitosisSwarm(makeConfig());
    await swarm.spawn();
    const r1 = swarm.shutdown();
    const r2 = swarm.shutdown();
    expect(r1.totalReports).toBe(r2.totalReports);
  });

  // --------------------------------------------------------------------------
  // Event system
  // --------------------------------------------------------------------------

  it('should support off() to remove handlers', async () => {
    const spy = vi.fn();
    const swarm = new MitosisSwarm(makeConfig());
    swarm.on('agent_spawned', spy);
    swarm.off('agent_spawned', spy);
    await swarm.spawn();
    expect(spy).not.toHaveBeenCalled();
  });

  it('should support off() without handler to remove all', async () => {
    const spy = vi.fn();
    const swarm = new MitosisSwarm(makeConfig());
    swarm.on('agent_spawned', spy);
    swarm.off('agent_spawned');
    await swarm.spawn();
    expect(spy).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  it('should return null status for unknown agents', () => {
    const swarm = new MitosisSwarm(makeConfig());
    expect(swarm.getAgentStatus('nonexistent')).toBeNull();
  });

  it('should report allComplete false when no agents spawned', () => {
    const swarm = new MitosisSwarm(makeConfig());
    expect(swarm.allComplete()).toBe(false);
  });

  it('should handle zero-count swarm', async () => {
    const swarm = new MitosisSwarm(makeConfig({ count: 0 }));
    const ids = await swarm.spawn();
    expect(ids).toHaveLength(0);
    expect(swarm.getAgentCount()).toBe(0);
  });

  it('should handle large swarm counts', async () => {
    const swarm = new MitosisSwarm(
      makeConfig({
        count: 100,
        agentFactory: (i, cmd) => ({
          id: `Worker_${i}`,
          parentId: cmd,
          initialState: { batch: Math.floor(i / 10) },
        }),
      })
    );

    const ids = await swarm.spawn();
    expect(ids).toHaveLength(100);

    // Report all
    for (let i = 0; i < 100; i++) {
      swarm.reportSync(`Worker_${i}`, { quantity: 1 });
    }

    const report = swarm.aggregate();
    expect(report.aggregatedState.quantity).toBe(100);
    expect(swarm.allComplete()).toBe(true);
  });
});
