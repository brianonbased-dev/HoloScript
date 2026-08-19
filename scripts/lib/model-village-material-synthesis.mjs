/* global Buffer */
import { createHash } from 'node:crypto';

const CHANNELS = Object.freeze(['albedo', 'normal', 'roughness', 'clearcoat']);
const RECIPES = new Set([
  'weathered_timber_v1',
  'lime_plaster_v1',
  'hand_split_slate_v1',
  'rain_darkened_basalt_v1',
]);

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function smoothstep(value) {
  const bounded = clamp(value);
  return bounded * bounded * (3 - 2 * bounded);
}

function fract(value) {
  return value - Math.floor(value);
}

function hash2(x, y, seed) {
  let value = (
    Math.imul(x | 0, 0x1f123bb5)
    ^ Math.imul(y | 0, 0x5f356495)
    ^ Math.imul(seed | 0, 0x6c8e9cf5)
  ) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value / 0xffffffff;
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function fbm(x, y, seed, octaves = 5) {
  let amplitude = 0.55;
  let frequency = 1;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(x * frequency, y * frequency, seed + octave * 1013) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return total / weight;
}

function parseHexColor(value) {
  const match = /^#([a-f0-9]{6})$/i.exec(value || '');
  if (!match) throw new Error(`Expected six-digit hex color, received ${value}`);
  const number = Number.parseInt(match[1], 16);
  return [
    (number >> 16) & 0xff,
    (number >> 8) & 0xff,
    number & 0xff,
  ];
}

function mixColor(a, b, amount) {
  const bounded = clamp(amount);
  return [
    Math.round(lerp(a[0], b[0], bounded)),
    Math.round(lerp(a[1], b[1], bounded)),
    Math.round(lerp(a[2], b[2], bounded)),
  ];
}

function rgbaBuffer(size) {
  return new Uint8Array(size * size * 4);
}

function setPixel(buffer, index, rgb, alpha = 255) {
  const offset = index * 4;
  buffer[offset] = clamp(Math.round(rgb[0]), 0, 255);
  buffer[offset + 1] = clamp(Math.round(rgb[1]), 0, 255);
  buffer[offset + 2] = clamp(Math.round(rgb[2]), 0, 255);
  buffer[offset + 3] = clamp(Math.round(alpha), 0, 255);
}

function setScalar(buffer, index, value) {
  const byte = clamp(Math.round(value), 0, 255);
  setPixel(buffer, index, [byte, byte, byte]);
}

function evaluateTimber(u, v, spec) {
  const warp = fbm(u * 2.4, v * 4.2, spec.seed + 17, 4) - 0.5;
  const longGrain = 0.5 + 0.5 * Math.sin(
    (v * 38 + warp * 5.8 + Math.sin(u * 5.2) * 0.45) * Math.PI,
  );
  const fineGrain = 0.5 + 0.5 * Math.sin(
    (v * 116 + fbm(u * 7, v * 13, spec.seed + 83, 3) * 8) * Math.PI,
  );
  const knotA = Math.hypot((u - 0.27) * 1.8, v - 0.34);
  const knotB = Math.hypot((u - 0.76) * 2.1, v - 0.71);
  const knotRing = Math.max(
    Math.exp(-knotA * 23) * (0.5 + 0.5 * Math.cos(knotA * 105)),
    Math.exp(-knotB * 25) * (0.5 + 0.5 * Math.cos(knotB * 112)),
  );
  const age = fbm(u * 4.5, v * 5.5, spec.seed + 211, 5);
  const height = clamp(
    0.42 + (longGrain - 0.5) * 0.25 + (fineGrain - 0.5) * 0.08 - knotRing * 0.18,
  );
  return {
    colorAmount: clamp(0.25 + longGrain * 0.37 + age * 0.23 - knotRing * 0.25),
    height,
    roughness: clamp(0.64 + age * 0.2 + knotRing * 0.1),
    clearcoat: clamp(0.025 + (1 - age) * 0.025),
  };
}

function evaluatePlaster(u, v, spec) {
  const broad = fbm(u * 3.2, v * 3.2, spec.seed + 31, 5);
  const grain = fbm(u * 17, v * 17, spec.seed + 97, 4);
  const crackA = Math.abs(Math.sin((u * 1.17 + v * 0.23 + broad * 0.19) * Math.PI * 8.3));
  const crackB = Math.abs(Math.sin((v * 0.91 - u * 0.14 + grain * 0.08) * Math.PI * 10.7));
  const crack = Math.max(
    smoothstep((0.045 - crackA) / 0.045),
    smoothstep((0.028 - crackB) / 0.028) * 0.55,
  );
  return {
    colorAmount: clamp(0.36 + broad * 0.38 + grain * 0.16 - crack * 0.19),
    height: clamp(0.48 + (broad - 0.5) * 0.18 + (grain - 0.5) * 0.08 - crack * 0.16),
    roughness: clamp(0.79 + grain * 0.16 + crack * 0.04),
    clearcoat: 0,
  };
}

function evaluateSlate(u, v, spec) {
  const rows = spec.courseCount || 9;
  const columns = spec.tileCount || 6;
  const rowValue = v * rows;
  const row = Math.floor(rowValue);
  const rowLocal = fract(rowValue);
  const offsetU = u + (row % 2 === 0 ? 0 : 0.5 / columns);
  const columnValue = offsetU * columns;
  const column = Math.floor(columnValue);
  const columnLocal = fract(columnValue);
  const edge = Math.min(columnLocal, 1 - columnLocal, rowLocal, 1 - rowLocal);
  const seam = 1 - smoothstep(edge / 0.075);
  const tileRandom = hash2(column, row, spec.seed + 43);
  const flake = fbm(u * 29, v * 29, spec.seed + 157, 3);
  const chipped = smoothstep((0.075 - edge) / 0.075)
    * hash2(column * 7 + Math.floor(rowLocal * 20), row, spec.seed + 331);
  return {
    colorAmount: clamp(0.31 + tileRandom * 0.42 + (flake - 0.5) * 0.17 - seam * 0.24),
    height: clamp(0.43 + rowLocal * 0.12 + tileRandom * 0.08 - seam * 0.31 - chipped * 0.07),
    roughness: clamp(0.48 + flake * 0.21 + seam * 0.17),
    clearcoat: clamp(0.08 + (1 - seam) * 0.17),
  };
}

function evaluateBasalt(u, v, spec) {
  const pitting = fbm(u * 22, v * 22, spec.seed + 401, 4);
  const rain = fbm(u * 4.3, v * 4.3, spec.seed + 503, 5);
  const mineral = fbm(u * 11.5, v * 11.5, spec.seed + 607, 4);
  const pooling = clamp((1 - rain) * 0.54 + (1 - pitting) * 0.18);
  return {
    colorAmount: clamp(0.18 + rain * 0.39 + mineral * 0.24 + (pitting - 0.5) * 0.12),
    height: clamp(0.49 + (rain - 0.5) * 0.08 + (mineral - 0.5) * 0.11 + (pitting - 0.5) * 0.07),
    roughness: clamp(0.34 + pitting * 0.25 + mineral * 0.08 - pooling * 0.09),
    clearcoat: clamp(0.2 + pooling * 0.42),
  };
}

function evaluator(recipe) {
  if (recipe === 'weathered_timber_v1') return evaluateTimber;
  if (recipe === 'lime_plaster_v1') return evaluatePlaster;
  if (recipe === 'hand_split_slate_v1') return evaluateSlate;
  if (recipe === 'rain_darkened_basalt_v1') return evaluateBasalt;
  throw new Error(`Unsupported material recipe: ${recipe}`);
}

function normalMap(height, size, strength) {
  const output = rgbaBuffer(size);
  const sample = (x, y) => height[
    ((y + size) % size) * size + ((x + size) % size)
  ];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (sample(x + 1, y) - sample(x - 1, y)) * strength;
      const dy = (sample(x, y + 1) - sample(x, y - 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      const nx = -dx / length;
      const ny = dy / length;
      const nz = 1 / length;
      setPixel(output, y * size + x, [
        (nx * 0.5 + 0.5) * 255,
        (ny * 0.5 + 0.5) * 255,
        (nz * 0.5 + 0.5) * 255,
      ]);
    }
  }
  return output;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function validateMaterialSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') return ['material spec must be an object'];
  if (!RECIPES.has(spec.recipe)) errors.push(`unsupported recipe ${spec.recipe}`);
  if (!Number.isInteger(spec.seed)) errors.push('seed must be an integer');
  if (!Number.isInteger(spec.resolution) || spec.resolution < 64 || spec.resolution > 512) {
    errors.push('resolution must be an integer between 64 and 512');
  }
  try {
    parseHexColor(spec.darkColor);
    parseHexColor(spec.lightColor);
  } catch (error) {
    errors.push(error.message);
  }
  if (!Array.isArray(spec.repeat) || spec.repeat.length !== 2
    || spec.repeat.some((value) => !Number.isFinite(value) || value <= 0)) {
    errors.push('repeat must contain two positive numbers');
  }
  if (!Number.isFinite(spec.normalStrength) || spec.normalStrength <= 0) {
    errors.push('normalStrength must be positive');
  }
  return errors;
}

export function synthesizeMaterialSet(spec) {
  const errors = validateMaterialSpec(spec);
  if (errors.length > 0) {
    throw new Error(`Invalid material spec: ${errors.join('; ')}`);
  }
  const size = spec.resolution;
  const dark = parseHexColor(spec.darkColor);
  const light = parseHexColor(spec.lightColor);
  const evaluate = evaluator(spec.recipe);
  const albedo = rgbaBuffer(size);
  const roughness = rgbaBuffer(size);
  const clearcoat = rgbaBuffer(size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const sample = evaluate(u, v, spec);
      const microVariation = (hash2(x, y, spec.seed + 991) - 0.5) * 0.035;
      setPixel(albedo, index, mixColor(dark, light, sample.colorAmount + microVariation));
      setScalar(roughness, index, sample.roughness * 255);
      setScalar(clearcoat, index, sample.clearcoat * 255);
      height[index] = sample.height;
    }
  }

  const channels = {
    albedo,
    normal: normalMap(height, size, spec.normalStrength),
    roughness,
    clearcoat,
  };
  return {
    schema: 'hololand.model-village.deterministic-pbr-set.v1',
    recipe: spec.recipe,
    seed: spec.seed,
    resolution: size,
    repeat: [...spec.repeat],
    normalScale: spec.normalScale ?? 1,
    channels,
    hashes: Object.fromEntries(CHANNELS.map((channel) => [
      channel,
      sha256(channels[channel]),
    ])),
  };
}

export function serializeMaterialSet(materialSet) {
  return {
    schema: materialSet.schema,
    recipe: materialSet.recipe,
    seed: materialSet.seed,
    resolution: materialSet.resolution,
    repeat: materialSet.repeat,
    normalScale: materialSet.normalScale,
    hashes: materialSet.hashes,
    channels: Object.fromEntries(CHANNELS.map((channel) => [
      channel,
      Buffer.from(materialSet.channels[channel]).toString('base64'),
    ])),
  };
}

export const MATERIAL_CHANNELS = CHANNELS;
