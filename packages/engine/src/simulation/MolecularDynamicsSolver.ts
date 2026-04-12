/**
 * MolecularDynamicsSolver — Classical molecular dynamics with Lennard-Jones potential.
 *
 * ## Governing Equations
 *
 *   F_i = -∇V(r_i)
 *   m_i · a_i = F_i
 *
 * ## Potential
 *
 *   V_LJ(r) = 4ε[(σ/r)¹² - (σ/r)⁶], cutoff at r_c = 2.5σ
 *
 * ## Integration: Velocity Verlet (symplectic, time-reversible)
 *
 *   v(t + dt/2) = v(t) + F(t)/(2m) · dt
 *   x(t + dt)   = x(t) + v(t + dt/2) · dt
 *   compute F(t + dt)
 *   v(t + dt)   = v(t + dt/2) + F(t + dt)/(2m) · dt
 *
 * ## Boundary Conditions
 *
 *   Periodic in all 3 dimensions (minimum image convention for force evaluation)
 *
 * ## Thermostat
 *
 *   Berendsen velocity rescaling: λ = √(1 + dt/τ · (T_target/T_current - 1))
 *
 * @see SimSolver — generic interface
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface MDConfig {
  /** Number of particles */
  particleCount: number;
  /** Simulation box size [Lx, Ly, Lz] in reduced units (σ) */
  boxSize: [number, number, number];
  /** LJ well depth ε (default: 1.0 in reduced units) */
  epsilon?: number;
  /** LJ diameter σ (default: 1.0 in reduced units) */
  sigma?: number;
  /** Particle mass (default: 1.0 in reduced units) */
  mass?: number;
  /** Cutoff distance in units of σ (default: 2.5) */
  cutoff?: number;
  /** Target temperature (reduced units, default: 1.0) */
  temperature?: number;
  /** Berendsen coupling time τ (default: 0.5, set 0 for NVE) */
  thermostatTau?: number;
  /** Initial arrangement: 'fcc' lattice or 'random' */
  initialConfig?: 'fcc' | 'random';
}

export interface MDStats {
  currentTime: number;
  stepCount: number;
  kineticEnergy: number;
  potentialEnergy: number;
  totalEnergy: number;
  temperature: number;
  pressure: number;
}

// ── Solver ────────────────────────────────────────────────────────────────────

export class MolecularDynamicsSolver {
  private N: number;
  private box: [number, number, number];
  private eps: number;
  private sig: number;
  private mass: number;
  private rc: number; // cutoff distance
  private rc2: number;
  private targetTemp: number;
  private thermostatTau: number;

  // State arrays (flat: [x0,y0,z0, x1,y1,z1, ...])
  readonly positions: Float64Array;
  readonly velocities: Float64Array;
  private forces: Float64Array;

  private potentialEnergy = 0;
  private virial = 0;
  private currentTime = 0;
  private stepCount = 0;

  constructor(config: MDConfig) {
    this.N = config.particleCount;
    this.box = config.boxSize;
    this.eps = config.epsilon ?? 1.0;
    this.sig = config.sigma ?? 1.0;
    this.mass = config.mass ?? 1.0;
    this.rc = (config.cutoff ?? 2.5) * this.sig;
    this.rc2 = this.rc * this.rc;
    this.targetTemp = config.temperature ?? 1.0;
    this.thermostatTau = config.thermostatTau ?? 0.5;

    this.positions = new Float64Array(this.N * 3);
    this.velocities = new Float64Array(this.N * 3);
    this.forces = new Float64Array(this.N * 3);

    // Initialize positions
    if (config.initialConfig === 'random') {
      this.initRandom();
    } else {
      this.initFCC();
    }

    // Initialize velocities from Maxwell-Boltzmann at target temperature
    this.initVelocities();

    // Initial force computation
    this.computeForces();
  }

  /** Velocity Verlet integration step. */
  step(dt: number): void {
    const N3 = this.N * 3;
    const halfDtOverM = 0.5 * dt / this.mass;

    // v(t + dt/2) = v(t) + F(t)/(2m) · dt
    for (let i = 0; i < N3; i++) {
      this.velocities[i] += this.forces[i] * halfDtOverM;
    }

    // x(t + dt) = x(t) + v(t + dt/2) · dt
    for (let i = 0; i < this.N; i++) {
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
    }

    // Apply periodic boundary conditions
    this.applyPBC();

    // Compute F(t + dt)
    this.computeForces();

    // v(t + dt) = v(t + dt/2) + F(t + dt)/(2m) · dt
    for (let i = 0; i < N3; i++) {
      this.velocities[i] += this.forces[i] * halfDtOverM;
    }

    // Thermostat
    if (this.thermostatTau > 0) {
      this.berendsenThermostat(dt);
    }

    this.currentTime += dt;
    this.stepCount++;
  }

  /** Compute all pairwise LJ forces. O(N²) — fine for N < 10000. */
  private computeForces(): void {
    this.forces.fill(0);
    this.potentialEnergy = 0;
    this.virial = 0;

    const { N, eps, sig, rc2, box } = this;
    const sig2 = sig * sig;

    for (let i = 0; i < N - 1; i++) {
      for (let j = i + 1; j < N; j++) {
        // Minimum image convention
        let dx = this.positions[i * 3] - this.positions[j * 3];
        let dy = this.positions[i * 3 + 1] - this.positions[j * 3 + 1];
        let dz = this.positions[i * 3 + 2] - this.positions[j * 3 + 2];

        // Periodic wrapping
        dx -= box[0] * Math.round(dx / box[0]);
        dy -= box[1] * Math.round(dy / box[1]);
        dz -= box[2] * Math.round(dz / box[2]);

        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 >= rc2) continue;

        const sr2 = sig2 / r2;
        const sr6 = sr2 * sr2 * sr2;
        const sr12 = sr6 * sr6;

        // Force magnitude: F = 24ε/r · [2(σ/r)¹² - (σ/r)⁶]
        const fMag = 24 * eps * (2 * sr12 - sr6) / r2;

        const fx = fMag * dx;
        const fy = fMag * dy;
        const fz = fMag * dz;

        this.forces[i * 3] += fx;
        this.forces[i * 3 + 1] += fy;
        this.forces[i * 3 + 2] += fz;
        this.forces[j * 3] -= fx;
        this.forces[j * 3 + 1] -= fy;
        this.forces[j * 3 + 2] -= fz;

        // Potential: V = 4ε[(σ/r)¹² - (σ/r)⁶]
        this.potentialEnergy += 4 * eps * (sr12 - sr6);
        // Virial for pressure
        this.virial += fMag * r2;
      }
    }
  }

  /** Wrap positions into periodic box. */
  private applyPBC(): void {
    const [Lx, Ly, Lz] = this.box;
    for (let i = 0; i < this.N; i++) {
      this.positions[i * 3] = ((this.positions[i * 3] % Lx) + Lx) % Lx;
      this.positions[i * 3 + 1] = ((this.positions[i * 3 + 1] % Ly) + Ly) % Ly;
      this.positions[i * 3 + 2] = ((this.positions[i * 3 + 2] % Lz) + Lz) % Lz;
    }
  }

  /** Berendsen thermostat: rescale velocities toward target temperature. */
  private berendsenThermostat(dt: number): void {
    const T = this.computeTemperature();
    if (T < 1e-20) return;
    const lambda = Math.sqrt(1 + (dt / this.thermostatTau) * (this.targetTemp / T - 1));
    for (let i = 0; i < this.N * 3; i++) {
      this.velocities[i] *= lambda;
    }
  }

  /** Initialize positions on FCC lattice. */
  private initFCC(): void {
    const [Lx, Ly, Lz] = this.box;
    const nSide = Math.ceil(Math.cbrt(this.N / 4));
    const a = Math.min(Lx, Ly, Lz) / nSide;

    const basis = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
    let idx = 0;

    for (let iz = 0; iz < nSide && idx < this.N; iz++) {
      for (let iy = 0; iy < nSide && idx < this.N; iy++) {
        for (let ix = 0; ix < nSide && idx < this.N; ix++) {
          for (const [bx, by, bz] of basis) {
            if (idx >= this.N) break;
            this.positions[idx * 3] = (ix + bx) * a;
            this.positions[idx * 3 + 1] = (iy + by) * a;
            this.positions[idx * 3 + 2] = (iz + bz) * a;
            idx++;
          }
        }
      }
    }
  }

  private initRandom(): void {
    const [Lx, Ly, Lz] = this.box;
    for (let i = 0; i < this.N; i++) {
      this.positions[i * 3] = Math.random() * Lx;
      this.positions[i * 3 + 1] = Math.random() * Ly;
      this.positions[i * 3 + 2] = Math.random() * Lz;
    }
  }

  /** Maxwell-Boltzmann velocity initialization. */
  private initVelocities(): void {
    const scale = Math.sqrt(this.targetTemp / this.mass);
    // Box-Muller for Gaussian random
    for (let i = 0; i < this.N * 3; i += 2) {
      const u1 = Math.random() || 1e-10;
      const u2 = Math.random();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
      this.velocities[i] = z0 * scale;
      if (i + 1 < this.N * 3) this.velocities[i + 1] = z1 * scale;
    }

    // Remove center-of-mass velocity
    let cmx = 0, cmy = 0, cmz = 0;
    for (let i = 0; i < this.N; i++) {
      cmx += this.velocities[i * 3];
      cmy += this.velocities[i * 3 + 1];
      cmz += this.velocities[i * 3 + 2];
    }
    cmx /= this.N; cmy /= this.N; cmz /= this.N;
    for (let i = 0; i < this.N; i++) {
      this.velocities[i * 3] -= cmx;
      this.velocities[i * 3 + 1] -= cmy;
      this.velocities[i * 3 + 2] -= cmz;
    }
  }

  private computeTemperature(): number {
    let ke = 0;
    for (let i = 0; i < this.N * 3; i++) {
      ke += this.mass * this.velocities[i] * this.velocities[i];
    }
    ke *= 0.5;
    // T = 2KE / (3Nk_B), in reduced units k_B = 1
    return (2 * ke) / (3 * this.N);
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getPositions(): Float64Array { return this.positions; }
  getVelocities(): Float64Array { return this.velocities; }

  getStats(): MDStats {
    let ke = 0;
    for (let i = 0; i < this.N * 3; i++) {
      ke += 0.5 * this.mass * this.velocities[i] * this.velocities[i];
    }
    const T = (2 * ke) / (3 * this.N);
    const V = this.box[0] * this.box[1] * this.box[2];
    const P = (this.N * T + this.virial / 3) / V;

    return {
      currentTime: this.currentTime,
      stepCount: this.stepCount,
      kineticEnergy: ke,
      potentialEnergy: this.potentialEnergy,
      totalEnergy: ke + this.potentialEnergy,
      temperature: T,
      pressure: P,
    };
  }

  dispose(): void {}
}
