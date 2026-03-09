/**
 * Sprint 19 Acceptance Tests — WoT (ThingDescriptionGenerator) + Logging Infrastructure
 *
 * Covers:
 *   - packages/core/src/wot/ThingDescriptionGenerator.ts
 *     ThingDescriptionGenerator class, generateThingDescription(), generateAllThingDescriptions(),
 *     serializeThingDescription(), validateThingDescription()
 *
 *   - packages/core/src/logging/HoloLogger.ts
 *     HoloLogger class: logging methods, entries, child loggers, level filtering
 *
 *   - packages/core/src/logging/LoggerFactory.ts
 *     LoggerFactory: named loggers, global level, formatters (Simple/Detailed/Json)
 *
 *   - packages/core/src/logging/LogMiddleware.ts
 *     createSampler, createContextEnricher, createLevelFilter, createErrorSerializer,
 *     createThrottler, LogMiddlewarePipeline
 *
 * All imports use relative paths (these modules live inside packages/core/src/).
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// WoT imports
// ---------------------------------------------------------------------------
import {
  ThingDescriptionGenerator,
  generateThingDescription,
  generateAllThingDescriptions,
  serializeThingDescription,
  validateThingDescription,
  type ThingDescription,
} from '../wot/ThingDescriptionGenerator.js';

// ---------------------------------------------------------------------------
// Logging imports
// ---------------------------------------------------------------------------
import { HoloLogger } from '../logging/HoloLogger.js';
import {
  LoggerFactory,
  SimpleFormatter,
  DetailedFormatter,
  JsonFormatter,
} from '../logging/LoggerFactory.js';
import {
  LogMiddlewarePipeline,
  createSampler,
  createContextEnricher,
  createLevelFilter,
  createErrorSerializer,
  createThrottler,
} from '../logging/LogMiddleware.js';
import type { LogEntry } from '../logging/HoloLogger.js';

// ---------------------------------------------------------------------------
// Helper: build a minimal HSPlusNode with @wot_thing trait
// ---------------------------------------------------------------------------
function makeWoTNode(
  name: string,
  title: string,
  security: 'nosec' | 'basic' | 'bearer' | 'oauth2' | 'apikey' = 'nosec',
  extra: Record<string, unknown> = {}
) {
  return {
    name,
    directives: [
      {
        type: 'trait',
        name: 'wot_thing',
        args: { title, security, ...extra },
      },
    ],
    children: [],
  };
}

function makeNodeWithoutWoT(name: string) {
  return { name, directives: [{ type: 'trait', name: 'color', args: { value: 'red' } }] };
}

function makeLogEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    level: 'info',
    message: 'test message',
    timestamp: Date.now(),
    logger: 'test',
    ...overrides,
  };
}

// =============================================================================
// Feature 1A: ThingDescriptionGenerator — class
// =============================================================================

describe('Feature 1A: ThingDescriptionGenerator — class', () => {
  it('can be instantiated with no args', () => {
    const gen = new ThingDescriptionGenerator();
    expect(gen).toBeDefined();
  });

  it('can be instantiated with options', () => {
    const gen = new ThingDescriptionGenerator({ baseUrl: 'http://example.com' });
    expect(gen).toBeDefined();
  });

  it('has a generate() method', () => {
    expect(typeof new ThingDescriptionGenerator().generate).toBe('function');
  });

  it('has a generateAll() method', () => {
    expect(typeof new ThingDescriptionGenerator().generateAll).toBe('function');
  });
});

// =============================================================================
// Feature 1B: generate() — node without @wot_thing returns null
// =============================================================================

describe('Feature 1B: generate() — no wot_thing trait → null', () => {
  let gen: ThingDescriptionGenerator;

  beforeEach(() => {
    gen = new ThingDescriptionGenerator();
  });

  it('node without directives returns null', () => {
    expect(gen.generate({ name: 'cube' } as any)).toBeNull();
  });

  it('node with non-wot_thing trait returns null', () => {
    expect(gen.generate(makeNodeWithoutWoT('cube') as any)).toBeNull();
  });
});

// =============================================================================
// Feature 1C: generate() — ThingDescription shape
// =============================================================================

describe('Feature 1C: generate() — ThingDescription shape', () => {
  let gen: ThingDescriptionGenerator;
  let td: ThingDescription;

  beforeEach(() => {
    gen = new ThingDescriptionGenerator({ baseUrl: 'http://example.com' });
    td = gen.generate(makeWoTNode('thermostat', 'My Thermostat') as any)!;
  });

  it('returns non-null ThingDescription', () => {
    expect(td).not.toBeNull();
  });

  it('has @context string', () => {
    expect(typeof td['@context']).toBe('string');
  });

  it('@context is W3C WoT URL', () => {
    expect(td['@context']).toContain('w3.org');
  });

  it('has title', () => {
    expect(typeof td.title).toBe('string');
    expect(td.title).toBe('My Thermostat');
  });

  it('has security field', () => {
    expect(td.security).toBeDefined();
  });

  it('has securityDefinitions object', () => {
    expect(typeof td.securityDefinitions).toBe('object');
    expect(td.securityDefinitions).not.toBeNull();
  });

  it('id is urn:holoscript:<name>', () => {
    expect(td.id).toContain('urn:holoscript:thermostat');
  });
});

// =============================================================================
// Feature 1D: generate() — security schemes
// =============================================================================

describe('Feature 1D: generate() — security schemes', () => {
  it('nosec security → scheme nosec', () => {
    const gen = new ThingDescriptionGenerator();
    const td = gen.generate(makeWoTNode('thing', 'A Thing', 'nosec') as any)!;
    expect(td.securityDefinitions.default).toHaveProperty('scheme', 'nosec');
  });

  it('basic security → scheme basic', () => {
    const gen = new ThingDescriptionGenerator();
    const td = gen.generate(makeWoTNode('thing', 'A Thing', 'basic') as any)!;
    expect(td.securityDefinitions.default).toHaveProperty('scheme', 'basic');
  });

  it('bearer security → scheme bearer', () => {
    const gen = new ThingDescriptionGenerator();
    const td = gen.generate(makeWoTNode('thing', 'A Thing', 'bearer') as any)!;
    expect(td.securityDefinitions.default).toHaveProperty('scheme', 'bearer');
  });

  it('apikey security → scheme apikey', () => {
    const gen = new ThingDescriptionGenerator();
    const td = gen.generate(makeWoTNode('thing', 'A Thing', 'apikey') as any)!;
    expect(td.securityDefinitions.default).toHaveProperty('scheme', 'apikey');
  });

  it('custom securityDefinitions override takes priority', () => {
    const gen = new ThingDescriptionGenerator({
      securityDefinitions: { custom: { scheme: 'bearer' } },
    });
    const td = gen.generate(makeWoTNode('thing', 'A Thing', 'nosec') as any)!;
    expect(td.securityDefinitions).toHaveProperty('custom');
  });
});

// =============================================================================
// Feature 1E: generate() — state properties
// =============================================================================

describe('Feature 1E: generate() — state properties from node.properties.state', () => {
  it('node with properties.state produces td.properties', () => {
    const gen = new ThingDescriptionGenerator();
    const node = {
      name: 'sensor',
      directives: [
        { type: 'trait', name: 'wot_thing', args: { title: 'Sensor', security: 'nosec' } },
      ],
      properties: {
        state: { temperature: 22.5, active: true, label: 'main' },
      },
    };
    const td = gen.generate(node as any)!;
    expect(td.properties).toBeDefined();
  });

  it('temperature (float) → property of type number', () => {
    const gen = new ThingDescriptionGenerator();
    const node = {
      name: 'sensor',
      directives: [
        { type: 'trait', name: 'wot_thing', args: { title: 'Sensor', security: 'nosec' } },
      ],
      properties: { state: { temperature: 22.5 } },
    };
    const td = gen.generate(node as any)!;
    expect(td.properties?.temperature).toBeDefined();
  });

  it('integer value → property with integer type', () => {
    const gen = new ThingDescriptionGenerator();
    const node = {
      name: 'counter',
      directives: [
        { type: 'trait', name: 'wot_thing', args: { title: 'Counter', security: 'nosec' } },
      ],
      properties: { state: { count: 42 } },
    };
    const td = gen.generate(node as any)!;
    expect(td.properties?.count?.type).toBe('integer');
  });
});

// =============================================================================
// Feature 2: generateAll() convenience path
// =============================================================================

describe('Feature 2: generateAll()', () => {
  it('returns empty array for empty input', () => {
    const gen = new ThingDescriptionGenerator();
    expect(gen.generateAll([])).toEqual([]);
  });

  it('filters out nodes without @wot_thing', () => {
    const gen = new ThingDescriptionGenerator();
    const nodes = [makeNodeWithoutWoT('cube'), makeNodeWithoutWoT('sphere')];
    expect(gen.generateAll(nodes as any)).toHaveLength(0);
  });

  it('returns one TD per wot_thing node', () => {
    const gen = new ThingDescriptionGenerator();
    const nodes = [
      makeWoTNode('a', 'Thing A'),
      makeWoTNode('b', 'Thing B'),
      makeNodeWithoutWoT('c'),
    ];
    expect(gen.generateAll(nodes as any)).toHaveLength(2);
  });

  it('generateAllThingDescriptions() convenience function works', () => {
    const nodes = [makeWoTNode('x', 'X')];
    const result = generateAllThingDescriptions(nodes as any);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });
});

// =============================================================================
// Feature 3: generateThingDescription() convenience function
// =============================================================================

describe('Feature 3: generateThingDescription() convenience function', () => {
  it('returns null for node without wot_thing', () => {
    expect(generateThingDescription(makeNodeWithoutWoT('x') as any)).toBeNull();
  });

  it('returns ThingDescription for wot_thing node', () => {
    const td = generateThingDescription(makeWoTNode('x', 'X') as any);
    expect(td).not.toBeNull();
    expect(td?.title).toBe('X');
  });

  it('accepts options arg', () => {
    const td = generateThingDescription(makeWoTNode('x', 'X') as any, {
      baseUrl: 'http://test.local',
    });
    expect(td).not.toBeNull();
  });
});

// =============================================================================
// Feature 4A: serializeThingDescription()
// =============================================================================

describe('Feature 4A: serializeThingDescription()', () => {
  let td: ThingDescription;

  beforeEach(() => {
    td = generateThingDescription(makeWoTNode('x', 'My Device') as any)!;
  });

  it('returns a string', () => {
    expect(typeof serializeThingDescription(td)).toBe('string');
  });

  it('is valid JSON', () => {
    expect(() => JSON.parse(serializeThingDescription(td))).not.toThrow();
  });

  it('contains title', () => {
    expect(serializeThingDescription(td)).toContain('My Device');
  });

  it('pretty=false produces compact JSON (no newlines)', () => {
    const compact = serializeThingDescription(td, false);
    expect(compact).not.toContain('\n');
  });

  it('pretty=true (default) produces indented JSON', () => {
    const pretty = serializeThingDescription(td);
    expect(pretty).toContain('\n');
  });
});

// =============================================================================
// Feature 4B: validateThingDescription()
// =============================================================================

describe('Feature 4B: validateThingDescription()', () => {
  it('valid TD returns {valid: true, errors: []}', () => {
    const td = generateThingDescription(makeWoTNode('x', 'My Device') as any)!;
    const result = validateThingDescription(td);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns object with valid and errors fields', () => {
    const td = generateThingDescription(makeWoTNode('x', 'My Device') as any)!;
    const result = validateThingDescription(td);
    expect(typeof result.valid).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('TD missing title fails validation', () => {
    const td = generateThingDescription(makeWoTNode('x', 'My Device') as any)!;
    const broken = { ...td, title: '' };
    const result = validateThingDescription(broken as any);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('TD with mismatched security ref fails validation', () => {
    const td = generateThingDescription(makeWoTNode('x', 'My Device') as any)!;
    const broken = { ...td, security: 'nonexistent' };
    const result = validateThingDescription(broken);
    expect(result.valid).toBe(false);
  });
});

// =============================================================================
// Feature 5A: HoloLogger — instantiation and getters
// =============================================================================

describe('Feature 5A: HoloLogger — instantiation', () => {
  it('can be instantiated with name', () => {
    const log = new HoloLogger('myapp');
    expect(log).toBeDefined();
  });

  it('getName() returns constructor name', () => {
    expect(new HoloLogger('app').getName()).toBe('app');
  });

  it('getLevel() returns "info" by default', () => {
    expect(new HoloLogger('app').getLevel()).toBe('info');
  });

  it('getEntries() returns empty array initially', () => {
    expect(new HoloLogger('app').getEntries()).toHaveLength(0);
  });

  it('isDebugEnabled is false when level is info', () => {
    expect(new HoloLogger('app').isDebugEnabled).toBe(false);
  });
});

// =============================================================================
// Feature 5B: HoloLogger — logging and entry storage
// =============================================================================

describe('Feature 5B: HoloLogger — logging and entries', () => {
  let log: HoloLogger;

  beforeEach(() => {
    log = new HoloLogger('test');
  });

  it('info() stores an entry', () => {
    log.info('hello');
    expect(log.getEntries()).toHaveLength(1);
  });

  it('warn() stores an entry', () => {
    log.warn('oops');
    expect(log.getEntries()).toHaveLength(1);
  });

  it('error() stores an entry', () => {
    log.error('boom');
    expect(log.getEntries()).toHaveLength(1);
  });

  it('fatal() stores an entry', () => {
    log.fatal('critical');
    expect(log.getEntries()).toHaveLength(1);
  });

  it('debug() NOT stored when level is "info"', () => {
    log.debug('verbose');
    expect(log.getEntries()).toHaveLength(0);
  });

  it('debug() IS stored when level is "debug"', () => {
    log.setLevel('debug');
    log.debug('verbose');
    expect(log.getEntries()).toHaveLength(1);
  });

  it('entry has correct level', () => {
    log.error('oops');
    expect(log.getEntries()[0].level).toBe('error');
  });

  it('entry has correct message', () => {
    log.info('the message');
    expect(log.getEntries()[0].message).toBe('the message');
  });

  it('entry.timestamp is a number', () => {
    log.info('x');
    expect(typeof log.getEntries()[0].timestamp).toBe('number');
  });

  it('entry.logger is the logger name', () => {
    log.info('x');
    expect(log.getEntries()[0].logger).toBe('test');
  });

  it('entry.context is set when provided', () => {
    log.info('x', { key: 'value' });
    expect(log.getEntries()[0].context?.key).toBe('value');
  });

  it('getEntriesByLevel() filters correctly', () => {
    log.info('a');
    log.error('b');
    log.warn('c');
    expect(log.getEntriesByLevel('error')).toHaveLength(1);
    expect(log.getEntriesByLevel('info')).toHaveLength(1);
  });

  it('clear() empties entries', () => {
    log.info('a');
    log.info('b');
    log.clear();
    expect(log.getEntries()).toHaveLength(0);
  });
});

// =============================================================================
// Feature 5C: HoloLogger — specialized log methods
// =============================================================================

describe('Feature 5C: HoloLogger — build/request/performance', () => {
  let log: HoloLogger;

  beforeEach(() => {
    log = new HoloLogger('test');
  });

  it('build() stores entry with context.buildId', () => {
    log.build('Building', 'build-123', 'compile');
    const entry = log.getEntries()[0];
    expect(entry.context?.buildId).toBe('build-123');
  });

  it('request() stores entry with context.requestId', () => {
    log.request('GET /api', 'req-456');
    const entry = log.getEntries()[0];
    expect(entry.context?.requestId).toBe('req-456');
  });

  it('performance() stores entry with context.durationMs', () => {
    log.performance('Parse done', 42);
    const entry = log.getEntries()[0];
    expect(entry.context?.durationMs).toBe(42);
  });
});

// =============================================================================
// Feature 5D: HoloLogger — child loggers
// =============================================================================

describe('Feature 5D: HoloLogger — child loggers', () => {
  let parent: HoloLogger;

  beforeEach(() => {
    parent = new HoloLogger('parent');
  });

  it('child() returns a HoloLogger', () => {
    expect(parent.child('sub')).toBeInstanceOf(HoloLogger);
  });

  it('child name is parent.child format', () => {
    expect(parent.child('sub').getName()).toBe('parent.sub');
  });

  it('child entries are propagated to parent', () => {
    const child = parent.child('sub');
    child.info('from child');
    // parent should also have the entry (propagation)
    expect(parent.getEntries()).toHaveLength(1);
  });

  it('child inherits parent log level', () => {
    parent.setLevel('debug');
    const child = parent.child('sub');
    expect(child.getLevel()).toBe('debug');
  });
});

// =============================================================================
// Feature 5E: HoloLogger — setLevel / isDebugEnabled
// =============================================================================

describe('Feature 5E: HoloLogger — setLevel and isDebugEnabled', () => {
  let log: HoloLogger;

  beforeEach(() => {
    log = new HoloLogger('test');
  });

  it('setLevel changes the level', () => {
    log.setLevel('warn');
    expect(log.getLevel()).toBe('warn');
  });

  it('isDebugEnabled is true when level is debug', () => {
    log.setLevel('debug');
    expect(log.isDebugEnabled).toBe(true);
  });

  it('info entries suppressed when level is warn', () => {
    log.setLevel('warn');
    log.info('ignored');
    expect(log.getEntries()).toHaveLength(0);
  });

  it('warn entries pass when level is warn', () => {
    log.setLevel('warn');
    log.warn('visible');
    expect(log.getEntries()).toHaveLength(1);
  });
});

// =============================================================================
// Feature 6: LoggerFactory
// =============================================================================

describe('Feature 6: LoggerFactory', () => {
  let factory: LoggerFactory;

  beforeEach(() => {
    factory = new LoggerFactory();
  });

  it('getLogger() returns a HoloLogger', () => {
    expect(factory.getLogger('app')).toBeInstanceOf(HoloLogger);
  });

  it('same name returns same instance', () => {
    const a = factory.getLogger('app');
    const b = factory.getLogger('app');
    expect(a).toBe(b);
  });

  it('getLoggerCount() increments for new names', () => {
    factory.getLogger('a');
    factory.getLogger('b');
    expect(factory.getLoggerCount()).toBe(2);
  });

  it('getLoggerNames() includes created loggers', () => {
    factory.getLogger('svc');
    expect(factory.getLoggerNames()).toContain('svc');
  });

  it('getGlobalLevel() defaults to "info"', () => {
    expect(factory.getGlobalLevel()).toBe('info');
  });

  it('setGlobalLevel() updates existing loggers', () => {
    const log = factory.getLogger('app');
    factory.setGlobalLevel('debug');
    expect(log.getLevel()).toBe('debug');
  });

  it('setGlobalLevel() affects new loggers', () => {
    factory.setGlobalLevel('warn');
    const log = factory.getLogger('new');
    expect(log.getLevel()).toBe('warn');
  });

  it('reset() clears all loggers', () => {
    factory.getLogger('a');
    factory.getLogger('b');
    factory.reset();
    expect(factory.getLoggerCount()).toBe(0);
  });

  it('getFormatter() returns SimpleFormatter by default', () => {
    expect(factory.getFormatter().name).toBe('simple');
  });

  it('setFormatter(DetailedFormatter) changes formatter', () => {
    factory.setFormatter(DetailedFormatter);
    expect(factory.getFormatter().name).toBe('detailed');
  });

  it('format() returns a non-empty string', () => {
    const entry = {
      level: 'info' as const,
      message: 'hello',
      logger: 'app',
      timestamp: Date.now(),
    };
    expect(typeof factory.format(entry)).toBe('string');
    expect(factory.format(entry).length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Feature 7A: Built-in formatters
// =============================================================================

describe('Feature 7A: Built-in formatters', () => {
  const entry = {
    level: 'warn' as const,
    message: 'something happened',
    logger: 'myapp',
    timestamp: Date.now(),
  };

  it('SimpleFormatter.name is "simple"', () => {
    expect(SimpleFormatter.name).toBe('simple');
  });

  it('SimpleFormatter output contains level', () => {
    expect(SimpleFormatter.format(entry)).toContain('WARN');
  });

  it('SimpleFormatter output contains logger name', () => {
    expect(SimpleFormatter.format(entry)).toContain('myapp');
  });

  it('SimpleFormatter output contains message', () => {
    expect(SimpleFormatter.format(entry)).toContain('something happened');
  });

  it('DetailedFormatter.name is "detailed"', () => {
    expect(DetailedFormatter.name).toBe('detailed');
  });

  it('DetailedFormatter output contains ISO timestamp', () => {
    expect(DetailedFormatter.format(entry)).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('JsonFormatter.name is "json"', () => {
    expect(JsonFormatter.name).toBe('json');
  });

  it('JsonFormatter output is valid JSON', () => {
    expect(() => JSON.parse(JsonFormatter.format(entry))).not.toThrow();
  });
});

// =============================================================================
// Feature 8A: createSampler()
// =============================================================================

describe('Feature 8A: createSampler()', () => {
  it('rate=1.0 always passes the entry through', () => {
    const sampler = createSampler(1.0);
    const entry = makeLogEntry();
    expect(sampler(entry)).toBe(entry);
  });

  it('rate=0.0 always returns null', () => {
    const sampler = createSampler(0.0);
    for (let i = 0; i < 20; i++) {
      expect(sampler(makeLogEntry())).toBeNull();
    }
  });

  it('returned function accepts LogEntry', () => {
    const sampler = createSampler(1.0);
    expect(typeof sampler).toBe('function');
  });
});

// =============================================================================
// Feature 8B: createContextEnricher()
// =============================================================================

describe('Feature 8B: createContextEnricher()', () => {
  it('adds static context to entry', () => {
    const enricher = createContextEnricher({ env: 'test', version: '1.0' });
    const result = enricher(makeLogEntry())!;
    expect(result.context?.env).toBe('test');
    expect(result.context?.version).toBe('1.0');
  });

  it('preserves existing context', () => {
    const enricher = createContextEnricher({ env: 'prod' });
    const entry = makeLogEntry({ context: { userId: 42 } });
    const result = enricher(entry)!;
    expect(result.context?.userId).toBe(42);
    expect(result.context?.env).toBe('prod');
  });

  it('does not modify original entry', () => {
    const enricher = createContextEnricher({ x: 1 });
    const entry = makeLogEntry();
    enricher(entry);
    expect(entry.context).toBeUndefined();
  });
});

// =============================================================================
// Feature 8C: createLevelFilter()
// =============================================================================

describe('Feature 8C: createLevelFilter()', () => {
  it('passes entry at exactly the minLevel', () => {
    const filter = createLevelFilter('warn');
    const entry = makeLogEntry({ level: 'warn' });
    expect(filter(entry)).toBe(entry);
  });

  it('passes entry above minLevel', () => {
    const filter = createLevelFilter('warn');
    const entry = makeLogEntry({ level: 'error' });
    expect(filter(entry)).toBe(entry);
  });

  it('suppresses entry below minLevel', () => {
    const filter = createLevelFilter('warn');
    const entry = makeLogEntry({ level: 'info' });
    expect(filter(entry)).toBeNull();
  });

  it('debug suppressed when minLevel is warn', () => {
    const filter = createLevelFilter('warn');
    expect(filter(makeLogEntry({ level: 'debug' }))).toBeNull();
  });

  it('fatal passes at any minLevel', () => {
    const filter = createLevelFilter('error');
    expect(filter(makeLogEntry({ level: 'fatal' }))).not.toBeNull();
  });
});

// =============================================================================
// Feature 8D: createErrorSerializer()
// =============================================================================

describe('Feature 8D: createErrorSerializer()', () => {
  it('converts Error in context to plain object', () => {
    const serializer = createErrorSerializer();
    const err = new Error('oops');
    const entry = makeLogEntry({ context: { error: err } });
    const result = serializer(entry)!;
    expect(result.context?.error).not.toBeInstanceOf(Error);
    expect(typeof result.context?.error).toBe('object');
  });

  it('serialized error has message', () => {
    const serializer = createErrorSerializer();
    const err = new Error('boom');
    const result = serializer(makeLogEntry({ context: { err } }))!;
    expect(result.context?.err?.message).toBe('boom');
  });

  it('serialized error has name', () => {
    const serializer = createErrorSerializer();
    const err = new TypeError('type error');
    const result = serializer(makeLogEntry({ context: { err } }))!;
    expect(result.context?.err?.name).toBe('TypeError');
  });

  it('non-Error context values unchanged', () => {
    const serializer = createErrorSerializer();
    const entry = makeLogEntry({ context: { count: 5, label: 'abc' } });
    const result = serializer(entry)!;
    expect(result.context?.count).toBe(5);
    expect(result.context?.label).toBe('abc');
  });

  it('entry without context returned unchanged', () => {
    const serializer = createErrorSerializer();
    const entry = makeLogEntry({ context: undefined });
    expect(serializer(entry)).toBe(entry);
  });
});

// =============================================================================
// Feature 8E: createThrottler()
// =============================================================================

describe('Feature 8E: createThrottler()', () => {
  it('first identical entry passes', () => {
    const { middleware } = createThrottler(1000);
    const entry = makeLogEntry();
    expect(middleware(entry)).not.toBeNull();
  });

  it('second identical entry within interval is suppressed', () => {
    const { middleware } = createThrottler(1000);
    const now = Date.now();
    const entry1 = makeLogEntry({ timestamp: now });
    const entry2 = makeLogEntry({ timestamp: now + 100 });
    middleware(entry1);
    expect(middleware(entry2)).toBeNull();
  });

  it('entry after interval passes again', () => {
    const { middleware } = createThrottler(100);
    const now = Date.now();
    const entry1 = makeLogEntry({ timestamp: now });
    const entry2 = makeLogEntry({ timestamp: now + 200 }); // outside interval
    middleware(entry1);
    expect(middleware(entry2)).not.toBeNull();
  });

  it('getState() returns a Map', () => {
    const { getState } = createThrottler(1000);
    expect(getState()).toBeInstanceOf(Map);
  });
});

// =============================================================================
// Feature 9: LogMiddlewarePipeline
// =============================================================================

describe('Feature 9: LogMiddlewarePipeline', () => {
  let pipeline: LogMiddlewarePipeline;

  beforeEach(() => {
    pipeline = new LogMiddlewarePipeline();
  });

  it('can be instantiated', () => {
    expect(pipeline).toBeDefined();
  });

  it('getCount() starts at 0', () => {
    expect(pipeline.getCount()).toBe(0);
  });

  it('use() adds middleware', () => {
    pipeline.use((e) => e);
    expect(pipeline.getCount()).toBe(1);
  });

  it('process() with no middleware returns entry unchanged', () => {
    const entry = makeLogEntry();
    expect(pipeline.process(entry)).toBe(entry);
  });

  it('process() runs middleware in order', () => {
    const order: number[] = [];
    pipeline.use((e) => {
      order.push(1);
      return e;
    });
    pipeline.use((e) => {
      order.push(2);
      return e;
    });
    pipeline.process(makeLogEntry());
    expect(order).toEqual([1, 2]);
  });

  it('process() returns null when middleware returns null', () => {
    pipeline.use(() => null);
    expect(pipeline.process(makeLogEntry())).toBeNull();
  });

  it('process() short-circuits on null', () => {
    let called = false;
    pipeline.use(() => null);
    pipeline.use((e) => {
      called = true;
      return e;
    });
    pipeline.process(makeLogEntry());
    expect(called).toBe(false);
  });

  it('clear() removes all middleware', () => {
    pipeline.use((e) => e);
    pipeline.use((e) => e);
    pipeline.clear();
    expect(pipeline.getCount()).toBe(0);
  });

  it('enricher middleware adds context', () => {
    pipeline.use(createContextEnricher({ service: 'test' }));
    const result = pipeline.process(makeLogEntry())!;
    expect(result.context?.service).toBe('test');
  });
});
