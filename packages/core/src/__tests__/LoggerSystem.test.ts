import { describe, it, expect, beforeEach } from 'vitest';
import { readJson } from '../errors/safeJsonParse';
import { HoloLogger } from '../logging/HoloLogger';
import {
  LoggerFactory,
  SimpleFormatter,
  DetailedFormatter,
  JsonFormatter,
} from '../logging/LoggerFactory';
import {
  LogMiddlewarePipeline,
  createSampler,
  createThrottler,
  createContextEnricher,
  createLevelFilter,
  createErrorSerializer,
} from '../logging/LogMiddleware';

describe('Logger Migration (Cycle 172)', () => {
  // ===========================================================================
  // HoloLogger
  // ===========================================================================
  describe('HoloLogger', () => {
    let logger: HoloLogger;

    beforeEach(() => {
      logger = new HoloLogger('test', 'debug');
    });

    it('should log at all levels', () => {
      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');
      logger.fatal('fatal msg');
      expect(logger.getEntries()).toHaveLength(5);
    });

    it('should filter by log level', () => {
      logger.setLevel('warn');
      logger.debug('nope');
      logger.info('nope');
      logger.warn('yes');
      logger.error('yes');
      expect(logger.getEntries()).toHaveLength(2);
    });

    it('should report isDebugEnabled based on level', () => {
      expect(logger.isDebugEnabled).toBe(true);
      logger.setLevel('info');
      expect(logger.isDebugEnabled).toBe(false);
    });

    it('should log build/request/performance events', () => {
      logger.build('Building', 'b1', 'compile');
      logger.request('GET /api', 'r1');
      logger.performance('Render', 16.5);
      expect(logger.getEntries()).toHaveLength(3);
      expect(logger.getEntries()[0].context?.buildId).toBe('b1');
      expect(logger.getEntries()[2].context?.durationMs).toBe(16.5);
    });

    it('should create child loggers', () => {
      const child = logger.child('parser');
      expect(child.getName()).toBe('test.parser');
      child.info('parsed');
      expect(child.getEntries()).toHaveLength(1);
    });

    it('should filter entries by level', () => {
      logger.info('info');
      logger.error('error');
      expect(logger.getEntriesByLevel('error')).toHaveLength(1);
    });
  });

  // ===========================================================================
  // LoggerFactory
  // ===========================================================================
  describe('LoggerFactory', () => {
    let factory: LoggerFactory;

    beforeEach(() => {
      factory = new LoggerFactory();
    });

    it('should create and cache named loggers', () => {
      const a = factory.getLogger('runtime');
      const b = factory.getLogger('runtime');
      expect(a).toBe(b); // same instance
      expect(factory.getLoggerCount()).toBe(1);
    });

    it('should apply global level to all loggers', () => {
      const a = factory.getLogger('a');
      const b = factory.getLogger('b');
      factory.setGlobalLevel('error');
      expect(a.getLevel()).toBe('error');
      expect(b.getLevel()).toBe('error');
    });

    it('should format with simple formatter', () => {
      factory.setFormatter(SimpleFormatter);
      const output = factory.format({
        level: 'info',
        message: 'hello',
        logger: 'test',
        timestamp: 0,
      });
      expect(output).toBe('[INFO] test: hello');
    });

    it('should format with JSON formatter', () => {
      factory.setFormatter(JsonFormatter);
      const output = factory.format({
        level: 'warn',
        message: 'oops',
        logger: 'x',
        timestamp: 123,
      });
      const parsed = readJson(output);
      expect(parsed.level).toBe('warn');
    });

    it('should format with detailed formatter', () => {
      factory.setFormatter(DetailedFormatter);
      const output = factory.format({
        level: 'debug',
        message: 'detail',
        logger: 'app',
        timestamp: Date.now(),
      });
      expect(output).toContain('[DEBUG]');
      expect(output).toContain('app');
    });
  });

  // ===========================================================================
  // LogMiddleware
  // ===========================================================================
  describe('LogMiddleware', () => {
    it('should filter by level', () => {
      const filter = createLevelFilter('warn');
      const debug = filter({ level: 'debug', message: 'x', timestamp: 0, logger: 'l' });
      const warn = filter({ level: 'warn', message: 'x', timestamp: 0, logger: 'l' });
      expect(debug).toBeNull();
      expect(warn).not.toBeNull();
    });

    it('should enrich context', () => {
      const enricher = createContextEnricher({ env: 'prod', version: '1.0' });
      const result = enricher({
        level: 'info',
        message: 'x',
        timestamp: 0,
        logger: 'l',
        context: { custom: true },
      });
      expect(result?.context?.env).toBe('prod');
      expect(result?.context?.custom).toBe(true);
    });

    it('should throttle repeated messages', () => {
      const { middleware } = createThrottler(1000);
      const entry = { level: 'info' as const, message: 'x', timestamp: Date.now(), logger: 'l' };

      const first = middleware(entry);
      expect(first).not.toBeNull();

      const second = middleware({ ...entry, timestamp: Date.now() + 10 });
      expect(second).toBeNull(); // throttled
    });

    it('should serialize Error objects', () => {
      const serializer = createErrorSerializer();
      const err = new Error('boom');
      const result = serializer({
        level: 'error',
        message: 'fail',
        timestamp: 0,
        logger: 'l',
        context: { error: err },
      });
      expect((result?.context?.error as any)?.message).toBe('boom');
      expect((result?.context?.error as any)?.stack).toBeDefined();
    });

    it('should chain middleware in a pipeline', () => {
      const pipeline = new LogMiddlewarePipeline();
      pipeline.use(createLevelFilter('info'));
      pipeline.use(createContextEnricher({ app: 'holo' }));

      const debugResult = pipeline.process({
        level: 'debug',
        message: 'x',
        timestamp: 0,
        logger: 'l',
      });
      expect(debugResult).toBeNull(); // filtered

      const infoResult = pipeline.process({
        level: 'info',
        message: 'x',
        timestamp: 0,
        logger: 'l',
      });
      expect(infoResult?.context?.app).toBe('holo'); // enriched
    });
  });
});
