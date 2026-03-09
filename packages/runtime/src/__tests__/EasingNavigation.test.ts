/**
 * Runtime Easing Functions + Navigation Utilities Production Tests
 *
 * Tests pure-math easing curves and URL/route parsing utilities.
 */

import { describe, it, expect } from 'vitest';
import { easing } from '../timing';
import { parseParams, matchRoute, parseQuery, buildQuery } from '../navigation';

describe('easing functions — Production', () => {
  it('linear returns identity', () => {
    expect(easing.linear(0)).toBe(0);
    expect(easing.linear(0.5)).toBe(0.5);
    expect(easing.linear(1)).toBe(1);
  });

  it('easeIn starts slow', () => {
    expect(easing.easeIn(0)).toBe(0);
    expect(easing.easeIn(0.5)).toBeLessThan(0.5);
    expect(easing.easeIn(1)).toBe(1);
  });

  it('easeOut starts fast', () => {
    expect(easing.easeOut(0)).toBe(0);
    expect(easing.easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easing.easeOut(1)).toBe(1);
  });

  it('easeInOut is symmetric', () => {
    expect(easing.easeInOut(0)).toBe(0);
    expect(easing.easeInOut(0.5)).toBeCloseTo(0.5, 1);
    expect(easing.easeInOut(1)).toBe(1);
  });

  it('easeInCubic boundary values', () => {
    expect(easing.easeInCubic(0)).toBe(0);
    expect(easing.easeInCubic(1)).toBe(1);
    expect(easing.easeInCubic(0.5)).toBeCloseTo(0.125, 5);
  });

  it('easeOutCubic boundary values', () => {
    expect(easing.easeOutCubic(0)).toBe(0);
    expect(easing.easeOutCubic(1)).toBe(1);
    expect(easing.easeOutCubic(0.5)).toBeCloseTo(0.875, 5);
  });

  it('easeInOutCubic boundary values', () => {
    expect(easing.easeInOutCubic(0)).toBe(0);
    expect(easing.easeInOutCubic(1)).toBe(1);
    expect(easing.easeInOutCubic(0.5)).toBeCloseTo(0.5, 5);
  });

  it('easeInElastic boundary values', () => {
    expect(easing.easeInElastic(0)).toBe(0);
    expect(easing.easeInElastic(1)).toBe(1);
  });

  it('easeOutElastic boundary values', () => {
    expect(easing.easeOutElastic(0)).toBe(0);
    expect(easing.easeOutElastic(1)).toBe(1);
  });

  it('easeOutBounce boundary values', () => {
    expect(easing.easeOutBounce(0)).toBe(0);
    expect(easing.easeOutBounce(1)).toBeCloseTo(1, 5);
    // Mid-values should be positive
    expect(easing.easeOutBounce(0.5)).toBeGreaterThan(0);
  });

  it('all easings return 0 at t=0 and ~1 at t=1', () => {
    const fns = [
      'linear',
      'easeIn',
      'easeOut',
      'easeInOut',
      'easeInCubic',
      'easeOutCubic',
      'easeInOutCubic',
      'easeInElastic',
      'easeOutElastic',
      'easeOutBounce',
    ] as const;
    for (const name of fns) {
      expect(easing[name](0)).toBe(0);
      expect(easing[name](1)).toBeCloseTo(1, 3);
    }
  });
});

describe('navigation utilities — Production', () => {
  it('parseParams extracts route parameters', () => {
    const params = parseParams('/users/:id/posts/:postId', '/users/42/posts/99');
    expect(params).toEqual({ id: '42', postId: '99' });
  });

  it('parseParams returns null on mismatch', () => {
    expect(parseParams('/users/:id', '/posts/42')).toBeNull();
    expect(parseParams('/a/b/c', '/a/b')).toBeNull();
  });

  it('parseParams matches exact static routes', () => {
    const params = parseParams('/about', '/about');
    expect(params).toEqual({});
  });

  it('matchRoute returns boolean', () => {
    expect(matchRoute('/users/:id', '/users/42')).toBe(true);
    expect(matchRoute('/users/:id', '/posts/42')).toBe(false);
  });

  it('parseQuery parses query string', () => {
    expect(parseQuery('?name=alice&age=25')).toEqual({ name: 'alice', age: '25' });
    expect(parseQuery('foo=bar')).toEqual({ foo: 'bar' });
    expect(parseQuery('')).toEqual({});
    expect(parseQuery('?')).toEqual({});
  });

  it('parseQuery handles encoded values', () => {
    const result = parseQuery('?key=hello%20world&path=%2Ffoo%2Fbar');
    expect(result.key).toBe('hello world');
    expect(result.path).toBe('/foo/bar');
  });

  it('buildQuery builds query string', () => {
    const qs = buildQuery({ name: 'alice', age: 25, active: true });
    expect(qs).toContain('name=alice');
    expect(qs).toContain('age=25');
    expect(qs).toContain('active=true');
    expect(qs.startsWith('?')).toBe(true);
  });

  it('buildQuery returns empty for empty params', () => {
    expect(buildQuery({})).toBe('');
  });
});
