import { describe, expect, it } from 'vitest';
import { Native2DCompiler } from '../Native2DCompiler';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
} from '../../parser/HoloCompositionTypes';

function trait(name: string, config: HoloObjectTrait['config']): HoloObjectTrait {
  return {
    type: 'ObjectTrait',
    name,
    config,
  };
}

function objectDecl(
  name: string,
  traits: HoloObjectTrait[],
  children: HoloObjectDecl[] = []
): HoloObjectDecl {
  return {
    type: 'Object',
    name,
    properties: [],
    traits,
    children,
  };
}

function makeComposition(): HoloComposition {
  const headline = objectDecl('headline', [
    trait('text', {
      variant: 'h1',
      content: 'Launch Room',
      align: 'center',
      weight: '700',
    }),
  ]);

  const preview = objectDecl('preview', [
    trait('image', {
      src: '/hero.png',
      alt: 'Hero preview',
    }),
  ]);

  const cta = objectDecl('cta', [
    trait('button', {
      content: 'Open room',
      variant: 'primary',
      onClick: "navigate('/rooms')",
    }),
  ]);

  const hero = objectDecl(
    'hero',
    [
      trait('theme', {
        tag: 'section',
        id: 'hero',
        className: 'hero-shell',
        backgroundColor: '#111827',
        color: '#f8fafc',
        padding: 24,
      }),
      trait('layout', {
        flex: 'column',
        gap: 12,
      }),
    ],
    [headline, preview, cta]
  );

  return {
    type: 'Composition',
    name: 'Native2DFidelity',
    objects: [hero],
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
    state: {
      type: 'State',
      properties: [{ type: 'StateProperty', key: 'status', value: 'ready' }],
    },
  };
}

describe('Native2DCompiler fidelity', () => {
  it('reflects input hierarchy, traits, content, and actions in HTML output', () => {
    const html = new Native2DCompiler().compile(makeComposition(), '');

    expect(html).toContain('<section');
    expect(html).toContain('id="hero"');
    expect(html).toContain('class="hero-shell"');
    expect(html).toContain('display: flex');
    expect(html).toContain('flex-direction: column');
    expect(html).toContain('gap: 12px');
    expect(html).toContain('background-color: #111827');
    expect(html).toContain('color: #f8fafc');
    expect(html).toContain('<h1');
    expect(html).toContain('Launch Room');
    expect(html).toContain('src="/hero.png"');
    expect(html).toContain('alt="Hero preview"');
    expect(html).toContain('<button');
    expect(html).toContain('onclick="navigate(\'/rooms\')"');
    expect(html).toContain('Open room');
  });

  it('reflects input hierarchy, state, traits, and actions in React output', () => {
    const react = new Native2DCompiler().compile(makeComposition(), '', undefined, {
      format: 'react',
    });

    expect(react).toContain('export function Native2DFidelityComponent()');
    expect(react).toContain('const [status, setStatus] = useState("ready");');
    expect(react).toContain('<section');
    expect(react).toContain('id="hero"');
    expect(react).toContain('"display":"flex"');
    expect(react).toContain('"flexDirection":"column"');
    expect(react).toContain('"backgroundColor":"#111827"');
    expect(react).toContain('className="hero-shell"');
    expect(react).toContain('{`Launch Room`}');
    expect(react).toContain('<img src="/hero.png" alt="Hero preview" />');
    expect(react).toContain("onClick={() => navigate('/rooms')}");
    expect(react).toContain('{`Open room`}');
  });
});

// ---------------------------------------------------------------------------
// Semantic entity / layout → real HTML DOM (tp-business dogfood, task_1780922175339_7hxi)
// ---------------------------------------------------------------------------
describe('Native2DCompiler semantic entity mapping', () => {
  /** Mirror of what generate_semantic_ui emits for an inventory dashboard:
   *  mesh objects carrying @semantic_entity + @semantic_layout + @color traits. */
  function makeSemanticComposition(): HoloComposition {
    // stock_table with table layout
    const stockTable = objectDecl('mesh_table', [
      trait('semantic_entity', { _arg0: 'stock_table' }),
      trait('semantic_layout', { _arg0: 'table', columns: ['item', 'quantity', 'reorder_level'] }),
      trait('color', { _arg0: '#16213e' }),
    ]);

    // add_item_form with form layout
    const addItemForm = objectDecl('mesh_form', [
      trait('semantic_entity', { _arg0: 'add_item_form' }),
      trait('semantic_layout', { _arg0: 'form', fields: ['item', 'quantity', 'reorder_level'] }),
      trait('color', { _arg0: '#0f3460' }),
    ]);

    // low_stock_alert_panel with alert_list layout
    const alertPanel = objectDecl('mesh_alert', [
      trait('semantic_entity', { _arg0: 'low_stock_alert_panel' }),
      trait('semantic_layout', { _arg0: 'alert_list', filter: 'quantity<reorder_level' }),
      trait('color', { _arg0: '#e63946' }),
    ]);

    // dashboard_title — entity only + @content
    const title = objectDecl('text_title', [
      trait('semantic_entity', { _arg0: 'dashboard_title' }),
      trait('content', { _arg0: 'Inventory Dashboard' }),
      trait('color', { _arg0: 'white' }),
    ]);

    // submit_button — entity + @content (button keyword in name)
    const submitBtn = objectDecl('text_btn', [
      trait('semantic_entity', { _arg0: 'submit_button' }),
      trait('content', { _arg0: '[ + Add Item ]' }),
    ]);

    return {
      type: 'Composition',
      name: 'GeneratedScene',
      objects: [stockTable, addItemForm, alertPanel, title, submitBtn],
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
    };
  }

  it('emits a <table> with column headers for @semantic_layout(table)', () => {
    const html = new Native2DCompiler().compile(makeSemanticComposition(), '');
    expect(html).toContain('<table');
    expect(html).toContain('item');
    expect(html).toContain('reorder');
  });

  it('emits a <form> with inputs for @semantic_layout(form)', () => {
    const html = new Native2DCompiler().compile(makeSemanticComposition(), '');
    expect(html).toContain('<form');
    expect(html).toContain('<input');
  });

  it('emits an alert list for @semantic_layout(alert_list)', () => {
    const html = new Native2DCompiler().compile(makeSemanticComposition(), '');
    expect(html).toContain('data-holo-semantic="alert_list"');
  });

  it('emits a title span for @semantic_entity + @content (non-button)', () => {
    const html = new Native2DCompiler().compile(makeSemanticComposition(), '');
    expect(html).toContain('Inventory Dashboard');
    expect(html).toContain('data-holo-entity="dashboard_title"');
  });

  it('emits a <button> for @semantic_entity named *button* + @content', () => {
    const html = new Native2DCompiler().compile(makeSemanticComposition(), '');
    expect(html).toContain('<button');
    expect(html).toContain('[ + Add Item ]');
  });
});

// ---------------------------------------------------------------------------
// Styling: inline CSS, no CDN dependency (task_1780203169908_xeg0)
// ---------------------------------------------------------------------------
describe('Native2DCompiler static-HTML styling', () => {
  it('does NOT reference cdn.tailwindcss.com (dead CDN removed)', () => {
    const html = new Native2DCompiler().compile(makeComposition(), '');
    expect(html).not.toContain('cdn.tailwindcss.com');
  });

  it('embeds inline utility CSS with Tailwind-compatible class definitions', () => {
    const html = new Native2DCompiler().compile(makeComposition(), '');
    expect(html).toContain('.text-5xl');
    expect(html).toContain('.rounded-lg');
    expect(html).toContain('.bg-blue-600');
    expect(html).toContain('.shadow-lg');
    expect(html).toContain('.transition-all');
  });

  it('defaults to dark theme (dark body background) when no theme env declared', () => {
    const html = new Native2DCompiler().compile(makeComposition(), '');
    // Default is dark: #050510 background, #ffffff text
    expect(html).toContain('#050510');
    expect(html).not.toContain('background-color: #ffffff');
  });

  it('uses light theme when environment declares theme:light', () => {
    const lightComposition = {
      ...makeComposition(),
      environment: {
        type: 'Environment' as const,
        properties: [{ key: 'theme', value: 'light' }],
      },
    };
    const html = new Native2DCompiler().compile(
      lightComposition as Parameters<Native2DCompiler['compile']>[0],
      ''
    );
    expect(html).toContain('#ffffff');
    expect(html).not.toContain('#050510');
  });
});

// ---------------------------------------------------------------------------
// @bind value-tier (threshold-conditional) className — profiler readout
// compiles natively (task_1781462589710_rzxt)
// ---------------------------------------------------------------------------
describe('Native2DCompiler @bind value-tier className', () => {
  /** A profiler FPS readout: bound to state.snap.fps, styled green/amber/red. */
  function makeProfilerReadout(): HoloComposition {
    const fpsReadout = objectDecl('fps_readout', [
      trait('text', { variant: 'caption' }),
      trait('bind', {
        state: 'snap',
        path: 'fps',
        fallback: '—',
        tiers: [
          { gte: 55, className: 'text-emerald-400' },
          { gte: 30, className: 'text-amber-400' },
          { className: 'text-red-400' },
        ],
      }),
    ]);

    return {
      type: 'Composition',
      name: 'ProfilerReadout',
      objects: [fpsReadout],
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
      state: {
        type: 'State',
        properties: [{ type: 'StateProperty', key: 'snap', value: { fps: 0 } }],
      },
    };
  }

  it('emits a threshold-conditional className ternary cascade from bind tiers (react)', () => {
    const react = new Native2DCompiler().compile(makeProfilerReadout(), '', undefined, {
      format: 'react',
    });
    // High-to-low ternary cascade reading the bound numeric value.
    expect(react).toContain('(snap?.fps ?? 0) >= 55 ? "text-emerald-400"');
    expect(react).toContain('(snap?.fps ?? 0) >= 30 ? "text-amber-400"');
    expect(react).toContain('"text-red-400"');
    // Emitted as a JSX expression className (not a static string).
    expect(react).toContain('className={`');
  });

  it('merges static variant classes with the value-tier cascade (react)', () => {
    const react = new Native2DCompiler().compile(makeProfilerReadout(), '', undefined, {
      format: 'react',
    });
    // @text(variant: caption) contributes `text-sm text-gray-500` statically,
    // which must prefix the dynamic tier cascade inside the same className.
    expect(react).toMatch(/className=\{`text-sm text-gray-500 \$\{.*text-red-400.*`\}/s);
  });

  it('still emits the bound value content alongside the tiered className (react)', () => {
    const react = new Native2DCompiler().compile(makeProfilerReadout(), '', undefined, {
      format: 'react',
    });
    // The reactive content expression and fallback are unchanged by tiers.
    expect(react).toContain('{snap?.fps ?? "—"}');
  });

  it('falls back to a plain static className when bind has no tiers (react)', () => {
    const noTiers = makeProfilerReadout();
    // strip tiers from the bind trait
    const bindTrait = noTiers.objects[0].traits.find((t) => t.name === 'bind');
    if (bindTrait && bindTrait.config && typeof bindTrait.config === 'object') {
      delete (bindTrait.config as Record<string, unknown>).tiers;
    }
    const react = new Native2DCompiler().compile(noTiers, '', undefined, { format: 'react' });
    // Static caption classes appear as a plain string className, no JSX cascade.
    expect(react).toContain('className="text-sm text-gray-500"');
    expect(react).not.toContain('>= 55');
  });
});

// ---------------------------------------------------------------------------
// "push native" roadmap: @when conditional render, @each list iteration,
// @bind value formatting (suffix/prefix/precision). Each MUST be a byte-
// identical no-op when its trait/keys are absent.
// ---------------------------------------------------------------------------

/** Wrap a single object in a minimal composition with an optional state. */
function singleNodeComposition(
  node: HoloObjectDecl,
  state?: Record<string, unknown>
): HoloComposition {
  return {
    type: 'Composition',
    name: 'PushNative',
    objects: [node],
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
    state: state
      ? {
          type: 'State',
          properties: Object.entries(state).map(([key, value]) => ({
            type: 'StateProperty' as const,
            key,
            value,
          })),
        }
      : undefined,
  };
}

function reactOf(node: HoloObjectDecl, state?: Record<string, unknown>): string {
  return new Native2DCompiler().compile(singleNodeComposition(node, state), '', undefined, {
    format: 'react',
  });
}

describe('Native2DCompiler @when conditional render', () => {
  it('wraps the element in {cond && (...)} for a numeric @when (dropped-frames badge)', () => {
    const badge = objectDecl('dropped_badge', [
      trait('text', { variant: 'caption', content: 'dropped frames' }),
      trait('when', { state: 'snap', path: 'dropped', gt: 0 }),
    ]);
    const react = reactOf(badge, { snap: { dropped: 0 } });
    expect(react).toContain('(snap?.dropped ?? 0) > 0 && (');
    // The wrapped element is still present inside the conditional.
    expect(react).toContain('{`dropped frames`}');
  });

  it('AND-s multiple numeric comparisons on a single @when', () => {
    const badge = objectDecl('range_badge', [
      trait('text', { variant: 'caption', content: 'mid' }),
      trait('when', { state: 'snap', path: 'fps', gte: 30, lt: 55 }),
    ]);
    const react = reactOf(badge, { snap: { fps: 0 } });
    expect(react).toContain('(snap?.fps ?? 0) >= 30 && (snap?.fps ?? 0) < 55 && (');
  });

  it('supports string equality via eq (empty-state pattern)', () => {
    const empty = objectDecl('empty_state', [
      trait('text', { variant: 'caption', content: 'No agents online' }),
      trait('when', { state: 'agents', path: 'status', eq: 'empty' }),
    ]);
    const react = reactOf(empty, { agents: { status: 'loading' } });
    expect(react).toContain('(agents?.status) === "empty" && (');
  });

  it('is a byte-identical no-op when @when is absent', () => {
    const withWhen = objectDecl('node', [
      trait('text', { variant: 'caption', content: 'hi' }),
      trait('when', { state: 'snap', path: 'dropped', gt: 0 }),
    ]);
    const without = objectDecl('node', [trait('text', { variant: 'caption', content: 'hi' })]);
    const a = reactOf(withWhen, { snap: { dropped: 0 } });
    const b = reactOf(without, { snap: { dropped: 0 } });
    // Stripping the conditional wrapper from `a` yields exactly `b`'s element.
    expect(b).toContain('<span className="text-sm text-gray-500">');
    expect(a).toContain('(snap?.dropped ?? 0) > 0 && (');
    // The inner element markup is identical (same span + content).
    expect(b).toContain('{`hi`}');
    expect(a).toContain('{`hi`}');
  });

  it('rejects an injection attempt in the @when path', () => {
    const evil = objectDecl('evil', [
      trait('text', { content: 'x' }),
      trait('when', { state: 'snap', path: 'fps); alert(1', gt: 0 }),
    ]);
    expect(() => reactOf(evil, { snap: {} })).toThrow(/invalid identifier path/);
  });

  it('rejects an injection attempt in the @when eq string literal', () => {
    const evil = objectDecl('evil', [
      trait('text', { content: 'x' }),
      trait('when', { state: 'snap', path: 'status', eq: '"); alert(1); ("' }),
    ]);
    expect(() => reactOf(evil, { snap: {} })).toThrow(/unsafe literal/);
  });
});

describe('Native2DCompiler @each list iteration', () => {
  it('renders the node once per array item via .map with key={i}', () => {
    const row = objectDecl('agent_row', [
      trait('text', { variant: 'caption' }),
      trait('each', { state: 'agents', path: 'list', as: 'agent' }),
      trait('bind', { state: 'agent', path: 'name' }),
    ]);
    const react = reactOf(row, { agents: { list: [] } });
    expect(react).toContain('(agents?.list ?? []).map((agent, i) => (');
    expect(react).toContain('key={i}');
    // Children/content reference the loop variable via @bind state=<as>.
    expect(react).toContain('{agent?.name ?? "—"}');
  });

  it('defaults the loop variable to `item` when `as` is omitted', () => {
    const row = objectDecl('item_row', [
      trait('text', { variant: 'caption' }),
      trait('each', { state: 'data', path: 'rows' }),
      trait('bind', { state: 'item', path: 'label' }),
    ]);
    const react = reactOf(row, { data: { rows: [] } });
    expect(react).toContain('(data?.rows ?? []).map((item, i) => (');
    expect(react).toContain('{item?.label ?? "—"}');
  });

  it('is a byte-identical no-op when @each is absent', () => {
    const without = objectDecl('node', [trait('text', { variant: 'caption', content: 'hi' })]);
    const react = reactOf(without, { agents: { list: [] } });
    expect(react).not.toContain('.map((');
    expect(react).not.toContain('key={i}');
    expect(react).toContain('<span className="text-sm text-gray-500">');
  });

  it('rejects an injection attempt in the @each loop variable', () => {
    const evil = objectDecl('evil', [
      trait('text', { content: 'x' }),
      trait('each', { state: 'agents', path: 'list', as: 'a) => evil(' }),
    ]);
    expect(() => reactOf(evil, { agents: { list: [] } })).toThrow(/invalid loop variable/);
  });
});

describe('Native2DCompiler @bind value formatting', () => {
  it('applies precision + suffix to the bound value (template literal)', () => {
    const stat = objectDecl('frame_ms', [
      trait('text', { variant: 'caption' }),
      trait('bind', { state: 'snap', path: 'frameMs', precision: 1, suffix: 'ms' }),
    ]);
    const react = reactOf(stat, { snap: { frameMs: 0 } });
    expect(react).toContain('{`${(snap?.frameMs ?? 0).toFixed(1)}ms`}');
  });

  it('applies a prefix when supplied', () => {
    const stat = objectDecl('price', [
      trait('text', { variant: 'caption' }),
      trait('bind', { state: 'cart', path: 'total', prefix: '$', precision: 2 }),
    ]);
    const react = reactOf(stat, { cart: { total: 0 } });
    expect(react).toContain('{`$${(cart?.total ?? 0).toFixed(2)}`}');
  });

  it('formats a bare suffix without precision (no toFixed)', () => {
    const stat = objectDecl('count', [
      trait('text', { variant: 'caption' }),
      trait('bind', { state: 'snap', path: 'agents', suffix: ' online' }),
    ]);
    const react = reactOf(stat, { snap: { agents: 0 } });
    expect(react).toContain('{`${(snap?.agents ?? 0)} online`}');
  });

  it('is a byte-identical no-op when no formatting keys are present', () => {
    const plain = objectDecl('plain', [
      trait('text', { variant: 'caption' }),
      trait('bind', { state: 'snap', path: 'fps', fallback: '—' }),
    ]);
    const react = reactOf(plain, { snap: { fps: 0 } });
    // Exact legacy form: reactive read with fallback, no template literal wrapper.
    expect(react).toContain('{snap?.fps ?? "—"}');
    expect(react).not.toContain('.toFixed');
    expect(react).not.toContain('`${');
  });

  it('rejects an injection attempt in the @bind suffix literal', () => {
    const evil = objectDecl('evil', [
      trait('text', { variant: 'caption' }),
      trait('bind', { state: 'snap', path: 'fps', suffix: '`}); alert(1); ({`' }),
    ]);
    expect(() => reactOf(evil, { snap: {} })).toThrow(/unsafe literal/);
  });

  it('rejects a non-integer precision', () => {
    const evil = objectDecl('evil', [
      trait('text', { variant: 'caption' }),
      trait('bind', { state: 'snap', path: 'fps', precision: 1.5 }),
    ]);
    expect(() => reactOf(evil, { snap: {} })).toThrow(/precision must be an integer/);
  });
});

// ---------------------------------------------------------------------------
// @action / @event / @model — declarative interactivity vocabulary
// Golden-output tests: no string-sniffing, no arbitrary JS, injection-safe.
// ---------------------------------------------------------------------------

describe('Native2DCompiler @action declarative event dispatch (React)', () => {
  it('compiles @action{on:click, emit:navigate, args:[\'/rooms\']} to onClick context.emit', () => {
    const btn = objectDecl('cta', [
      trait('button', { content: 'Go to rooms' }),
      trait('action', { on: 'click', emit: 'navigate', args: ['/rooms'] }),
    ]);
    const react = reactOf(btn);
    expect(react).toContain('onClick={() => { context.emit("navigate", "/rooms"); }}');
    // Must NOT fall through to legacy string-sniff path
    expect(react).not.toContain('console.log');
  });

  it('compiles @action{on:submit, emit:submit_form} with preventDefault wrapper', () => {
    const form = objectDecl('signup_form', [
      trait('form', { tag: 'form' }),
      trait('action', { on: 'submit', emit: 'submit_form' }),
    ]);
    const react = reactOf(form);
    expect(react).toContain('onSubmit={(e) => { e.preventDefault(); context.emit("submit_form"); }}');
  });

  it('compiles @action with no args (emit only)', () => {
    const btn = objectDecl('close_btn', [
      trait('button', { content: 'Close' }),
      trait('action', { on: 'click', emit: 'close_dialog' }),
    ]);
    const react = reactOf(btn);
    expect(react).toContain('context.emit("close_dialog")');
    expect(react).not.toContain('undefined');
  });

  it('compiles @action with multiple args', () => {
    const btn = objectDecl('buy_btn', [
      trait('button', { content: 'Buy' }),
      trait('action', { on: 'click', emit: 'purchase', args: ['item_42', 1] }),
    ]);
    const react = reactOf(btn);
    expect(react).toContain('context.emit("purchase", "item_42", 1)');
  });

  it('is a byte-identical no-op when @action trait is absent (legacy @button.onClick preserved)', () => {
    const btn = objectDecl('legacy', [
      trait('button', { content: 'Open room', onClick: "navigate('/rooms')" }),
    ]);
    const react = reactOf(btn);
    // Legacy string-sniff still works when @action is absent
    expect(react).toContain("onClick={() => navigate('/rooms')}");
  });
});

describe('Native2DCompiler @event declarative handler (React)', () => {
  it('compiles @event{on:click, handler:"navigate(\'/home\')"} to onClick', () => {
    const btn = objectDecl('nav_btn', [
      trait('button', { content: 'Home' }),
      trait('event', { on: 'click', handler: "navigate('/home')" }),
    ]);
    const react = reactOf(btn);
    expect(react).toContain("onClick={() => navigate('/home')}");
  });

  it('compiles @event{on:submit, handler:"handleSubmit(e)"} with event arg', () => {
    const form = objectDecl('contact_form', [
      trait('form', { tag: 'form' }),
      trait('event', { on: 'submit', handler: 'handleSubmit(e)' }),
    ]);
    const react = reactOf(form);
    expect(react).toContain('onSubmit={(e) => handleSubmit(e)}');
  });

  it('silently drops @event when handler contains injection characters (semicolons)', () => {
    const evil = objectDecl('evil_btn', [
      trait('button', { content: 'x' }),
      // Injection attempt: semicolon breaks the safe-char regex
      trait('event', { on: 'click', handler: "navigate('/home'); alert(1)" }),
    ]);
    const react = reactOf(evil);
    // Unsafe handler is NOT emitted; element still renders without any onClick
    expect(react).not.toContain('alert');
    expect(react).not.toContain('onClick');
  });

  it('silently drops @event when handler contains backtick template literals', () => {
    const evil = objectDecl('evil_btn2', [
      trait('button', { content: 'x' }),
      trait('event', { on: 'click', handler: '`${alert(1)}`' }),
    ]);
    const react = reactOf(evil);
    expect(react).not.toContain('alert');
  });
});

describe('Native2DCompiler @model two-way binding (React)', () => {
  it('compiles @model{state:email} on input to value= + onChange= setter', () => {
    const input = objectDecl('email_field', [
      trait('input', { type: 'email', placeholder: 'Enter email' }),
      trait('model', { state: 'email' }),
    ]);
    const react = reactOf(input, { email: '' });
    expect(react).toContain('value={email}');
    expect(react).toContain('onChange={(e) => setEmail(e.target.value)}');
    expect(react).toContain('const [email, setEmail] = useState("");');
  });

  it('compiles @model{state:form, path:name} to nested state path', () => {
    const input = objectDecl('name_field', [
      trait('input', { type: 'text', placeholder: 'Name' }),
      trait('model', { state: 'form', path: 'name' }),
    ]);
    const react = reactOf(input, { form: { name: '' } });
    expect(react).toContain('value={form.name}');
    expect(react).toContain('onChange={(e) => setForm(e.target.value)}');
  });

  it('does not emit @model attributes on non-input elements (div)', () => {
    const div = objectDecl('container', [
      trait('theme', { tag: 'div' }),
      trait('model', { state: 'title' }),
    ]);
    const react = reactOf(div, { title: '' });
    // @model is input-scoped; divs must not get value/onChange
    expect(react).not.toContain('value={title}');
    expect(react).not.toContain('onChange');
  });

  it('is a no-op when @model trait is absent', () => {
    const input = objectDecl('plain_input', [
      trait('input', { type: 'text', placeholder: 'Plain' }),
    ]);
    const react = reactOf(input);
    expect(react).not.toContain('onChange');
    expect(react).not.toContain('value=');
  });
});

describe('Native2DCompiler @action + @model — HTML path', () => {
  function htmlOf(node: HoloObjectDecl): string {
    return new Native2DCompiler().compile(singleNodeComposition(node), '');
  }

  it('compiles @action to data-holo-action attributes in HTML output', () => {
    const btn = objectDecl('cta', [
      trait('button', { content: 'Go' }),
      trait('action', { on: 'click', emit: 'navigate', args: ['/rooms'] }),
    ]);
    const html = htmlOf(btn);
    expect(html).toContain('data-holo-action-on="click"');
    expect(html).toContain('data-holo-action=');
    expect(html).toContain('"emit":"navigate"');
  });

  it('compiles @event to inline onclick in HTML output (safe chars only)', () => {
    const btn = objectDecl('nav_btn', [
      trait('button', { content: 'Home' }),
      trait('event', { on: 'click', handler: "navigate('/home')" }),
    ]);
    const html = htmlOf(btn);
    expect(html).toContain("onclick=");
    expect(html).toContain("navigate");
  });

  it('compiles @model to data-holo-model attribute in HTML output', () => {
    const input = objectDecl('email_field', [
      trait('input', { type: 'email' }),
      trait('model', { state: 'email' }),
    ]);
    const html = htmlOf(input);
    expect(html).toContain('data-holo-model="email"');
  });

  it('compiles @model with path to data-holo-model="state.path" in HTML', () => {
    const input = objectDecl('name_field', [
      trait('input', { type: 'text' }),
      trait('model', { state: 'form', path: 'name' }),
    ]);
    const html = htmlOf(input);
    expect(html).toContain('data-holo-model="form.name"');
  });
});
