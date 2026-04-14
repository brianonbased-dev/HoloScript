/**
 * FITSToGrid — Convert parsed FITS data to HoloScript grid structures.
 *
 * Maps FITS spectral cubes (RA × Dec × Freq) and 2D images to
 * RegularGrid3D for visualization via ScalarFieldOverlay or SimResultsMesh.
 */

import { RegularGrid3D } from '@holoscript/engine/simulation';
import type { FITSFile } from './FITSParser';

/**
 * Convert a parsed FITS file to a RegularGrid3D.
 *
 * - 3D cubes (NAXIS=3): maps directly to grid
 * - 2D images (NAXIS=2): creates a 1-deep grid (nx × ny × 1)
 * - 1D spectra (NAXIS=1): creates a 1×1×n grid
 */
export function fitsToGrid3D(fits: FITSFile): RegularGrid3D {
  const shape = fits.shape;

  let nx: number, ny: number, nz: number;

  if (shape.length >= 3) {
    nx = shape[0];
    ny = shape[1];
    nz = shape[2];
  } else if (shape.length === 2) {
    nx = shape[0];
    ny = shape[1];
    nz = 1;
  } else if (shape.length === 1) {
    nx = shape[0];
    ny = 1;
    nz = 1;
  } else {
    throw new Error(`FITS: Cannot convert ${shape.length}D data to grid`);
  }

  const grid = new RegularGrid3D([nx, ny, nz], [nx, ny, nz]);

  // FITS stores data in FORTRAN order (column-major: NAXIS1 varies fastest)
  // RegularGrid3D uses row-major (x varies fastest in our convention)
  // Since NAXIS1 = x and it varies fastest in both, direct copy works
  const data = fits.data;
  const gridData = grid.data;
  const len = Math.min(data.length, gridData.length);

  for (let i = 0; i < len; i++) {
    gridData[i] = data[i];
  }

  return grid;
}

/**
 * Extract a single frequency channel (z-slice) from a 3D FITS cube.
 * Returns a 2D Float32Array (nx × ny) for use as a ScalarFieldOverlay.
 */
export function extractChannel(fits: FITSFile, channel: number): Float32Array {
  if (fits.shape.length < 3) {
    // 2D image — return the whole thing
    return new Float32Array(fits.data);
  }

  const nx = fits.shape[0];
  const ny = fits.shape[1];
  const nz = fits.shape[2];

  if (channel < 0 || channel >= nz) {
    throw new Error(`Channel ${channel} out of range [0, ${nz - 1}]`);
  }

  const slice = new Float32Array(nx * ny);
  const offset = channel * nx * ny;

  for (let i = 0; i < nx * ny; i++) {
    slice[i] = fits.data[offset + i];
  }

  return slice;
}

/**
 * Get data range (min/max) for the FITS data.
 * Useful for colormap normalization.
 */
export function fitsDataRange(fits: FITSFile): [number, number] {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < fits.data.length; i++) {
    const v = fits.data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}
