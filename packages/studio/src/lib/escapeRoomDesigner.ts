/**
 * escapeRoomDesigner.ts — Escape Room Designer Engine
 *
 * Puzzle dependency graphs, hint triggers, player tracking,
 * solution verification, and room flow management.
 */

export interface Vec3 { x: number; y: number; z: number }

export type PuzzleType = 'lock' | 'cipher' | 'pattern' | 'physical' | 'logic' | 'search' | 'mechanical';
export type PuzzleStatus = 'locked' | 'available' | 'in-progress' | 'solved' | 'skipped';
export type HintLevel = 'nudge' | 'direction' | 'solution';

export interface Puzzle {
  id: string;
  name: string;
  type: PuzzleType;
  description: string;
  position: Vec3;
  difficulty: 1 | 2 | 3 | 4 | 5;
  timeEstimateSec: number;
  solution: string;
  status: PuzzleStatus;
  dependsOn: string[];       // Puzzle IDs that must be solved first
  hints: Array<{ level: HintLevel; text: string }>;
  maxAttempts: number;
  attempts: number;
}

export interface EscapeRoom {
  id: string;
  name: string;
  theme: string;
  timeLimitSec: number;
  puzzles: Puzzle[];
  startTime: number | null;
  elapsedSec: number;
  hintsUsed: number;
  maxHints: number;
}

export function isPuzzleAvailable(puzzle: Puzzle, allPuzzles: Puzzle[]): boolean {
  if (puzzle.status === 'solved') return false;
  return puzzle.dependsOn.every(depId => {
    const dep = allPuzzles.find(p => p.id === depId);
    return dep?.status === 'solved';
  });
}

export function checkSolution(puzzle: Puzzle, answer: string): boolean {
  return answer.toLowerCase().trim() === puzzle.solution.toLowerCase().trim();
}

export function roomProgress(room: EscapeRoom): number {
  const solved = room.puzzles.filter(p => p.status === 'solved').length;
  return room.puzzles.length > 0 ? solved / room.puzzles.length : 0;
}

export function timeRemaining(room: EscapeRoom): number {
  return Math.max(0, room.timeLimitSec - room.elapsedSec);
}

export function isRoomComplete(room: EscapeRoom): boolean {
  return room.puzzles.every(p => p.status === 'solved' || p.status === 'skipped');
}

export function getNextHint(puzzle: Puzzle, hintsGiven: number): string | null {
  if (hintsGiven >= puzzle.hints.length) return null;
  return puzzle.hints[hintsGiven].text;
}

export function criticalPath(puzzles: Puzzle[]): Puzzle[] {
  // Return puzzles that are on the longest dependency chain
  const visited = new Set<string>();
  const chain: Puzzle[] = [];
  function dfs(id: string): number {
    if (visited.has(id)) return 0;
    visited.add(id);
    const puzzle = puzzles.find(p => p.id === id);
    if (!puzzle) return 0;
    let maxDepth = 0;
    for (const dep of puzzle.dependsOn) {
      maxDepth = Math.max(maxDepth, dfs(dep) + 1);
    }
    chain.push(puzzle);
    return maxDepth;
  }
  for (const p of puzzles) dfs(p.id);
  return chain;
}

export function averageDifficulty(puzzles: Puzzle[]): number {
  if (puzzles.length === 0) return 0;
  return puzzles.reduce((sum, p) => sum + p.difficulty, 0) / puzzles.length;
}

export function estimatedTotalTime(puzzles: Puzzle[]): number {
  return puzzles.reduce((sum, p) => sum + p.timeEstimateSec, 0);
}

// ═══════════════════════════════════════════════════════════════════
// Procedural Puzzle Generation
// ═══════════════════════════════════════════════════════════════════

const SOLUTIONS_POOL: Record<PuzzleType, string[]> = {
  lock: ['1234', '5678', '9021', '3141', '7890', '2468', '1357', '8024'],
  cipher: ['freedom', 'escape', 'shadow', 'labyrinth', 'enigma', 'phantom', 'nexus'],
  pattern: ['ABBA', 'AABB', 'ABCD', 'ABAC', 'CBBA', 'DCBA'],
  physical: ['pull', 'push', 'twist', 'slide', 'lift', 'rotate'],
  logic: ['true', 'north', 'seven', 'blue', 'third', 'last'],
  search: ['drawer', 'behind_painting', 'under_rug', 'bookshelf', 'ceiling_tile'],
  mechanical: ['clockwise', 'three_turns', 'reverse', 'align_gears'],
};

/**
 * Generates a procedural puzzle variant with a randomized solution
 * from the type-appropriate pool. Randomizes solution each playthrough.
 */
export function generateProceduralPuzzle(
  template: Puzzle,
  seed?: number
): Puzzle {
  const pool = SOLUTIONS_POOL[template.type] ?? ['default'];
  // Simple seeded random (LCG)
  const rng = seed !== undefined
    ? () => { seed = (seed! * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; }
    : Math.random;

  const solution = pool[Math.floor(rng() * pool.length)];
  return {
    ...template,
    solution,
    status: template.dependsOn.length === 0 ? 'available' : 'locked',
    attempts: 0,
  };
}
