/**
 * Marketplace types for community content
 */

/**
 * All supported content types in HoloScript marketplace
 */
export type ContentType =
  // AI Orchestration
  | 'workflow'           // Agent workflows
  | 'behavior_tree'      // Behavior trees
  // AI Skills & Configs
  | 'skill'              // Claude/Gemini AI skills (.md + config)
  | 'agent_config'       // Agent identity configs & RBAC policies
  | 'mcp_bundle'         // MCP tool bundles
  | 'rbac_policy'        // RBAC role & permission configs
  // Training Data
  | 'training_data'      // Curated AI training datasets (via DataForge)
  // 3D Content
  | 'scene'              // Complete 3D scenes (.hsplus)
  | 'composition'        // Compositions (.holo)
  | 'character'          // VRM characters
  | 'model'              // 3D models (GLTF/GLB)
  | 'template'           // Project templates & starters
  // Visual Programming
  | 'shader_graph'       // Shader node graphs
  | 'material'           // Materials/shaders
  | 'node_graph'         // Generic node graphs
  // Animation & Physics
  | 'animation'          // Animation sequences
  | 'physics_preset'     // Physics configurations
  | 'particle_effect'    // Particle systems & VFX
  // Audio
  | 'audio'              // Sound effects
  | 'music'              // Music tracks
  // VR/AR
  | 'vr_environment'     // Complete VR experiences
  | 'ar_marker'          // AR markers/targets
  // Utilities
  | 'plugin'             // Studio plugins
  | 'script'             // Custom scripts
  | 'preset';            // General presets

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
  type: ContentType;
  tags: string[];
  category: string;
  rating: number;
  downloadCount: number;
  viewCount: number;
  createdAt: number;
  updatedAt: number;
  thumbnailUrl?: string;
  previewUrl?: string;
  featured?: boolean;
  verified?: boolean; // Verified by HoloScript team
  license?: 'MIT' | 'CC0' | 'CC-BY' | 'CC-BY-SA' | 'Commercial';
  fileSize?: number; // bytes
  version?: string;
  compatibility?: string; // "HoloScript 3.42.0+"
}

export interface MarketplaceCategory {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  icon?: string; // Icon name (lucide-react)
  parentId?: string; // For nested categories
}

/**
 * Predefined categories matching HoloScript Studio features
 */
export const MARKETPLACE_CATEGORIES = {
  // AI Orchestration
  AI_WORKFLOWS: 'ai-workflows',
  BEHAVIOR_TREES: 'behavior-trees',
  // AI Skills & Configs
  AI_SKILLS: 'ai-skills',
  AGENT_CONFIGS: 'agent-configs',
  MCP_BUNDLES: 'mcp-bundles',
  // Training Data
  TRAINING_DATA: 'training-data',
  // 3D Content
  SCENES: 'scenes',
  CHARACTERS: 'characters',
  MODELS: 'models',
  MATERIALS: 'materials',
  TEMPLATES: 'templates',
  // Animation & Physics
  ANIMATIONS: 'animations',
  PHYSICS: 'physics',
  VFX: 'vfx',
  // Audio
  AUDIO: 'audio',
  MUSIC: 'music',
  // VR/AR
  VR_ENVIRONMENTS: 'vr-environments',
  AR_EXPERIENCES: 'ar-experiences',
  // Development
  PLUGINS: 'plugins',
  SCRIPTS: 'scripts',
  PRESETS: 'presets',
} as const;

export interface MarketplaceFilter {
  category?: string;
  tags?: string[];
  type?: ContentType | ContentType[];
  minRating?: number;
  search?: string;
  sortBy?: 'popular' | 'recent' | 'rating' | 'downloads' | 'views';
  license?: string;
  verified?: boolean; // Only verified content
  page?: number;
  limit?: number;
}

export interface MarketplaceResponse<T> {
  data: T;
  total: number;
  page: number;
  limit: number;
}

export interface ContentUpload {
  name: string;
  description: string;
  type: ContentType;
  tags: string[];
  category: string;
  content: string | File; // JSON string or binary file
  thumbnail?: File;
  license?: 'MIT' | 'CC0' | 'CC-BY' | 'CC-BY-SA' | 'Commercial';
  version?: string;
  remixOf?: string; // ID of original content if this is a remix
}

export interface ContentReview {
  id: string;
  contentId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: number;
  helpful?: number; // Upvotes
}

/**
 * Content type metadata (for UI display)
 */
export interface ContentTypeMetadata {
  type: ContentType;
  label: string;
  description: string;
  icon: string; // lucide-react icon name
  fileExtension?: string;
  category: string;
}

/**
 * Metadata for each content type
 */
export const CONTENT_TYPE_METADATA: Record<ContentType, ContentTypeMetadata> = {
  // AI Orchestration
  workflow: {
    type: 'workflow',
    label: 'Agent Workflow',
    description: 'Multi-agent orchestration workflows',
    icon: 'Workflow',
    fileExtension: '.json',
    category: MARKETPLACE_CATEGORIES.AI_WORKFLOWS,
  },
  behavior_tree: {
    type: 'behavior_tree',
    label: 'Behavior Tree',
    description: 'AI behavior tree logic',
    icon: 'GitBranch',
    fileExtension: '.json',
    category: MARKETPLACE_CATEGORIES.BEHAVIOR_TREES,
  },
  // AI Skills & Configs
  skill: {
    type: 'skill',
    label: 'AI Skill',
    description: 'Claude/Gemini agent skills and workflows',
    icon: 'Brain',
    fileExtension: '.md',
    category: MARKETPLACE_CATEGORIES.AI_SKILLS,
  },
  agent_config: {
    type: 'agent_config',
    label: 'Agent Config',
    description: 'Agent identity, RBAC, and orchestration configs',
    icon: 'Bot',
    fileExtension: '.json',
    category: MARKETPLACE_CATEGORIES.AGENT_CONFIGS,
  },
  mcp_bundle: {
    type: 'mcp_bundle',
    label: 'MCP Bundle',
    description: 'Curated MCP tool bundles for specific domains',
    icon: 'Globe',
    fileExtension: '.json',
    category: MARKETPLACE_CATEGORIES.MCP_BUNDLES,
  },
  rbac_policy: {
    type: 'rbac_policy',
    label: 'RBAC Policy',
    description: 'Role-based access control configurations',
    icon: 'Shield',
    fileExtension: '.json',
    category: MARKETPLACE_CATEGORIES.AGENT_CONFIGS,
  },
  // Training Data
  training_data: {
    type: 'training_data',
    label: 'Training Data',
    description: 'Curated AI training datasets via DataForge/TrainingMonkey',
    icon: 'Database',
    fileExtension: '.jsonl',
    category: MARKETPLACE_CATEGORIES.TRAINING_DATA,
  },
  // 3D Content
  scene: {
    type: 'scene',
    label: '3D Scene',
    description: 'Complete 3D scenes with objects and lighting',
    icon: 'Box',
    fileExtension: '.hsplus',
    category: MARKETPLACE_CATEGORIES.SCENES,
  },
  composition: {
    type: 'composition',
    label: 'Composition',
    description: 'Multi-scene compositions',
    icon: 'Layers',
    fileExtension: '.holo',
    category: MARKETPLACE_CATEGORIES.SCENES,
  },
  character: {
    type: 'character',
    label: 'Character',
    description: 'VRM characters and avatars',
    icon: 'User',
    fileExtension: '.vrm',
    category: MARKETPLACE_CATEGORIES.CHARACTERS,
  },
  model: {
    type: 'model',
    label: '3D Model',
    description: 'GLTF/GLB 3D models',
    icon: 'Package',
    fileExtension: '.glb',
    category: MARKETPLACE_CATEGORIES.MODELS,
  },
  template: {
    type: 'template',
    label: 'Template',
    description: 'Project starters and boilerplate templates',
    icon: 'LayoutTemplate',
    fileExtension: '.zip',
    category: MARKETPLACE_CATEGORIES.TEMPLATES,
  },
  // Visual Programming
  shader_graph: {
    type: 'shader_graph',
    label: 'Shader Graph',
    description: 'Visual shader node graphs',
    icon: 'Network',
    fileExtension: '.json',
    category: MARKETPLACE_CATEGORIES.MATERIALS,
  },
  material: {
    type: 'material',
    label: 'Material',
    description: 'Custom materials and shaders',
    icon: 'Palette',
    fileExtension: '.json',
    category: MARKETPLACE_CATEGORIES.MATERIALS,
  },
  node_graph: {
    type: 'node_graph',
    label: 'Node Graph',
    description: 'Visual programming graphs',
    icon: 'GitBranch',
    fileExtension: '.json',
    category: MARKETPLACE_CATEGORIES.SCRIPTS,
  },
  // Animation & Physics
  animation: {
    type: 'animation',
    label: 'Animation',
    description: 'Animation sequences and clips',
    icon: 'Zap',
    fileExtension: '.json',
    category: MARKETPLACE_CATEGORIES.ANIMATIONS,
  },
  physics_preset: {
    type: 'physics_preset',
    label: 'Physics Preset',
    description: 'Physics configurations and constraints',
    icon: 'Orbit',
    fileExtension: '.json',
    category: MARKETPLACE_CATEGORIES.PHYSICS,
  },
  particle_effect: {
    type: 'particle_effect',
    label: 'Particle Effect',
    description: 'Particle systems, explosions, and VFX presets',
    icon: 'Sparkles',
    fileExtension: '.json',
    category: MARKETPLACE_CATEGORIES.VFX,
  },
  // Audio
  audio: {
    type: 'audio',
    label: 'Sound Effect',
    description: 'Sound effects and audio clips',
    icon: 'Volume2',
    fileExtension: '.mp3',
    category: MARKETPLACE_CATEGORIES.AUDIO,
  },
  music: {
    type: 'music',
    label: 'Music',
    description: 'Background music tracks',
    icon: 'Music',
    fileExtension: '.mp3',
    category: MARKETPLACE_CATEGORIES.MUSIC,
  },
  // VR/AR
  vr_environment: {
    type: 'vr_environment',
    label: 'VR Environment',
    description: 'Complete VR experiences',
    icon: 'Glasses',
    fileExtension: '.hsplus',
    category: MARKETPLACE_CATEGORIES.VR_ENVIRONMENTS,
  },
  ar_marker: {
    type: 'ar_marker',
    label: 'AR Marker',
    description: 'AR markers and targets',
    icon: 'Scan',
    fileExtension: '.json',
    category: MARKETPLACE_CATEGORIES.AR_EXPERIENCES,
  },
  // Utilities
  plugin: {
    type: 'plugin',
    label: 'Plugin',
    description: 'Studio plugins and extensions',
    icon: 'Puzzle',
    fileExtension: '.js',
    category: MARKETPLACE_CATEGORIES.PLUGINS,
  },
  script: {
    type: 'script',
    label: 'Script',
    description: 'Custom scripts and utilities',
    icon: 'FileCode',
    fileExtension: '.js',
    category: MARKETPLACE_CATEGORIES.SCRIPTS,
  },
  preset: {
    type: 'preset',
    label: 'Preset',
    description: 'General configuration presets',
    icon: 'Settings',
    fileExtension: '.json',
    category: MARKETPLACE_CATEGORIES.PRESETS,
  },
};
