/**
 * The engine runtime's control flow evaluates its expressions against program state.
 *
 * On main, every engine expression came back undefined once a program had any state:
 * the state snapshot carries index keys ("0", "1", ...), and `new Function` cannot take
 * those as parameter names, so it threw and the evaluator answered undefined. With the
 * interpreter (#479) they evaluate. These pin what @if, @for, @while and an `__expr`
 * property produce now, and that an expression cannot hand text to setTimeout.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HoloScriptPlusRuntimeImpl } from '../HoloScriptPlusRuntime';

interface Built {
  node: { id?: string; properties?: Record<string, unknown> };
}

const node = (id: string, properties: Record<string, unknown> = {}) => ({
  type: 'object',
  id,
  properties,
  directives: [],
  children: [],
  traits: new Map(),
});

const runtimes: HoloScriptPlusRuntimeImpl[] = [];

/** Mount a program with state `{ score: 5, items: [a, b, c] }` and these directives. */
function mount(directives: unknown[]): Built[] {
  const ast = {
    root: {
      type: 'composition',
      id: 'root',
      properties: {},
      traits: new Map(),
      children: [],
      directives: [{ type: 'state', body: { score: 5, items: ['a', 'b', 'c'] } }, ...directives],
    },
    imports: [],
  };
  const runtime = new HoloScriptPlusRuntimeImpl(ast as never, {} as never);
  runtimes.push(runtime);
  runtime.mount({});
  return (runtime as unknown as { rootInstance: { children: Built[] } }).rootInstance.children;
}

const ids = (children: Built[]) => children.map((child) => child.node.id);

describe('HoloScriptPlusRuntime control flow reads program state', () => {
  afterEach(() => {
    for (const runtime of runtimes.splice(0)) runtime.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('@if takes the branch its condition selects', () => {
    expect(ids(mount([{ type: 'if', condition: 'score > 3', body: [node('shown')] }]))).toEqual([
      'shown',
    ]);
    expect(
      ids(
        mount([
          { type: 'if', condition: 'score > 9', body: [node('shown')], else: [node('other')] },
        ])
      )
    ).toEqual(['other']);
  });

  it('@for makes one node per item, and an __expr property reads state', () => {
    const children = mount([
      {
        type: 'for',
        variable: 'it',
        iterable: 'items',
        body: [node('item-${it}', { label: { __expr: true, __raw: '"Score: " + score' } })],
      },
    ]);
    expect(ids(children)).toEqual(['item-a', 'item-b', 'item-c']);
    expect(children.map((child) => child.node.properties?.label)).toEqual([
      'Score: 5',
      'Score: 5',
      'Score: 5',
    ]);
  });

  it('@while expands until its condition is false, and stops at 1000 when it never is', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(mount([{ type: 'while', condition: 'score > 9', body: [node('w')] }])).toHaveLength(0);
    // State cannot change while the tree is built, so a true condition stays true and the
    // expansion stops at its cap, with a warning.
    expect(mount([{ type: 'while', condition: 'score > 3', body: [node('w')] }])).toHaveLength(
      1000
    );
    expect(warn).toHaveBeenCalledWith('@while loop hit maximum iteration limit (1000)');
  });

  it('setTimeout, offered to expressions, schedules a function and refuses text', () => {
    const setTimeout = vi.fn(() => 7);
    vi.stubGlobal('window', { setTimeout, clearTimeout: vi.fn() });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const children = mount([
      {
        type: 'for',
        variable: 'it',
        iterable: 'items',
        body: [node('t', { timer: { __expr: true, __raw: 'setTimeout("alert(1)", 0)' } })],
      },
    ]);
    // A browser would compile the text like eval; the builtin refuses it instead.
    expect(children.map((child) => child.node.properties?.timer)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(setTimeout).not.toHaveBeenCalled();

    const runtime = runtimes[0] as unknown as {
      builtins: { setTimeout: (callback: unknown, delay: number) => number };
    };
    const callback = () => undefined;
    expect(runtime.builtins.setTimeout(callback, 5)).toBe(7);
    expect(setTimeout).toHaveBeenCalledWith(callback, 5);
  });
});
