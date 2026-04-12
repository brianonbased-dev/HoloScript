/**
 * SpectralCubeViewer + FITSViewerPanel — integration tests.
 * Validates FITS → parse → channel extraction → data range pipeline.
 */

import { describe, it, expect } from 'vitest';
import { parseFITS, buildFITS } from '../src/fits/FITSParser';
import { fitsToGrid3D, extractChannel, fitsDataRange } from '../src/fits/FITSToGrid';

describe('FITS Viewer Pipeline', () => {
  it('parses a synthetic 2D FITS image', () => {
    const data: number[] = [];
    for (let j = 0; j < 8; j++) {
      for (let i = 0; i < 10; i++) {
        data.push(i + j * 10); // gradient
      }
    }

    const buffer = buildFITS({
      bitpix: -32,
      shape: [10, 8],
      data,
      headers: { OBJECT: 'Test Image', TELESCOP: 'HoloScript' },
    });

    const fits = parseFITS(buffer);
    expect(fits.shape).toEqual([10, 8]);
    expect(fits.object).toBe('Test Image');
    expect(fits.telescope).toBe('HoloScript');
    expect(fits.data.length).toBe(80);
    expect(fits.data[0]).toBeCloseTo(0);
    expect(fits.data[79]).toBeCloseTo(79);
  });

  it('parses a synthetic 3D FITS spectral cube', () => {
    const nx = 4, ny = 3, nz = 5;
    const data: number[] = [];
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          data.push(k * 100 + j * 10 + i);
        }
      }
    }

    const buffer = buildFITS({
      bitpix: -32,
      shape: [nx, ny, nz],
      data,
      headers: {
        OBJECT: 'Spectral Cube',
        CRVAL3: 1.4e9,
        CDELT3: 1e6,
        CTYPE3: 'FREQ',
        CUNIT3: 'Hz',
      },
    });

    const fits = parseFITS(buffer);
    expect(fits.shape).toEqual([nx, ny, nz]);
    expect(fits.data.length).toBe(nx * ny * nz);

    // Extract channel 2
    const ch2 = extractChannel(fits, 2);
    expect(ch2.length).toBe(nx * ny);
    // Channel 2 values: 200, 201, ..., 211
    expect(ch2[0]).toBeCloseTo(200);
    expect(ch2[nx * ny - 1]).toBeCloseTo(211);
  });

  it('fitsToGrid3D creates correct grid dimensions', () => {
    const buffer = buildFITS({
      bitpix: -32,
      shape: [5, 4, 3],
      data: Array.from({ length: 60 }, (_, i) => i),
    });

    const fits = parseFITS(buffer);
    const grid = fitsToGrid3D(fits);

    expect(grid.nx).toBe(5);
    expect(grid.ny).toBe(4);
    expect(grid.nz).toBe(3);
  });

  it('fitsDataRange computes correct min/max', () => {
    const buffer = buildFITS({
      bitpix: -32,
      shape: [3, 3],
      data: [1, 5, 3, -2, 7, 0, 4, 8, -1],
    });

    const fits = parseFITS(buffer);
    const [min, max] = fitsDataRange(fits);
    expect(min).toBe(-2);
    expect(max).toBe(8);
  });

  it('handles BSCALE/BZERO for integer FITS', () => {
    const buffer = buildFITS({
      bitpix: 16, // int16
      shape: [4],
      data: [0, 100, 200, 300],
      bscale: 0.1,
      bzero: 50,
    });

    const fits = parseFITS(buffer);
    // Physical value = BSCALE * raw + BZERO
    expect(fits.data[0]).toBeCloseTo(50);       // 0.1 * 0 + 50
    expect(fits.data[1]).toBeCloseTo(60);       // 0.1 * 100 + 50
    expect(fits.data[3]).toBeCloseTo(80);       // 0.1 * 300 + 50
  });

  it('2D image converts to nx×ny×1 grid', () => {
    const buffer = buildFITS({
      bitpix: -32,
      shape: [6, 4],
      data: Array.from({ length: 24 }, (_, i) => i),
    });

    const fits = parseFITS(buffer);
    const grid = fitsToGrid3D(fits);

    expect(grid.nx).toBe(6);
    expect(grid.ny).toBe(4);
    expect(grid.nz).toBe(1);
  });
});
