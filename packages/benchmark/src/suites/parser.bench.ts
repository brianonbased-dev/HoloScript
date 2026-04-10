/**
 * Parser Benchmarks
 *
 * Measures parsing speed for different file sizes
 */

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Bench } from 'tinybench';
import {
  HoloScriptPlusParser,
  ChunkBasedIncrementalParser,
  globalParseCache,
} from '@holoscript/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load fixtures - go up to package root (../.. from dist/suites or src/suites)
const fixturesDir = resolve(__dirname, '../../fixtures');
const smallSource = readFileSync(resolve(fixturesDir, 'small.hsplus'), 'utf-8');
const mediumSource = readFileSync(resolve(fixturesDir, 'medium.hsplus'), 'utf-8');
const largeSource = readFileSync(resolve(fixturesDir, 'large.hsplus'), 'utf-8');

const bench = new Bench({ time: 1000 });

// Full parse benchmarks
const parser = new HoloScriptPlusParser();

bench
  .add('parse-small (100 lines)', () => {
    parser.parse(smallSource);
  })
  .add('parse-medium (600 lines)', () => {
    parser.parse(mediumSource);
  })
  .add('parse-large (1200 lines)', () => {
    parser.parse(largeSource);
  });

// Incremental parse benchmarks
const incrementalParser = new ChunkBasedIncrementalParser(globalParseCache);

bench
  .add('incremental-small-single-edit', () => {
    const modified = smallSource.replace('color: "blue"', 'color: "red"');
    incrementalParser.parse(modified);
  })
  .add('incremental-medium-single-edit', () => {
    const modified = mediumSource.replace('color: "red"', 'color: "cyan"');
    incrementalParser.parse(modified);
  })
  .add('incremental-large-single-edit', () => {
    const modified = largeSource.replace('color: "red"', 'color: "magenta"');
    incrementalParser.parse(modified);
  });

export async function runParserBench() {
  await bench.run();
  return bench;
}
