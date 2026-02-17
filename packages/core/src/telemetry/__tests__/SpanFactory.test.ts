import { describe, it, expect, beforeEach } from 'vitest';
import { SpanFactory, createSpanObject, generateTraceId, generateSpanId } from '../SpanFactory';

describe('SpanFactory', () => {
  let factory: SpanFactory;

  beforeEach(() => { factory = new SpanFactory(); });

  // ID generation
  it('generateTraceId returns 32-char hex string', () => {
    const id = generateTraceId();
    expect(id.length).toBe(32);
  });

  it('generateSpanId returns 16-char hex string', () => {
    const id = generateSpanId();
    expect(id.length).toBe(16);
  });

  // createSpanObject
  it('createSpanObject creates a span with correct fields', () => {
    const traceId = generateTraceId();
    const span = createSpanObject('test-op', traceId);
    expect(span.name).toBe('test-op');
    expect(span.traceId).toBe(traceId);
    expect(span.spanId).toBeDefined();
    expect(span.startTime).toBeGreaterThan(0);
    expect(span.endTime).toBeUndefined();
    expect(span.status).toBe('unset');
  });

  it('span.end sets endTime and status', () => {
    const span = createSpanObject('op', generateTraceId());
    span.end('ok');
    expect(span.endTime).toBeGreaterThan(0);
    expect(span.status).toBe('ok');
  });

  it('span.end defaults status to ok', () => {
    const span = createSpanObject('op', generateTraceId());
    span.end();
    expect(span.status).toBe('ok');
  });

  it('span.setAttribute adds attribute', () => {
    const span = createSpanObject('op', generateTraceId());
    span.setAttribute('key', 'value');
    expect(span.attributes['key']).toBe('value');
  });

  it('span.addEvent appends event', () => {
    const span = createSpanObject('op', generateTraceId());
    span.addEvent('start', { step: 1 });
    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe('start');
  });

  // SpanFactory.createSpan
  it('createSpan generates trace context', () => {
    const span = factory.createSpan('root');
    expect(span.traceId).toBeDefined();
    expect(span.parentSpanId).toBeUndefined();
  });

  it('createSpan with parent inherits traceId', () => {
    const parent = factory.createSpan('parent');
    const child = factory.createSpan('child', parent);
    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentSpanId).toBe(parent.spanId);
  });

  it('createSpan with attributes', () => {
    const span = factory.createSpan('op', undefined, { env: 'test' });
    expect(span.attributes['env']).toBe('test');
  });

  // withSpan (sync)
  it('withSpan executes sync function and ends span', () => {
    const result = factory.withSpan('add', (span) => {
      span.setAttribute('a', 1);
      return 42;
    });
    expect(result).toBe(42);
  });

  it('withSpan ends span with error on throw', () => {
    expect(() => {
      factory.withSpan('fail', () => { throw new Error('boom'); });
    }).toThrow('boom');
  });

  // withSpan (async)
  it('withSpan handles async functions', async () => {
    const result = await factory.withSpan('async-op', async (span) => {
      span.setAttribute('async', true);
      return 'done';
    });
    expect(result).toBe('done');
  });

  it('withSpan async handles rejection', async () => {
    await expect(
      factory.withSpan('fail', async () => { throw new Error('async-boom'); })
    ).rejects.toThrow('async-boom');
  });
});
