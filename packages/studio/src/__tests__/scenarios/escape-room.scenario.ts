/**
 * escape-room.scenario.ts — LIVING-SPEC: Escape Room Designer
 *
 * Persona: Felix — puzzle designer who builds escape rooms with
 * dependency graphs, progressive hints, and solution verification.
 */

import { describe, it, expect } from 'vitest';
import {
  isPuzzleAvailable,
  checkSolution,
  roomProgress,
  timeRemaining,
  isRoomComplete,
  getNextHint,
  criticalPath,
  averageDifficulty,
  estimatedTotalTime,
  generateProceduralPuzzle,
  multiplayerSync,
  type Puzzle,
  type EscapeRoom,
} from '@/lib/escapeRoomDesigner';

describe('Scenario: Escape Room — Puzzle Dependencies', () => {
  const puzzles: Puzzle[] = [
    {
      id: 'p1',
      name: 'Find the Key',
      type: 'search',
      description: '',
      position: { x: 0, y: 0, z: 0 },
      difficulty: 1,
      timeEstimateSec: 60,
      solution: 'drawer',
      status: 'solved',
      dependsOn: [],
      hints: [{ level: 'nudge', text: 'Look around' }],
      maxAttempts: 5,
      attempts: 1,
    },
    {
      id: 'p2',
      name: 'Open the Box',
      type: 'lock',
      description: '',
      position: { x: 1, y: 0, z: 0 },
      difficulty: 2,
      timeEstimateSec: 120,
      solution: '4521',
      status: 'available',
      dependsOn: ['p1'],
      hints: [
        { level: 'nudge', text: 'Check the key' },
        { level: 'direction', text: 'Numbers on back' },
        { level: 'solution', text: '4521' },
      ],
      maxAttempts: 5,
      attempts: 0,
    },
    {
      id: 'p3',
      name: 'Decode Message',
      type: 'cipher',
      description: '',
      position: { x: 2, y: 0, z: 0 },
      difficulty: 4,
      timeEstimateSec: 300,
      solution: 'freedom',
      status: 'locked',
      dependsOn: ['p2'],
      hints: [{ level: 'nudge', text: 'Use the cipher wheel' }],
      maxAttempts: 3,
      attempts: 0,
    },
    {
      id: 'p4',
      name: 'Final Lock',
      type: 'logic',
      description: '',
      position: { x: 3, y: 0, z: 0 },
      difficulty: 5,
      timeEstimateSec: 180,
      solution: 'escape',
      status: 'locked',
      dependsOn: ['p2', 'p3'],
      hints: [],
      maxAttempts: 3,
      attempts: 0,
    },
  ];

  it('p2 is available because p1 is solved', () => {
    expect(isPuzzleAvailable(puzzles[1], puzzles)).toBe(true);
  });

  it('p3 is NOT available because p2 is not solved', () => {
    expect(isPuzzleAvailable(puzzles[2], puzzles)).toBe(false);
  });

  it('p4 requires both p2 AND p3 solved', () => {
    expect(isPuzzleAvailable(puzzles[3], puzzles)).toBe(false);
  });

  it('solved puzzle is not available (already done)', () => {
    expect(isPuzzleAvailable(puzzles[0], puzzles)).toBe(false);
  });

  it('criticalPath() returns all connected puzzles', () => {
    const path = criticalPath(puzzles);
    expect(path.length).toBe(4);
  });
});

describe('Scenario: Escape Room — Solutions & Hints', () => {
  it('checkSolution() is case-insensitive', () => {
    const puzzle: Puzzle = {
      id: 'p',
      name: '',
      type: 'cipher',
      description: '',
      position: { x: 0, y: 0, z: 0 },
      difficulty: 1,
      timeEstimateSec: 60,
      solution: 'Hello',
      status: 'available',
      dependsOn: [],
      hints: [],
      maxAttempts: 5,
      attempts: 0,
    };
    expect(checkSolution(puzzle, 'hello')).toBe(true);
    expect(checkSolution(puzzle, 'HELLO')).toBe(true);
    expect(checkSolution(puzzle, '  hello  ')).toBe(true);
    expect(checkSolution(puzzle, 'wrong')).toBe(false);
  });

  it('getNextHint() returns progressive hints', () => {
    const puzzle: Puzzle = {
      id: 'p',
      name: '',
      type: 'lock',
      description: '',
      position: { x: 0, y: 0, z: 0 },
      difficulty: 2,
      timeEstimateSec: 120,
      solution: '1234',
      status: 'available',
      dependsOn: [],
      hints: [
        { level: 'nudge', text: 'Look closer' },
        { level: 'direction', text: 'Try the shelf' },
        { level: 'solution', text: '1234' },
      ],
      maxAttempts: 5,
      attempts: 0,
    };
    expect(getNextHint(puzzle, 0)).toBe('Look closer');
    expect(getNextHint(puzzle, 1)).toBe('Try the shelf');
    expect(getNextHint(puzzle, 2)).toBe('1234');
    expect(getNextHint(puzzle, 3)).toBeNull();
  });
});

describe('Scenario: Escape Room — Room Progress', () => {
  const room: EscapeRoom = {
    id: 'r1',
    name: 'The Vault',
    theme: 'heist',
    timeLimitSec: 3600,
    puzzles: [
      {
        id: 'p1',
        name: 'A',
        type: 'search',
        description: '',
        position: { x: 0, y: 0, z: 0 },
        difficulty: 1,
        timeEstimateSec: 60,
        solution: 'x',
        status: 'solved',
        dependsOn: [],
        hints: [],
        maxAttempts: 5,
        attempts: 1,
      },
      {
        id: 'p2',
        name: 'B',
        type: 'lock',
        description: '',
        position: { x: 0, y: 0, z: 0 },
        difficulty: 3,
        timeEstimateSec: 120,
        solution: 'y',
        status: 'in-progress',
        dependsOn: [],
        hints: [],
        maxAttempts: 5,
        attempts: 2,
      },
    ],
    startTime: Date.now(),
    elapsedSec: 1200,
    hintsUsed: 1,
    maxHints: 5,
  };

  it('roomProgress() = 50% with 1/2 solved', () => {
    expect(roomProgress(room)).toBe(0.5);
  });

  it('timeRemaining() calculates correctly', () => {
    expect(timeRemaining(room)).toBe(2400); // 3600 - 1200
  });

  it('isRoomComplete() false until all solved/skipped', () => {
    expect(isRoomComplete(room)).toBe(false);
  });

  it('averageDifficulty() = 2.0 for [1, 3]', () => {
    expect(averageDifficulty(room.puzzles)).toBe(2);
  });

  it('estimatedTotalTime() sums all puzzle estimates', () => {
    expect(estimatedTotalTime(room.puzzles)).toBe(180);
  });

  it('multiplayer sync — coordinate puzzle solving across players', () => {
    const puzzles: Puzzle[] = [
      {
        id: 'p1',
        name: 'Lock',
        type: 'lock',
        description: '',
        position: { x: 0, y: 0, z: 0 },
        difficulty: 1,
        timeEstimateSec: 60,
        solution: '1234',
        status: 'available',
        dependsOn: [],
        hints: [],
        maxAttempts: 5,
        attempts: 0,
      },
      {
        id: 'p2',
        name: 'Cipher',
        type: 'cipher',
        description: '',
        position: { x: 1, y: 0, z: 0 },
        difficulty: 2,
        timeEstimateSec: 120,
        solution: 'escape',
        status: 'available',
        dependsOn: [],
        hints: [],
        maxAttempts: 5,
        attempts: 0,
      },
      {
        id: 'p3',
        name: 'Logic',
        type: 'logic',
        description: '',
        position: { x: 2, y: 0, z: 0 },
        difficulty: 3,
        timeEstimateSec: 180,
        solution: 'true',
        status: 'locked',
        dependsOn: ['p1'],
        hints: [],
        maxAttempts: 5,
        attempts: 0,
      },
    ];
    const assignments = multiplayerSync(puzzles, ['alice', 'bob']);
    // Only p1 and p2 are available (p3 is locked)
    expect(assignments.length).toBe(2);
    // Should distribute evenly (one puzzle per player)
    const alicePuzzles = assignments.filter((a) => a.playerId === 'alice');
    const bobPuzzles = assignments.filter((a) => a.playerId === 'bob');
    expect(alicePuzzles.length).toBe(1);
    expect(bobPuzzles.length).toBe(1);
  });

  it('procedural puzzle generation — randomize solutions each playthrough', () => {
    const template: Puzzle = {
      id: 'p1',
      name: 'Lock',
      type: 'lock',
      description: '',
      position: { x: 0, y: 0, z: 0 },
      difficulty: 2,
      timeEstimateSec: 60,
      solution: 'original',
      status: 'available',
      dependsOn: [],
      hints: [],
      maxAttempts: 5,
      attempts: 3,
    };
    // Same seed → same solution
    const a = generateProceduralPuzzle(template, 42);
    const b = generateProceduralPuzzle(template, 42);
    expect(a.solution).toBe(b.solution);
    // Different seed → likely different solution
    const c = generateProceduralPuzzle(template, 99);
    // Solution comes from pool, attempts reset
    expect(a.attempts).toBe(0);
    expect(a.status).toBe('available');
    // Solution is from lock pool
    expect(['1234', '5678', '9021', '3141', '7890', '2468', '1357', '8024']).toContain(a.solution);
  });
});
