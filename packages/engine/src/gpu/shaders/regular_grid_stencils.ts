export const REGULAR_GRID_STENCIL_WGSL = `
struct GridParams {
  nx: u32,
  ny: u32,
  nz: u32,
  hasVelocity: u32,
  dx: f32,
  dy: f32,
  dz: f32,
  dt: f32,
  alpha: f32,
  rhoCp: f32,
  cUniform: f32,
  _pad0: f32,
};

@group(0) @binding(0) var<storage, read> inputA: array<f32>;
@group(0) @binding(1) var<storage, read> inputB: array<f32>;
@group(0) @binding(2) var<storage, read> aux: array<f32>;
@group(0) @binding(3) var<storage, read_write> outputField: array<f32>;
@group(0) @binding(4) var<uniform> params: GridParams;

fn flat_index(i: u32, j: u32, k: u32) -> u32 {
  return (k * params.ny + j) * params.nx + i;
}

fn laplacian(field: ptr<storage, array<f32>, read>, i: u32, j: u32, k: u32) -> f32 {
  let idx = flat_index(i, j, k);
  let center = (*field)[idx];
  var lap = 0.0;

  if (i > 0u && i < params.nx - 1u) {
    lap += ((*field)[flat_index(i + 1u, j, k)] - 2.0 * center + (*field)[flat_index(i - 1u, j, k)]) / (params.dx * params.dx);
  }
  if (j > 0u && j < params.ny - 1u) {
    lap += ((*field)[flat_index(i, j + 1u, k)] - 2.0 * center + (*field)[flat_index(i, j - 1u, k)]) / (params.dy * params.dy);
  }
  if (k > 0u && k < params.nz - 1u) {
    lap += ((*field)[flat_index(i, j, k + 1u)] - 2.0 * center + (*field)[flat_index(i, j, k - 1u)]) / (params.dz * params.dz);
  }

  return lap;
}

@compute @workgroup_size(128)
fn thermal_explicit(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = params.nx * params.ny * params.nz;
  let idx = gid.x;
  if (idx >= n) {
    return;
  }

  let i = idx % params.nx;
  let j = (idx / params.nx) % params.ny;
  let k = idx / (params.nx * params.ny);
  let current = inputA[idx];

  if (i == 0u || j == 0u || k == 0u || i == params.nx - 1u || j == params.ny - 1u || k == params.nz - 1u) {
    outputField[idx] = current;
    return;
  }

  let lap = laplacian(&inputA, i, j, k);
  outputField[idx] = current + params.dt * (params.alpha * lap + aux[idx] / params.rhoCp);
}

@compute @workgroup_size(128)
fn acoustic_leapfrog(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = params.nx * params.ny * params.nz;
  let idx = gid.x;
  if (idx >= n) {
    return;
  }

  let i = idx % params.nx;
  let j = (idx / params.nx) % params.ny;
  let k = idx / (params.nx * params.ny);

  if (i == 0u || j == 0u || k == 0u || i == params.nx - 1u || j == params.ny - 1u || k == params.nz - 1u) {
    outputField[idx] = inputA[idx];
    return;
  }

  let c = select(params.cUniform, aux[idx], params.hasVelocity != 0u);
  let c2dt2 = (c * params.dt) * (c * params.dt);
  let lap = laplacian(&inputA, i, j, k);
  outputField[idx] = 2.0 * inputA[idx] - inputB[idx] + c2dt2 * lap;
}
`;
