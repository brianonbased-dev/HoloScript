'use client';

export type StudioViewCategory =
  | 'authoring'
  | 'assistant'
  | 'assets'
  | 'collaboration'
  | 'debug'
  | 'governance'
  | 'integration'
  | 'learning'
  | 'publishing'
  | 'simulation'
  | 'workspace';

export type StudioViewPlacement =
  | 'bottom-panel'
  | 'floating-overlay'
  | 'left-panel'
  | 'modal'
  | 'right-rail'
  | 'top-overlay';

export type StudioWorkspaceScope = 'global' | 'workspace' | 'project' | 'scene';

const VIEW_TITLES = {
  palette: 'Command Palette',
  chat: 'Brittney Chat',
  history: 'History',
  profiler: 'Profiler',
  shaderEditor: 'Shader Editor',
  timeline: 'Timeline',
  templatePicker: 'Template Picker',
  aiMaterial: 'AI Materials',
  share: 'Share',
  critique: 'Critique',
  assetPack: 'Asset Pack',
  versions: 'Versions',
  repl: 'REPL',
  registry: 'Pack Registry',
  remote: 'Mobile Remote',
  export: 'Export',
  generator: 'AI Generator',
  multiplayer: 'Multiplayer',
  debugger: 'Debugger',
  snapshots: 'Snapshots',
  assetLib: 'Asset Library',
  templateGallery: 'Template Gallery',
  minimap: 'Minimap',
  audio: 'Audio Traits',
  exportV2: 'Export Pipeline',
  nodeGraph: 'Node Graph',
  keyframes: 'Keyframes',
  sceneSearch: 'Scene Search',
  particles: 'Particles',
  lod: 'LOD',
  console: 'Console',
  undoHistory: 'Undo History',
  outliner: 'Outliner',
  material: 'Material Editor',
  physics: 'Physics',
  simulation: 'Simulation',
  snapshotDiff: 'Snapshot Diff',
  audioVisualizer: 'Audio Visualizer',
  multiTransform: 'Multi-Transform',
  environment: 'Environment',
  inspector: 'Inspector',
  hotkey: 'Hotkey Map',
  plugins: 'Plugin Marketplace',
  sandboxedPlugins: 'Sandboxed Plugins',
  splatWizard: 'Splat Wizard',
  agentMonitor: 'Agent Monitor',
  texturePaint: 'Texture Paint',
  mcpConfig: 'MCP Servers',
  agentWorkflow: 'Agent Workflow',
  behaviorTree: 'Behavior Tree',
  agentEnsemble: 'Agent Ensemble',
  eventMonitor: 'Event Monitor',
  toolCallGraph: 'Tool Call Graph',
  marketplace: 'Marketplace',
  pluginManager: 'Plugin Manager',
  cloudDeploy: 'Cloud Deploy',
  publish: 'Publish',
  examples: 'Examples',
  tutorial: 'Tutorial',
  hotkeyOverlay: 'Hotkey Overlay',
  prompts: 'Prompts',
  blame: 'Spatial Blame',
  dag: 'DAG',
  calibration: 'Calibration',
  dragonPreview: 'Dragon Preview',
  holoDiff: 'HoloDiff',
  sliderInspector: 'Slider Inspector',
  traitMatrix: 'Trait Matrix',
  assetImport: 'Asset Import',
  cinematicCamera: 'Cinematic Camera',
  syntheticData: 'Synthetic Data',
  compilationPipeline: 'Compilation Pipeline',
  confidenceXR: 'Confidence XR',
  operationsHub: 'Operations Hub',
  foundationDao: 'Foundation DAO',
  runtimeTier: 'Runtime Tier',
} as const;

export type StudioViewId = keyof typeof VIEW_TITLES;
export type StudioViewCommandId = `studio.view.${StudioViewId}.toggle`;

export interface StudioViewDefinition {
  id: StudioViewId;
  title: string;
  category: StudioViewCategory;
  defaultPlacement: StudioViewPlacement;
  activationCommand: StudioViewCommandId;
  workspaceScope: StudioWorkspaceScope;
  defaultOpen: boolean;
  exclusiveWith: StudioViewId[];
}

export const STUDIO_VIEW_IDS = Object.keys(VIEW_TITLES) as StudioViewId[];
export const DEFAULT_OPEN_STUDIO_VIEW_IDS = ['chat', 'minimap'] as const satisfies StudioViewId[];
const DEFAULT_OPEN_VIEW_SET = new Set<StudioViewId>(DEFAULT_OPEN_STUDIO_VIEW_IDS);

const CATEGORY_BY_VIEW = {
  chat: 'assistant',
  aiMaterial: 'assistant',
  critique: 'assistant',
  generator: 'assistant',
  agentMonitor: 'assistant',
  assetPack: 'assets',
  assetLib: 'assets',
  assetImport: 'assets',
  splatWizard: 'assets',
  templatePicker: 'assets',
  templateGallery: 'assets',
  multiplayer: 'collaboration',
  share: 'collaboration',
  debugger: 'debug',
  profiler: 'debug',
  console: 'debug',
  snapshots: 'debug',
  snapshotDiff: 'debug',
  eventMonitor: 'debug',
  toolCallGraph: 'debug',
  blame: 'debug',
  dag: 'debug',
  foundationDao: 'governance',
  mcpConfig: 'integration',
  plugins: 'integration',
  sandboxedPlugins: 'integration',
  pluginManager: 'integration',
  cloudDeploy: 'integration',
  marketplace: 'integration',
  tutorial: 'learning',
  examples: 'learning',
  prompts: 'learning',
  publish: 'publishing',
  export: 'publishing',
  exportV2: 'publishing',
  physics: 'simulation',
  simulation: 'simulation',
  particles: 'simulation',
  runtimeTier: 'simulation',
} satisfies Partial<Record<StudioViewId, StudioViewCategory>>;

const PLACEMENT_BY_VIEW = {
  palette: 'modal',
  templatePicker: 'modal',
  hotkey: 'modal',
  hotkeyOverlay: 'modal',
  splatWizard: 'modal',
  publish: 'modal',
  examples: 'modal',
  tutorial: 'modal',
  prompts: 'modal',
  assetImport: 'modal',
  shaderEditor: 'bottom-panel',
  timeline: 'bottom-panel',
  history: 'bottom-panel',
  minimap: 'floating-overlay',
  mcpConfig: 'top-overlay',
  agentWorkflow: 'top-overlay',
  behaviorTree: 'top-overlay',
  agentEnsemble: 'top-overlay',
  eventMonitor: 'top-overlay',
  toolCallGraph: 'top-overlay',
  marketplace: 'top-overlay',
  pluginManager: 'top-overlay',
  cloudDeploy: 'top-overlay',
} satisfies Partial<Record<StudioViewId, StudioViewPlacement>>;

const GLOBAL_VIEWS = new Set<StudioViewId>([
  'palette',
  'hotkey',
  'hotkeyOverlay',
  'mcpConfig',
  'agentWorkflow',
  'behaviorTree',
  'agentEnsemble',
  'eventMonitor',
  'toolCallGraph',
  'marketplace',
  'pluginManager',
  'cloudDeploy',
  'examples',
  'tutorial',
  'prompts',
]);

const WORKSPACE_VIEWS = new Set<StudioViewId>([
  'chat',
  'agentMonitor',
  'plugins',
  'sandboxedPlugins',
  'publish',
  'assetImport',
  'operationsHub',
]);

const EXCLUSIVE_WITH = {
  timeline: ['shaderEditor'],
  shaderEditor: ['timeline'],
  aiMaterial: ['share'],
  share: ['aiMaterial'],
  critique: ['assetPack'],
  assetPack: ['critique'],
  versions: ['repl'],
  repl: ['versions'],
  registry: ['remote'],
  remote: ['registry'],
  export: ['generator', 'profiler'],
  generator: ['export', 'profiler'],
  profiler: ['export', 'generator'],
  multiplayer: ['debugger', 'snapshots', 'assetLib'],
  debugger: ['multiplayer', 'snapshots', 'assetLib'],
  snapshots: ['multiplayer', 'debugger', 'assetLib'],
  assetLib: ['multiplayer', 'debugger', 'snapshots'],
  templateGallery: ['audio', 'exportV2'],
  audio: ['templateGallery', 'exportV2'],
  exportV2: ['templateGallery', 'audio'],
  nodeGraph: ['keyframes'],
  keyframes: ['nodeGraph'],
} satisfies Partial<Record<StudioViewId, StudioViewId[]>>;

function viewScope(id: StudioViewId): StudioWorkspaceScope {
  if (GLOBAL_VIEWS.has(id)) return 'global';
  if (WORKSPACE_VIEWS.has(id)) return 'workspace';
  return 'project';
}

export const STUDIO_VIEW_REGISTRY: StudioViewDefinition[] = STUDIO_VIEW_IDS.map((id) => ({
  id,
  title: VIEW_TITLES[id],
  category: CATEGORY_BY_VIEW[id] ?? 'authoring',
  defaultPlacement: PLACEMENT_BY_VIEW[id] ?? 'right-rail',
  activationCommand: `studio.view.${id}.toggle`,
  workspaceScope: viewScope(id),
  defaultOpen: DEFAULT_OPEN_VIEW_SET.has(id),
  exclusiveWith: EXCLUSIVE_WITH[id] ?? [],
}));

export const STUDIO_VIEW_REGISTRY_BY_ID = Object.fromEntries(
  STUDIO_VIEW_REGISTRY.map((view) => [view.id, view])
) as Record<StudioViewId, StudioViewDefinition>;

export function getStudioView(id: StudioViewId): StudioViewDefinition {
  return STUDIO_VIEW_REGISTRY_BY_ID[id];
}
