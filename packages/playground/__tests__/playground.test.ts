/**
 * Playground Acceptance Tests — Sprint 2
 *
 * Tests for:
 * 1. Monaco editor setup (language registration, theme, editor creation)
 * 2. Scene builder (hot-reload diffing, SceneManager)
 * 3. URL share encoder/decoder (encode → decode round-trip)
 * 4. 5 example scenes are defined
 * 5. Minimal inline parser (parseForPreview logic via index)
 * 6. Mobile-responsive layout marker (index.html viewport meta)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Monaco is a browser library; mock it for node tests
const mockEditor = {
  getValue: vi.fn(() => 'orb "Test" { color: "blue" }'),
  getModel: vi.fn(() => ({ setValue: vi.fn() })),
  onDidChangeModelContent: vi.fn(),
};

const mockMonaco = {
  languages: {
    getLanguages: vi.fn(() => []),
    register: vi.fn(),
    setMonarchTokensProvider: vi.fn(),
    setLanguageConfiguration: vi.fn(),
  },
  editor: {
    defineTheme: vi.fn(),
    create: vi.fn(() => mockEditor),
  },
};

// ---------------------------------------------------------------------------
// Scene Builder
// ---------------------------------------------------------------------------

import {
  diffOrbs,
  nodeToOrb,
  SceneManager,
  type SceneOrb,
  type SceneNode,
  type ThreeScene,
} from '../src/preview/scene-builder.js';

describe('Scene Builder - diffOrbs', () => {
  const baseOrb: SceneOrb = {
    id: 'orb-A',
    name: 'A',
    color: '#ff0000',
    scale: [1, 1, 1],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    opacity: 1,
    castShadow: true,
  };

  test('empty prev → all orbs are added', () => {
    const result = diffOrbs([], [baseOrb]);
    expect(result.added).toHaveLength(1);
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
  });

  test('identical prev/next → nothing changed', () => {
    const result = diffOrbs([baseOrb], [baseOrb]);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
  });

  test('removed orb detected', () => {
    const result = diffOrbs([baseOrb], []);
    expect(result.removed).toContain('orb-A');
    expect(result.added).toHaveLength(0);
  });

  test('modified orb detected as changed', () => {
    const modified: SceneOrb = { ...baseOrb, color: '#00ff00' };
    const result = diffOrbs([baseOrb], [modified]);
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].color).toBe('#00ff00');
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  test('add + remove in same update', () => {
    const orbB: SceneOrb = { ...baseOrb, id: 'orb-B', name: 'B' };
    const result = diffOrbs([baseOrb], [orbB]);
    expect(result.added).toHaveLength(1);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]).toBe('orb-A');
  });
});

describe('Scene Builder - nodeToOrb', () => {
  test('converts orb node to SceneOrb with defaults', () => {
    const node: SceneNode = {
      id: 'orb-X',
      type: 'orb',
      name: 'X',
      properties: {},
      traits: [],
    };
    const orb = nodeToOrb(node);
    expect(orb.id).toBe('orb-X');
    expect(orb.color).toBe('#ffffff');
    expect(orb.scale).toEqual([1, 1, 1]);
    expect(orb.position).toEqual([0, 0, 0]);
    expect(orb.opacity).toBe(1);
    expect(orb.castShadow).toBe(true);
  });

  test('converts node with explicit properties', () => {
    const node: SceneNode = {
      id: 'orb-Y',
      type: 'orb',
      name: 'Y',
      properties: {
        color: 'red',
        scale: [2, 2, 2],
        position: [1, 0, -3],
        opacity: 0.8,
        castShadow: false,
      },
      traits: [],
    };
    const orb = nodeToOrb(node);
    expect(orb.color).toBe('red');
    expect(orb.scale).toEqual([2, 2, 2]);
    expect(orb.position).toEqual([1, 0, -3]);
    expect(orb.opacity).toBe(0.8);
    expect(orb.castShadow).toBe(false);
  });

  test('scalar scale is expanded to vec3', () => {
    const node: SceneNode = {
      id: 'orb-Z',
      type: 'orb',
      name: 'Z',
      properties: { scale: 3 },
      traits: [],
    };
    const orb = nodeToOrb(node);
    expect(orb.scale).toEqual([3, 3, 3]);
  });
});

describe('Scene Builder - SceneManager', () => {
  let addCalls: SceneOrb[] = [];
  let updateCalls: SceneOrb[] = [];
  let removeCalls: string[] = [];
  let renderCalls = 0;

  const mockScene: ThreeScene = {
    addBox: (orb) => addCalls.push(orb),
    updateBox: (orb) => updateCalls.push(orb),
    removeBox: (id) => removeCalls.push(id),
    render: () => renderCalls++,
  };

  beforeEach(() => {
    addCalls = [];
    updateCalls = [];
    removeCalls = [];
    renderCalls = 0;
  });

  const makeOrb = (id: string, color = '#fff'): SceneOrb => ({
    id,
    name: id,
    color,
    scale: [1, 1, 1],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    opacity: 1,
    castShadow: true,
  });

  test('applyUpdate adds new orbs', () => {
    const mgr = new SceneManager(mockScene);
    mgr.applyUpdate([makeOrb('A'), makeOrb('B')]);
    expect(addCalls).toHaveLength(2);
    expect(mgr.orbCount).toBe(2);
    expect(renderCalls).toBe(1);
  });

  test('applyUpdate removes orbs no longer present', () => {
    const mgr = new SceneManager(mockScene);
    mgr.applyUpdate([makeOrb('A'), makeOrb('B')]);
    mgr.applyUpdate([makeOrb('A')]); // B removed
    expect(removeCalls).toContain('B');
    expect(mgr.orbCount).toBe(1);
  });

  test('applyUpdate calls updateBox for changed orbs', () => {
    const mgr = new SceneManager(mockScene);
    mgr.applyUpdate([makeOrb('A', '#red')]);
    mgr.applyUpdate([makeOrb('A', '#blue')]);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].color).toBe('#blue');
  });

  test('identical update does not call add/update/remove', () => {
    const mgr = new SceneManager(mockScene);
    const orb = makeOrb('A');
    mgr.applyUpdate([orb]);
    addCalls = [];
    mgr.applyUpdate([orb]);
    expect(addCalls).toHaveLength(0);
    expect(updateCalls).toHaveLength(0);
    expect(removeCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// URL Encoder
// ---------------------------------------------------------------------------

import {
  encodeState,
  decodeState,
  type PlaygroundState,
} from '../src/sharing/url-encoder.js';

describe('URL Encoder - encodeState / decodeState', () => {
  // Override TextEncoder/Decoder/btoa/atob for node (available in Node 18+)

  test('encode → decode round-trip preserves source', async () => {
    const state: PlaygroundState = {
      source: 'orb "Hello" { color: "cyan" }',
      example: 'Hello Orb',
    };
    const hash = await encodeState(state);
    expect(hash).toMatch(/^#v[01]\//);

    const decoded = await decodeState(hash);
    expect(decoded).not.toBeNull();
    expect(decoded!.source).toBe(state.source);
    expect(decoded!.example).toBe('Hello Orb');
  });

  test('decode returns null for malformed hash', async () => {
    expect(await decodeState('#garbage')).toBeNull();
    expect(await decodeState('')).toBeNull();
    expect(await decodeState('#v0/')).toBeNull();
  });

  test('decode returns null for unknown version', async () => {
    const result = await decodeState('#v99/abc');
    expect(result).toBeNull();
  });

  test('encode works with multiline source', async () => {
    const source = Array.from({ length: 20 }, (_, i) =>
      `orb "Orb${i}" {\n  color: "red"\n  position: [${i}, 0, -2]\n}`
    ).join('\n\n');

    const hash = await encodeState({ source });
    const decoded = await decodeState(hash);
    expect(decoded!.source).toBe(source);
  });

  test('hash without # prefix is handled in decodeState', async () => {
    const state: PlaygroundState = { source: 'orb "Test" {}' };
    const hash = await encodeState(state);
    const noHash = hash.slice(1); // remove leading #
    const decoded = await decodeState(noHash);
    expect(decoded!.source).toBe('orb "Test" {}');
  });
});

// ---------------------------------------------------------------------------
// Monaco Setup
// ---------------------------------------------------------------------------

import {
  registerHoloScriptLanguage,
  registerThemes,
  EXAMPLE_SCENES,
} from '../src/editor/monaco-setup.js';

describe('Monaco Setup - language registration', () => {
  test('registers holoscript language with monaco', () => {
    registerHoloScriptLanguage(mockMonaco);
    expect(mockMonaco.languages.register).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'holoscript' })
    );
    expect(mockMonaco.languages.setMonarchTokensProvider).toHaveBeenCalled();
  });

  test('does not re-register if already present', () => {
    const monacoWithLang = {
      ...mockMonaco,
      languages: {
        ...mockMonaco.languages,
        getLanguages: vi.fn(() => [{ id: 'holoscript' }]),
        register: vi.fn(),
        setMonarchTokensProvider: vi.fn(),
        setLanguageConfiguration: vi.fn(),
      },
    };
    registerHoloScriptLanguage(monacoWithLang);
    expect(monacoWithLang.languages.register).not.toHaveBeenCalled();
  });

  test('registers dark and light themes', () => {
    registerThemes(mockMonaco);
    expect(mockMonaco.editor.defineTheme).toHaveBeenCalledWith(
      'holoscript-dark',
      expect.any(Object)
    );
    expect(mockMonaco.editor.defineTheme).toHaveBeenCalledWith(
      'holoscript-light',
      expect.any(Object)
    );
  });
});

describe('Monaco Setup - example scenes', () => {
  test('has exactly 5 example scenes', () => {
    expect(EXAMPLE_SCENES).toHaveLength(5);
  });

  test('each example has name, description, and source', () => {
    for (const ex of EXAMPLE_SCENES) {
      expect(typeof ex.name).toBe('string');
      expect(typeof ex.description).toBe('string');
      expect(typeof ex.source).toBe('string');
      expect(ex.source.length).toBeGreaterThan(0);
    }
  });

  test('example names match expected scenes', () => {
    const names = EXAMPLE_SCENES.map((e) => e.name);
    expect(names).toContain('Hello Orb');
    expect(names).toContain('Physics Sandbox');
    expect(names).toContain('Multiplayer');
    expect(names).toContain('Gallery');
    expect(names).toContain('Accessible UI');
  });
});

// ---------------------------------------------------------------------------
// HTML playground mobile-responsive layout
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { join } from 'path';

describe('Playground HTML', () => {
  const html = readFileSync(
    join(import.meta.dirname ?? __dirname, '../public/index.html'),
    'utf-8'
  );

  test('has viewport meta tag for mobile responsiveness', () => {
    expect(html).toContain('name="viewport"');
    expect(html).toContain('width=device-width');
  });

  test('has all 5 example options in dropdown', () => {
    expect(html).toContain('Hello Orb');
    expect(html).toContain('Physics Sandbox');
    expect(html).toContain('Multiplayer');
    expect(html).toContain('Gallery');
    expect(html).toContain('Accessible UI');
  });

  test('has share button', () => {
    expect(html).toContain('btn-share');
    expect(html).toContain('Share');
  });

  test('has mobile-responsive CSS media query', () => {
    expect(html).toContain('@media');
    expect(html).toContain('max-width');
  });

  test('has Monaco CDN loader', () => {
    expect(html).toContain('monaco-editor');
  });
});
