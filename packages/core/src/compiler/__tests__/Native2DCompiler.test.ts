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
