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
