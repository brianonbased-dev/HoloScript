/**
 * TypeAliasRegistry Production Tests
 *
 * Tests parsing, registration, resolution (simple, union, generic),
 * recursive detection, and reference expansion.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TypeAliasRegistry } from '../../types/TypeAliasRegistry';

describe('TypeAliasRegistry — Production', () => {
  let reg: TypeAliasRegistry;

  beforeEach(() => {
    reg = new TypeAliasRegistry();
  });

  // ─── Parsing ────────────────────────────────────────────────────────

  it('parse simple alias', () => {
    const decl = TypeAliasRegistry.parse('type Color = string');
    expect(decl).not.toBeNull();
    expect(decl!.name).toBe('Color');
    expect(decl!.kind).toBe('simple');
    expect(decl!.definition).toBe('string');
  });

  it('parse union alias', () => {
    const decl = TypeAliasRegistry.parse('type State = "idle" | "loading" | "error"');
    expect(decl).not.toBeNull();
    expect(decl!.kind).toBe('union');
  });

  it('parse generic alias', () => {
    const decl = TypeAliasRegistry.parse('type Optional<T> = T | null');
    expect(decl).not.toBeNull();
    expect(decl!.kind).toBe('generic');
    expect(decl!.typeParams).toEqual(['T']);
  });

  it('parse multi-param generic', () => {
    const decl = TypeAliasRegistry.parse('type Pair<A, B> = [A, B]');
    expect(decl).not.toBeNull();
    expect(decl!.typeParams).toEqual(['A', 'B']);
  });

  it('parse returns null for non-alias', () => {
    expect(TypeAliasRegistry.parse('const x = 5')).toBeNull();
  });

  // ─── Registration + Lookup ──────────────────────────────────────────

  it('register and lookup', () => {
    const decl = TypeAliasRegistry.parse('type Color = string')!;
    reg.register(decl);
    expect(reg.has('Color')).toBe(true);
    expect(reg.get('Color')).toBe(decl);
  });

  it('all returns registered aliases', () => {
    reg.register(TypeAliasRegistry.parse('type A = number')!);
    reg.register(TypeAliasRegistry.parse('type B = string')!);
    expect(reg.all().length).toBe(2);
  });

  it('clear removes all', () => {
    reg.register(TypeAliasRegistry.parse('type A = number')!);
    reg.clear();
    expect(reg.has('A')).toBe(false);
  });

  // ─── Resolution ─────────────────────────────────────────────────────

  it('resolve simple alias', () => {
    reg.register(TypeAliasRegistry.parse('type Size = number')!);
    expect(reg.resolve('Size')).toBe('number');
  });

  it('resolve generic with args', () => {
    reg.register(TypeAliasRegistry.parse('type Optional<T> = T | null')!);
    expect(reg.resolve('Optional', ['string'])).toBe('string | null');
  });

  it('resolve generic defaults missing args to any', () => {
    reg.register(TypeAliasRegistry.parse('type Box<T> = { value: T }')!);
    expect(reg.resolve('Box')).toBe('{ value: any }');
  });

  it('resolve returns null for unknown', () => {
    expect(reg.resolve('Unknown')).toBeNull();
  });

  // ─── Recursive Detection ───────────────────────────────────────────

  it('isRecursive detects self-reference', () => {
    reg.register(TypeAliasRegistry.parse('type Loop = Loop[]')!);
    expect(reg.isRecursive('Loop')).toBe(true);
  });

  it('isRecursive returns false for non-recursive', () => {
    reg.register(TypeAliasRegistry.parse('type Safe = number')!);
    expect(reg.isRecursive('Safe')).toBe(false);
  });

  it('resolve returns null for recursive alias', () => {
    reg.register(TypeAliasRegistry.parse('type Cycle = Cycle | null')!);
    expect(reg.resolve('Cycle')).toBeNull();
  });

  // ─── Reference Expansion ───────────────────────────────────────────

  it('expands alias references in definitions', () => {
    reg.register(TypeAliasRegistry.parse('type Size = number')!);
    reg.register(TypeAliasRegistry.parse('type Dimensions = [Size, Size]')!);
    const result = reg.resolve('Dimensions');
    expect(result).toContain('number');
  });
});
