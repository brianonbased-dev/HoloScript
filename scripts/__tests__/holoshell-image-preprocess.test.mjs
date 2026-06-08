#!/usr/bin/env node
/**
 * Pure Node tests for HoloShell RGB preprocessing modes.
 */

import { preprocessFrame } from '../holoshell/image/preprocess.mjs';

let testsRun = 0;
let testsFailed = 0;

function assertOk(value, name) {
  testsRun += 1;
  if (value) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
  }
}

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(
      `  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function makeFrame(width, height, pixelAt) {
  const stride = 3;
  const rgb = new Uint8Array(width * height * stride);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixelAt(x, y);
      const p = (y * width + x) * stride;
      rgb[p] = r;
      rgb[p + 1] = g;
      rgb[p + 2] = b;
    }
  }
  return { width, height, stride, rgb };
}

console.log('Test 1: raw mode preserves the same frame bytes');
const rawSource = makeFrame(4, 4, (x, y) => [x * 30, y * 30, 40]);
const raw = preprocessFrame(rawSource, 'raw');
assertEq(raw.summary.mode, 'raw', 'raw mode recorded');
assertEq(raw.summary.applied, false, 'raw mode is not applied');
assertOk(raw.frame.rgb === rawSource.rgb, 'raw mode keeps RGB buffer identity');

console.log('Test 2: luma-clahe changes a low-contrast gradient');
const gradient = makeFrame(8, 8, (x, y) => {
  const value = 88 + x + y;
  return [value, value, value];
});
const clahe = preprocessFrame(gradient, 'luma-clahe');
assertEq(clahe.summary.mode, 'luma-clahe', 'clahe mode recorded');
assertOk(clahe.summary.changedPixelRatio > 0.5, 'clahe changes most low-contrast pixels');
assertOk(clahe.frame.rgb !== gradient.rgb, 'clahe returns a new RGB buffer');

console.log('Test 3: bilateral-light preserves hard edges better than plain averaging would');
const edge = makeFrame(6, 4, (x) => (x < 3 ? [20, 20, 20] : [230, 230, 230]));
const bilateral = preprocessFrame(edge, 'bilateral-light');
const leftEdge = bilateral.frame.rgb[(1 * edge.width + 2) * edge.stride];
const rightEdge = bilateral.frame.rgb[(1 * edge.width + 3) * edge.stride];
assertEq(bilateral.summary.mode, 'bilateral-light', 'bilateral mode recorded');
assertOk(rightEdge - leftEdge > 150, 'bilateral keeps strong edge contrast');

console.log('Test 4: nlm-light smooths isolated same-patch noise');
const noisy = makeFrame(7, 7, () => [100, 100, 100]);
const center = (3 * noisy.width + 3) * noisy.stride;
noisy.rgb[center] = 130;
noisy.rgb[center + 1] = 130;
noisy.rgb[center + 2] = 130;
const nlm = preprocessFrame(noisy, 'nlm-light');
assertEq(nlm.summary.mode, 'nlm-light', 'nlm mode recorded');
assertOk(nlm.summary.changedPixelRatio > 0, 'nlm changes at least one pixel');
assertOk(nlm.frame.rgb[center] < noisy.rgb[center], 'nlm pulls isolated noise toward neighbors');

console.log('Test 5: unknown modes fail closed');
let threw = false;
try {
  preprocessFrame(rawSource, 'magic');
} catch {
  threw = true;
}
assertOk(threw, 'unknown preprocess mode throws');

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
