/**
 * Native2DReactiveFeatures.test.ts — N1 [hs-native-console]: one falsifier test
 * per reactive feature for the HoloScript-Native Console (task_1780431630769_w5ay).
 *
 * The task is reconcile-then-advance, NOT rebuild: enumerate which of the 10
 * reactive features Native2DCompiler already emits, pin each with a falsifier,
 * and close ONLY genuine gaps. This file is the enumeration made executable.
 *
 * RECONCILIATION (compiler state @ 2026-06-03):
 *   1. @apiEndpoint/poll  PARTIAL — @fetch one-shot emits (React useEffect+fetch,
 *                         HTML data-holo-fetch+vanilla runtime); interval POLL is a GAP.
 *   2. form traits        WORKS — @form.onSubmit + @input attrs. (Closed a real bug:
 *                         React onSubmit was emitted as `onSubmit={fn(e)}` — invoked at
 *                         render — now `onSubmit={(e) => fn(e)}`.)
 *   3. event handlers     WORKS — @button.onClick (React arrow + HTML onclick).
 *   4. @state             WORKS — composition.state → useState (React). HTML stays
 *                         hydration-free (no useState by design).
 *   5. @map / list        PARTIAL — HTML @fetch+template list-render WORKS; the React
 *                         path registers state+effect but never .maps the array (GAP).
 *   6. @if                ABSENT — no conditional emission, no consumer.
 *   7. @computed          ABSENT — no derived-value emission, no consumer.
 *   8. layout             WORKS — flex AND grid (+justify/align/gap/padding).
 *   9. @route             ABSENT — no router emission; onClick navigate() is the path.
 *  10. @websocket         ABSENT — no WS emission, no consumer.
 *
 * The 4 ABSENT features (6,7,9,10) are NOT built here: they have zero consumer
 * (the Founder Console uses @fetch/@count_of/@text/layout), so emitting them now
 * would be speculative Pattern-B stubs (contra EXTEND-don't-rebuild). Their tests
 * pin the CURRENT no-op so they fail loudly the moment someone implements them —
 * that is the falsifier doing its job. The two PARTIAL gaps (poll, React .map) are
 * pinned the same way. When a consumer needs one, close it + flip its test.
 */
import { describe, it, expect } from 'vitest';
import { Native2DCompiler } from '../Native2DCompiler';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
} from '../../parser/HoloCompositionTypes';

function trait(name: string, config: HoloObjectTrait['config']): HoloObjectTrait {
  return { type: 'ObjectTrait', name, config };
}

function obj(
  name: string,
  traits: HoloObjectTrait[],
  children: HoloObjectDecl[] = []
): HoloObjectDecl {
  return { type: 'Object', name, properties: [], traits, children };
}

function comp(objects: HoloObjectDecl[], state?: HoloComposition['state']): HoloComposition {
  return {
    type: 'Composition',
    name: 'ReactiveProbe',
    objects,
    templates: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    ...(state ? { state } : {}),
  } as HoloComposition;
}

const html = (c: HoloComposition) =>
  new Native2DCompiler().compile(c, '', undefined, { format: 'html' }) as string;
const react = (c: HoloComposition) =>
  new Native2DCompiler().compile(c, '', undefined, { format: 'react' }) as string;

describe('Native2D reactive features — falsifier-per-feature (N1)', () => {
  // 1 ─────────────────────────────────────────────────────────────────────────
  describe('1. @apiEndpoint / poll', () => {
    const c = comp([
      obj('Inbox', [trait('fetch', { into: 'items', endpoint: '/api/x', method: 'GET' })]),
    ]);

    it('WORKS: one-shot @fetch emits useEffect+fetch (React) and data-holo-fetch (HTML)', () => {
      const r = react(c);
      expect(r).toContain('useEffect');
      expect(r).toContain('fetch(`/api/x`)');
      expect(html(c)).toContain('data-holo-fetch="/api/x"');
    });

    it('GAP: interval polling is NOT emitted (no setInterval); close when a live-poll consumer needs it', () => {
      expect(react(c)).not.toContain('setInterval');
      expect(html(c)).not.toContain('setInterval');
    });
  });

  // 2 ─────────────────────────────────────────────────────────────────────────
  describe('2. form traits', () => {
    const c = comp([
      obj(
        'Signup',
        [trait('panel', { tag: 'form' }), trait('form', { onSubmit: 'submitNewsletter(e)' })],
        [
          obj('Email', [
            trait('input', { type: 'email', placeholder: 'you@x.com', required: true }),
          ]),
        ]
      ),
    ]);

    it('WORKS: @input emits type/placeholder/required (both targets)', () => {
      const h = html(c);
      expect(h).toContain('type="email"');
      expect(h).toContain('placeholder="you@x.com"');
      expect(h).toContain('required');
      const r = react(c);
      expect(r).toContain('type="email"');
      expect(r).toContain('placeholder="you@x.com"');
    });

    it('WORKS (bug closed): React @form.onSubmit is PASSED, not invoked at render', () => {
      const r = react(c);
      // correct handler form — arrow wrapper
      expect(r).toContain('onSubmit={(e) => submitNewsletter(e)}');
      // regression guard: never the bare-call form that runs during render
      expect(r).not.toContain('onSubmit={submitNewsletter(e)}');
      // HTML target uses the onsubmit attribute
      expect(html(c)).toContain('onsubmit="submitNewsletter(e)"');
    });
  });

  // 3 ─────────────────────────────────────────────────────────────────────────
  describe('3. event handlers', () => {
    const c = comp([
      obj('Go', [trait('button', { content: 'Go', onClick: "navigate('/rooms')" })]),
    ]);

    it('WORKS: @button.onClick → React arrow handler + HTML onclick attr', () => {
      expect(react(c)).toContain("onClick={() => navigate('/rooms')}");
      expect(html(c)).toContain('onclick="navigate(\'/rooms\')"');
    });
  });

  // 4 ─────────────────────────────────────────────────────────────────────────
  describe('4. @state', () => {
    const c = comp([obj('Box', [trait('text', { content: 'x' })])], {
      type: 'State',
      properties: [{ type: 'StateProperty', key: 'count', value: 3 }],
    } as HoloComposition['state']);

    it('WORKS: composition.state → useState hook (React)', () => {
      expect(react(c)).toContain('const [count, setCount] = useState(3);');
    });

    it('HTML target is hydration-free by design (no useState)', () => {
      expect(html(c)).not.toContain('useState');
    });
  });

  // 5 ─────────────────────────────────────────────────────────────────────────
  describe('5. @map / list rendering', () => {
    const c = comp([
      obj(
        'List',
        [trait('fetch', { into: 'items', endpoint: '/api/items' })],
        [obj('Row', [trait('text', { content: '{{name}}' })])]
      ),
    ]);

    it('WORKS (HTML): @fetch container + row template + interpolation tokens', () => {
      const h = html(c);
      expect(h).toContain('data-holo-fetch="/api/items"');
      expect(h).toContain('data-holo-template');
      expect(h).toContain('{{name}}');
    });

    it('GAP (React): @fetch registers state+effect but never .maps the array', () => {
      const r = react(c);
      expect(r).toContain('useState'); // state slot created
      expect(r).toContain('useEffect'); // fetch effect created
      expect(r).not.toContain('.map('); // but the array is never rendered — the gap
    });
  });

  // 6 ─────────────────────────────────────────────────────────────────────────
  describe('6. @if (conditional rendering)', () => {
    const c = comp([
      obj('Maybe', [trait('if', { when: 'count > 0' }), trait('text', { content: 'shown' })]),
    ]);

    it('ABSENT: @if is not emitted — element renders unconditionally (pins the gap)', () => {
      const r = react(c);
      const h = html(c);
      // current reality: the trait is ignored, content renders with no guard
      expect(r).toContain('shown');
      expect(h).toContain('shown');
      expect(r).not.toMatch(/\{count > 0 &&|\? \(/); // no conditional JSX emitted
    });
  });

  // 7 ─────────────────────────────────────────────────────────────────────────
  // WORKS as of 2026-07-07: @computed closed now that a consumer needs it
  // (UniversalCompilerDashboard: `const targets = compileAST(nodes)`). Per this file's
  // doctrine — close the gap + flip the falsifier when a real consumer arrives.
  describe('7. @computed (derived values)', () => {
    it('WORKS: @computed emits a derived const from state', () => {
      const c = comp([obj('Box', [trait('computed', { name: 'doubled', expr: 'count * 2' })])], {
        type: 'State',
        properties: [{ type: 'StateProperty', key: 'count', value: 2 }],
      } as HoloComposition['state']);
      const r = react(c);
      expect(r).toContain('const doubled = count * 2;');
    });

    it('WORKS: @computed with from/uses imports the called symbol and binds AFTER state', () => {
      const c = comp(
        [
          obj('Slider', [
            trait('input', { type: 'range', min: '100', max: '10000', step: '100' }),
            trait('model', { state: 'nodes' }),
          ]),
          obj('Targets', [
            trait('computed', {
              name: 'targets',
              expr: 'compileAST(nodes)',
              from: '@/lib/v6PlatformServices',
              uses: ['compileAST'],
            }),
          ]),
        ],
        {
          type: 'State',
          properties: [{ type: 'StateProperty', key: 'nodes', value: 2500 }],
        } as HoloComposition['state']
      );
      const r = react(c);
      expect(r).toContain("import { compileAST } from '@/lib/v6PlatformServices';");
      expect(r).toContain('const [nodes, setNodes] = useState(2500);');
      // range @model coerces the string event value so state stays numeric
      expect(r).toContain('onChange={(e) => setNodes(Number(e.target.value))}');
      expect(r).toContain('min="100"'); // @input min/max/step now emit
      expect(r).toContain('max="10000"');
      expect(r).toContain('const targets = compileAST(nodes);');
      // the derived binding must come after the state hook it reads
      expect(r.indexOf('const [nodes')).toBeLessThan(r.indexOf('const targets ='));
    });

    it('rejects an unsafe expr (semicolon injection)', () => {
      const c = comp([obj('Box', [trait('computed', { name: 'x', expr: 'a; dropTable()' })])], {
        type: 'State',
        properties: [{ type: 'StateProperty', key: 'a', value: 1 }],
      } as HoloComposition['state']);
      expect(() => react(c)).toThrow(/unsafe expr/);
    });
  });

  // 7b ────────────────────────────────────────────────────────────────────────
  // @theme overrides the compiler's variant DEFAULT colors (resolveColorConflicts).
  // Without this the default's raw color (e.g. caption text-gray-500) leaks because which
  // conflicting utility wins depends on Tailwind's CSS emission order, not the class string.
  describe('7b. @theme overrides default colors', () => {
    it('WORKS: @theme text color wins over the caption default text-gray-500', () => {
      const c = comp([
        obj('Cap', [
          trait('text', { variant: 'caption', content: 'x' }),
          trait('theme', { className: 'text-studio-muted' }),
        ]),
      ]);
      const r = react(c);
      expect(r).toContain('text-studio-muted');
      expect(r).not.toContain('text-gray-500'); // default color no longer leaks
      expect(r).toContain('text-sm'); // structural default (size) preserved
    });

    it('WORKS: @theme colors win over the input default border/bg/text/ring', () => {
      const c = comp([
        obj('In', [
          trait('input', { type: 'range' }),
          trait('theme', {
            className: 'border-studio-border bg-studio-panel text-studio-text focus:ring-studio-accent',
          }),
        ]),
      ]);
      const r = react(c);
      expect(r).not.toContain('border-gray-700');
      expect(r).not.toContain('bg-gray-900');
      expect(r).not.toContain('text-white');
      expect(r).not.toContain('focus:ring-indigo-500');
      expect(r).toContain('border-studio-border');
      expect(r).toContain('bg-studio-panel');
      expect(r).toContain('focus:ring-studio-accent');
      expect(r).toContain('rounded-lg'); // structural default preserved
      expect(r).toContain('focus:ring-2'); // ring WIDTH kept (not a color)
    });

    it('keeps the default color when @theme provides no overriding color', () => {
      const c = comp([obj('Cap', [trait('text', { variant: 'caption', content: 'x' })])]);
      const r = react(c);
      expect(r).toContain('text-gray-500'); // no override → app-neutral default stays
    });

    it('preserves an arbitrary text SIZE ([10px]) while overriding only the color', () => {
      const c = comp([
        obj('Cap', [
          trait('text', { variant: 'caption', content: 'x' }),
          trait('theme', { className: 'text-[10px] text-studio-muted' }),
        ]),
      ]);
      const r = react(c);
      expect(r).toContain('text-[10px]'); // arbitrary size is NOT a color — must survive
      expect(r).toContain('text-studio-muted');
      expect(r).not.toContain('text-gray-500');
    });

    it('keeps border SIDE/WIDTH tokens alongside a border color (not deduped as color)', () => {
      const c = comp([
        obj('Card', [trait('theme', { className: 'border-l-2 border-studio-accent' })]),
        obj('Row', [trait('theme', { className: 'border-b border-studio-border' })]),
      ]);
      const r = react(c);
      expect(r).toContain('border-l-2'); // side+width is not a color — survives
      expect(r).toContain('border-studio-accent');
      expect(r).toContain('border-b'); // single-side is not a color — survives
      expect(r).toContain('border-studio-border');
    });
  });

  describe('7c. @bind tiers — categorical (string) coloring', () => {
    it('WORKS: string eq tiers emit === comparisons and coerce to "" (not 0)', () => {
      const c = comp([
        obj('Outcome', [
          trait('text', { variant: 'caption' }),
          trait('bind', {
            state: 'entry',
            path: 'outcome',
            fallback: '',
            tiers: [
              { eq: 'denied', className: 'text-studio-error' },
              { eq: 'success', className: 'text-studio-success' },
              { className: 'text-studio-muted' },
            ],
          }),
        ]),
      ]);
      const r = react(c);
      expect(r).toContain('=== "denied" ? "text-studio-error"');
      expect(r).toContain('=== "success" ? "text-studio-success"');
      expect(r).toContain(': "text-studio-muted"'); // unconditional default branch
      expect(r).toContain("?? ''"); // string coercion for the compared value
      expect(r).not.toContain('entry?.outcome ?? 0'); // NOT numeric-coerced
    });

    it('WORKS: neq string tier emits a !== comparison', () => {
      const c = comp([
        obj('Flag', [
          trait('text', { variant: 'caption' }),
          trait('bind', {
            state: 'row',
            path: 'status',
            tiers: [
              { neq: 'ok', className: 'text-studio-error' },
              { className: 'text-studio-muted' },
            ],
          }),
        ]),
      ]);
      expect(react(c)).toContain('!== "ok" ? "text-studio-error"');
    });

    it('WORKS: numeric eq tier compares exactly and keeps numeric coercion', () => {
      const c = comp([
        obj('Count', [
          trait('text', { variant: 'caption' }),
          trait('bind', {
            state: 'row',
            path: 'n',
            tiers: [
              { eq: 0, className: 'text-studio-muted' },
              { className: 'text-studio-text' },
            ],
          }),
        ]),
      ]);
      const r = react(c);
      expect(r).toContain('=== 0 ? "text-studio-muted"');
      expect(r).toContain('?? 0'); // numeric-only tiers keep numeric coercion
    });

    it('REGRESSION: pure numeric threshold tiers still coerce with ?? 0', () => {
      const c = comp([
        obj('Fps', [
          trait('text', { variant: 'caption' }),
          trait('bind', {
            state: 'snap',
            path: 'fps',
            tiers: [
              { gte: 55, className: 'text-studio-success' },
              { className: 'text-studio-error' },
            ],
          }),
        ]),
      ]);
      const r = react(c);
      expect(r).toContain('>= 55 ? "text-studio-success"');
      expect(r).toContain('?? 0');
      expect(r).not.toContain("?? ''");
    });

    it('CLEAN: the tier-owned color family is stripped from the static prefix', () => {
      const c = comp([
        obj('Outcome', [
          trait('text', { variant: 'caption' }), // default injects text-gray-500
          trait('bind', {
            state: 'entry',
            path: 'outcome',
            tiers: [
              { eq: 'denied', className: 'text-studio-error' },
              { className: 'text-studio-muted' },
            ],
          }),
          trait('theme', { className: 'font-semibold' }),
        ]),
      ]);
      const r = react(c);
      expect(r).not.toContain('text-gray-500'); // default color no longer leaks statically
      expect(r).toContain('text-sm'); // structural size default preserved
      expect(r).toContain('font-semibold'); // authored non-color class preserved
      expect(r).toContain('text-studio-error'); // dynamic tier color present
    });

    it('REJECTS: an eq operand that would break out of the string literal', () => {
      const c = comp([
        obj('Bad', [
          trait('text', { variant: 'caption' }),
          trait('bind', {
            state: 'row',
            path: 'x',
            tiers: [{ eq: 'a" + alert(1) + "', className: 'text-studio-error' }],
          }),
        ]),
      ]);
      expect(() => react(c)).toThrow(/@bind tier eq/);
    });
  });

  describe('7d. @sparkline — native SVG polyline data-viz', () => {
    it('WORKS: emits an SVG polyline with runtime-computed points from the bound array', () => {
      const c = comp([obj('Spark', [trait('sparkline', { state: 'series' })])]);
      const r = react(c);
      expect(r).toContain('<svg');
      expect(r).toContain('viewBox="0 0 100 30"'); // default dims
      expect(r).toContain('preserveAspectRatio="none"');
      expect(r).toContain('<polyline');
      expect(r).toContain('points={');
      expect(r).toContain('Number(d) || 0'); // default value expr (items are numbers)
      expect(r).toContain('(series)'); // bound array passed into the points IIFE
      expect(r).toContain('stroke-studio-accent'); // default themeable stroke
    });

    it('WORKS: valueKey reads a number out of object items', () => {
      const c = comp([obj('Spark', [trait('sparkline', { state: 'targets', valueKey: 'sizeKb' })])]);
      expect(react(c)).toContain('Number(d?.sizeKb) || 0');
    });

    it('WORKS: custom height sets the viewBox and a custom stroke class applies', () => {
      const c = comp([
        obj('Spark', [trait('sparkline', { state: 's', height: 24, stroke: 'stroke-studio-success' })]),
      ]);
      const r = react(c);
      expect(r).toContain('viewBox="0 0 100 24"');
      expect(r).toContain('className="stroke-studio-success"');
    });

    it('WORKS: declares its min-max framing via data-baseline="min" (axis-less glyph receipt)', () => {
      const c = comp([obj('Spark', [trait('sparkline', { state: 'series' })])]);
      const r = react(c);
      expect(r).toContain('data-baseline="min"'); // framing declared, mirroring @chart
      expect(r).toContain('Math.min(...__v)'); // min-max normalization kept (shape glyph)
    });

    it('ABSENT: a plain object emits no polyline (byte-identical to pre-@sparkline)', () => {
      const c = comp([obj('Plain', [trait('theme', { className: 'p-2' })])]);
      expect(react(c)).not.toContain('<polyline');
    });

    it('REJECTS: an invalid valueKey (dot path is not a bare key)', () => {
      const c = comp([obj('Bad', [trait('sparkline', { state: 's', valueKey: 'a.b' })])]);
      expect(() => react(c)).toThrow(/@sparkline: invalid valueKey/);
    });

    it('REJECTS: a stroke class that would break out of the attribute', () => {
      const c = comp([obj('Bad', [trait('sparkline', { state: 's', stroke: 'x" onload="y' })])]);
      expect(() => react(c)).toThrow(/@sparkline stroke/);
    });
  });

  describe('7e. @hook args — hooks that take arguments', () => {
    it('WORKS: args are passed to the hook call', () => {
      const c = comp([
        obj('Dash', [
          trait('hook', {
            name: 'useCreatorStats',
            import: '@/hooks/useCreatorStats',
            returns: 'stats',
            args: '{ address }',
          }),
        ]),
      ]);
      expect(react(c)).toContain('const { stats } = useCreatorStats({ address });');
    });

    it('WORKS: no args keeps the bare call (regression)', () => {
      const c = comp([
        obj('P', [trait('hook', { name: 'useProfiler', import: '@/hooks/useProfiler', returns: 'snap' })]),
      ]);
      expect(react(c)).toContain('const { snap } = useProfiler();');
    });

    it('REJECTS: unsafe args (backtick / statement injection)', () => {
      const c = comp([
        obj('Bad', [
          trait('hook', { name: 'useX', import: '@/hooks/useX', returns: 'x', args: '`;drop()' }),
        ]),
      ]);
      expect(() => react(c)).toThrow(/@hook: unsafe args/);
    });
  });

  describe('7f. @chart — native SVG bar/line/area chart', () => {
    it('WORKS: bar chart emits a baseline, one rect per item, and crisp labels', () => {
      const c = comp([
        obj('Chart', [
          trait('chart', { kind: 'bar', state: 'targets', valueKey: 'sizeKb', labelKey: 'target' }),
        ]),
      ]);
      const r = react(c);
      expect(r).toContain('<svg');
      expect(r).toContain('viewBox="0 0 280 140"'); // default dims
      expect(r).toContain('<line'); // baseline axis
      expect(r).toContain('stroke-studio-border'); // axis color (token)
      expect(r).toContain('<rect'); // bars
      expect(r).toContain('Number(d?.sizeKb)'); // valueKey
      expect(r).toContain('className="fill-studio-accent"'); // bar fill (default token)
      expect(r).toContain('<text'); // category labels
      expect(r).toContain("String(d?.target ?? '')"); // labelKey text
      expect(r).toContain('(targets)'); // bound array
      // A chart carries text labels, so it must NOT stretch (crisp text) — unlike @sparkline.
      expect(r).not.toContain('preserveAspectRatio="none"');
    });

    it('WORKS: classKey gives each bar per-item provenance (solid/hatch/dots + class attr)', () => {
      const c = comp([
        obj('Chart', [
          trait('chart', { kind: 'bar', state: 'rows', valueKey: 'v', classKey: 'prov' }),
        ]),
      ]);
      const r = react(c);
      expect(r).toContain('<pattern id="holo-hatch"'); // inferred pattern def
      expect(r).toContain('<pattern id="holo-dots"'); // generative pattern def
      expect(r).toContain('d?.prov === "inferred" ? "url(#holo-hatch)"'); // per-bar fill
      expect(r).toContain('d?.prov === "generative" ? "url(#holo-dots)"');
      expect(r).toContain('data-provenance-class={String(d?.prov ?? "")}'); // per-bar receipt
    });

    it('ABSENT: no classKey → solid bars, no pattern defs (backward compat)', () => {
      const c = comp([obj('Chart', [trait('chart', { kind: 'bar', state: 'rows', valueKey: 'v' })])]);
      const r = react(c);
      expect(r).not.toContain('<pattern');
      expect(r).not.toContain('data-provenance-class');
    });

    it('REJECTS: an invalid classKey', () => {
      const c = comp([obj('Bad', [trait('chart', { state: 's', classKey: 'a.b' })])]);
      expect(() => react(c)).toThrow(/@chart: invalid classKey/);
    });

    it('WORKS: bar heights clamp negative values to zero AND declare it via data-clamped', () => {
      const c = comp([obj('Chart', [trait('chart', { kind: 'bar', state: 'rows', valueKey: 'v' })])]);
      const r = react(c);
      // Render-time clamp: a negative rect height is invalid SVG, so heights floor at 0.
      expect(r).toContain('Math.max(0, Number(d?.v) || 0)');
      // The truncation is declared, runtime-computed from the bound data on the svg root.
      expect(r).toContain(
        'data-clamped={String(((__a) => (__a ?? []).some((d) => (Number(d?.v) || 0) < 0))(rows))}'
      );
    });

    it('WORKS: line chart emits a polyline over the plot region, no rects', () => {
      const c = comp([obj('Chart', [trait('chart', { kind: 'line', state: 'series' })])]);
      const r = react(c);
      expect(r).toContain('<polyline');
      expect(r).toContain('stroke-studio-accent');
      expect(r).not.toContain('<rect');
    });

    it('WORKS: area chart emits a filled polygon plus the line', () => {
      const c = comp([obj('Chart', [trait('chart', { kind: 'area', state: 'series' })])]);
      const r = react(c);
      expect(r).toContain('<polygon');
      expect(r).toContain('fillOpacity="0.25"');
      expect(r).toContain('<polyline'); // line drawn on top of the area
    });

    it('WORKS: custom dims set the viewBox', () => {
      const c = comp([obj('Chart', [trait('chart', { kind: 'bar', state: 's', width: 320, height: 100 })])]);
      expect(react(c)).toContain('viewBox="0 0 320 100"');
    });

    it('ABSENT: a plain object emits no chart svg', () => {
      const c = comp([obj('Plain', [trait('theme', { className: 'p-2' })])]);
      const r = react(c);
      expect(r).not.toContain('<rect');
      expect(r).not.toContain('fill-studio-accent');
    });

    it('REJECTS: an invalid valueKey', () => {
      const c = comp([obj('Bad', [trait('chart', { state: 's', valueKey: 'a.b' })])]);
      expect(() => react(c)).toThrow(/@chart: invalid valueKey/);
    });

    it('REJECTS: an invalid labelKey', () => {
      const c = comp([obj('Bad', [trait('chart', { state: 's', labelKey: 'a-b' })])]);
      expect(() => react(c)).toThrow(/@chart: invalid labelKey/);
    });

    it('REJECTS: a fill class that would break out of the attribute', () => {
      const c = comp([obj('Bad', [trait('chart', { state: 's', fill: 'x" onload="y' })])]);
      expect(() => react(c)).toThrow(/@chart fill/);
    });
  });

  describe('7g. @honest / @provenance_bound — the Receipt-Bound Surface', () => {
    const honestComp = (
      objects: HoloObjectDecl[],
      state?: HoloComposition['state']
    ): HoloComposition =>
      ({ ...comp(objects, state), traits: [{ name: 'honest' }] } as unknown as HoloComposition);

    it('WORKS: a measured provenance-bound value emits a receipt, no visible glyph', () => {
      const c = honestComp([
        obj('Sessions', [
          trait('text', { variant: 'h2' }),
          trait('bind', { state: 'stats', path: 'sessions', fallback: '0' }),
          trait('provenance_bound', {
            source: 'securityEventBus',
            class: 'measured',
            confidence: 1,
          }),
        ]),
      ]);
      const r = react(c);
      expect(r).toContain('data-provenance-class="measured"');
      expect(r).toContain('"source":"securityEventBus"');
      expect(r).toContain('"class":"measured"');
      expect(r).toContain('"confidence":1');
      expect(r).not.toContain('holo-prov-mark'); // measured = trusted → no glyph
    });

    it('WORKS: an inferred value appends a visible ~ glyph plus the receipt', () => {
      const c = honestComp([
        obj('Forecast', [
          trait('text', { variant: 'h2' }),
          trait('bind', { state: 'model', path: 'next', fallback: '0' }),
          trait('provenance_bound', { source: 'forecast-v2', class: 'inferred' }),
        ]),
      ]);
      const r = react(c);
      expect(r).toContain('data-provenance-class="inferred"');
      expect(r).toContain('holo-prov-mark'); // visible honesty marker
      expect(r).toContain('~'); // the inferred glyph
    });

    it('REJECTS (HONEST-UNSOURCED): a data-bound element with no @provenance_bound in honest mode', () => {
      const c = honestComp([
        obj('Naked', [trait('text', { variant: 'h2' }), trait('bind', { state: 'x', path: 'y' })]),
      ]);
      expect(() => react(c)).toThrow(/HONEST-UNSOURCED/);
    });

    it('REJECTS: an unknown provenance class (fails toward lower trust, never upgraded)', () => {
      const c = honestComp([
        obj('Bad', [
          trait('text', { variant: 'h2' }),
          trait('bind', { state: 'x', path: 'y' }),
          trait('provenance_bound', { source: 's', class: 'trustworthy' }),
        ]),
      ]);
      expect(() => react(c)).toThrow(/invalid class/);
    });

    it('BACKWARD-COMPAT: a data-bound element with no provenance is fine when NOT honest', () => {
      const c = comp([
        obj('Plain', [trait('text', { variant: 'h2' }), trait('bind', { state: 'x', path: 'y' })]),
      ]);
      const r = react(c);
      expect(r).not.toContain('data-holo-provenance'); // no receipt when not honest
      expect(r).toContain('{x?.y'); // still renders normally
    });

    it('WORKS: a @chart carries the provenance receipt on its svg', () => {
      const c = honestComp([
        obj('Chart', [
          trait('chart', { kind: 'bar', state: 'series', valueKey: 'v' }),
          trait('provenance_bound', { source: 'compileAST', class: 'derived' }),
        ]),
      ]);
      const r = react(c);
      expect(r).toContain('<svg');
      expect(r).toContain('data-provenance-class="derived"');
      expect(r).toContain('"source":"compileAST"');
    });

    it('HONEST FRAMING: line chart uses a zero baseline, not min-max (no truncated axis)', () => {
      const c = honestComp([
        obj('Trend', [
          trait('chart', { kind: 'line', state: 'series', valueKey: 'v' }),
          trait('provenance_bound', { source: 'sensorBus', class: 'measured' }),
        ]),
      ]);
      const r = react(c);
      expect(r).toContain('__mn = 0'); // baseline anchored at zero
      expect(r).toContain('Math.max(1, ...__v)'); // range = max (mirrors the bar branch)
      expect(r).not.toContain('Math.min(...__v)'); // never re-anchors at min
      expect(r).toContain('data-baseline="zero"'); // the framing itself is auditable
    });

    it('BACKWARD-COMPAT: a non-honest line chart keeps min-max framing and declares it', () => {
      const c = comp([obj('Trend', [trait('chart', { kind: 'line', state: 'series' })])]);
      const r = react(c);
      expect(r).toContain('Math.min(...__v)'); // min-max normalization preserved
      expect(r).toContain('data-baseline="min"'); // but the framing is declared, not hidden
    });

    it('HONEST FRAMING: @sparkline KEEPS min-max in honest mode but declares it (axis-less glyph)', () => {
      const c = honestComp([
        obj('Spark', [
          trait('sparkline', { state: 'series' }),
          trait('provenance_bound', { source: 'sensorBus', class: 'measured' }),
        ]),
      ]);
      const r = react(c);
      // Zero-anchoring an axis-less shape glyph would destroy its shape-reading
      // purpose, so min-max survives @honest — the declaration IS the honest contract.
      expect(r).toContain('Math.min(...__v)');
      expect(r).toContain('data-baseline="min"');
    });

    it('HONEST FRAMING: negative line values clamp to the zero baseline and declare data-clamped', () => {
      const c = honestComp([
        obj('Trend', [
          trait('chart', { kind: 'line', state: 'series', valueKey: 'v' }),
          trait('provenance_bound', { source: 'sensorBus', class: 'measured' }),
        ]),
      ]);
      const r = react(c);
      expect(r).toContain('Math.max(0, y)'); // clamp at the zero baseline (no below-axis geometry)
      expect(r).toContain(
        'data-clamped={String(((__a) => (__a ?? []).some((d) => (Number(d?.v) || 0) < 0))(series))}'
      ); // the truncation is a declared, runtime-computed receipt
    });

    it('BACKWARD-COMPAT: a non-honest line chart is unchanged — no clamp, no data-clamped', () => {
      const c = comp([obj('Trend', [trait('chart', { kind: 'line', state: 'series' })])]);
      const r = react(c);
      expect(r).toContain('Math.min(...__v)'); // min-max handles negatives natively
      expect(r).not.toContain('Math.max(0, y)'); // no clamp injected
      expect(r).not.toContain('data-clamped'); // no truncation attribute
    });

    it('REJECTS: an unsafe provenance source that breaks out of the attribute', () => {
      const c = honestComp([
        obj('Bad', [
          trait('text', { variant: 'h2' }),
          trait('bind', { state: 'x', path: 'y' }),
          trait('provenance_bound', { source: 'a" onload="z', class: 'measured' }),
        ]),
      ]);
      expect(() => react(c)).toThrow(/@provenance_bound source/);
    });
  });

  describe('7i. @verified_view / @projects — admission gate for agent-authored surfaces (slice 4 v0)', () => {
    const vstate = {
      type: 'State',
      properties: [{ type: 'StateProperty', key: 'stats', value: { sessions: 4 } }],
    } as HoloComposition['state'];
    const verifiedComp = (objects: HoloObjectDecl[]): HoloComposition =>
      ({ ...comp(objects, vstate), traits: [{ name: 'verified_view' }] } as unknown as HoloComposition);

    it('WORKS: a matching projection compiles and emits the data-holo-projects receipt', () => {
      const c = verifiedComp([
        obj('Sessions', [
          trait('text', { variant: 'h2' }),
          trait('bind', { state: 'stats', path: 'sessions' }),
          trait('projects', { node: 'stats.sessions' }),
        ]),
      ]);
      const r = react(c);
      expect(r).toContain('data-holo-projects="stats.sessions"');
      expect(r).toContain('{stats?.sessions'); // still actually bound
    });

    it('REJECTS (VIEW-UNGROUNDED): a data-bound element with no @projects under @verified_view', () => {
      const c = verifiedComp([
        obj('Naked', [trait('text', { variant: 'h2' }), trait('bind', { state: 'stats', path: 'sessions' })]),
      ]);
      expect(() => react(c)).toThrow(/VIEW-UNGROUNDED/);
    });

    it('REJECTS (the falsification): the claim names a DIFFERENT node than the actual binding', () => {
      // "The agent says sessions, but wired revenue" — the core lie this gate exists for.
      const c = verifiedComp([
        obj('Liar', [
          trait('text', { variant: 'h2' }),
          trait('bind', { state: 'stats', path: 'revenue' }),
          trait('projects', { node: 'stats.sessions' }),
        ]),
      ]);
      expect(() => react(c)).toThrow(/claims to project "stats\.sessions" but is actually bound to "stats\.revenue"/);
    });

    it('REJECTS: a projection rooted in a hallucinated state node', () => {
      const c = verifiedComp([
        obj('Ghost', [
          trait('text', { variant: 'h2' }),
          trait('bind', { state: 'phantom', path: 'x' }),
          trait('projects', { node: 'phantom.x' }),
        ]),
      ]);
      expect(() => react(c)).toThrow(/hallucinated node/);
    });

    it('REJECTS: @projects on an element with no data binding (a lie by construction) — even OUTSIDE the mode', () => {
      const c = comp(
        [obj('Static', [trait('text', { variant: 'h2', content: 'hi' }), trait('projects', { node: 'stats.sessions' })])],
        vstate
      );
      expect(() => react(c)).toThrow(/no data binding at all/);
    });

    it('WORKS: a @fetch into-slot is a legitimate projection root (pre-scanned, order-independent)', () => {
      const c = verifiedComp([
        obj('List', [
          trait('bind', { state: 'items', path: 'length' }),
          trait('projects', { node: 'items.length' }),
        ]),
        obj('Loader', [trait('fetch', { into: 'items', endpoint: '/api/items' })]),
      ]);
      // the fetch container comes AFTER the bound element in document order
      expect(react(c)).toContain('data-holo-projects="items.length"');
    });

    it('BACKWARD-COMPAT: without @verified_view, unprojected data bindings still compile', () => {
      const c = comp(
        [obj('Plain', [trait('text', { variant: 'h2' }), trait('bind', { state: 'stats', path: 'sessions' })])],
        vstate
      );
      expect(react(c)).not.toContain('data-holo-projects');
    });
  });

  describe('7h. @live_proof — the falsifiable surface (receipt as render state)', () => {
    it('WORKS: emits a verdict badge that flips PASS/FALSIFIED on the claim', () => {
      const c = comp([
        obj('Margin', [
          trait('live_proof', { claim: 'capacity >= load * factor', label: 'Structural margin' }),
        ]),
      ]);
      const r = react(c);
      expect(r).toContain('data-proof-claim={"capacity >= load * factor"}');
      expect(r).toContain('data-proof-state={(capacity >= load * factor) ? "pass" : "falsified"}');
      expect(r).toContain('text-studio-success'); // holds
      expect(r).toContain('text-studio-error'); // falsified
      expect(r).toContain('✓ Structural margin holds');
      expect(r).toContain('✗ Structural margin FALSIFIED');
    });

    it('WORKS: defaults the label to "Claim" when unset', () => {
      const c = comp([obj('P', [trait('live_proof', { claim: 'a > b' })])]);
      expect(react(c)).toContain('✓ Claim holds');
    });

    it('REJECTS: an unsafe claim (backtick / statement injection)', () => {
      const c = comp([obj('Bad', [trait('live_proof', { claim: 'a > b`;drop()' })])]);
      expect(() => react(c)).toThrow(/@live_proof: unsafe/);
    });

    it('REJECTS: an empty claim', () => {
      const c = comp([obj('Bad', [trait('live_proof', { claim: '   ' })])]);
      expect(() => react(c)).toThrow(/unsafe or empty/);
    });
  });

  // 8 ─────────────────────────────────────────────────────────────────────────
  describe('8. layout', () => {
    it('WORKS: flex layout → display:flex + direction + gap', () => {
      const c = comp([
        obj('Col', [
          trait('layout', { flex: 'column', gap: 12, justify: 'center', align: 'start' }),
        ]),
      ]);
      const h = html(c);
      expect(h).toContain('display: flex');
      expect(h).toContain('flex-direction: column');
      expect(h).toContain('gap: 12px');
      expect(h).toContain('justify-content: center');
    });

    it('WORKS: grid layout → display:grid + template columns', () => {
      const c = comp([obj('Grid', [trait('layout', { grid: true, columns: 3 })])]);
      const h = html(c);
      expect(h).toContain('display: grid');
      expect(h).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    });
  });

  // 9 ─────────────────────────────────────────────────────────────────────────
  describe('9. @route', () => {
    const c = comp([
      obj(
        'Page',
        [trait('route', { path: '/dashboard' })],
        [obj('T', [trait('text', { content: 'hi' })])]
      ),
    ]);

    it('ABSENT: @route emits no router/path binding (pins the gap; nav today is onClick navigate())', () => {
      const r = react(c);
      const h = html(c);
      expect(r).not.toContain('/dashboard');
      expect(h).not.toContain('/dashboard');
      expect(r).not.toMatch(/Router|useRouter|<Route/);
    });
  });

  // 10 ────────────────────────────────────────────────────────────────────────
  describe('10. @websocket', () => {
    const c = comp([obj('Live', [trait('websocket', { url: 'wss://x/feed', into: 'feed' })])]);

    it('ABSENT: @websocket emits no WebSocket wiring (pins the gap)', () => {
      const r = react(c);
      const h = html(c);
      expect(r).not.toContain('WebSocket');
      expect(r).not.toContain('wss://x/feed');
      expect(h).not.toContain('WebSocket');
    });
  });
});
