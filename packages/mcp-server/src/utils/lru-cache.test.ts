/**
 * Tests for MCP Server LRU Cache
 *
 * Covers:
 * - Basic get/set operations
 * - LRU eviction on capacity overflow
 * - TTL expiration
 * - Cache clear
 * - Recently-used refresh behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LRUCache } from './lru-cache.js';

describe('LRUCache', () => {
  describe('basic operations', () => {
    it('stores and retrieves values', () => {
      const cache = new LRUCache<string, number>(10, 60000);
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
    });

    it('returns undefined for missing keys', () => {
      const cache = new LRUCache<string, number>(10, 60000);
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('overwrites existing values', () => {
      const cache = new LRUCache<string, number>(10, 60000);
      cache.set('a', 1);
      cache.set('a', 2);
      expect(cache.get('a')).toBe(2);
    });

    it('stores multiple keys', () => {
      const cache = new LRUCache<string, string>(10, 60000);
      cache.set('x', 'hello');
      cache.set('y', 'world');
      expect(cache.get('x')).toBe('hello');
      expect(cache.get('y')).toBe('world');
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest entry when at capacity', () => {
      const cache = new LRUCache<string, number>(3, 60000);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // Should evict 'a'
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('d')).toBe(4);
    });

    it('refreshes recency on get', () => {
      const cache = new LRUCache<string, number>(3, 60000);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.get('a'); // Refresh 'a' — now 'b' is oldest
      cache.set('d', 4); // Should evict 'b'
      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBeUndefined();
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns undefined for expired entries', () => {
      const cache = new LRUCache<string, number>(10, 1000); // 1 second TTL
      cache.set('a', 1);
      vi.advanceTimersByTime(2000); // Advance past TTL
      expect(cache.get('a')).toBeUndefined();
    });

    it('returns value before TTL expires', () => {
      const cache = new LRUCache<string, number>(10, 5000);
      cache.set('a', 1);
      vi.advanceTimersByTime(3000); // Before TTL
      expect(cache.get('a')).toBe(1);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      const cache = new LRUCache<string, number>(10, 60000);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
    });
  });

  describe('defaults', () => {
    it('uses default capacity and TTL', () => {
      const cache = new LRUCache<string, number>();
      // Should not throw
      for (let i = 0; i < 150; i++) {
        cache.set(`key-${i}`, i);
      }
      // Beyond default capacity of 100, oldest should be evicted
      expect(cache.get('key-0')).toBeUndefined();
      expect(cache.get('key-149')).toBe(149);
    });
  });
});
