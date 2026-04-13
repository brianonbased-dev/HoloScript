import { MitosisSwarm, SwarmConfig } from '../MitosisSwarm';
import { describe, it, expect } from 'vitest';

describe('MitosisSwarm Algebraic Aggregation', () => {
  it('should use default "sum" aggregation (legacy behavior)', async () => {
    const config: SwarmConfig = {
      count: 3,
      template: 'test-agent',
      commanderId: 'root',
      agentFactory: (i) => ({ id: `agent_${i}` }),
    };

    const swarm = new MitosisSwarm(config);
    await swarm.spawn();

    swarm.reportSync('agent_0', { score: 10 });
    swarm.reportSync('agent_1', { score: 20 });
    swarm.reportSync('agent_2', { score: 30 });

    const report = swarm.aggregate();
    expect(report.aggregatedState.score).toBe(60); // 10 + 20 + 30
  });

  it('should use "tropical-min-plus" to find the minimum value', async () => {
    const config: SwarmConfig = {
      count: 3,
      template: 'test-agent',
      commanderId: 'root',
      aggregationStrategy: 'tropical-min-plus',
      agentFactory: (i) => ({ id: `agent_${i}` }),
    };

    const swarm = new MitosisSwarm(config);
    await swarm.spawn();

    swarm.reportSync('agent_0', { latency: 50 });
    swarm.reportSync('agent_1', { latency: 10 });
    swarm.reportSync('agent_2', { latency: 100 });

    const report = swarm.aggregate();
    expect(report.aggregatedState.latency).toBe(10); // min(50, 10, 100)
  });

  it('should use "tropical-max-plus" to find the maximum value', async () => {
    const config: SwarmConfig = {
      count: 3,
      template: 'test-agent',
      commanderId: 'root',
      aggregationStrategy: 'tropical-max-plus',
      agentFactory: (i) => ({ id: `agent_${i}` }),
    };

    const swarm = new MitosisSwarm(config);
    await swarm.spawn();

    swarm.reportSync('agent_0', { confidence: 0.5 });
    swarm.reportSync('agent_1', { confidence: 0.9 });
    swarm.reportSync('agent_2', { confidence: 0.2 });

    const report = swarm.aggregate();
    expect(report.aggregatedState.confidence).toBe(0.9); // max(0.5, 0.9, 0.2)
  });
});
