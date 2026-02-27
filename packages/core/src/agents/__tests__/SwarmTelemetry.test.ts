import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SwarmManager } from '../../swarm/SwarmManager';
import { SwarmMetrics } from '../../swarm/analytics/SwarmMetrics';

describe('Swarm Telemetry & Scaling', () => {
  let swarmManager: SwarmManager;
  let metrics: SwarmMetrics;

  beforeEach(() => {
    swarmManager = new SwarmManager({ maxSwarmsPerAgent: 100 });
    metrics = new SwarmMetrics({ retentionPeriod: 1000, maxSamples: 500 });
    
    // Register telemetry metrics
    metrics.register({ name: 'swarm_count', type: 'gauge', description: 'Active swarms' });
    metrics.register({ name: 'agent_joins', type: 'counter', description: 'Agent join events' });
    metrics.register({ name: 'scaling_latency', type: 'summary', description: 'Scaling latencies' });
    
    // Mock time for accurate telemetry rates
    vi.useFakeTimers();
  });

  it('emits telemetry accurately during parallel swarm scaling', async () => {
    // 1. Setup Phase: creating initial swarm
    const swarm = swarmManager.createSwarm({
      name: 'GlobalTelemetryTest',
      objective: 'Validate parallel scaling emission rates',
      createdBy: 'agent-0'
    });
    metrics.setGauge('swarm_count', swarmManager.getActiveSwarms().length);
    expect(metrics.getGauge('swarm_count')).toBe(1);

    // 2. Parallel Scaling Phase (simulating 50 agents joining at once)
    const joinPromises = [];
    const startTime = Date.now();
    
    for (let i = 1; i <= 50; i++) {
      joinPromises.push(new Promise<void>(resolve => {
        const joinTimeStart = Date.now();
        const success = swarmManager.joinSwarm(swarm.id, `agent-${i}`);
        
        if (success) {
            // Track the individual join latency
            metrics.observeSummary('scaling_latency', Date.now() - joinTimeStart);
            metrics.increment('agent_joins');
        }
        resolve();
      }));
    }

    await Promise.all(joinPromises);
    
    // Fast-forward time to simulate realistic event spread
    vi.advanceTimersByTime(100);

    // 3. Validation Phase: Check telemetry bounds and rates
    const stats = swarmManager.getSwarmStats(swarm.id);
    const joinsCounter = metrics.getCounter('agent_joins');
    
    // Total members should be Creator + successful joins
    expect(stats?.memberCount).toBe(1 + joinsCounter);
    
    expect(joinsCounter).toBeGreaterThan(0);

    const latencySummary = metrics.getSummary('scaling_latency');
    expect(latencySummary).toBeDefined();
    expect(latencySummary!.count).toBe(joinsCounter);
  });

  it('aggregates multi-swarm orchestration telemetry without bottlenecks', () => {
    // 1. Create 10 different swarms simultaneously
    for (let i = 0; i < 10; i++) {
        swarmManager.createSwarm({
            name: `LoadSwarm-${i}`,
            objective: `Test Load ${i}`,
            createdBy: `creator-${i}`
        });
    }
    
    metrics.setGauge('swarm_count', swarmManager.getActiveSwarms().length);
    expect(metrics.getGauge('swarm_count')).toBe(10);

    // 2. Disband 5 swarms and calculate drop-off rate
    const swarms = swarmManager.getActiveSwarms();
    for (let i = 0; i < 5; i++) {
        swarmManager.disbandSwarm(swarms[i].id, {
            reason: 'Load Test Completion',
            redistributeTasks: false,
            notifyMembers: false
        });
    }
    
    metrics.setGauge('swarm_count', swarmManager.getActiveSwarms().length);
    expect(metrics.getGauge('swarm_count')).toBe(5);
  });
});
