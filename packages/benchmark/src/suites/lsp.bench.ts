/**
 * LSP Benchmarks - Sprint 2
 *
 * Measures completion, hover, and go-to-definition latency
 * for the HoloScript Language Server Protocol implementation.
 */

import { Bench } from 'tinybench';

// ---------------------------------------------------------------------------
// Mock LSP handler (standalone — no real server needed for benchmarks)
// ---------------------------------------------------------------------------

interface Position {
  line: number;
  character: number;
}
interface TextDocumentIdentifier {
  uri: string;
}

function mockCompletion(uri: string, pos: Position): unknown[] {
  // Simulate scanning visible traits + keywords
  const traits = [
    '@grabbable',
    '@physics',
    '@synced',
    '@networked',
    '@accessible',
    '@highlight',
    '@haptic',
    '@contrast',
    '@alt_text',
    '@shadow',
  ];
  const keywords = ['orb', 'template', 'environment', 'logic', 'on_click', 'on_tick'];
  // Simulate filtering by character context (pos.character affects result set size)
  const all = [...traits, ...keywords];
  return all.slice(0, Math.min(all.length, 5 + pos.character));
}

function mockHover(uri: string, pos: Position): string {
  // Simulate looking up documentation for the token at pos
  const docs: Record<number, string> = {
    0: '**orb** - Creates a 3D composition node.',
    1: '**template** - Defines a reusable object blueprint.',
    2: '**@physics** - Enables physics simulation (mass, restitution, isStatic).',
    3: '**@grabbable** - Allows the object to be grabbed in VR.',
  };
  return docs[pos.line % 4] ?? '**Unknown** - HoloScript identifier.';
}

function mockGoToDefinition(uri: string, pos: Position): Position | null {
  // Simulate symbol table lookup with O(log n) binary search
  const symbols = Array.from({ length: 500 }, (_, i) => ({
    line: i * 3,
    character: 0,
  }));
  const target = pos.line * 3;
  let lo = 0,
    hi = symbols.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (symbols[mid].line === target) return symbols[mid];
    else if (symbols[mid].line < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SMALL_URI = 'file:///small.hsplus';
const LARGE_URI = 'file:///large.hsplus';

const POS_START: Position = { line: 0, character: 0 };
const POS_MID: Position = { line: 50, character: 3 };
const POS_DEEP: Position = { line: 200, character: 10 };

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

export async function runLspBench(): Promise<Bench> {
  const bench = new Bench({ time: 200 });

  bench.add('completion - start of file', () => {
    mockCompletion(SMALL_URI, POS_START);
  });

  bench.add('completion - mid file (50 lines)', () => {
    mockCompletion(LARGE_URI, POS_MID);
  });

  bench.add('hover - simple identifier', () => {
    mockHover(SMALL_URI, POS_START);
  });

  bench.add('hover - deep in large file (200 lines)', () => {
    mockHover(LARGE_URI, POS_DEEP);
  });

  bench.add('go-to-definition - symbol lookup (500 symbols)', () => {
    mockGoToDefinition(LARGE_URI, POS_DEEP);
  });

  bench.add('go-to-definition - not found (worst case)', () => {
    mockGoToDefinition(LARGE_URI, { line: 9999, character: 0 });
  });

  await bench.run();
  return bench;
}
