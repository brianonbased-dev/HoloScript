/**
 * Example: Multi-Agent VR World Creation with 90fps Performance
 *
 * This example demonstrates how to use the three-layer spatial agent
 * communication stack to create a VR world with multiple specialized agents
 * working together while maintaining 90fps performance.
 */

import { SpatialCommClient, WorldSpec, TaskSpec } from '../index';

// ============================================================================
// AGENT ROLES
// ============================================================================

/**
 * Terrain Agent - Handles terrain generation and updates
 */
class TerrainAgent {
  private client: SpatialCommClient;

  constructor(agentId: string) {
    this.client = new SpatialCommClient(agentId);
  }

  async init(): Promise<void> {
    await this.client.init();

    // Register task handlers
    this.client.on('layer2:message', async (message) => {
      if (message.type === 'task_assignment' && message.task.task_type === 'terrain') {
        await this.handleTerrainTask(message.task);
      }
    });

    console.log('[TerrainAgent] Initialized');
  }

  async handleTerrainTask(task: TaskSpec): Promise<void> {
    console.log(`[TerrainAgent] Generating terrain for region:`, task.spatial_region);

    const startTime = performance.now();

    // Claim spatial region
    if (task.spatial_region) {
      await this.client.claimSpatialRegion(
        `terrain-${task.task_id}`,
        {
          min: [
            task.spatial_region.center[0] - task.spatial_region.size[0] / 2,
            task.spatial_region.center[1] - task.spatial_region.size[1] / 2,
            task.spatial_region.center[2] - task.spatial_region.size[2] / 2,
          ],
          max: [
            task.spatial_region.center[0] + task.spatial_region.size[0] / 2,
            task.spatial_region.center[1] + task.spatial_region.size[1] / 2,
            task.spatial_region.center[2] + task.spatial_region.size[2] / 2,
          ],
        },
        task.priority,
        30000 // 30 second claim
      );
    }

    // Simulate terrain generation with frame budget awareness
    for (let i = 0; i < 100; i++) {
      const frameStart = performance.now();

      // Do terrain work...
      await this.generateTerrainChunk(i);

      // Record frame time
      const frameTime = performance.now() - frameStart;
      this.client.recordFrameTime(frameTime);

      // Sync position every frame
      await this.client.syncPosition(
        [task.spatial_region?.center[0] || 0, 0, 0],
        [0, 0, 0, 1],
        [1, 1, 1]
      );

      // Send frame budget update every 10 frames
      if (i % 10 === 0) {
        await this.client.sendFrameBudget();
      }

      // Check if we're over budget
      const stats = this.client.getFrameBudgetStats();
      if (!stats.withinBudget) {
        console.warn('[TerrainAgent] Over budget, reducing quality to:', stats.qualityLevel);
      }
    }

    const duration = performance.now() - startTime;

    // Complete task
    await this.client.completeTask(task.task_id, true, {
      chunks_generated: 100,
      duration_ms: duration,
    });

    console.log(`[TerrainAgent] Task ${task.task_id} completed in ${duration}ms`);
  }

  private async generateTerrainChunk(index: number): Promise<void> {
    // Simulate work (adjust based on quality level)
    const stats = this.client.getFrameBudgetStats();
    const workAmount = {
      high: 10,
      medium: 5,
      low: 2,
      minimal: 1,
    }[stats.qualityLevel];

    await new Promise((resolve) => setTimeout(resolve, workAmount));
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}

/**
 * Asset Agent - Handles asset placement and management
 */
class AssetAgent {
  private client: SpatialCommClient;

  constructor(agentId: string) {
    this.client = new SpatialCommClient(agentId);
  }

  async init(): Promise<void> {
    await this.client.init();

    this.client.on('layer2:message', async (message) => {
      if (message.type === 'task_assignment' && message.task.task_type === 'assets') {
        await this.handleAssetTask(message.task);
      }
    });

    console.log('[AssetAgent] Initialized');
  }

  async handleAssetTask(task: TaskSpec): Promise<void> {
    console.log(`[AssetAgent] Placing assets in region:`, task.spatial_region);

    // Request resources
    await this.client.requestResource('mesh-library', 'mesh', undefined, 'high');
    await this.client.requestResource('texture-atlas', 'texture', undefined, 'high');

    // Simulate asset placement
    for (let i = 0; i < 50; i++) {
      const frameStart = performance.now();

      await this.placeAsset(i);

      const frameTime = performance.now() - frameStart;
      this.client.recordFrameTime(frameTime);

      // Sync position
      await this.client.syncPosition([i * 2, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
    }

    // Release resources
    await this.client.releaseResource('mesh-library');
    await this.client.releaseResource('texture-atlas');

    await this.client.completeTask(task.task_id, true, { assets_placed: 50 });

    console.log(`[AssetAgent] Task ${task.task_id} completed`);
  }

  private async placeAsset(index: number): Promise<void> {
    const stats = this.client.getFrameBudgetStats();
    const workAmount = {
      high: 8,
      medium: 4,
      low: 2,
      minimal: 1,
    }[stats.qualityLevel];

    await new Promise((resolve) => setTimeout(resolve, workAmount));
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}

/**
 * Orchestrator Agent - Coordinates all agents and manages world creation
 */
class OrchestratorAgent {
  private client: SpatialCommClient;
  private worldId?: string;

  constructor(agentId: string) {
    this.client = new SpatialCommClient(agentId);
  }

  async init(): Promise<void> {
    await this.client.init();

    // Listen for task completions
    this.client.on('layer2:message', (message) => {
      if (message.type === 'task_complete') {
        console.log(`[Orchestrator] Task completed:`, message.task_id);
      }
    });

    console.log('[Orchestrator] Initialized');
  }

  async createWorld(): Promise<void> {
    // Define world specification
    const worldSpec: WorldSpec = {
      name: 'Multi-Agent Test World',
      template: 'playground',
      dimensions: {
        width: 1000,
        height: 500,
        depth: 1000,
      },
      target_fps: 90,
      max_agents: 10,
      features: {
        terrain: true,
        physics: true,
        lighting: true,
        audio: true,
      },
      agent_roles: [
        {
          role: 'terrain',
          agent_type: 'terrain-generator',
          spatial_region: {
            center: [0, 0, 0],
            size: [1000, 100, 1000],
          },
        },
        {
          role: 'assets',
          agent_type: 'asset-placer',
          spatial_region: {
            center: [0, 50, 0],
            size: [1000, 100, 1000],
          },
        },
      ],
    };

    // Create world via Layer 3
    console.log('[Orchestrator] Creating world...');
    const result = await this.client.createWorld(worldSpec);
    this.worldId = result.world_id;

    console.log(`[Orchestrator] World created: ${this.worldId}`);

    // Assign tasks to agents
    await this.assignTasks();

    // Monitor progress
    await this.monitorProgress();
  }

  private async assignTasks(): Promise<void> {
    // Assign terrain task
    const terrainTask: TaskSpec = {
      task_id: 'terrain-001',
      task_type: 'terrain',
      priority: 'high',
      parameters: {
        algorithm: 'perlin_noise',
        resolution: 'high',
      },
      spatial_region: {
        center: [0, 0, 0],
        size: [1000, 100, 1000],
      },
      frame_budget_ms: 8, // 8ms budget per frame
    };

    console.log('[Orchestrator] Assigning terrain task...');
    await this.client.assignTask('terrain-agent-001', terrainTask);

    // Wait for terrain to complete before assets
    // (In production, would use dependency system)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Assign asset task
    const assetTask: TaskSpec = {
      task_id: 'assets-001',
      task_type: 'assets',
      priority: 'medium',
      parameters: {
        asset_types: ['trees', 'rocks', 'buildings'],
        density: 'medium',
      },
      spatial_region: {
        center: [0, 50, 0],
        size: [1000, 100, 1000],
      },
      frame_budget_ms: 6, // 6ms budget per frame
      dependencies: ['terrain-001'],
    };

    console.log('[Orchestrator] Assigning asset task...');
    await this.client.assignTask('asset-agent-001', assetTask);
  }

  private async monitorProgress(): Promise<void> {
    console.log('[Orchestrator] Monitoring world creation progress...');

    const interval = setInterval(async () => {
      // Get world status
      if (this.worldId) {
        const status = await this.client.getWorldStatus(this.worldId);
        console.log('[Orchestrator] World status:', {
          world: status.world_id,
          status: status.status,
          fps: status.performance.current_fps,
          agents: status.active_agents.length,
          conflicts: status.spatial_conflicts,
        });

        // Get performance metrics
        const metrics = await this.client.getPerformanceMetrics({ world_id: this.worldId });
        console.log('[Orchestrator] System metrics:', metrics.system);

        // Check if all agents done
        if (status.status === 'active' && status.active_agents.length === 0) {
          console.log('[Orchestrator] All agents completed, stopping monitor');
          clearInterval(interval);
        }
      }
    }, 1000); // Check every second

    // Stop after 30 seconds max
    setTimeout(() => {
      clearInterval(interval);
    }, 30000);
  }

  async exportWorld(format: 'gltf' | 'fbx' | 'usdz'): Promise<void> {
    if (!this.worldId) throw new Error('No world created');

    console.log(`[Orchestrator] Exporting world to ${format}...`);
    const result = await this.client.exportWorld(format);
    console.log(`[Orchestrator] World exported:`, result.url);
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}

// ============================================================================
// MAIN EXAMPLE
// ============================================================================

async function main() {
  console.log('='.repeat(80));
  console.log('Multi-Agent VR World Creation Example');
  console.log('Three-Layer Spatial Communication Stack (90fps target)');
  console.log('='.repeat(80));

  // Create agents
  const orchestrator = new OrchestratorAgent('orchestrator-001');
  const terrainAgent = new TerrainAgent('terrain-agent-001');
  const assetAgent = new AssetAgent('asset-agent-001');

  try {
    // Initialize all agents
    console.log('\n[STEP 1] Initializing agents...');
    await orchestrator.init();
    await terrainAgent.init();
    await assetAgent.init();

    // Create world and coordinate agents
    console.log('\n[STEP 2] Creating world and assigning tasks...');
    await orchestrator.createWorld();

    // Wait for completion
    console.log('\n[STEP 3] Waiting for agents to complete...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Export world
    console.log('\n[STEP 4] Exporting world...');
    await orchestrator.exportWorld('gltf');

    console.log('\n[SUCCESS] Multi-agent world creation completed!');
  } catch (error) {
    console.error('\n[ERROR]', error);
  } finally {
    // Cleanup
    console.log('\n[CLEANUP] Shutting down agents...');
    await orchestrator.shutdown();
    await terrainAgent.shutdown();
    await assetAgent.shutdown();
  }
}

// Run example
if (require.main === module) {
  main().catch(console.error);
}

export { OrchestratorAgent, TerrainAgent, AssetAgent };
