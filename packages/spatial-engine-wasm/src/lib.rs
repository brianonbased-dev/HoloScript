//! spatial-engine-wasm — Hot-path functions for the HoloScript spatial engine.
//!
//! Compiled to WebAssembly via `wasm-pack build --target web`.
//! Provides noise generation, collision detection, and A* pathfinding.

use wasm_bindgen::prelude::*;

// =============================================================================
// Noise Generation
// =============================================================================

/// Simple hash function for integer coordinates.
fn hash2d(ix: i32, iy: i32, seed: i32) -> f64 {
    let mut h = ix.wrapping_mul(374761393)
        .wrapping_add(iy.wrapping_mul(668265263))
        .wrapping_add(seed.wrapping_mul(1013904223));
    h = (h >> 13 ^ h).wrapping_mul(1274126177);
    h = h >> 16 ^ h;
    (h & 0x7fff_ffff) as f64 / 0x7fff_ffff as f64 * 2.0 - 1.0
}

fn smoothstep(t: f64) -> f64 {
    t * t * (3.0 - 2.0 * t)
}

/// 2D Perlin-like value noise.
#[wasm_bindgen]
pub fn perlin_noise_2d(x: f64, y: f64, seed: i32) -> f64 {
    let ix = x.floor() as i32;
    let iy = y.floor() as i32;
    let fx = x - ix as f64;
    let fy = y - iy as f64;
    let sx = smoothstep(fx);
    let sy = smoothstep(fy);

    let n00 = hash2d(ix, iy, seed);
    let n10 = hash2d(ix + 1, iy, seed);
    let n01 = hash2d(ix, iy + 1, seed);
    let n11 = hash2d(ix + 1, iy + 1, seed);

    let nx0 = n00 * (1.0 - sx) + n10 * sx;
    let nx1 = n01 * (1.0 - sx) + n11 * sx;
    nx0 * (1.0 - sy) + nx1 * sy
}

/// 3D Perlin-like value noise.
#[wasm_bindgen]
pub fn perlin_noise_3d(x: f64, y: f64, z: f64, seed: i32) -> f64 {
    // Combine 3 planes of 2D noise
    let xy = perlin_noise_2d(x, y, seed);
    let yz = perlin_noise_2d(y, z, seed.wrapping_add(1));
    let xz = perlin_noise_2d(x, z, seed.wrapping_add(2));
    (xy + yz + xz) / 3.0
}

/// Fractal Brownian Motion using layered 2D noise.
#[wasm_bindgen]
pub fn fbm_noise(
    x: f64,
    y: f64,
    octaves: i32,
    lacunarity: f64,
    persistence: f64,
    seed: i32,
) -> f64 {
    let mut total = 0.0;
    let mut amplitude = 1.0;
    let mut frequency = 1.0;
    let mut max_amplitude = 0.0;

    for i in 0..octaves {
        total += perlin_noise_2d(x * frequency, y * frequency, seed + i) * amplitude;
        max_amplitude += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }

    if max_amplitude > 0.0 {
        total / max_amplitude
    } else {
        0.0
    }
}

// =============================================================================
// Collision Detection
// =============================================================================

/// Sphere-sphere intersection test. Returns 1 if colliding, 0 otherwise.
#[wasm_bindgen]
pub fn sphere_sphere_test(
    ax: f64, ay: f64, az: f64, ar: f64,
    bx: f64, by: f64, bz: f64, br: f64,
) -> i32 {
    let dx = bx - ax;
    let dy = by - ay;
    let dz = bz - az;
    let dist_sq = dx * dx + dy * dy + dz * dz;
    let rad_sum = ar + br;
    if dist_sq <= rad_sum * rad_sum { 1 } else { 0 }
}

/// AABB overlap test. Returns 1 if overlapping, 0 otherwise.
#[wasm_bindgen]
pub fn aabb_overlap(
    amin_x: f64, amin_y: f64, amin_z: f64,
    amax_x: f64, amax_y: f64, amax_z: f64,
    bmin_x: f64, bmin_y: f64, bmin_z: f64,
    bmax_x: f64, bmax_y: f64, bmax_z: f64,
) -> i32 {
    let overlap = amin_x <= bmax_x && amax_x >= bmin_x
        && amin_y <= bmax_y && amax_y >= bmin_y
        && amin_z <= bmax_z && amax_z >= bmin_z;
    if overlap { 1 } else { 0 }
}

// =============================================================================
// A* Pathfinding
// =============================================================================

/// A* pathfinding on a 2D grid (grid values: 0=walkable, 1=blocked).
/// Writes waypoints as (x, y) i32 pairs into `result_ptr`.
/// Returns number of waypoints written (0 = no path found).
///
/// # Safety
/// Caller must ensure `grid_ptr` points to `width * height` bytes
/// and `result_ptr` points to at least `width * height * 8` bytes.
#[wasm_bindgen]
pub fn astar_find_path(
    grid_ptr: *const u8,
    width: i32,
    height: i32,
    start_x: i32,
    start_y: i32,
    end_x: i32,
    end_y: i32,
    result_ptr: *mut i32,
) -> i32 {
    let w = width as usize;
    let h = height as usize;
    let total = w * h;

    // Safety: read grid from WASM memory
    let grid = unsafe { std::slice::from_raw_parts(grid_ptr, total) };

    let key = |x: usize, y: usize| -> usize { y * w + x };

    // Open set as a simple vec (no priority queue for simplicity)
    let mut g_score = vec![f64::INFINITY; total];
    let mut f_score = vec![f64::INFINITY; total];
    let mut came_from = vec![usize::MAX; total];
    let mut open = vec![false; total];
    let mut closed = vec![false; total];

    let sk = key(start_x as usize, start_y as usize);
    let ek = key(end_x as usize, end_y as usize);
    g_score[sk] = 0.0;
    f_score[sk] = ((end_x - start_x).abs() + (end_y - start_y).abs()) as f64;
    open[sk] = true;

    let dirs: [(i32, i32, f64); 8] = [
        (1, 0, 1.0), (-1, 0, 1.0), (0, 1, 1.0), (0, -1, 1.0),
        (1, 1, 1.414), (-1, 1, 1.414), (1, -1, 1.414), (-1, -1, 1.414),
    ];

    loop {
        // Find open node with lowest f_score
        let mut current = usize::MAX;
        let mut best_f = f64::INFINITY;
        for i in 0..total {
            if open[i] && f_score[i] < best_f {
                best_f = f_score[i];
                current = i;
            }
        }

        if current == usize::MAX {
            return 0; // No path
        }

        if current == ek {
            // Reconstruct path
            let mut path = Vec::new();
            let mut c = current;
            while c != usize::MAX && c != sk {
                path.push(c);
                c = came_from[c];
            }
            path.push(sk);
            path.reverse();

            let result = unsafe { std::slice::from_raw_parts_mut(result_ptr, path.len() * 2) };
            for (i, &node) in path.iter().enumerate() {
                result[i * 2] = (node % w) as i32;
                result[i * 2 + 1] = (node / w) as i32;
            }
            return path.len() as i32;
        }

        open[current] = false;
        closed[current] = true;

        let cx = (current % w) as i32;
        let cy = (current / w) as i32;

        for &(dx, dy, cost) in &dirs {
            let nx = cx + dx;
            let ny = cy + dy;
            if nx < 0 || nx >= width || ny < 0 || ny >= height {
                continue;
            }
            let nk = key(nx as usize, ny as usize);
            if closed[nk] || grid[nk] != 0 {
                continue;
            }

            let tent_g = g_score[current] + cost;
            if tent_g < g_score[nk] {
                came_from[nk] = current;
                g_score[nk] = tent_g;
                f_score[nk] = tent_g + ((end_x - nx).abs() + (end_y - ny).abs()) as f64;
                open[nk] = true;
            }
        }
    }
}

// =============================================================================
// Memory Management (for JS interop)
// =============================================================================

/// Allocate `size` bytes in WASM linear memory. Returns pointer.
#[wasm_bindgen]
pub fn alloc(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// Deallocate memory previously allocated by `alloc`.
///
/// # Safety
/// Caller must ensure `ptr` was returned by `alloc` with the same `size`.
#[wasm_bindgen]
pub fn dealloc(ptr: *mut u8, size: usize) {
    unsafe {
        let _ = Vec::from_raw_parts(ptr, 0, size);
    }
}
