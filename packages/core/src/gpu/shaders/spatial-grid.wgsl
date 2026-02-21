/**
 * WebGPU Compute Shader - Spatial Hash Grid
 *
 * Implements a spatial hash grid for efficient O(N) particle-particle collision detection.
 *
 * Algorithm:
 * 1. Pass 1 (grid-build): Hash particles into grid cells
 * 2. Pass 2 (grid-sort): Sort particles by cell ID (optional, for cache coherency)
 * 3. Pass 3 (collision): Check collisions only within neighboring cells
 *
 * This replaces the O(N²) naive collision check with O(N) spatial partitioning.
 */

// =============================================================================
// Uniforms
// =============================================================================

struct GridUniforms {
  cellSize: f32,           // Size of each grid cell (2× max particle radius)
  gridDimX: u32,           // Grid dimensions X
  gridDimY: u32,           // Grid dimensions Y
  gridDimZ: u32,           // Grid dimensions Z
  particleCount: u32,      // Total particle count
  maxParticlesPerCell: u32, // Max particles per cell (for array sizing)
  _pad1: u32,
  _pad2: u32,
};

@group(0) @binding(0) var<uniform> gridUniforms: GridUniforms;

// =============================================================================
// Storage Buffers
// =============================================================================

// Particle data (from main physics simulation)
@group(0) @binding(1) var<storage, read> positions: array<vec4<f32>>;  // xyz = pos, w = radius
@group(0) @binding(2) var<storage, read> velocities: array<vec4<f32>>; // xyz = vel, w = mass

// Grid data structures
@group(0) @binding(3) var<storage, read_write> gridCellStart: array<atomic<u32>>;  // Start index of particles in cell
@group(0) @binding(4) var<storage, read_write> gridCellEnd: array<atomic<u32>>;    // End index of particles in cell
@group(0) @binding(5) var<storage, read_write> gridParticleIndices: array<u32>;   // Particle index sorted by cell

// Collision output (forces to apply)
@group(0) @binding(6) var<storage, read_write> collisionForces: array<vec4<f32>>; // xyz = force, w = collision count

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Hash 3D position to grid cell index
 */
fn hashPosition(pos: vec3<f32>) -> u32 {
  // Clamp position to grid bounds
  let gridMin = vec3<f32>(0.0, 0.0, 0.0);
  let gridMax = vec3<f32>(
    f32(gridUniforms.gridDimX) * gridUniforms.cellSize,
    f32(gridUniforms.gridDimY) * gridUniforms.cellSize,
    f32(gridUniforms.gridDimZ) * gridUniforms.cellSize
  );

  let clampedPos = clamp(pos, gridMin, gridMax - vec3<f32>(0.001));

  // Convert to grid coordinates
  let gridX = u32(clampedPos.x / gridUniforms.cellSize);
  let gridY = u32(clampedPos.y / gridUniforms.cellSize);
  let gridZ = u32(clampedPos.z / gridUniforms.cellSize);

  // Flatten to 1D index
  return gridX + gridY * gridUniforms.gridDimX + gridZ * gridUniforms.gridDimX * gridUniforms.gridDimY;
}

/**
 * Convert cell index back to 3D grid coordinates
 */
fn cellIndexToGrid(cellIdx: u32) -> vec3<u32> {
  let gridSize = gridUniforms.gridDimX * gridUniforms.gridDimY;
  let z = cellIdx / gridSize;
  let rem = cellIdx % gridSize;
  let y = rem / gridUniforms.gridDimX;
  let x = rem % gridUniforms.gridDimX;
  return vec3<u32>(x, y, z);
}

/**
 * Get neighboring cell index (with bounds checking)
 * Returns cell index or 0xFFFFFFFF if out of bounds
 */
fn getNeighborCell(cellCoords: vec3<u32>, offsetX: i32, offsetY: i32, offsetZ: i32) -> u32 {
  let newX = i32(cellCoords.x) + offsetX;
  let newY = i32(cellCoords.y) + offsetY;
  let newZ = i32(cellCoords.z) + offsetZ;

  // Bounds check
  if (newX < 0 || newX >= i32(gridUniforms.gridDimX) ||
      newY < 0 || newY >= i32(gridUniforms.gridDimY) ||
      newZ < 0 || newZ >= i32(gridUniforms.gridDimZ)) {
    return 0xFFFFFFFFu; // Invalid cell
  }

  // Convert back to 1D index
  return u32(newX) + u32(newY) * gridUniforms.gridDimX + u32(newZ) * gridUniforms.gridDimX * gridUniforms.gridDimY;
}

// =============================================================================
// Pass 1: Build Spatial Grid
// =============================================================================

/**
 * Pass 1: Build spatial grid by hashing particle positions into cells
 *
 * Each particle writes its index to the appropriate grid cell.
 * Uses atomic operations to handle concurrent writes.
 */
@compute @workgroup_size(256)
fn gridBuild(@builtin(global_invocation_id) id: vec3<u32>) {
  let particleIdx = id.x;

  if (particleIdx >= gridUniforms.particleCount) {
    return;
  }

  // Get particle position
  let pos = positions[particleIdx].xyz;

  // Hash to grid cell
  let cellIdx = hashPosition(pos);

  // Atomically increment cell end counter and get insertion position
  let insertPos = atomicAdd(&gridCellEnd[cellIdx], 1u);

  // Write particle index to grid (if space available)
  if (insertPos < gridUniforms.maxParticlesPerCell) {
    let gridIdx = cellIdx * gridUniforms.maxParticlesPerCell + insertPos;
    gridParticleIndices[gridIdx] = particleIdx;
  }
}

// =============================================================================
// Pass 2: Clear Grid (run before Pass 1)
// =============================================================================

/**
 * Pass 2: Clear grid counters before building
 *
 * Resets gridCellStart and gridCellEnd to 0 for the next frame.
 */
@compute @workgroup_size(256)
fn gridClear(@builtin(global_invocation_id) id: vec3<u32>) {
  let cellIdx = id.x;
  let totalCells = gridUniforms.gridDimX * gridUniforms.gridDimY * gridUniforms.gridDimZ;

  if (cellIdx >= totalCells) {
    return;
  }

  atomicStore(&gridCellStart[cellIdx], 0u);
  atomicStore(&gridCellEnd[cellIdx], 0u);
}

// =============================================================================
// Pass 3: Collision Detection Using Grid
// =============================================================================

/**
 * Pass 3: Detect and resolve collisions using the spatial grid
 *
 * For each particle:
 * 1. Find its grid cell
 * 2. Check particles in the same cell + 26 neighboring cells
 * 3. Compute collision response forces
 */
@compute @workgroup_size(256)
fn gridCollision(@builtin(global_invocation_id) id: vec3<u32>) {
  let particleIdx = id.x;

  if (particleIdx >= gridUniforms.particleCount) {
    return;
  }

  // Get particle data
  let myPos = positions[particleIdx].xyz;
  let myRadius = positions[particleIdx].w;
  let myVel = velocities[particleIdx].xyz;
  let myMass = velocities[particleIdx].w;

  // Hash to grid cell
  let myCellIdx = hashPosition(myPos);
  let myCellCoords = cellIndexToGrid(myCellIdx);

  // Accumulate collision forces
  var totalForce = vec3<f32>(0.0, 0.0, 0.0);
  var collisionCount: u32 = 0u;

  // Check 27 cells (current + 26 neighbors)
  for (var dz: i32 = -1; dz <= 1; dz++) {
    for (var dy: i32 = -1; dy <= 1; dy++) {
      for (var dx: i32 = -1; dx <= 1; dx++) {
        let neighborCellIdx = getNeighborCell(myCellCoords, dx, dy, dz);

        // Skip invalid cells
        if (neighborCellIdx == 0xFFFFFFFFu) {
          continue;
        }

        // Get particle range in this cell
        let cellStart = atomicLoad(&gridCellStart[neighborCellIdx]);
        let cellEnd = atomicLoad(&gridCellEnd[neighborCellIdx]);

        // Check all particles in this cell
        for (var i = cellStart; i < cellEnd; i++) {
          let gridIdx = neighborCellIdx * gridUniforms.maxParticlesPerCell + i;

          // Bounds check
          if (gridIdx >= arrayLength(&gridParticleIndices)) {
            continue;
          }

          let otherIdx = gridParticleIndices[gridIdx];

          // Skip self-collision
          if (otherIdx == particleIdx) {
            continue;
          }

          // Get other particle data
          let otherPos = positions[otherIdx].xyz;
          let otherRadius = positions[otherIdx].w;
          let otherVel = velocities[otherIdx].xyz;
          let otherMass = velocities[otherIdx].w;

          // Check collision
          let delta = myPos - otherPos;
          let dist = length(delta);
          let minDist = myRadius + otherRadius;

          if (dist < minDist && dist > 0.0001) {
            // Collision detected!
            collisionCount++;

            // Normal vector
            let normal = delta / dist;

            // Relative velocity
            let relVel = myVel - otherVel;

            // Velocity along collision normal
            let velAlongNormal = dot(relVel, normal);

            // Only resolve if particles moving toward each other
            if (velAlongNormal < 0.0) {
              // Penetration depth
              let penetration = minDist - dist;

              // Compute impulse (simplified elastic collision)
              let restitution = 0.8; // Bounciness
              let impulse = -(1.0 + restitution) * velAlongNormal / (1.0 / myMass + 1.0 / otherMass);

              // Apply impulse as force
              let force = normal * impulse / myMass;

              // Add separation force (push apart)
              let separationForce = normal * penetration * 1000.0; // Stiffness

              totalForce += force + separationForce;
            }
          }
        }
      }
    }
  }

  // Write collision forces (to be applied in main physics pass)
  collisionForces[particleIdx] = vec4<f32>(totalForce, f32(collisionCount));
}

// =============================================================================
// Debug: Visualize Grid Occupancy
// =============================================================================

/**
 * Debug shader: Output grid occupancy for visualization
 */
@compute @workgroup_size(256)
fn gridDebug(@builtin(global_invocation_id) id: vec3<u32>) {
  let cellIdx = id.x;
  let totalCells = gridUniforms.gridDimX * gridUniforms.gridDimY * gridUniforms.gridDimZ;

  if (cellIdx >= totalCells) {
    return;
  }

  let cellStart = atomicLoad(&gridCellStart[cellIdx]);
  let cellEnd = atomicLoad(&gridCellEnd[cellIdx]);
  let occupancy = cellEnd - cellStart;

  // Occupancy stored in first element of collision forces for debug
  // (would normally be a separate debug buffer)
  if (cellIdx == 0u) {
    collisionForces[0] = vec4<f32>(f32(occupancy), 0.0, 0.0, 0.0);
  }
}
