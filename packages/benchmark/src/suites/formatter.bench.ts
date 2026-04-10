/**
 * Formatter Benchmarks
 *
 * Measures code formatting performance
 */

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Bench } from 'tinybench';
import { HoloScriptFormatter, DEFAULT_CONFIG } from '@holoscript/formatter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load fixtures - go up to package root
const fixturesDir = resolve(__dirname, '../../fixtures');
const smallSource = readFileSync(resolve(fixturesDir, 'small.hsplus'), 'utf-8');
const mediumSource = readFileSync(resolve(fixturesDir, 'medium.hsplus'), 'utf-8');
const largeSource = readFileSync(resolve(fixturesDir, 'large.hsplus'), 'utf-8');

const bench = new Bench({ time: 1000 });

const formatter = new HoloScriptFormatter(DEFAULT_CONFIG);

bench
  .add('format-small', () => {
    formatter.format(smallSource, 'hsplus');
  })
  .add('format-medium', () => {
    formatter.format(mediumSource, 'hsplus');
  })
  .add('format-large', () => {
    formatter.format(largeSource, 'hsplus');
  })
  .add('format-range-small', () => {
    formatter.formatRange(smallSource, { startLine: 0, endLine: 10 }, 'hsplus');
  })
  .add('format-range-medium', () => {
    formatter.formatRange(mediumSource, { startLine: 10, endLine: 50 }, 'hsplus');
  });

export async function runFormatterBench() {
  await bench.run();
  return bench;
}
