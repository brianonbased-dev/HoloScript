/**
 * RegularGrid3D — Uniform 3D scalar/vector field for PDE solvers.
 *
 * Flat Float32Array storage with stencil operations (laplacian, gradient, divergence)
 * for finite difference methods. Shared by thermal, structural, and hydraulic solvers.
 */

export class RegularGrid3D {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly components: number;
  readonly dx: number;
  readonly dy: number;
  readonly dz: number;
  readonly data: Float32Array;

  constructor(
    resolution: [number, number, number],
    domainSize: [number, number, number],
    components = 1
  ) {
    this.nx = resolution[0];
    this.ny = resolution[1];
    this.nz = resolution[2];
    this.components = components;
    this.dx = domainSize[0] / (this.nx - 1);
    this.dy = domainSize[1] / (this.ny - 1);
    this.dz = domainSize[2] / (this.nz - 1);
    this.data = new Float32Array(this.nx * this.ny * this.nz * components);
  }

  /** Flat index for cell (i, j, k) component c */
  private idx(i: number, j: number, k: number, c = 0): number {
    return ((k * this.ny + j) * this.nx + i) * this.components + c;
  }

  get(i: number, j: number, k: number, component = 0): number {
    return this.data[this.idx(i, j, k, component)];
  }

  set(i: number, j: number, k: number, value: number, component = 0): void {
    this.data[this.idx(i, j, k, component)] = value;
  }

  /** Total number of cells */
  get cellCount(): number {
    return this.nx * this.ny * this.nz;
  }

  // ── Stencil Operations ──────────────────────────────────────────────────

  /**
   * Discrete Laplacian ∇²f at (i,j,k) using 2nd-order central differences.
   * 
   * BOUNDARY CONTRACT: This solver uses a flat array without ghost cells.
   * At boundaries (e.g. i=0 or i=nx-1), the partial derivative in that 
   * direction is skipped. This results in a partial Laplacian which implicitly
   * enforces a homogeneous Neumann boundary condition (∂T/∂n = 0 / zero flux)
   * if no explicit boundary condition overwrites it after integration.
   */
  laplacian(i: number, j: number, k: number, component = 0): number {
    const c = this.get(i, j, k, component);
    let lap = 0;

    if (i > 0 && i < this.nx - 1) {
      lap +=
        (this.get(i + 1, j, k, component) -
          2 * c +
          this.get(i - 1, j, k, component)) /
        (this.dx * this.dx);
    }
    if (j > 0 && j < this.ny - 1) {
      lap +=
        (this.get(i, j + 1, k, component) -
          2 * c +
          this.get(i, j - 1, k, component)) /
        (this.dy * this.dy);
    }
    if (k > 0 && k < this.nz - 1) {
      lap +=
        (this.get(i, j, k + 1, component) -
          2 * c +
          this.get(i, j, k - 1, component)) /
        (this.dz * this.dz);
    }

    return lap;
  }

  /**
   * Gradient ∇f at (i,j,k) using central differences.
   * Falls back to one-sided differences at boundaries.
   */
  gradient(
    i: number,
    j: number,
    k: number,
    component = 0
  ): [number, number, number] {
    let gx: number, gy: number, gz: number;

    if (i <= 0) {
      gx =
        (this.get(i + 1, j, k, component) - this.get(i, j, k, component)) /
        this.dx;
    } else if (i >= this.nx - 1) {
      gx =
        (this.get(i, j, k, component) - this.get(i - 1, j, k, component)) /
        this.dx;
    } else {
      gx =
        (this.get(i + 1, j, k, component) -
          this.get(i - 1, j, k, component)) /
        (2 * this.dx);
    }

    if (j <= 0) {
      gy =
        (this.get(i, j + 1, k, component) - this.get(i, j, k, component)) /
        this.dy;
    } else if (j >= this.ny - 1) {
      gy =
        (this.get(i, j, k, component) - this.get(i, j - 1, k, component)) /
        this.dy;
    } else {
      gy =
        (this.get(i, j + 1, k, component) -
          this.get(i, j - 1, k, component)) /
        (2 * this.dy);
    }

    if (k <= 0) {
      gz =
        (this.get(i, j, k + 1, component) - this.get(i, j, k, component)) /
        this.dz;
    } else if (k >= this.nz - 1) {
      gz =
        (this.get(i, j, k, component) - this.get(i, j, k - 1, component)) /
        this.dz;
    } else {
      gz =
        (this.get(i, j, k + 1, component) -
          this.get(i, j, k - 1, component)) /
        (2 * this.dz);
    }

    return [gx, gy, gz];
  }

  /**
   * Divergence ∇·F for a 3-component vector field at (i,j,k).
   * Components 0,1,2 = x,y,z.
   */
  divergence(i: number, j: number, k: number): number {
    if (this.components < 3) return 0;

    const [gx] = this.gradient(i, j, k, 0);
    const gy = this.gradient(i, j, k, 1)[1];
    const gz = this.gradient(i, j, k, 2)[2];

    return gx + gy + gz;
  }

  // ── Bulk Operations ─────────────────────────────────────────────────────

  fill(value: number): void {
    this.data.fill(value);
  }

  copy(other: RegularGrid3D): void {
    this.data.set(other.data);
  }

  /** this.data += scale * other.data (element-wise) */
  addScaled(other: RegularGrid3D, scale: number): void {
    const d = this.data;
    const o = other.data;
    for (let n = 0; n < d.length; n++) {
      d[n] += scale * o[n];
    }
  }

  /** L∞ norm (max absolute value) */
  maxAbs(): number {
    let m = 0;
    for (let n = 0; n < this.data.length; n++) {
      const a = Math.abs(this.data[n]);
      if (a > m) m = a;
    }
    return m;
  }

  /** L2 norm */
  norm2(): number {
    let s = 0;
    for (let n = 0; n < this.data.length; n++) {
      s += this.data[n] * this.data[n];
    }
    return Math.sqrt(s);
  }

  // ── Export for Rendering ─────────────────────────────────────────────────

  /** Direct reference to the flat data buffer (for ScalarFieldOverlay) */
  toFloat32Array(): Float32Array {
    return this.data;
  }

  /**
   * Sample grid values at mesh vertex positions via trilinear interpolation.
   * @param positions Flat xyz vertex positions [x0,y0,z0, x1,y1,z1, ...]
   * @param domainOrigin World-space origin of the grid domain
   * @param component Which component to sample (default 0)
   */
  sampleAtPositions(
    positions: Float32Array,
    domainOrigin: [number, number, number] = [0, 0, 0],
    component = 0
  ): Float32Array {
    const vertexCount = positions.length / 3;
    const out = new Float32Array(vertexCount);

    for (let v = 0; v < vertexCount; v++) {
      const wx = positions[v * 3] - domainOrigin[0];
      const wy = positions[v * 3 + 1] - domainOrigin[1];
      const wz = positions[v * 3 + 2] - domainOrigin[2];

      // Continuous grid coordinates
      const fx = wx / this.dx;
      const fy = wy / this.dy;
      const fz = wz / this.dz;

      // Integer bounds (clamped)
      const i0 = Math.max(0, Math.min(this.nx - 2, Math.floor(fx)));
      const j0 = Math.max(0, Math.min(this.ny - 2, Math.floor(fy)));
      const k0 = Math.max(0, Math.min(this.nz - 2, Math.floor(fz)));

      // Fractional parts
      const tx = Math.max(0, Math.min(1, fx - i0));
      const ty = Math.max(0, Math.min(1, fy - j0));
      const tz = Math.max(0, Math.min(1, fz - k0));

      // Trilinear interpolation
      const c000 = this.get(i0, j0, k0, component);
      const c100 = this.get(i0 + 1, j0, k0, component);
      const c010 = this.get(i0, j0 + 1, k0, component);
      const c110 = this.get(i0 + 1, j0 + 1, k0, component);
      const c001 = this.get(i0, j0, k0 + 1, component);
      const c101 = this.get(i0 + 1, j0, k0 + 1, component);
      const c011 = this.get(i0, j0 + 1, k0 + 1, component);
      const c111 = this.get(i0 + 1, j0 + 1, k0 + 1, component);

      const c00 = c000 * (1 - tx) + c100 * tx;
      const c10 = c010 * (1 - tx) + c110 * tx;
      const c01 = c001 * (1 - tx) + c101 * tx;
      const c11 = c011 * (1 - tx) + c111 * tx;

      const c0 = c00 * (1 - ty) + c10 * ty;
      const c1 = c01 * (1 - ty) + c11 * ty;

      out[v] = c0 * (1 - tz) + c1 * tz;
    }

    return out;
  }

  /**
   * Create a deep clone of this grid.
   */
  clone(): RegularGrid3D {
    const g = new RegularGrid3D(
      [this.nx, this.ny, this.nz],
      [this.dx * (this.nx - 1), this.dy * (this.ny - 1), this.dz * (this.nz - 1)],
      this.components
    );
    g.data.set(this.data);
    return g;
  }
}
