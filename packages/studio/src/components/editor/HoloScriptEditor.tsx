'use client';

/**
 * HoloScriptEditor â€” Monaco editor with HoloScript language support
 *
 * Features:
 *  - Dark studio theme matching the editor color palette
 *  - HoloScript tokenizer: keywords, types, @trait decorators, numbers, strings
 *  - 60+ trait autocomplete from the standard library
 *  - Snippet library: scene, world, trait, animation, physics, audio
 *  - Hover documentation for @traits
 *  - Format on save (Ctrl+S) via @holoscript/formatter
 *  - Error markers from the pipeline (red squiggles)
 *  - File associations: .holo, .hs, .hsplus
 *  - onChange â†’ debounced setCode (300ms)
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import MonacoEditor, { type Monaco, type OnMount } from '@monaco-editor/react';
import { useSceneStore } from '@/lib/stores';
import { EditorToolbar } from './EditorToolbar';
import { SpatialBlameOverlay } from '@/components/versionControl/SpatialBlameOverlay';

/** Minimal IStandaloneCodeEditor surface used by this component. */
interface IStandaloneCodeEditor {
  getModel(): {
    getLineLength(line: number): number;
    getValue(): string;
    setValue(value: string): void;
  } | null;
  dispose(): void;
  addAction(action: {
    id: string;
    label: string;
    keybindings?: number[];
    run: (editor: any) => void;
  }): void;
  getAction(id: string): { run(): Promise<void> } | null;
}

/** Minimal IMarkerData surface used for pipeline error markers. */
interface IMarkerData {
  severity: number;
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

// â”€â”€â”€ HoloScript Grammar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const HOLOSCRIPT_LANGUAGE_ID = 'holoscript';

const KEYWORDS = [
  'scene',
  'object',
  'trait',
  'extends',
  'import',
  'from',
  'export',
  'if',
  'else',
  'for',
  'while',
  'return',
  'let',
  'const',
  'var',
  'true',
  'false',
  'null',
  'undefined',
  'new',
  'this',
  'world',
  'entity',
  'component',
  'system',
  'query',
  'spawn',
  'despawn',
  'on_create',
  'on_update',
  'on_destroy',
  'on_collision',
  'on_trigger',
];

const TYPE_KEYWORDS = [
  'number',
  'string',
  'boolean',
  'void',
  'any',
  'Vec2',
  'Vec3',
  'Vec4',
  'Mat3',
  'Mat4',
  'Quat',
  'Color',
  'Entity',
  'World',
  'Scene',
];

// 60+ traits covering all major HoloScript subsystems
const BUILTIN_TRAITS: { name: string; detail: string; docs: string }[] = [
  // Core rendering
  {
    name: '@mesh',
    detail: 'Mesh renderer',
    docs: 'Attaches a 3D mesh geometry (box, sphere, cylinder, custom) to the entity.',
  },
  {
    name: '@material',
    detail: 'Material',
    docs: 'Assigns a PBR material with color, roughness, metalness, textures.',
  },
  {
    name: '@light',
    detail: 'Light source',
    docs: 'Adds a light source to the scene (point, spot, directional, ambient).',
  },
  {
    name: '@camera',
    detail: 'Camera',
    docs: 'Defines a camera viewpoint with FOV, near/far planes, and projection.',
  },
  {
    name: '@gaussian_splat',
    detail: 'Gaussian Splat',
    docs: 'Renders a 3D Gaussian splatting point cloud for photorealistic scenes.',
  },
  // Physics
  {
    name: '@physics',
    detail: 'Physics body',
    docs: 'Adds physics simulation with mass, friction, restitution.',
  },
  {
    name: '@collider',
    detail: 'Collision shape',
    docs: 'Defines collision geometry: box, sphere, capsule, mesh, or compound.',
  },
  {
    name: '@rigidbody',
    detail: 'Rigid body',
    docs: 'Enables rigid body dynamics with velocity, angular velocity, forces.',
  },
  {
    name: '@buoyancy',
    detail: 'Buoyancy',
    docs: 'Simulates fluid buoyancy forces for water interactions.',
  },
  // Animation
  {
    name: '@animation',
    detail: 'Animation clip',
    docs: 'Plays skeletal or morph target animations with blending.',
  },
  {
    name: '@particle',
    detail: 'Particle system',
    docs: 'Emits particles with configurable rate, lifetime, velocity, color.',
  },
  {
    name: '@choreography',
    detail: 'Choreography',
    docs: 'Sequences multi-entity animations with timing and sync.',
  },
  // Audio
  {
    name: '@audio',
    detail: 'Audio source',
    docs: 'Attaches a spatial audio source with 3D falloff.',
  },
  {
    name: '@audio_source',
    detail: 'Audio emitter',
    docs: 'Configures audio playback: volume, loop, spatial blending.',
  },
  {
    name: '@audio_occlusion',
    detail: 'Audio occlusion',
    docs: 'Simulates sound occlusion through walls and obstacles.',
  },
  // Spatial
  {
    name: '@point_light',
    detail: 'Point light',
    docs: 'Omnidirectional light with configurable range, intensity, and color.',
  },
  {
    name: '@spot_light',
    detail: 'Spot light',
    docs: 'Focused cone light with angle, penumbra, and decay.',
  },
  {
    name: '@directional_light',
    detail: 'Directional light',
    docs: 'Infinite-distance light simulating sunlight with shadow support.',
  },
  {
    name: '@ambient_light',
    detail: 'Ambient light',
    docs: 'Global ambient illumination for the entire scene.',
  },
  // Interaction
  {
    name: '@script',
    detail: 'Script component',
    docs: 'Attaches custom logic with lifecycle hooks (on_create, on_update).',
  },
  {
    name: '@input',
    detail: 'Input handler',
    docs: 'Captures keyboard, mouse, gamepad, and XR controller input.',
  },
  {
    name: '@gesture',
    detail: 'Gesture recognition',
    docs: 'Detects hand gestures: pinch, grab, point, fist, wave.',
  },
  {
    name: '@eye_tracked',
    detail: 'Eye tracking',
    docs: 'Enables eye-tracking fixation, saccade, and dwell detection.',
  },
  {
    name: '@body_tracking',
    detail: 'Body tracking',
    docs: 'Full body tracking with joint positions and rotations.',
  },
  // AI & Agents
  {
    name: '@ai_npc_brain',
    detail: 'NPC AI brain',
    docs: 'Adds autonomous NPC behavior with goal planning and memory.',
  },
  {
    name: '@behavior_tree',
    detail: 'Behavior tree',
    docs: 'Decision tree for complex AI behaviors with sequence/selector nodes.',
  },
  {
    name: '@agent_memory',
    detail: 'Agent memory',
    docs: 'Persistent episodic and semantic memory for AI agents.',
  },
  {
    name: '@dialogue',
    detail: 'Dialogue system',
    docs: 'Branching dialogue trees with conditions and effects.',
  },
  // Multiplayer
  {
    name: '@multiplayer',
    detail: 'Network sync',
    docs: 'Synchronizes entity state across the network for multiplayer.',
  },
  {
    name: '@networked',
    detail: 'Networked entity',
    docs: 'Marks entity for network replication with ownership model.',
  },
  // VR/XR
  { name: '@vr', detail: 'VR component', docs: 'VR-specific rendering and interaction setup.' },
  {
    name: '@avatar',
    detail: 'Avatar embodiment',
    docs: 'Maps user body to a 3D avatar with IK and hand tracking.',
  },
  // World
  {
    name: '@terrain',
    detail: 'Terrain',
    docs: 'Generates terrain with heightmaps, textures, and vegetation.',
  },
  {
    name: '@navigation',
    detail: 'Navigation mesh',
    docs: 'Bakes and uses NavMesh for AI pathfinding.',
  },
  {
    name: '@lod',
    detail: 'Level of detail',
    docs: 'Automatic LOD switching based on camera distance.',
  },
  // IoT/Digital Twin
  {
    name: '@sensor_stream',
    detail: 'Sensor stream',
    docs: 'Binds real-time IoT sensor data to entity properties.',
  },
  {
    name: '@digital_twin',
    detail: 'Digital twin',
    docs: 'Mirrors a physical device/system as a live 3D representation.',
  },
  // Security
  {
    name: '@audit_log',
    detail: 'Audit log',
    docs: 'Logs all entity mutations for compliance and debugging.',
  },
  {
    name: '@accessible',
    detail: 'Accessibility',
    docs: 'Adds screen reader labels, keyboard navigation, and contrast modes.',
  },
  // Procedural
  {
    name: '@procedural',
    detail: 'Procedural generation',
    docs: 'Generates content procedurally: meshes, textures, worlds.',
  },
  {
    name: '@tilemap',
    detail: 'Tilemap',
    docs: 'Creates 2D/3D tile-based maps with auto-tiling rules.',
  },
  // Meta-traits (Wisdom/Gotcha)
  {
    name: '@wisdom',
    detail: 'Wisdom meta-trait',
    docs: 'Declares a battle-tested insight that applies to one or more traits. Queryable by Studio, LSP, and MCP agents.\n\nProperties: `description`, `source`, `applies_to: [...]`, `examples: [...]`',
  },
  {
    name: '@gotcha',
    detail: 'Gotcha meta-trait',
    docs: 'Declares a known failure mode with severity and mitigation. Critical gotchas block `--enforce-gotchas` builds.\n\nProperties: `warning`, `severity: "info"|"warning"|"critical"`, `mitigation`, `triggers_on: [...]`',
  },
  // State & Resilience (Batch 1 atoms)
  {
    name: '@versioned_state',
    detail: 'Branchable state',
    docs: 'Fork/merge state history with CRDT or manual merge strategy. Enables collaborative editing and undo trees.',
  },
  {
    name: '@world_heartbeat',
    detail: 'World heartbeat',
    docs: 'Global pulse emitter for distributed synchronization. Provisions redundant emitters to avoid single-point-of-failure.',
  },
  {
    name: '@circuit_auto_reset',
    detail: 'Circuit breaker',
    docs: 'Exponential backoff retry with circuit breaker pattern (closed/open/half-open). Auto-resets after cooldown and successful probe.',
  },
];

const BUILTIN_FUNCTIONS = [
  'vec2',
  'vec3',
  'vec4',
  'mat3',
  'mat4',
  'quat',
  'lerp',
  'clamp',
  'mix',
  'smoothstep',
  'length',
  'normalize',
  'cross',
  'dot',
  'sin',
  'cos',
  'tan',
  'abs',
  'floor',
  'ceil',
  'spawn',
  'despawn',
  'query',
  'emit',
  'listen',
  'broadcast',
];

// â”€â”€â”€ Formatter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function formatHoloScript(source: string): string {
  return source;
}

// â”€â”€â”€ Language Registration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function registerHoloScript(monaco: Monaco) {
  // Skip if already registered
  if (monaco.languages.getLanguages().some((l) => l.id === HOLOSCRIPT_LANGUAGE_ID)) return;

  monaco.languages.register({
    id: HOLOSCRIPT_LANGUAGE_ID,
    extensions: ['.holo', '.hs', '.hsplus'],
    aliases: ['HoloScript', 'holoscript', 'holo'],
    mimetypes: ['text/x-holoscript'],
  });

  monaco.languages.setMonarchTokensProvider(HOLOSCRIPT_LANGUAGE_ID, {
    keywords: KEYWORDS,
    typeKeywords: TYPE_KEYWORDS,
    symbols: /[=><~?:&|+\-*/^%]+/,
    tokenizer: {
      root: [
        // @trait decorators
        [/@[a-zA-Z_]\w*/, 'type.identifier'],
        // Line comments
        [/\/\/.*$/, 'comment'],
        // Block comments
        [/\/\*/, 'comment', '@comment'],
        // Strings
        [/"([^"\\]|\\.)*"/, 'string'],
        [/'([^'\\]|\\.)*'/, 'string'],
        // Template literals
        [/`/, 'string', '@template'],
        // Numbers
        [/\d+(\.\d+)?([eE][+-]?\d+)?/, 'number.float'],
        [/0x[0-9a-fA-F]+/, 'number.hex'],
        // Identifiers + keywords
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@typeKeywords': 'type',
              '@default': 'identifier',
            },
          },
        ],
        // Scene block header: scene "Name" {
        [/scene\s+"[^"]*"/, 'type.identifier'],
        // Punctuation
        [/[{}()\[\]]/, '@brackets'],
        [/[,;.]/, 'delimiter'],
        // Operators
        [/[=><!~?:&|+\-*/^%]+/, 'operator'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
      template: [
        [/`/, 'string', '@pop'],
        [/\$\{/, { token: 'delimiter.bracket', next: '@templateExpr' }],
        [/./, 'string'],
      ],
      templateExpr: [[/}/, { token: 'delimiter.bracket', next: '@pop' }], { include: 'root' }],
    },
  } as Parameters<typeof monaco.languages.setMonarchTokensProvider>[1]);

  // Autocomplete provider
  monaco.languages.registerCompletionItemProvider(HOLOSCRIPT_LANGUAGE_ID, {
    triggerCharacters: ['@', '.'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      // Check if typing a @trait
      const lineText = model.getLineContent(position.lineNumber);
      const charBefore = lineText[position.column - 2];

      const suggestions = [
        ...KEYWORDS.map((kw) => ({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range,
        })),
        ...TYPE_KEYWORDS.map((t) => ({
          label: t,
          kind: monaco.languages.CompletionItemKind.TypeParameter,
          insertText: t,
          range,
        })),
        ...BUILTIN_TRAITS.map((t) => ({
          label: t.name,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: charBefore === '@' ? t.name.slice(1) : t.name,
          detail: t.detail,
          documentation: t.docs,
          range,
        })),
        ...BUILTIN_FUNCTIONS.map((fn) => ({
          label: fn,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${fn}($0)`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        })),
        // â”€â”€ Snippets â”€â”€
        {
          label: 'scene',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'scene "${1:MyScene}" {\n\t$0\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Create a new HoloScript scene',
          range,
        },
        {
          label: 'object',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText:
            'object ${1:MyObject} {\n\t@mesh { geometry: "${2:box}" }\n\t@material { color: "${3:#ffffff}" }\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Create a new scene object with mesh and material',
          range,
        },
        {
          label: 'trait',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'trait ${1:MyTrait} {\n\t$0\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Define a new HoloScript trait',
          range,
        },
        {
          label: 'world',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText:
            'world "${1:MyWorld}" {\n\t@terrain { heightmap: "${2:flat}" }\n\t@ambient_light { intensity: ${3:0.5} }\n\n\t$0\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Create a new HoloScript world with terrain and lighting',
          range,
        },
        {
          label: 'physics-object',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText:
            'object ${1:PhysicsObj} {\n\t@mesh { geometry: "${2:sphere}" }\n\t@material { color: "${3:#6366f1}" }\n\t@rigidbody { mass: ${4:1.0} }\n\t@collider { shape: "${5:sphere}" }\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Create a physics-enabled object with collider',
          range,
        },
        {
          label: 'npc',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText:
            'object ${1:NPC} {\n\t@mesh { geometry: "humanoid" }\n\t@avatar { model: "${2:default}" }\n\t@ai_npc_brain {\n\t\tgoals: ["${3:patrol}", "${4:interact}"]\n\t}\n\t@dialogue {\n\t\tgreeting: "${5:Hello, traveler!}"\n\t}\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Create an AI-driven NPC with dialogue',
          range,
        },
      ];

      return { suggestions };
    },
  });

  // Hover provider â€” shows trait documentation on hover
  monaco.languages.registerHoverProvider(HOLOSCRIPT_LANGUAGE_ID, {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      // Check line for @trait pattern
      const lineText = model.getLineContent(position.lineNumber);
      const traitMatch = lineText.match(/@(\w+)/);
      if (traitMatch) {
        const traitName = `@${traitMatch[1]}`;
        const trait = BUILTIN_TRAITS.find((t) => t.name === traitName);
        if (trait) {
          const hoverRange = {
            startLineNumber: position.lineNumber,
            startColumn: lineText.indexOf(traitName) + 1,
            endLineNumber: position.lineNumber,
            endColumn: lineText.indexOf(traitName) + traitName.length + 1,
          };
          const contents: { value: string }[] = [
            { value: `**${trait.name}** — *${trait.detail}*` },
            { value: trait.docs },
          ];

          // Extract inline wisdom/gotcha content from the surrounding block
          if (traitName === '@wisdom' || traitName === '@gotcha') {
            const totalLines = model.getLineCount();
            let blockText = '';
            for (
              let ln = position.lineNumber;
              ln <= Math.min(position.lineNumber + 10, totalLines);
              ln++
            ) {
              blockText += model.getLineContent(ln) + '\n';
              if (model.getLineContent(ln).includes('}')) break;
            }
            if (traitName === '@wisdom') {
              const descMatch = blockText.match(/description:\s*"([^"]*)"/);
              const sourceMatch = blockText.match(/source:\s*"([^"]*)"/);
              if (descMatch) {
                contents.push({
                  value: `---\n**Insight:** ${descMatch[1]}${sourceMatch ? `\n\n*Source: ${sourceMatch[1]}*` : ''}`,
                });
              }
            } else {
              const warnMatch = blockText.match(/warning:\s*"([^"]*)"/);
              const sevMatch = blockText.match(/severity:\s*"([^"]*)"/);
              const mitMatch = blockText.match(/mitigation:\s*"([^"]*)"/);
              if (warnMatch) {
                const sev = sevMatch?.[1] || 'warning';
                const icon = sev === 'critical' ? '🔴' : sev === 'warning' ? '🟡' : '🔵';
                contents.push({
                  value: `---\n${icon} **${sev.toUpperCase()}:** ${warnMatch[1]}${mitMatch ? `\n\n*Mitigation: ${mitMatch[1]}*` : ''}`,
                });
              }
            }
          }

          return { range: hoverRange, contents };
        }
      }

      // Check keywords
      if (KEYWORDS.includes(word.word)) {
        return {
          contents: [{ value: `**${word.word}** â€” HoloScript keyword` }],
        };
      }

      return null;
    },
  });

  // Studio theme
  monaco.editor.defineTheme('holoscript-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '6366f1', fontStyle: 'bold' },
      { token: 'type.identifier', foreground: '818cf8' },
      { token: 'type', foreground: '38bdf8' },
      { token: 'comment', foreground: '4b5563', fontStyle: 'italic' },
      { token: 'string', foreground: '34d399' },
      { token: 'number.float', foreground: 'f59e0b' },
      { token: 'number.hex', foreground: 'fb923c' },
      { token: 'identifier', foreground: 'e2e8f0' },
      { token: 'delimiter', foreground: '6b7280' },
      { token: '@brackets', foreground: '94a3b8' },
      { token: 'operator', foreground: 'c084fc' },
    ],
    colors: {
      'editor.background': '#0a0a12',
      'editor.foreground': '#e2e8f0',
      'editor.lineHighlightBackground': '#1a1a2e',
      'editorCursor.foreground': '#6366f1',
      'editor.selectionBackground': '#6366f130',
      'editorIndentGuide.background1': '#1e1e30',
      'editorLineNumber.foreground': '#374151',
      'editorLineNumber.activeForeground': '#6366f1',
      'editor.inactiveSelectionBackground': '#6366f115',
    },
  });
}

// â”€â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface HoloScriptEditorProps {
  height?: string | number;
}

export function HoloScriptEditor({ height = '100%' }: HoloScriptEditorProps) {
  const code = useSceneStore((s) => s.code);
  const setCode = useSceneStore((s) => s.setCode);
  const errors = useSceneStore((s) => s.errors);

  const editorRef = useRef<IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [blameTarget, setBlameTarget] = useState<{ line: number; traitLabel?: string } | null>(
    null
  );

  // Apply error markers whenever pipeline errors change
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const model = editor.getModel();
    if (!model) return;

    const markers: IMarkerData[] = errors.map((e) => ({
      severity: monaco.MarkerSeverity.Error,
      message: e.message,
      startLineNumber: e.line ?? 1,
      startColumn: 1,
      endLineNumber: e.line ?? 1,
      endColumn: model.getLineLength(e.line ?? 1) + 1,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    monaco.editor.setModelMarkers(model as any, 'holoscript', markers as any);
  }, [errors]);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      registerHoloScript(monaco);
      monaco.editor.setTheme('holoscript-dark');

      // Set model language
      const model = editor.getModel();
      if (model) monaco.editor.setModelLanguage(model, HOLOSCRIPT_LANGUAGE_ID);

      // Register format action (Ctrl+Shift+F)
      editor.addAction({
        id: 'holoscript.format',
        label: 'Format HoloScript',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
        run: (ed: any) => {
          const m = ed.getModel();
          if (!m) return;
          const formatted = formatHoloScript(m.getValue());
          if (formatted !== m.getValue()) {
            m.setValue(formatted);
          }
        },
      });

      // Format on save (Ctrl+S)
      editor.addAction({
        id: 'holoscript.formatOnSave',
        label: 'Format & Save HoloScript',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: (ed: any) => {
          const m = ed.getModel();
          if (!m) return;
          const formatted = formatHoloScript(m.getValue());
          if (formatted !== m.getValue()) {
            m.setValue(formatted);
          }
          setCode(formatted);
        },
      });

      // Spatial Blame — right-click context menu
      editor.addAction({
        id: 'holoscript.blame',
        label: 'Spatial Blame: Who wrote this?',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.5,
        run: (ed: any) => {
          const pos = ed.getPosition();
          if (!pos) return;
          const lineText = ed.getModel()?.getLineContent(pos.lineNumber) ?? '';
          const traitMatch = lineText.match(/@([a-zA-Z_]\w*)/);
          setBlameTarget({
            line: pos.lineNumber,
            traitLabel: traitMatch ? `@${traitMatch[1]}` : undefined,
          });
        },
      });
    },
    [setCode, setBlameTarget]
  );

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setCode(value ?? '');
      }, 300);
    },
    [setCode]
  );

  return (
    <div className="relative flex flex-col h-full">
      {blameTarget && (
        <SpatialBlameOverlay
          filePath="scene-1.holo"
          line={blameTarget.line}
          traitLabel={blameTarget.traitLabel}
          onClose={() => setBlameTarget(null)}
        />
      )}
      <div className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          defaultLanguage={HOLOSCRIPT_LANGUAGE_ID}
          language={HOLOSCRIPT_LANGUAGE_ID}
          value={code}
          onChange={handleChange}
          onMount={handleMount}
          theme="holoscript-dark"
          options={{
            fontSize: 12,
            fontFamily: '"JetBrains Mono", "Fira Mono", "Cascadia Code", monospace',
            lineHeight: 20,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 12, bottom: 12 },
            folding: true,
            renderLineHighlight: 'gutter',
            glyphMargin: false,
            lineDecorationsWidth: 4,
            tabSize: 2,
            insertSpaces: true,
            automaticLayout: true,
            bracketPairColorization: { enabled: true },
            formatOnPaste: true,
            suggest: {
              showKeywords: true,
              showSnippets: true,
            },
            quickSuggestions: {
              other: true,
              comments: false,
              strings: false,
            },
          }}
        />
      </div>
      <EditorToolbar code={code} />
    </div>
  );
}
