/**
 * HoloScript Playground — Main Orchestrator
 *
 * Wires together:
 *  - Monaco editor (editor/monaco-setup.ts)
 *  - Three.js scene preview (preview/scene-builder.ts)
 *  - URL share encoding (sharing/url-encoder.ts)
 *  - Example scene dropdown
 *  - Debounced live-preview on keypress
 */

import {
  registerHoloScriptLanguage,
  registerThemes,
  createEditor,
  EXAMPLE_SCENES,
  type PlaygroundEditorOptions,
} from './editor/monaco-setup.js';
import { extractTraits } from '@holoscript/std';

import {
  SceneManager,
  nodeToOrb,
  type SceneNode,
  type ThreeScene,
} from './preview/scene-builder.js';

import {
  encodeState,
  decodeState,
  pushState,
  readState,
  type PlaygroundState,
} from './sharing/url-encoder.js';

export {
  registerHoloScriptLanguage,
  registerThemes,
  createEditor,
  EXAMPLE_SCENES,
  SceneManager,
  nodeToOrb,
  encodeState,
  decodeState,
  pushState,
  readState,
};

export type { PlaygroundEditorOptions, PlaygroundState, SceneNode, ThreeScene };

// ---------------------------------------------------------------------------
// Playground bootstrap (browser only)
// ---------------------------------------------------------------------------

interface PlaygroundConfig {
  /** Container element for Monaco editor */
  editorContainer: HTMLElement;
  /** Container element for the Three.js canvas */
  previewContainer: HTMLElement;
  /** Initial source code (overridden by URL hash if present) */
  initialSource?: string;
  /** Debounce delay in ms for live preview updates */
  debounceMs?: number;
  /** Monaco instance (loaded via CDN or bundled) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  monaco: any;
  /** ThreeScene adapter (caller constructs from their Three.js setup) */
  scene: ThreeScene;
  /** Called when the share URL is generated */
  onShareUrl?: (url: string) => void;
}

export async function initPlayground(config: PlaygroundConfig): Promise<{
  setSource(src: string): void;
  getSource(): string;
  shareUrl(): Promise<string>;
  loadExample(name: string): void;
}> {
  const { editorContainer, monaco, scene, debounceMs = 300, onShareUrl } = config;

  // Register language + themes
  registerHoloScriptLanguage(monaco);
  registerThemes(monaco);

  // Determine initial source: URL hash > config default > first example
  let initialSource = config.initialSource ?? EXAMPLE_SCENES[0].source;
  const stateFromUrl = await readState();
  if (stateFromUrl) {
    initialSource = stateFromUrl.source;
  }

  // Create editor
  const editor = createEditor(monaco, {
    container: editorContainer,
    initialValue: initialSource,
    theme: 'holoscript-dark',
  });

  // Create scene manager
  const sceneManager = new SceneManager(scene);

  // Initial render
  renderPreview(initialSource);

  // Debounced live preview
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  editor.onDidChangeModelContent(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderPreview(editor.getValue());
    }, debounceMs);
  });

  function renderPreview(source: string): void {
    try {
      // Minimal inline parser for preview (no dependency on @holoscript/core in playground)
      const nodes = parseForPreview(source);
      const orbs = nodes.map(nodeToOrb);
      sceneManager.applyUpdate(orbs);
    } catch {
      // Parse error — keep current scene
    }
  }

  return {
    setSource(src: string) {
      const model = editor.getModel();
      if (model) {
        model.setValue(src);
      }
    },
    getSource() {
      return editor.getValue();
    },
    async shareUrl() {
      const source = editor.getValue();
      const hash = await encodeState({ source });
      const url = window.location.origin + window.location.pathname + hash;
      if (onShareUrl) onShareUrl(url);
      await pushState({ source });
      return url;
    },
    loadExample(name: string) {
      const example = EXAMPLE_SCENES.find((e) => e.name === name);
      if (example) {
        const model = editor.getModel();
        if (model) model.setValue(example.source);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Minimal preview parser (no external deps)
// Extracts orb names/properties for live preview without the full parser
// ---------------------------------------------------------------------------

function parseForPreview(source: string): SceneNode[] {
  const nodes: SceneNode[] = [];
  // Match: orb "Name" { ... }
  const orbPattern = /\borb\s+"([^"]+)"\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = orbPattern.exec(source)) !== null) {
    const name = match[1];
    const body = match[2];
    const props = parseProperties(body);
    nodes.push({
      id: `orb-${name}`,
      type: 'orb',
      name,
      properties: props,
      traits: extractTraits(body).map(t => t.replace('@', '')),
    });
  }

  return nodes;
}

function parseProperties(body: string): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const lines = body.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('@') || trimmed.startsWith('//')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rawVal = trimmed.slice(colonIdx + 1).trim();

    // Parse value
    if (rawVal.startsWith('"') && rawVal.endsWith('"')) {
      props[key] = rawVal.slice(1, -1);
    } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      try {
        props[key] = JSON.parse(rawVal);
      } catch {
        /* skip */
      }
    } else if (rawVal === 'true') {
      props[key] = true;
    } else if (rawVal === 'false') {
      props[key] = false;
    } else {
      const num = parseFloat(rawVal);
      if (!isNaN(num)) props[key] = num;
    }
  }

  return props;
}

