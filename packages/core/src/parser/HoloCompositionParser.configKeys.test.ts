import { describe, it, expect } from 'vitest';
import { HoloCompositionParser } from './HoloCompositionParser';

function traitConfig(cfg: string): Record<string, unknown> | undefined {
  const src = `composition "T" {\n  object "Root" {\n    @mutation ${cfg}\n  }\n}`;
  const r = new HoloCompositionParser().parse(src);
  expect(r.errors ?? []).toEqual([]);
  return r.ast?.objects?.[0]?.traits?.[0]?.config as Record<string, unknown> | undefined;
}

describe('HoloCompositionParser: nested config objects keep their keys (.holo text)', () => {
  it('on_ok: { remove: { from, where } } parses two objects deep with `from` kept', () => {
    expect(traitConfig('{ name: "m", on_ok: { remove: { from: "apps", where: "id" } } }')).toEqual({
      name: 'm',
      on_ok: { remove: { from: 'apps', where: 'id' } },
    });
  });

  it('`from` is kept as a key at every depth, next to other keys', () => {
    expect(traitConfig('{ a: { from: "x", to: "y" }, b: { c: { from: "z" } } }')).toEqual({
      a: { from: 'x', to: 'y' },
      b: { c: { from: 'z' } },
    });
  });

  it('three-deep plain objects are kept (control: the drop was the `from` key, not depth)', () => {
    expect(traitConfig('{ a: { b: { c: { d: 1 } } } }')).toEqual({ a: { b: { c: { d: 1 } } } });
  });
});
