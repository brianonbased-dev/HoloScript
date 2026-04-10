/**
 * HoloLogger Production Tests
 *
 * Log levels, entry storage, level filtering, child loggers, clear.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HoloLogger } from '../HoloLogger';

describe('HoloLogger — Production', () => {
  let logger: HoloLogger;

  beforeEach(() => {
    logger = new HoloLogger('test', 'info');
  });

  describe('construction', () => {
    it('creates with name and level', () => {
      expect(logger.getName()).toBe('test');
      expect(logger.getLevel()).toBe('info');
    });

    it('isDebugEnabled false at info level', () => {
      expect(logger.isDebugEnabled).toBe(false);
    });

    it('isDebugEnabled true at debug level', () => {
      const dbg = new HoloLogger('dbg', 'debug');
      expect(dbg.isDebugEnabled).toBe(true);
    });
  });

  describe('level filtering', () => {
    it('stores info at info level', () => {
      logger.info('hello');
      expect(logger.getEntries()).toHaveLength(1);
    });

    it('filters debug at info level', () => {
      logger.debug('hidden');
      expect(logger.getEntries()).toHaveLength(0);
    });

    it('stores error at info level', () => {
      logger.error('fail');
      expect(logger.getEntries()).toHaveLength(1);
    });

    it('stores warn at info level', () => {
      logger.warn('caution');
      expect(logger.getEntries()).toHaveLength(1);
    });
  });

  describe('setLevel', () => {
    it('changes minimum level', () => {
      logger.setLevel('error');
      logger.info('filtered');
      logger.error('kept');
      expect(logger.getEntries()).toHaveLength(1);
    });
  });

  describe('specialised methods', () => {
    it('build logs with buildId context', () => {
      logger.build('Building', 'b123', 'compile');
      const entry = logger.getEntries()[0];
      expect(entry.context?.buildId).toBe('b123');
      expect(entry.context?.stage).toBe('compile');
    });

    it('request logs with requestId', () => {
      logger.request('GET /api', 'req-1');
      expect(logger.getEntries()[0].context?.requestId).toBe('req-1');
    });

    it('performance logs with durationMs', () => {
      logger.performance('Render', 16.5);
      expect(logger.getEntries()[0].context?.durationMs).toBe(16.5);
    });
  });

  describe('child logger', () => {
    it('creates child with prefixed name', () => {
      const child = logger.child('renderer');
      expect(child.getName()).toBe('test.renderer');
    });
  });

  describe('getEntriesByLevel', () => {
    it('filters entries by level', () => {
      logger.info('a');
      logger.error('b');
      logger.info('c');
      expect(logger.getEntriesByLevel('error')).toHaveLength(1);
      expect(logger.getEntriesByLevel('info')).toHaveLength(2);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      logger.info('a');
      logger.clear();
      expect(logger.getEntries()).toHaveLength(0);
    });
  });
});
