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
  describe('7. @computed (derived values)', () => {
    const c = comp([obj('Box', [trait('computed', { name: 'doubled', expr: 'count * 2' })])], {
      type: 'State',
      properties: [{ type: 'StateProperty', key: 'count', value: 2 }],
    } as HoloComposition['state']);

    it('ABSENT: @computed emits no derived binding (pins the gap)', () => {
      const r = react(c);
      expect(r).not.toContain('doubled'); // no const doubled = ...
      expect(r).not.toContain('count * 2');
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
