/**
 * DEMSolver — Discrete Element Method for granular-particle physics.
 *
 * ## Contact Model: Cundall–Strack Linear Spring-Dashpot
 *
 *   Normal contact force (overlap δ = R_i + R_j - |r_ij| > 0):
 *
 *     F_n = k_n · δ - c_n · v_rel_n
 *
 *   Normal damping coefficient from coefficient of restitution e:
 *
 *     c_n = -2 · ln(e) · sqrt(m_eff · k_n / (π² + ln²(e)))
 *
 *   where m_eff = m_i · m_j / (m_i + m_j) is the reduced mass.
 *
 *   Tangential: incremental spring with Coulomb slip cap:
 *
 *     ΔF_t = k_t · Δu_t   (incremental tangential displacement)
 *     |F_t| ≤ μ · |F_n|    (Coulomb cut)
 *
 *   k_t defaults to 2/7 · k_n (common DEM practice).
 *
 * ## Neighbor Search: Uniform Grid
 *
 *   Cell size = 2 · r_max ensures each particle overlaps at most the 27
 *   directly adjacent cells, keeping contact detection O(N).  Grid arrays
 *   are pre-allocated in the constructor and reused every step.
 *
 * ## Integration: Semi-Implicit Euler
 *
 *     v(t+dt) = v(t) + (F/m) · dt
 *     x(t+dt) = x(t) + v(t+dt) · dt
 *
 *   Stability guard: dt ≤ safety · 2 · √(m_min / k_n)
 *   (Rayleigh/contact-time estimate for a linear spring-dashpot contact).
 *   When dt exceeds this limit the solver automatically sub-steps.
 *
 * ## Boundaries: Axis-Aligned Bounding Box (AABB)
 *
 *   Each of the six wall faces applies the same spring-dashpot contact
 *   model when a particle overlaps the wall (coefficient of restitution = e,
 *   frictionless — walls have no tangential spring state).
 *
 *   Wall contact convention:
 *     n̂ points from wall toward the particle (into the interior).
 *     Approach velocity: vRel_n = v · n̂  (negative = approaching wall).
 *     fn = kn · δ − cn · vRel_n  (clamped ≥ 0).
 *
 * ## Configuration (vault rule G.GOLD.485 — no Earth-hardcoded constants)
 *
 *   All physical constants are config fields with documented defaults.
 *   gravity defaults to Earth standard [0, -9.81, 0] — this is an Earth
 *   default; change for other environments.
 *
 * @see SimSolver — generic solver interface consumed by the registry
 * @see MolecularDynamicsSolver — sibling particle solver, style reference
 */

import type { SolverMode, FieldData } from './SimSolver';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Full poly-disperse DEM configuration. */
export interface DEMConfig {
  /** Number of particles. */
  particleCount: number;

  /**
   * Per-particle radius array (length = particleCount).
   * If omitted, all radii default to `defaultRadius`.
   */
  radii?: Float64Array | number[];

  /**
   * Per-particle mass array (length = particleCount).
   * If omitted, all masses default to `defaultMass`.
   */
  masses?: Float64Array | number[];

  /** Default radius when `radii` is not supplied (default: 0.05 m). */
  defaultRadius?: number;

  /** Default mass when `masses` is not supplied (default: 1.0 kg). */
  defaultMass?: number;

  /**
   * Normal contact stiffness k_n (N/m).
   * Default: 1e5 N/m — suitable for moderately stiff grains.
   */
  kn?: number;

  /**
   * Tangential contact stiffness k_t (N/m).
   * Default: 2/7 · k_n (common DEM calibration).
   */
  kt?: number;

  /**
   * Coefficient of restitution e ∈ (0, 1].
   * e=1 → perfectly elastic (c_n=0); e→0 → maximally damped.
   * Default: 0.5.
   */
  restitution?: number;

  /**
   * Coulomb friction coefficient μ ≥ 0.
   * Default: 0.3.
   */
  friction?: number;

  /**
   * Gravity vector [gx, gy, gz] in m/s².
   * Default: [0, -9.81, 0] — Earth standard, vertical down.
   * Change for other planetary environments or zero-g experiments.
   */
  gravity?: [number, number, number];

  /**
   * AABB box bounds [[xMin, xMax], [yMin, yMax], [zMin, zMax]] in metres.
   * Default: [[-1,1], [-1,1], [-1,1]].
   */
  boxBounds?: [[number, number], [number, number], [number, number]];

  /**
   * Safety factor for automatic sub-stepping.
   * dt_contact = safety · 2 · √(m_min / k_n); sub-step when dt > dt_contact.
   * Default: 0.2 (conservative).
   */
  dtSafety?: number;

  /**
   * Initial particle positions as a flat array [x0,y0,z0, x1,y1,z1, ...].
   * If not supplied the constructor distributes particles on a simple grid.
   */
  initialPositions?: Float64Array | number[];

  /**
   * Initial particle velocities as a flat array [vx0,vy0,vz0, ...].
   * Defaults to zero.
   */
  initialVelocities?: Float64Array | number[];
}

export interface DEMStats {
  stepCount: number;
  currentTime: number;
  kineticEnergy: number;
  contactCount: number;
  maxOverlap: number;
}

// ── Seeded LCG ────────────────────────────────────────────────────────────────

/**
 * Minimal seeded PRNG (mulberry32) — deterministic, 32-bit integer math only.
 * Used only for deterministic default particle initialization — no randomness
 * elsewhere in the solver. No BigInt: keeps this module type-checkable under
 * consumers targeting < ES2020 (e.g. studio).
 */
class LCG {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** Returns a float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  }
}

// ── Solver ────────────────────────────────────────────────────────────────────

// NOTE: satisfies the SimSolver shape structurally and registers via the
// double-cast in simulation-registry.ts (house pattern — a literal
// `implements SimSolver` fails strict TS because the typed getStats()
// return (DEMStats) lacks the interface's index signature).
export class DEMSolver {
  readonly mode: SolverMode = 'transient';
  readonly fieldNames: readonly string[] = ['positions', 'velocities'];

  private readonly N: number;

  // Per-particle flat arrays (stride 3: x, y, z)
  readonly positions: Float64Array;
  readonly velocities: Float64Array;
  private readonly forces: Float64Array;

  // Per-particle scalar properties
  private readonly radii: Float64Array;
  private readonly masses: Float64Array;
  private readonly invMasses: Float64Array;

  // Contact parameters
  private readonly kn: number;
  private readonly kt: number;
  private readonly restitution: number;
  private readonly friction: number;
  private readonly gravity: [number, number, number];

  // Box bounds: [xMin, xMax, yMin, yMax, zMin, zMax]
  private readonly box: [number, number, number, number, number, number];

  // Derived
  private readonly rMax: number;
  private readonly mMin: number;
  private readonly dtContact: number; // stability dt limit

  // Pre-allocated uniform-grid structures (sized once in constructor)
  private readonly _gridNx: number;
  private readonly _gridNy: number;
  private readonly _gridNz: number;
  private readonly _gridCellSize: number;
  private readonly _cellCount: Int32Array; // per-cell particle count
  private readonly _cellStart: Int32Array; // prefix-sum offsets
  private readonly _cellFill: Int32Array; // fill cursor during construction
  private readonly _sortedParticles: Int32Array;
  private readonly _cellIdx: Int32Array; // which cell each particle belongs to
  private readonly _activeContactSet: Set<number>; // reused set for active contacts

  private stepCount = 0;
  private currentTime = 0;

  // Stats updated each step
  private kineticEnergy = 0;
  private contactCount = 0;
  private maxOverlap = 0;

  /**
   * Tangential spring state keyed by contact pair.
   * Key = min(i,j)*N + max(i,j) for particle-particle contacts.
   * Wall contacts don't accumulate tangential spring state (walls are friction-free).
   */
  private readonly tangentialSprings: Map<number, [number, number, number]> = new Map();
  /**
   * Per-contact tangential velocities collected during _particleContacts().
   * Updated in _updateTangentialSprings() before the velocity integration.
   */
  private readonly _tangentialVelocities: Map<number, [number, number, number]> = new Map();

  constructor(config: DEMConfig) {
    this.N = config.particleCount;
    if (this.N < 1) throw new RangeError('DEMSolver: particleCount must be ≥ 1');

    const defaultRadius = config.defaultRadius ?? 0.05;
    const defaultMass = config.defaultMass ?? 1.0;

    this.radii = new Float64Array(this.N);
    this.masses = new Float64Array(this.N);
    this.invMasses = new Float64Array(this.N);

    if (config.radii) {
      for (let i = 0; i < this.N; i++) this.radii[i] = config.radii[i] ?? defaultRadius;
    } else {
      this.radii.fill(defaultRadius);
    }
    if (config.masses) {
      for (let i = 0; i < this.N; i++) this.masses[i] = config.masses[i] ?? defaultMass;
    } else {
      this.masses.fill(defaultMass);
    }
    for (let i = 0; i < this.N; i++) this.invMasses[i] = 1.0 / this.masses[i];

    this.kn = config.kn ?? 1e5;
    const defaultKt = (2 / 7) * this.kn;
    this.kt = config.kt ?? defaultKt;
    this.restitution = config.restitution ?? 0.5;
    this.friction = config.friction ?? 0.3;
    this.gravity = config.gravity ?? [0, -9.81, 0];

    const bounds = config.boxBounds ?? [
      [-1, 1],
      [-1, 1],
      [-1, 1],
    ];
    this.box = [bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1], bounds[2][0], bounds[2][1]];

    // Derived safety quantities
    let rMax = 0;
    let mMin = Infinity;
    for (let i = 0; i < this.N; i++) {
      if (this.radii[i] > rMax) rMax = this.radii[i];
      if (this.masses[i] < mMin) mMin = this.masses[i];
    }
    this.rMax = rMax;
    this.mMin = mMin;
    const dtSafety = config.dtSafety ?? 0.2;
    this.dtContact = dtSafety * 2.0 * Math.sqrt(mMin / this.kn);

    // Pre-allocate uniform grid.
    // cellSize = 2 * rMax.
    // Cell count per axis is capped at the smaller of:
    //   (a) domain / cellSize — the physically required grid density, and
    //   (b) ceil(cbrt(N)) + 4 — a bound derived from particle count so that
    //       sparse large-box problems (few particles, large domain) don't
    //       allocate millions of cells.  With N particles at most N cells can
    //       be non-empty, so a grid with more than O(N) cells wastes memory.
    // Hard cap at 256 per axis as absolute maximum.
    const [xMin, xMax, yMin, yMax, zMin, zMax] = this.box;
    const cellSize = rMax > 0 ? 2.0 * rMax : 1.0;
    const lx = xMax - xMin;
    const ly = yMax - yMin;
    const lz = zMax - zMin;
    const nCap = Math.min(256, Math.ceil(Math.cbrt(this.N)) + 4);
    const nx = Math.max(1, Math.min(nCap, Math.ceil(lx / cellSize)));
    const ny = Math.max(1, Math.min(nCap, Math.ceil(ly / cellSize)));
    const nz = Math.max(1, Math.min(nCap, Math.ceil(lz / cellSize)));
    this._gridNx = nx;
    this._gridNy = ny;
    this._gridNz = nz;
    this._gridCellSize = cellSize;

    const ncells = nx * ny * nz;
    this._cellCount = new Int32Array(ncells);
    this._cellStart = new Int32Array(ncells + 1);
    this._cellFill = new Int32Array(ncells);
    this._sortedParticles = new Int32Array(this.N);
    this._cellIdx = new Int32Array(this.N);
    this._activeContactSet = new Set<number>();

    // Allocate state arrays
    this.positions = new Float64Array(this.N * 3);
    this.velocities = new Float64Array(this.N * 3);
    this.forces = new Float64Array(this.N * 3);

    // Initialize positions
    if (config.initialPositions) {
      const src = config.initialPositions;
      for (let i = 0; i < this.N * 3; i++) this.positions[i] = src[i] ?? 0;
    } else {
      this._defaultPositions();
    }

    // Initialize velocities (zero by default)
    if (config.initialVelocities) {
      const src = config.initialVelocities;
      for (let i = 0; i < this.N * 3; i++) this.velocities[i] = src[i] ?? 0;
    }
  }

  /**
   * Default position initialization: pack particles on a simple 3-D grid
   * inside the box, using a seeded LCG for a small jitter so particles
   * aren't perfectly aligned (which can cause degenerate contacts).
   */
  private _defaultPositions(): void {
    const [xMin, xMax, yMin, yMax, zMin, zMax] = this.box;
    const lx = xMax - xMin;
    const ly = yMax - yMin;
    const lz = zMax - zMin;

    const n = Math.ceil(Math.cbrt(this.N));
    const rng = new LCG(12345);

    let idx = 0;
    outer: for (let iz = 0; iz < n; iz++) {
      for (let iy = 0; iy < n; iy++) {
        for (let ix = 0; ix < n; ix++) {
          if (idx >= this.N) break outer;
          const r = this.radii[idx];
          // Centre-of-cell positions with a small deterministic jitter (< r/4)
          this.positions[idx * 3] = xMin + (ix + 0.5 + (rng.next() - 0.5) * 0.1) * (lx / n);
          this.positions[idx * 3 + 1] = yMin + r + (iy + 0.5 + (rng.next() - 0.5) * 0.1) * (ly / n);
          this.positions[idx * 3 + 2] = zMin + (iz + 0.5 + (rng.next() - 0.5) * 0.1) * (lz / n);
          idx++;
        }
      }
    }
  }

  // ── SimSolver interface ───────────────────────────────────────────────────

  /**
   * Advance the simulation by dt seconds.
   *
   * If dt > dtContact (stability limit), the step is automatically
   * sub-divided into smaller equal substeps.
   */
  step(dt: number): void {
    if (dt <= 0) return;
    if (this.dtContact > 0 && dt > this.dtContact) {
      const nSub = Math.ceil(dt / this.dtContact);
      const dtSub = dt / nSub;
      for (let s = 0; s < nSub; s++) this._substep(dtSub);
    } else {
      this._substep(dt);
    }
    this.currentTime += dt;
    this.stepCount++;
  }

  /** No-op for transient solvers. */
  solve(): void {}

  getField(name: string): FieldData | null {
    if (name === 'positions') return this.positions;
    if (name === 'velocities') return this.velocities;
    return null;
  }

  getStats(): DEMStats {
    return {
      stepCount: this.stepCount,
      currentTime: this.currentTime,
      kineticEnergy: this.kineticEnergy,
      contactCount: this.contactCount,
      maxOverlap: this.maxOverlap,
    };
  }

  dispose(): void {
    this.tangentialSprings.clear();
    this._tangentialVelocities.clear();
    this._activeContactSet.clear();
  }

  // ── Integration ───────────────────────────────────────────────────────────

  private _substep(dt: number): void {
    this._computeForces();

    // Update tangential spring displacements using the relative tangential
    // velocities collected during _computeForces().  Must happen before the
    // velocity update so springs reflect v(t), not v(t+dt).
    this._updateTangentialSprings(dt);

    // Semi-implicit Euler: v first, then x
    let ke = 0;
    for (let i = 0; i < this.N; i++) {
      const im = this.invMasses[i];
      const i3 = i * 3;
      this.velocities[i3] += this.forces[i3] * im * dt;
      this.velocities[i3 + 1] += this.forces[i3 + 1] * im * dt;
      this.velocities[i3 + 2] += this.forces[i3 + 2] * im * dt;

      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;

      const vx = this.velocities[i3];
      const vy = this.velocities[i3 + 1];
      const vz = this.velocities[i3 + 2];
      ke += 0.5 * this.masses[i] * (vx * vx + vy * vy + vz * vz);
    }
    this.kineticEnergy = ke;
  }

  // ── Force computation ─────────────────────────────────────────────────────

  private _computeForces(): void {
    this.forces.fill(0);
    this.contactCount = 0;
    this.maxOverlap = 0;

    // Apply gravity
    for (let i = 0; i < this.N; i++) {
      const i3 = i * 3;
      this.forces[i3] += this.masses[i] * this.gravity[0];
      this.forces[i3 + 1] += this.masses[i] * this.gravity[1];
      this.forces[i3 + 2] += this.masses[i] * this.gravity[2];
    }

    // Particle-particle contacts (uniform-grid neighbor search)
    this._particleContacts();

    // Particle-wall contacts (AABB)
    this._wallContacts();

    // Purge tangential springs for contacts that no longer exist
    this._purgeStaleSprings();
  }

  // ── Uniform-grid neighbor search ──────────────────────────────────────────

  /**
   * Detect all overlapping particle pairs using a pre-allocated uniform grid.
   * Cell size = 2·r_max (capped at 128 cells/axis).
   */
  private _particleContacts(): void {
    const { N, _gridNx: gnx, _gridNy: gny, _gridNz: gnz, _gridCellSize: cellSize } = this;
    const [xMin, , yMin, , zMin] = this.box;
    const ncells = gnx * gny * gnz;

    // Reset reused arrays
    this._cellCount.fill(0);
    this._activeContactSet.clear();

    // Assign particles to cells
    for (let i = 0; i < N; i++) {
      const px = this.positions[i * 3] - xMin;
      const py = this.positions[i * 3 + 1] - yMin;
      const pz = this.positions[i * 3 + 2] - zMin;

      let cx = Math.floor(px / cellSize);
      let cy = Math.floor(py / cellSize);
      let cz = Math.floor(pz / cellSize);

      cx = Math.max(0, Math.min(gnx - 1, cx));
      cy = Math.max(0, Math.min(gny - 1, cy));
      cz = Math.max(0, Math.min(gnz - 1, cz));

      const c = cx + cy * gnx + cz * gnx * gny;
      this._cellIdx[i] = c;
      this._cellCount[c]++;
    }

    // Build prefix sums for cell starts
    this._cellStart[0] = 0;
    for (let c = 0; c < ncells; c++) {
      this._cellStart[c + 1] = this._cellStart[c] + this._cellCount[c];
    }

    // Fill sorted particle list
    this._cellFill.fill(0);
    for (let i = 0; i < N; i++) {
      const c = this._cellIdx[i];
      this._sortedParticles[this._cellStart[c] + this._cellFill[c]] = i;
      this._cellFill[c]++;
    }

    // Iterate over cells, check 27-neighbour cells
    for (let cz = 0; cz < gnz; cz++) {
      for (let cy = 0; cy < gny; cy++) {
        for (let cx = 0; cx < gnx; cx++) {
          const c0 = cx + cy * gnx + cz * gnx * gny;
          const s0 = this._cellStart[c0];
          const e0 = this._cellStart[c0 + 1];
          if (s0 === e0) continue;

          for (let dcz = -1; dcz <= 1; dcz++) {
            const cz2 = cz + dcz;
            if (cz2 < 0 || cz2 >= gnz) continue;
            for (let dcy = -1; dcy <= 1; dcy++) {
              const cy2 = cy + dcy;
              if (cy2 < 0 || cy2 >= gny) continue;
              for (let dcx = -1; dcx <= 1; dcx++) {
                const cx2 = cx + dcx;
                if (cx2 < 0 || cx2 >= gnx) continue;

                const c1 = cx2 + cy2 * gnx + cz2 * gnx * gny;
                const s1 = this._cellStart[c1];
                const e1 = this._cellStart[c1 + 1];
                if (s1 === e1) continue;

                // Only process pair (c0, c1) when c1 >= c0 to avoid double-counting
                if (c1 < c0) continue;

                for (let a = s0; a < e0; a++) {
                  const i = this._sortedParticles[a];
                  const bStart = c1 === c0 ? a + 1 : s1;
                  for (let b = bStart; b < e1; b++) {
                    const j = this._sortedParticles[b];
                    if (i !== j) this._resolveParticlePair(i, j);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  /** Apply forces for a single overlapping particle pair (i, j). */
  private _resolveParticlePair(i: number, j: number): void {
    const i3 = i * 3;
    const j3 = j * 3;

    const dx = this.positions[i3] - this.positions[j3];
    const dy = this.positions[i3 + 1] - this.positions[j3 + 1];
    const dz = this.positions[i3 + 2] - this.positions[j3 + 2];

    const dist2 = dx * dx + dy * dy + dz * dz;
    const rSum = this.radii[i] + this.radii[j];

    if (dist2 >= rSum * rSum) return; // no contact

    const dist = Math.sqrt(dist2);
    const delta = rSum - dist; // overlap (positive)

    if (delta > this.maxOverlap) this.maxOverlap = delta;
    this.contactCount++;

    // Contact pair key (lo < hi always for symmetry)
    const lo = Math.min(i, j);
    const hi = Math.max(i, j);
    const key = lo * this.N + hi;
    this._activeContactSet.add(key);

    // Unit normal from j → i (n̂ points toward i)
    const invDist = dist > 1e-15 ? 1.0 / dist : 0;
    const nx = dx * invDist;
    const ny = dy * invDist;
    const nz = dz * invDist;

    // Relative velocity of i w.r.t. j
    const vrx = this.velocities[i3] - this.velocities[j3];
    const vry = this.velocities[i3 + 1] - this.velocities[j3 + 1];
    const vrz = this.velocities[i3 + 2] - this.velocities[j3 + 2];

    // Normal component of relative velocity (positive = separating)
    const vrn = vrx * nx + vry * ny + vrz * nz;

    // Effective mass
    const mi = this.masses[i];
    const mj = this.masses[j];
    const mEff = (mi * mj) / (mi + mj);

    // Normal damping coefficient from restitution
    const e = this.restitution;
    const logE = e > 0 ? Math.log(e) : -50; // avoid log(0)
    const cn =
      (-2.0 * logE * Math.sqrt(mEff * this.kn)) / Math.sqrt(Math.PI * Math.PI + logE * logE);

    // Normal contact force: fn = kn·δ − cn·vRel_n (clamped ≥ 0)
    const fn = Math.max(0, this.kn * delta - cn * vrn);

    // Tangential relative velocity (subtract normal component)
    const vtx = vrx - vrn * nx;
    const vty = vry - vrn * ny;
    const vtz = vrz - vrn * nz;

    // Tangential spring force from accumulated displacement
    const existing = this.tangentialSprings.get(key);
    const stx = existing ? existing[0] : 0;
    const sty = existing ? existing[1] : 0;
    const stz = existing ? existing[2] : 0;

    let ftx = -this.kt * stx;
    let fty = -this.kt * sty;
    let ftz = -this.kt * stz;

    // Coulomb cap: |F_t| ≤ μ · |F_n|
    const ftMag = Math.sqrt(ftx * ftx + fty * fty + ftz * ftz);
    const ftMax = this.friction * fn;
    if (ftMag > ftMax && ftMag > 1e-20) {
      const scale = ftMax / ftMag;
      ftx *= scale;
      fty *= scale;
      ftz *= scale;
    }

    // Apply forces on both particles along n̂ and tangent direction
    const fnx = fn * nx;
    const fny = fn * ny;
    const fnz = fn * nz;

    this.forces[i3] += fnx + ftx;
    this.forces[i3 + 1] += fny + fty;
    this.forces[i3 + 2] += fnz + ftz;
    this.forces[j3] -= fnx + ftx;
    this.forces[j3 + 1] -= fny + fty;
    this.forces[j3 + 2] -= fnz + ftz;

    // Store tangential velocity for spring integration this step
    this._tangentialVelocities.set(key, [vtx, vty, vtz]);
    // Preserve existing spring value (will be updated in _updateTangentialSprings)
    if (!existing) this.tangentialSprings.set(key, [0, 0, 0]);
  }

  /**
   * Integrate tangential spring displacements using relative tangential
   * velocities collected during _resolveParticlePair().
   */
  private _updateTangentialSprings(dt: number): void {
    for (const [key, vt] of this._tangentialVelocities) {
      const s = this.tangentialSprings.get(key) ?? [0, 0, 0];
      this.tangentialSprings.set(key, [s[0] + vt[0] * dt, s[1] + vt[1] * dt, s[2] + vt[2] * dt]);
    }
    this._tangentialVelocities.clear();
  }

  /** Remove springs for contacts that were not active this step. */
  private _purgeStaleSprings(): void {
    for (const key of this.tangentialSprings.keys()) {
      if (!this._activeContactSet.has(key)) {
        this.tangentialSprings.delete(key);
      }
    }
  }

  // ── Wall contacts ─────────────────────────────────────────────────────────

  /**
   * Apply spring-dashpot wall contact forces for each AABB face.
   *
   * Wall contact convention for wall W with inward unit normal n̂:
   *   - δ = r − (signed gap to wall) — positive when overlapping
   *   - vRel_n = v · n̂  (negative when approaching the wall)
   *   - fn = kn·δ − cn·vRel_n  (clamped ≥ 0)
   *   - Applied force on particle: fn · n̂
   */
  private _wallContacts(): void {
    const [xMin, xMax, yMin, yMax, zMin, zMax] = this.box;

    for (let i = 0; i < this.N; i++) {
      const i3 = i * 3;
      const r = this.radii[i];
      const mi = this.masses[i];
      // Reduced mass for particle-wall contact: wall is infinite mass → m_eff = m_i
      const mEff = mi;

      const e = this.restitution;
      const logE = e > 0 ? Math.log(e) : -50;
      const cn =
        (-2.0 * logE * Math.sqrt(mEff * this.kn)) / Math.sqrt(Math.PI * Math.PI + logE * logE);

      const px = this.positions[i3];
      const py = this.positions[i3 + 1];
      const pz = this.positions[i3 + 2];
      const vx = this.velocities[i3];
      const vy = this.velocities[i3 + 1];
      const vz = this.velocities[i3 + 2];

      // x- wall  (n̂ = +x, vRel_n = vx)
      {
        const delta = r - (px - xMin);
        if (delta > 0) {
          const fn = Math.max(0, this.kn * delta - cn * vx);
          this.forces[i3] += fn;
          if (delta > this.maxOverlap) this.maxOverlap = delta;
          this.contactCount++;
        }
      }
      // x+ wall  (n̂ = -x, vRel_n = -vx)
      {
        const delta = r - (xMax - px);
        if (delta > 0) {
          const fn = Math.max(0, this.kn * delta - cn * -vx);
          this.forces[i3] -= fn;
          if (delta > this.maxOverlap) this.maxOverlap = delta;
          this.contactCount++;
        }
      }
      // y- wall / floor  (n̂ = +y, vRel_n = vy)
      {
        const delta = r - (py - yMin);
        if (delta > 0) {
          const fn = Math.max(0, this.kn * delta - cn * vy);
          this.forces[i3 + 1] += fn;
          if (delta > this.maxOverlap) this.maxOverlap = delta;
          this.contactCount++;
        }
      }
      // y+ wall / ceiling  (n̂ = -y, vRel_n = -vy)
      {
        const delta = r - (yMax - py);
        if (delta > 0) {
          const fn = Math.max(0, this.kn * delta - cn * -vy);
          this.forces[i3 + 1] -= fn;
          if (delta > this.maxOverlap) this.maxOverlap = delta;
          this.contactCount++;
        }
      }
      // z- wall  (n̂ = +z, vRel_n = vz)
      {
        const delta = r - (pz - zMin);
        if (delta > 0) {
          const fn = Math.max(0, this.kn * delta - cn * vz);
          this.forces[i3 + 2] += fn;
          if (delta > this.maxOverlap) this.maxOverlap = delta;
          this.contactCount++;
        }
      }
      // z+ wall  (n̂ = -z, vRel_n = -vz)
      {
        const delta = r - (zMax - pz);
        if (delta > 0) {
          const fn = Math.max(0, this.kn * delta - cn * -vz);
          this.forces[i3 + 2] -= fn;
          if (delta > this.maxOverlap) this.maxOverlap = delta;
          this.contactCount++;
        }
      }
    }
  }
}
