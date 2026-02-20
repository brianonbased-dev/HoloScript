/**
 * SpanFactory — Production Test Suite
 *
 * Covers: createSpan (root, child), unique ID generation, span lifecycle
 * (end, setAttribute, addEvent), status propagation, withSpan sync/async/error.
 */
import { describe, it, expect, vi } from 'vitest';
import { SpanFactory } from '../SpanFactory';

describe('SpanFactory — Production', () => {
  const factory = new SpanFactory();

  // ─── createSpan — Root ────────────────────────────────────────────────────

  it('createSpan returns span with a name', () => {
    const span = factory.createSpan('parse-file');
    expect(span.name).toBe('parse-file');
  });

  it('createSpan generates 32-char hex traceId', () => {
    const span = factory.createSpan('op');
    expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('createSpan generates 16-char hex spanId', () => {
    const span = factory.createSpan('op');
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('createSpan produces unique spanIds', () => {
    const a = factory.createSpan('a');
    const b = factory.createSpan('b');
    expect(a.spanId).not.toBe(b.spanId);
  });

  it('createSpan root: parentSpanId is undefined', () => {
    const span = factory.createSpan('root');
    expect(span.parentSpanId).toBeUndefined();
  });

  it('createSpan sets startTime', () => {
    const before = Date.now();
    const span = factory.createSpan('op');
    expect(span.startTime).toBeGreaterThanOrEqual(before);
  });

  it('createSpan with initial attributes stores them', () => {
    const span = factory.createSpan('op', undefined, { userId: 'abc', count: 3 });
    expect(span.attributes.userId).toBe('abc');
    expect(span.attributes.count).toBe(3);
  });

  it('createSpan status defaults to unset', () => {
    // Source: span.status = 'unset' — becomes 'ok' only after end() is called
    const span = factory.createSpan('op');
    expect(span.status).toBe('unset');
  });

  // ─── createSpan — Child ───────────────────────────────────────────────────

  it('child span inherits traceId from parent', () => {
    const parent = factory.createSpan('parent');
    const child = factory.createSpan('child', parent);
    expect(child.traceId).toBe(parent.traceId);
  });

  it('child span gets different spanId from parent', () => {
    const parent = factory.createSpan('parent');
    const child = factory.createSpan('child', parent);
    expect(child.spanId).not.toBe(parent.spanId);
  });

  it('child span sets parentSpanId to parent.spanId', () => {
    const parent = factory.createSpan('parent');
    const child = factory.createSpan('child', parent);
    expect(child.parentSpanId).toBe(parent.spanId);
  });

  it('grandchild inherits same traceId as root', () => {
    const root = factory.createSpan('root');
    const child = factory.createSpan('child', root);
    const grand = factory.createSpan('grand', child);
    expect(grand.traceId).toBe(root.traceId);
  });

  // ─── span.end() ───────────────────────────────────────────────────────────

  it('span.end() sets endTime', () => {
    const span = factory.createSpan('op');
    span.end();
    expect(span.endTime).toBeDefined();
    // endTime may equal startTime within same ms, so use >=
    expect(span.endTime).toBeGreaterThanOrEqual(span.startTime);
  });

  it('span.end() defaults status to ok', () => {
    const span = factory.createSpan('op');
    span.end();
    expect(span.status).toBe('ok');
  });

  it('span.end("error") sets status to error', () => {
    const span = factory.createSpan('op');
    span.end('error');
    expect(span.status).toBe('error');
  });

  it('span.end() is idempotent — second call does not reset endTime', () => {
    const span = factory.createSpan('op');
    span.end();
    const firstEnd = span.endTime;
    span.end();
    expect(span.endTime).toBe(firstEnd);
  });

  // ─── span.setAttribute() ─────────────────────────────────────────────────

  it('setAttribute stores string value', () => {
    const span = factory.createSpan('op');
    span.setAttribute('service', 'auth');
    expect(span.attributes.service).toBe('auth');
  });

  it('setAttribute stores number value', () => {
    const span = factory.createSpan('op');
    span.setAttribute('size', 512);
    expect(span.attributes.size).toBe(512);
  });

  it('setAttribute stores boolean value', () => {
    const span = factory.createSpan('op');
    span.setAttribute('cached', true);
    expect(span.attributes.cached).toBe(true);
  });

  it('setAttribute overwrites existing key', () => {
    const span = factory.createSpan('op');
    span.setAttribute('env', 'dev');
    span.setAttribute('env', 'prod');
    expect(span.attributes.env).toBe('prod');
  });

  // ─── span.addEvent() ─────────────────────────────────────────────────────

  it('addEvent appends to events array', () => {
    const span = factory.createSpan('op');
    span.addEvent('cache-hit');
    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe('cache-hit');
  });

  it('addEvent stores timestamp close to now', () => {
    const before = Date.now();
    const span = factory.createSpan('op');
    span.addEvent('tick');
    expect(span.events[0].timestamp).toBeGreaterThanOrEqual(before);
  });

  it('addEvent with attributes stores them on event', () => {
    const span = factory.createSpan('op');
    span.addEvent('error', { code: 500, msg: 'fail' });
    expect(span.events[0].attributes?.code).toBe(500);
  });

  it('addEvent multiple events accumulate', () => {
    const span = factory.createSpan('op');
    span.addEvent('start');
    span.addEvent('mid');
    span.addEvent('end');
    expect(span.events).toHaveLength(3);
  });

  // ─── withSpan — Synchronous ───────────────────────────────────────────────

  it('withSpan sync returns result of callback', () => {
    const result = factory.withSpan('compute', () => 42);
    expect(result).toBe(42);
  });

  it('withSpan sync auto-ends span after callback', () => {
    let captured: any;
    factory.withSpan('op', (span) => {
      captured = span;
      return 'x';
    });
    expect(captured.endTime).toBeDefined();
  });

  it('withSpan sync sets status ok on success', () => {
    let captured: any;
    factory.withSpan('op', (span) => { captured = span; return 0; });
    expect(captured.status).toBe('ok');
  });

  it('withSpan sync sets status error when callback throws', () => {
    let captured: any;
    try {
      factory.withSpan('bad', (span) => { captured = span; throw new Error('boom'); });
    } catch { /* expected */ }
    expect(captured.status).toBe('error');
  });

  it('withSpan sync re-throws callback error', () => {
    expect(() => factory.withSpan('err', () => { throw new Error('x'); })).toThrow('x');
  });

  it('withSpan sync: parent span causes child to inherit traceId', () => {
    const parent = factory.createSpan('parent');
    let childTraceId: string | undefined;
    factory.withSpan('child', (span) => { childTraceId = span.traceId; }, parent);
    expect(childTraceId).toBe(parent.traceId);
  });

  // ─── withSpan — Asynchronous ──────────────────────────────────────────────

  it('withSpan async resolves with result', async () => {
    const result = await factory.withSpan('async-op', async () => {
      await Promise.resolve();
      return 'done';
    });
    expect(result).toBe('done');
  });

  it('withSpan async auto-ends span on resolve', async () => {
    let captured: any;
    await factory.withSpan('op', async (span) => {
      captured = span;
      return true;
    });
    expect(captured.endTime).toBeDefined();
  });

  it('withSpan async sets status ok on resolve', async () => {
    let captured: any;
    await factory.withSpan('op', async (span) => { captured = span; });
    expect(captured.status).toBe('ok');
  });

  it('withSpan async sets status error on reject', async () => {
    let captured: any;
    await factory.withSpan('failing', async (span) => {
      captured = span;
      throw new Error('async fail');
    }).catch(() => {});
    expect(captured.status).toBe('error');
  });

  it('withSpan async propagates rejection', async () => {
    await expect(
      factory.withSpan('fail', async () => { throw new Error('rej'); }),
    ).rejects.toThrow('rej');
  });
});
