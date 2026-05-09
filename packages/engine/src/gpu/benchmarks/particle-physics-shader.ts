/**
 * Inline WGSL shader for the WebGPU physics benchmark.
 * Mirrors packages/engine/src/gpu/shaders/particle-physics.wgsl.
 * Keep in sync with the canonical shader.
 */

export const PARTICLE_PHYSICS_WGSL = `
struct Uniforms {
  dt: f32,
  gravity: f32,
  groundY: f32,
  restitution: f32,
  friction: f32,
  particleCount: u32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@group(0) @binding(1) var<storage, read> positions_in: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> velocities_in: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> states_in: array<vec4<f32>>;

@group(0) @binding(4) var<storage, read_write> positions_out: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> velocities_out: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> states_out: array<vec4<f32>>;

const SLEEP_VELOCITY_THRESHOLD: f32 = 0.01;
const SLEEP_FRAMES_REQUIRED: f32 = 10.0;
const COLLISION_DAMPING: f32 = 0.8;

fn resolveGroundCollision(
  position: vec3<f32>,
  velocity: vec3<f32>,
  radius: f32
) -> vec4<f32> {
  var pos = position;
  var vel = velocity;
  if (pos.y < uniforms.groundY + radius) {
    pos.y = uniforms.groundY + radius;
    vel.y = -vel.y * uniforms.restitution;
    vel.x *= uniforms.friction;
    vel.z *= uniforms.friction;
    if (abs(vel.y) < 0.05) {
      vel.y = 0.0;
    }
  }
  return vec4<f32>(vel, f32(pos.y <= uniforms.groundY + radius + 0.01));
}

fn checkParticleCollision(
  myIdx: u32,
  myPos: vec3<f32>,
  myVel: vec3<f32>,
  myRadius: f32,
  myMass: f32
) -> vec3<f32> {
  var resultVel = myVel;
  let checkRadius: u32 = 100u;
  let startIdx = max(0u, myIdx - checkRadius);
  let endIdx = min(uniforms.particleCount, myIdx + checkRadius);
  for (var i = startIdx; i < endIdx; i = i + 1u) {
    if (i == myIdx) { continue; }
    let otherPos = positions_in[i].xyz;
    let otherRadius = positions_in[i].w;
    let otherVel = velocities_in[i].xyz;
    let otherMass = velocities_in[i].w;
    let delta = myPos - otherPos;
    let dist = length(delta);
    let minDist = myRadius + otherRadius;
    if (dist < minDist && dist > 0.0001) {
      let normal = delta / dist;
      let relVel = myVel - otherVel;
      let velAlongNormal = dot(relVel, normal);
      if (velAlongNormal < 0.0) {
        let impulse = -(1.0 + COLLISION_DAMPING) * velAlongNormal / (1.0 / myMass + 1.0 / otherMass);
        resultVel += impulse * normal / myMass;
      }
    }
  }
  return resultVel;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;
  if (idx >= uniforms.particleCount) { return; }

  let pos_in = positions_in[idx];
  let vel_in = velocities_in[idx];
  let state_in = states_in[idx];

  var pos = pos_in.xyz;
  let radius = pos_in.w;
  var vel = vel_in.xyz;
  let mass = vel_in.w;
  let active = state_in.x;
  let sleeping = state_in.y;
  let health = state_in.z;
  let userData = state_in.w;

  if (active < 0.5 || sleeping > 0.5) {
    positions_out[idx] = pos_in;
    velocities_out[idx] = vel_in;
    states_out[idx] = state_in;
    return;
  }

  vel.y -= uniforms.gravity * uniforms.dt;
  pos += vel * uniforms.dt;

  let groundResult = resolveGroundCollision(pos, vel, radius);
  vel = groundResult.xyz;
  let hitGround = groundResult.w;

  vel = checkParticleCollision(idx, pos, vel, radius, mass);

  var sleepCounter = userData;
  let speed = length(vel);
  if (speed < SLEEP_VELOCITY_THRESHOLD) {
    sleepCounter += 1.0;
  } else {
    sleepCounter = 0.0;
  }
  var newSleeping = sleeping;
  if (sleepCounter >= SLEEP_FRAMES_REQUIRED) {
    newSleeping = 1.0;
    vel = vec3<f32>(0.0, 0.0, 0.0);
  }
  if (hitGround > 0.5 && speed > 0.1) {
    newSleeping = 0.0;
    sleepCounter = 0.0;
  }

  positions_out[idx] = vec4<f32>(pos, radius);
  velocities_out[idx] = vec4<f32>(vel, mass);
  states_out[idx] = vec4<f32>(active, newSleeping, health, sleepCounter);
}
`;
