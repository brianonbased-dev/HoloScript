/**
 * BoundaryConditions — Dirichlet, Neumann, Robin, and Convection BCs
 * for grid-based PDE solvers.
 */

import { RegularGrid3D } from './RegularGrid3D';

export type BCType = 'dirichlet' | 'neumann' | 'robin' | 'convection';
export type BCFace = 'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+';

export interface BoundaryCondition {
  type: BCType;
  faces: BCFace[];
  /** Fixed value (Dirichlet), flux (Neumann), or reference value (Robin/Convection) */
  value: number;
  /** Heat transfer coefficient h (convection) or alpha (Robin) */
  coefficient?: number;
  /** Ambient temperature for convection BC */
  ambient?: number;
}

/**
 * Apply boundary conditions to a scalar field grid.
 *
 * - Dirichlet: set boundary cells to fixed value
 * - Neumann: ghost-cell gradient enforcement (∂T/∂n = flux)
 * - Convection: -k∂T/∂n = h(T - T_ambient)
 * - Robin: αT + β∂T/∂n = value
 */
export function applyBoundaryConditions(
  grid: RegularGrid3D,
  bcs: BoundaryCondition[],
  dt: number,
  component = 0
): void {
  for (const bc of bcs) {
    for (const face of bc.faces) {
      applyToFace(grid, face, bc, dt, component);
    }
  }
}

function applyToFace(
  grid: RegularGrid3D,
  face: BCFace,
  bc: BoundaryCondition,
  _dt: number,
  c: number
): void {
  const { nx, ny, nz } = grid;

  switch (face) {
    case 'x-':
      for (let k = 0; k < nz; k++)
        for (let j = 0; j < ny; j++) applyAtCell(grid, 0, j, k, face, bc, c);
      break;
    case 'x+':
      for (let k = 0; k < nz; k++)
        for (let j = 0; j < ny; j++)
          applyAtCell(grid, nx - 1, j, k, face, bc, c);
      break;
    case 'y-':
      for (let k = 0; k < nz; k++)
        for (let i = 0; i < nx; i++) applyAtCell(grid, i, 0, k, face, bc, c);
      break;
    case 'y+':
      for (let k = 0; k < nz; k++)
        for (let i = 0; i < nx; i++)
          applyAtCell(grid, i, ny - 1, k, face, bc, c);
      break;
    case 'z-':
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) applyAtCell(grid, i, j, 0, face, bc, c);
      break;
    case 'z+':
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++)
          applyAtCell(grid, i, j, nz - 1, face, bc, c);
      break;
  }
}

function applyAtCell(
  grid: RegularGrid3D,
  i: number,
  j: number,
  k: number,
  face: BCFace,
  bc: BoundaryCondition,
  c: number
): void {
  switch (bc.type) {
    case 'dirichlet':
      grid.set(i, j, k, bc.value, c);
      break;

    case 'neumann': {
      // Ghost cell: T_boundary = T_interior + flux * dx
      const [ni, nj, nk] = interiorNeighbor(i, j, k, face, grid);
      const dn = normalSpacing(face, grid);
      grid.set(i, j, k, grid.get(ni, nj, nk, c) + bc.value * dn, c);
      break;
    }

    case 'convection': {
      // -k ∂T/∂n = h(T - T_amb) → T_boundary = (T_interior + Bi·T_amb) / (1 + Bi)
      const h = bc.coefficient ?? 10;
      const Tamb = bc.ambient ?? bc.value;
      const [ni, nj, nk] = interiorNeighbor(i, j, k, face, grid);
      const dn = normalSpacing(face, grid);
      const Bi = (h * dn) / 1.0; // Biot number (k=1 normalized, actual k applied by solver)
      const Tinterior = grid.get(ni, nj, nk, c);
      grid.set(i, j, k, (Tinterior + Bi * Tamb) / (1 + Bi), c);
      break;
    }

    case 'robin': {
      // α·T + β·∂T/∂n = value
      const alpha = bc.coefficient ?? 1;
      const [ni, nj, nk] = interiorNeighbor(i, j, k, face, grid);
      const dn = normalSpacing(face, grid);
      const Tinterior = grid.get(ni, nj, nk, c);
      // Approximate: T_boundary ≈ (value + (1/dn)·T_interior) / (alpha + 1/dn)
      grid.set(i, j, k, (bc.value + Tinterior / dn) / (alpha + 1 / dn), c);
      break;
    }
  }
}

/** Get the interior neighbor cell adjacent to a boundary cell */
function interiorNeighbor(
  i: number,
  j: number,
  k: number,
  face: BCFace,
  grid: RegularGrid3D
): [number, number, number] {
  switch (face) {
    case 'x-': return [Math.min(i + 1, grid.nx - 1), j, k];
    case 'x+': return [Math.max(i - 1, 0), j, k];
    case 'y-': return [i, Math.min(j + 1, grid.ny - 1), k];
    case 'y+': return [i, Math.max(j - 1, 0), k];
    case 'z-': return [i, j, Math.min(k + 1, grid.nz - 1)];
    case 'z+': return [i, j, Math.max(k - 1, 0)];
  }
}

/** Grid spacing in the normal direction for a face */
function normalSpacing(face: BCFace, grid: RegularGrid3D): number {
  switch (face) {
    case 'x-':
    case 'x+':
      return grid.dx;
    case 'y-':
    case 'y+':
      return grid.dy;
    case 'z-':
    case 'z+':
      return grid.dz;
  }
}
