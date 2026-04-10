import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConsoleLogger, LogLevel } from '../ConsoleLogger';

describe('ConsoleLogger', () => {
  let logger: ConsoleLogger;

  beforeEach(() => {
    logger = new ConsoleLogger();
  });

  it('logs at all severity levels', () => {
    logger.trace('sys', 'trace msg');
    logger.debug('sys', 'debug msg');
    logger.info('sys', 'info msg');
    logger.warn('sys', 'warn msg');
    logger.error('sys', 'error msg');
    logger.fatal('sys', 'fatal msg');
    // TRACE is below default minLevel (DEBUG), so 5 entries
    expect(logger.getEntryCount()).toBe(5);
  });

  it('respects minLevel filter', () => {
    logger.setMinLevel(LogLevel.WARN);
    logger.debug('sys', 'should skip');
    logger.warn('sys', 'should appear');
    expect(logger.getEntryCount()).toBe(1);
    expect(logger.getMinLevel()).toBe(LogLevel.WARN);
  });

  it('enableTag restricts logging to enabled tags', () => {
    logger.enableTag('network');
    logger.info('network', 'net msg');
    logger.info('physics', 'phys msg');
    expect(logger.getEntryCount()).toBe(1);
  });

  it('disableTag blocks specific tags', () => {
    logger.disableTag('verbose');
    logger.info('verbose', 'should skip');
    logger.info('physics', 'should appear');
    expect(logger.getEntryCount()).toBe(1);
  });

  it('resetFilters clears all tag filters', () => {
    logger.enableTag('network');
    logger.resetFilters();
    logger.info('physics', 'should appear');
    expect(logger.getEntryCount()).toBe(1);
  });

  it('getHistory with filter by level and tag', () => {
    logger.info('net', 'info 1');
    logger.warn('net', 'warn 1');
    logger.error('phys', 'error 1');
    const warnings = logger.getHistory({ minLevel: LogLevel.WARN });
    expect(warnings.length).toBe(2);
    const netOnly = logger.getHistory({ tags: ['net'] });
    expect(netOnly.length).toBe(2);
  });

  it('getHistory with search', () => {
    logger.info('sys', 'player connected');
    logger.info('sys', 'player disconnected');
    logger.info('sys', 'world loaded');
    const results = logger.getHistory({ search: 'player' });
    expect(results.length).toBe(2);
  });

  it('getRecentEntries returns last N', () => {
    for (let i = 0; i < 10; i++) logger.info('sys', `msg ${i}`);
    const recent = logger.getRecentEntries(3);
    expect(recent.length).toBe(3);
    expect(recent[2].message).toBe('msg 9');
  });

  it('getCountByLevel returns counts per level', () => {
    logger.info('a', '1');
    logger.info('a', '2');
    logger.warn('a', '3');
    const counts = logger.getCountByLevel();
    expect(counts['INFO ']).toBe(2);
    expect(counts['WARN ']).toBe(1);
  });

  it('format produces formatted string', () => {
    logger.error('sys', 'test error', { code: 42 });
    const entries = logger.getHistory();
    const formatted = logger.format(entries[0]);
    expect(formatted).toContain('ERROR');
    expect(formatted).toContain('[sys]');
    expect(formatted).toContain('test error');
    expect(formatted).toContain('42');
  });

  it('listeners are notified on log', () => {
    const listener = vi.fn();
    logger.addListener(listener);
    logger.info('sys', 'test');
    expect(listener).toHaveBeenCalledTimes(1);
    logger.removeListener(listener);
    logger.info('sys', 'test2');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('respects maxHistory cap', () => {
    logger.setMaxHistory(5);
    for (let i = 0; i < 10; i++) logger.info('sys', `msg ${i}`);
    expect(logger.getEntryCount()).toBe(5);
  });

  it('clear empties history', () => {
    logger.info('sys', 'test');
    logger.clear();
    expect(logger.getEntryCount()).toBe(0);
  });
});
