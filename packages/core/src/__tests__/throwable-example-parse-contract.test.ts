import { test, expect, describe } from 'vitest';
import { HoloCompositionParser } from '../parser/HoloCompositionParser';
import * as fs from 'fs';
import * as path from 'path';

const FILE_PATH = path.resolve(process.cwd(), '../../examples/traits/throwable-breakable-stackable.holo');

describe('throwable example parse contract', () => {
  test('parses with zero fatal errors', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf-8');
    const parser = new HoloCompositionParser({ tolerant: true });
    const result = parser.parse(source);

    expect(result.errors || []).toHaveLength(0);
  });

  test('produces expected top-level AST structure', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf-8');
    const parser = new HoloCompositionParser({ tolerant: true });
    const result = parser.parse(source);

    const objects = result.ast?.objects || [];
    const templates = result.ast?.templates || [];

    expect(objects.length).toBe(23);
    expect(templates.length).toBe(4);
  });

  test('templates carry the core trait definitions', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf-8');
    const parser = new HoloCompositionParser({ tolerant: true });
    const result = parser.parse(source);

    const templates = result.ast?.templates || [];
    const traitNames = (t: any) => (t.traits || []).map((tr: any) => tr.name || tr);

    expect(templates.find((t: any) => t.name === 'ThrowableBottle')).toBeDefined();
    expect(traitNames(templates.find((t: any) => t.name === 'ThrowableBottle'))).toEqual(
      expect.arrayContaining(['grabbable', 'throwable', 'physics', 'collidable', 'breakable'])
    );

    expect(templates.find((t: any) => t.name === 'BreakableVase')).toBeDefined();
    expect(traitNames(templates.find((t: any) => t.name === 'BreakableVase'))).toEqual(
      expect.arrayContaining(['collidable', 'breakable', 'physics'])
    );

    expect(templates.find((t: any) => t.name === 'StackableBlock')).toBeDefined();
    expect(traitNames(templates.find((t: any) => t.name === 'StackableBlock'))).toEqual(
      expect.arrayContaining(['grabbable', 'collidable', 'physics', 'stackable'])
    );

    expect(templates.find((t: any) => t.name === 'Target')).toBeDefined();
    expect(traitNames(templates.find((t: any) => t.name === 'Target'))).toEqual(
      expect.arrayContaining(['collidable'])
    );
  });

  test('scene objects inherit from templates or declare standalone traits', () => {
    const source = fs.readFileSync(FILE_PATH, 'utf-8');
    const parser = new HoloCompositionParser({ tolerant: true });
    const result = parser.parse(source);

    const objects = result.ast?.objects || [];
    const byName = (name: string) => objects.find((o: any) => o.name === name);

    expect(byName('Floor')).toBeDefined();
    expect(byName('Bottle1')).toBeDefined();
    expect(byName('Vase1')).toBeDefined();
    expect(byName('RedBlock')).toBeDefined();
    expect(byName('ScoreTracker')).toBeDefined();
    expect(byName('StatsHUD')).toBeDefined();
  });
});
