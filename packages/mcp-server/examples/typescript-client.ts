/**
 * TypeScript MCP Client Example
 *
 * Demonstrates how to use HoloScript MCP Compiler Tools from TypeScript.
 */

import { MCPClient } from '@modelcontextprotocol/sdk/client';

// Initialize MCP client
const client = new MCPClient({
  serverUrl: 'http://localhost:8100',
  headers: {
    Authorization: 'Bearer YOUR_JWT_TOKEN',
    'X-Agent-ID': 'typescript-example-agent',
  },
});

// Example 1: Compile to Unity
async function compileToUnity() {
  const holoCode = `
    composition "VRRoom" {
      environment {
        skybox: "nebula"
        ambient_light: 0.4
      }

      object "table" @collidable @physics(mass: 10) {
        geometry: "box"
        position: [0, 0.5, 0]
        size: [2, 0.1, 1]
        color: "#8B4513"
      }

      object "sword" @grabbable @throwable {
        geometry: "model"
        model: "assets/sword.glb"
        position: [0, 1.2, 0]
        @physics(mass: 0.5)
      }
    }
  `;

  const result = await client.callTool('compile_to_unity', {
    code: holoCode,
    options: {
      namespace: 'MyVRGame',
      generatePrefabs: true,
    },
  });

  console.log('Unity Compilation Result:');
  console.log(`Success: ${result.success}`);
  console.log(`Job ID: ${result.jobId}`);
  console.log(`Compilation Time: ${result.metadata.compilationTimeMs}ms`);
  console.log('\nGenerated C# Code:\n', result.output);

  return result;
}

// Example 2: Compile to URDF for ROS 2
async function compileToURDF() {
  const holoCode = `
    composition "Robot" {
      object "base_link" @physics(mass: 5.0) {
        geometry: "box"
        size: [0.5, 0.3, 0.2]
        color: "#333333"
      }

      object "wheel_left" @physics(mass: 0.5) {
        geometry: "cylinder"
        radius: 0.15
        length: 0.05
        position: [-0.2, -0.15, 0.3]
      }

      object "wheel_right" @physics(mass: 0.5) {
        geometry: "cylinder"
        radius: 0.15
        length: 0.05
        position: [0.2, -0.15, 0.3]
      }
    }
  `;

  const result = await client.callTool('compile_to_urdf', {
    code: holoCode,
    options: {
      robotName: 'my_robot',
      includeInertial: true,
    },
  });

  console.log('URDF Compilation Result:');
  console.log(`Success: ${result.success}`);
  console.log('\nGenerated URDF:\n', result.output);

  return result;
}

// Example 3: Compile to React Three Fiber
async function compileToR3F() {
  const holoCode = `
    composition "InteractiveScene" {
      environment {
        skybox: "sunset"
      }

      object "cube" @hoverable @clickable {
        geometry: "cube"
        position: [0, 1, 0]
        color: "#FF6B6B"
        @state(hovered: false, clicked: false)
      }

      object "sphere" @grabbable {
        geometry: "sphere"
        position: [2, 1, 0]
        radius: 0.5
        color: "#4ECDC4"
      }
    }
  `;

  const result = await client.callTool('compile_to_r3f', {
    code: holoCode,
    options: {
      typescript: true,
      environmentPreset: 'sunset',
    },
  });

  console.log('R3F Compilation Result:');
  console.log(`Success: ${result.success}`);
  console.log('\nGenerated R3F Component:\n', result.output);

  return result;
}

// Example 4: Generic compilation with job tracking
async function compileWithTracking() {
  // Start compilation
  const compilePromise = client.callTool('compile_holoscript', {
    code: `composition "LargeScene" { /* ... large scene ... */ }`,
    target: 'webgpu',
    stream: false,
  });

  // Poll for status (in real app, use WebSocket streaming)
  const jobId = (await compilePromise).jobId;

  const checkStatus = async () => {
    const status = await client.callTool('get_compilation_status', { jobId });
    console.log(`Progress: ${status.progress}%`);

    if (status.status === 'completed') {
      console.log('Compilation complete!');
      console.log(status.result);
    } else if (status.status === 'failed') {
      console.error('Compilation failed:', status.result?.error);
    }
  };

  // Check status every 2 seconds
  const interval = setInterval(checkStatus, 2000);
  const result = await compilePromise;
  clearInterval(interval);

  return result;
}

// Example 5: List all available export targets
async function listTargets() {
  const result = await client.callTool('list_export_targets', {});

  console.log('Available Export Targets:');
  console.log(`Total: ${result.targets.length}`);
  console.log('\nCategories:');

  for (const [category, targets] of Object.entries(result.categories)) {
    console.log(`\n${category}:`);
    targets.forEach((target: string) => console.log(`  - ${target}`));
  }

  return result;
}

// Example 6: Check circuit breaker health
async function checkCircuitBreaker(target: string) {
  const result = await client.callTool('get_circuit_breaker_status', { target });

  console.log(`Circuit Breaker Status for ${target}:`);
  console.log(`State: ${result.state}`);
  console.log(`Success Rate: ${((result.successCount / result.totalRequests) * 100).toFixed(2)}%`);
  console.log(`Failure Rate: ${result.failureRate.toFixed(2)} failures/hour`);
  console.log(`Time in Degraded Mode: ${result.timeInDegradedMode}ms`);
  console.log(`Can Retry: ${result.canRetry}`);

  if (result.lastError) {
    console.log(`Last Error: ${result.lastError}`);
  }

  return result;
}

// Run examples
async function main() {
  console.log('=== HoloScript MCP Compiler Tools - TypeScript Examples ===\n');

  try {
    // Example 1: Unity
    console.log('\n--- Example 1: Compile to Unity ---');
    await compileToUnity();

    // Example 2: URDF
    console.log('\n--- Example 2: Compile to URDF ---');
    await compileToURDF();

    // Example 3: R3F
    console.log('\n--- Example 3: Compile to React Three Fiber ---');
    await compileToR3F();

    // Example 4: Job Tracking
    console.log('\n--- Example 4: Compile with Job Tracking ---');
    await compileWithTracking();

    // Example 5: List Targets
    console.log('\n--- Example 5: List Export Targets ---');
    await listTargets();

    // Example 6: Circuit Breaker
    console.log('\n--- Example 6: Check Circuit Breaker ---');
    await checkCircuitBreaker('unity');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Execute if run directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  compileToUnity,
  compileToURDF,
  compileToR3F,
  compileWithTracking,
  listTargets,
  checkCircuitBreaker,
};
