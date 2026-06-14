'use client';

/**
 * lotusTextures — deterministic procedural normal/roughness maps for the petal.
 *
 * The real surface detail (vein normal map + waxy roughness mottling) is generated
 * by @holoscript/core's `generateBotanicalNormalMap` / `generateBotanicalRoughnessMap`.
 * Those are PURE math (value-noise fbm → finite-difference normals) with NO three.js
 * or WebGL dependency. The Railway runtime bundle can't import core, so this module
 * is a verbatim port of that pure algorithm — the SAME seeds + params (baked into the
 * scene JSON) produce PIXEL-IDENTICAL maps, then wrapped in a three DataTexture here.
 *
 * Keeping it as regenerated math (not baked pixel arrays) keeps the scene JSON small:
 * a 256² RGBA map is 256 KB of raw bytes — two of them inlined as JSON number arrays
 * would bloat each scene by ~1.5 MB. The noise loop runs once on mount instead.
 *
 * Source of truth: packages/core/src/traits/BotanicalLotusTrait.ts (botFbm,
 * botanicalSurfaceHeight, generateBotanicalNormalMap, generateBotanicalRoughnessMap).
 */
import * as THREE from 'three';

function botMix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function botHash(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1013904223)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function botValueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = botHash(ix, iy, seed);
  const b = botHash(ix + 1, iy, seed);
  const c = botHash(ix, iy + 1, seed);
  const d = botHash(ix + 1, iy + 1, seed);
  return botMix(botMix(a, b, ux), botMix(c, d, ux), uy);
}
function botFbm(x: number, y: number, seed: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * botValueNoise(x * freq, y * freq, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function botanicalSurfaceHeight(pattern: string, u: number, v: number, seed: number): number {
  const micro = botFbm(u * 26, v * 26, seed, 4);
  if (pattern === 'petal_veins') {
    const sx = u * 2 - 1;
    const major = Math.pow(1 - Math.abs(Math.sin((sx * 9 + v * 3.2) * Math.PI)), 8);
    const secondary = Math.pow(1 - Math.abs(Math.sin((sx * 19 - v * 2) * Math.PI)), 16) * 0.5;
    const ridge = Math.max(0, 1 - Math.abs(sx) * 3) * (0.4 + v * 0.3);
    return micro * 0.28 + major * 0.46 + secondary * 0.2 + ridge * 0.4;
  }
  if (pattern === 'leaf_radial') {
    const cx = u * 2 - 1;
    const cy = v * 2 - 1;
    const ang = Math.atan2(cy, cx);
    const rad = Math.min(1, Math.sqrt(cx * cx + cy * cy));
    const veins = Math.pow(Math.abs(Math.sin(ang * 13.0)), 6) * (1 - rad);
    const rings = Math.pow(Math.abs(Math.sin(rad * 22.0)), 4) * 0.3;
    return micro * 0.34 + veins * 0.56 + rings;
  }
  return micro;
}

/** Tangent-space normal map (RGBA8) — port of core generateBotanicalNormalMap. */
export function buildBotanicalNormalTexture(opts: {
  size?: number;
  seed?: number;
  pattern?: string;
  strength?: number;
}): THREE.DataTexture {
  const size = opts.size ?? 256;
  const seed = (opts.seed ?? 0xdead) >>> 0;
  const strength = opts.strength ?? 1.6;
  const pattern = opts.pattern ?? 'petal_veins';
  const data = new Uint8Array(size * size * 4);
  const inv = 1 / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x * inv;
      const v = y * inv;
      const hL = botanicalSurfaceHeight(pattern, ((x - 1 + size) % size) * inv, v, seed);
      const hR = botanicalSurfaceHeight(pattern, ((x + 1) % size) * inv, v, seed);
      const hD = botanicalSurfaceHeight(pattern, u, ((y - 1 + size) % size) * inv, seed);
      const hU = botanicalSurfaceHeight(pattern, u, ((y + 1) % size) * inv, seed);
      let nx = (hL - hR) * strength;
      let ny = (hD - hU) * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      const i = (y * size + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Grayscale roughness map (RGBA8) — port of core generateBotanicalRoughnessMap. */
export function buildBotanicalRoughnessTexture(opts: {
  size?: number;
  seed?: number;
  base?: number;
  variance?: number;
  scale?: number;
}): THREE.DataTexture {
  const size = opts.size ?? 256;
  const seed = (opts.seed ?? 0xb007) >>> 0;
  const base = opts.base ?? 0.6;
  const variance = opts.variance ?? 0.3;
  const scale = opts.scale ?? 10;
  const data = new Uint8Array(size * size * 4);
  const inv = 1 / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const r = Math.min(
        1,
        Math.max(0, base + (botFbm(x * inv * scale, y * inv * scale, seed, 4) - 0.5) * 2 * variance)
      );
      const g = Math.round(r * 255);
      const i = (y * size + x) * 4;
      data[i] = g;
      data[i + 1] = g;
      data[i + 2] = g;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}
