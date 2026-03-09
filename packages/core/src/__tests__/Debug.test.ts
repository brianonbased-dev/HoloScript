import { describe, it, expect } from 'vitest';
import { DebugRenderer, DebugColors } from '../debug/DebugRenderer';
import { Profiler } from '../debug/Profiler';
import { ConsoleLogger, LogLevel } from '../debug/ConsoleLogger';

describe('Cycle 120: Debug & Profiler Tools', () => {
  // -------------------------------------------------------------------------
  // DebugRenderer
  // -------------------------------------------------------------------------

  it('should draw and query primitives', () => {
    const debug = new DebugRenderer();
    debug.drawLine({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, DebugColors.red, 5);
    debug.drawSphere({ x: 5, y: 5, z: 5 }, 2, DebugColors.blue, 5);
    debug.drawBox({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, DebugColors.green, 5);

    expect(debug.getDrawCallCount()).toBe(3);
    expect(debug.getDrawCallsByType('line')).toHaveLength(1);
    expect(debug.getDrawCallsByType('sphere')).toHaveLength(1);
  });

  it('should expire draw calls after duration', () => {
    const debug = new DebugRenderer();
    debug.drawLine({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, DebugColors.red, 1); // 1 sec
    debug.drawSphere({ x: 5, y: 5, z: 5 }, 2, DebugColors.blue, 5); // 5 sec

    debug.update(2); // 2 seconds passed
    expect(debug.getDrawCallCount()).toBe(1); // Only sphere remains
  });

  it('should disable rendering', () => {
    const debug = new DebugRenderer();
    debug.setEnabled(false);
    debug.drawLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(debug.getDrawCallCount()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Profiler
  // -------------------------------------------------------------------------

  it('should profile frames and scopes', () => {
    const profiler = new Profiler();

    profiler.beginFrame();
    profiler.beginScope('Physics');
    profiler.beginScope('Collision');
    profiler.endScope();
    profiler.endScope();
    profiler.beginScope('Render');
    profiler.endScope();
    profiler.endFrame();

    const frame = profiler.getLastFrame();
    expect(frame).not.toBeNull();
    expect(frame!.scopes.length).toBe(2); // Physics and Render at top level

    const physicsSummary = profiler.getSummary('Physics');
    expect(physicsSummary).toBeDefined();
    expect(physicsSummary!.callCount).toBe(1);
  });

  it('should track memory snapshots', () => {
    const profiler = new Profiler();
    profiler.takeMemorySnapshot('before');
    profiler.takeMemorySnapshot('after');

    const snaps = profiler.getMemorySnapshots();
    expect(snaps).toHaveLength(2);
    expect(snaps[0].label).toBe('before');
  });

  it('should profile inline functions', () => {
    const profiler = new Profiler();
    profiler.beginFrame();

    const result = profiler.profile('Calculate', () => {
      let sum = 0;
      for (let i = 0; i < 100; i++) sum += i;
      return sum;
    });

    profiler.endFrame();

    expect(result).toBe(4950);
    const summary = profiler.getSummary('Calculate');
    expect(summary).toBeDefined();
    expect(summary!.totalTime).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------------
  // ConsoleLogger
  // -------------------------------------------------------------------------

  it('should log messages with severity levels', () => {
    const logger = new ConsoleLogger();
    logger.setMinLevel(LogLevel.INFO);

    logger.debug('Core', 'Debug message'); // Filtered out
    logger.info('Core', 'Info message');
    logger.warn('Core', 'Warning!', { code: 42 });
    logger.error('Core', 'Error!');

    expect(logger.getEntryCount()).toBe(3); // debug filtered
    const counts = logger.getCountByLevel();
    expect(counts['INFO ']).toBe(1);
    expect(counts['WARN ']).toBe(1);
  });

  it('should filter by tag and search', () => {
    const logger = new ConsoleLogger();
    logger.info('Physics', 'Collision detected');
    logger.info('Render', 'Frame drawn');
    logger.info('Physics', 'Gravity applied');

    const physicsLogs = logger.getHistory({ tags: ['Physics'] });
    expect(physicsLogs).toHaveLength(2);

    const searchLogs = logger.getHistory({ search: 'collision' });
    expect(searchLogs).toHaveLength(1);
  });

  it('should format log entries', () => {
    const logger = new ConsoleLogger();
    logger.warn('Net', 'Latency spike', { ms: 150 });

    const entry = logger.getRecentEntries(1)[0];
    const formatted = logger.format(entry);
    expect(formatted).toContain('WARN');
    expect(formatted).toContain('[Net]');
    expect(formatted).toContain('Latency spike');
  });
});
