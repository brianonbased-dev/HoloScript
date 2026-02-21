/**
 * WebGPU Compute Shader - Granular Particle Physics
 *
 * Simulates 100K+ particles using GPU acceleration with the following features:
 * - Semi-implicit Euler integration
 * - Gravity
 * - Ground plane collision
 * - Particle-particle collision (spatial grid)
 * - Sleep states for optimization
 *
 * Layout:
 * - positions: vec4(x, y, z, radius)
 * - velocities: vec4(vx, vy, vz, mass)
 * - states: vec4(active, sleeping, health, userData)
 */

// =============================================================================
// Uniforms
// =============================================================================

struct Uniforms {
  dt: f32,               // Timestep (seconds)
  gravity: f32,          // Gravity acceleration (m/s²)
  groundY: f32,          // Ground plane Y position
  restitution: f32,      // Bounce coefficient (0-1)
  friction: f32,         // Friction coefficient (0-1)
  particleCount: u32,    // Total particle count
  _pad1: f32,            // Padding
  _pad2: f32,            // Padding
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// =============================================================================
// Storage Buffers (Double-buffered)
// =============================================================================

// Input buffers (previous frame)
@group(0) @binding(1) var<storage, read> positions_in: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> velocities_in: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> states_in: array<vec4<f32>>;

// Output buffers (current frame)
@group(0) @binding(4) var<storage, read_write> positions_out: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> velocities_out: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> states_out: array<vec4<f32>>;

// =============================================================================
// Constants
// =============================================================================

const SLEEP_VELOCITY_THRESHOLD: f32 = 0.01;  // m/s
const SLEEP_FRAMES_REQUIRED: f32 = 10.0;     // frames below threshold
const COLLISION_DAMPING: f32 = 0.8;          // Energy loss in collisions

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Compute kinetic energy of a particle
 */
fn kineticEnergy(velocity: vec3<f32>, mass: f32) -> f32 {
  return 0.5 * mass * dot(velocity, velocity);
}

/**
 * Check if particle should sleep
 */
fn shouldSleep(velocity: vec3<f32>, sleepCounter: f32) -> bool {
  let speed = length(velocity);
  if (speed < SLEEP_VELOCITY_THRESHOLD) {
    return sleepCounter >= SLEEP_FRAMES_REQUIRED;
  }
  return false;
}

/**
 * Ground plane collision response
 */
fn resolveGroundCollision(
  position: vec3<f32>,
  velocity: vec3<f32>,
  radius: f32
) -> vec4<f32> {
  var pos = position;
  var vel = velocity;

  // Check if particle intersects ground
  if (pos.y < uniforms.groundY + radius) {
    // Push particle above ground
    pos.y = uniforms.groundY + radius;

    // Reverse and dampen vertical velocity (bounce)
    vel.y = -vel.y * uniforms.restitution;

    // Apply friction to horizontal velocity
    vel.x *= uniforms.friction;
    vel.z *= uniforms.friction;

    // Stop small bounces (prevents jitter)
    if (abs(vel.y) < 0.05) {
      vel.y = 0.0;
    }
  }

  // Pack result (xyz = velocity, w = collision flag)
  return vec4<f32>(vel, f32(pos.y <= uniforms.groundY + radius + 0.01));
}

/**
 * Particle-particle collision detection
 *
 * Simplified version: only checks immediate neighbors in grid cell.
 * Full spatial grid implementation would be in a separate shader pass.
 */
fn checkParticleCollision(
  myIdx: u32,
  myPos: vec3<f32>,
  myVel: vec3<f32>,
  myRadius: f32,
  myMass: f32
) -> vec3<f32> {
  var resultVel = myVel;

  // Simple O(N) collision check (for now - spatial grid coming later)
  // Only check nearby particles to avoid O(N²) cost
  let checkRadius: u32 = 100u;  // Check 100 nearest particles
  let startIdx = max(0u, myIdx - checkRadius);
  let endIdx = min(uniforms.particleCount, myIdx + checkRadius);

  for (var i = startIdx; i < endIdx; i = i + 1u) {
    if (i == myIdx) {
      continue;
    }

    let otherPos = positions_in[i].xyz;
    let otherRadius = positions_in[i].w;
    let otherVel = velocities_in[i].xyz;
    let otherMass = velocities_in[i].w;

    // Distance between particles
    let delta = myPos - otherPos;
    let dist = length(delta);
    let minDist = myRadius + otherRadius;

    // Check collision
    if (dist < minDist && dist > 0.0001) {
      // Normal vector
      let normal = delta / dist;

      // Relative velocity
      let relVel = myVel - otherVel;

      // Velocity along collision normal
      let velAlongNormal = dot(relVel, normal);

      // Ignore if particles moving apart
      if (velAlongNormal < 0.0) {
        // Compute impulse (simplified elastic collision)
        let impulse = -(1.0 + COLLISION_DAMPING) * velAlongNormal / (1.0 / myMass + 1.0 / otherMass);

        // Apply impulse to velocity
        resultVel += impulse * normal / myMass;
      }
    }
  }

  return resultVel;
}

// =============================================================================
// Main Compute Shader
// =============================================================================

/**
 * Particle Physics Update
 *
 * Workgroup size: 256 particles per workgroup
 * Grid size: ceil(particleCount / 256)
 */
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;

  // Bounds check
  if (idx >= uniforms.particleCount) {
    return;
  }

  // Load particle data
  let pos_in = positions_in[idx];
  let vel_in = velocities_in[idx];
  let state_in = states_in[idx];

  // Unpack data
  var pos = pos_in.xyz;
  let radius = pos_in.w;

  var vel = vel_in.xyz;
  let mass = vel_in.w;

  let active = state_in.x;
  let sleeping = state_in.y;
  let health = state_in.z;
  let userData = state_in.w;

  // Skip inactive or sleeping particles
  if (active < 0.5 || sleeping > 0.5) {
    // Write unchanged data
    positions_out[idx] = pos_in;
    velocities_out[idx] = vel_in;
    states_out[idx] = state_in;
    return;
  }

  // ===================
  // Physics Integration
  // ===================

  // Apply gravity (semi-implicit Euler)
  vel.y -= uniforms.gravity * uniforms.dt;

  // Integrate position
  pos += vel * uniforms.dt;

  // Ground collision
  let groundResult = resolveGroundCollision(pos, vel, radius);
  vel = groundResult.xyz;
  let hitGround = groundResult.w;

  // Particle-particle collision (simplified)
  // Note: Full spatial grid implementation would go here
  vel = checkParticleCollision(idx, pos, vel, radius, mass);

  // ===================
  // Sleep State Update
  // ===================

  var sleepCounter = userData;  // Use userData as sleep counter

  let speed = length(vel);
  if (speed < SLEEP_VELOCITY_THRESHOLD) {
    sleepCounter += 1.0;
  } else {
    sleepCounter = 0.0;
  }

  var newSleeping = sleeping;
  if (sleepCounter >= SLEEP_FRAMES_REQUIRED) {
    newSleeping = 1.0;  // Put to sleep
    vel = vec3<f32>(0.0, 0.0, 0.0);  // Zero velocity
  }

  // Wake up if hit ground (prevents premature sleep)
  if (hitGround > 0.5 && speed > 0.1) {
    newSleeping = 0.0;
    sleepCounter = 0.0;
  }

  // ===================
  // Write Output
  // ===================

  positions_out[idx] = vec4<f32>(pos, radius);
  velocities_out[idx] = vec4<f32>(vel, mass);
  states_out[idx] = vec4<f32>(active, newSleeping, health, sleepCounter);
}
