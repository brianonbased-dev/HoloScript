/**
 * Studio Presets — Pre-configured IDE layouts for different user workflows.
 *
 * Each preset defines which panels, domain profile, studio mode, and sidebar
 * tabs to activate. The wizard selects a preset based on user answers, then
 * project specifics add extra panels on top.
 */

import type { StudioMode } from '../stores/editorStore';
import type { DomainProfile } from '../../hooks/useDomainFilter';
import type { PanelKey } from '../stores/panelVisibilityStore';
import type { PanelTab } from '../../types/panels';

// ─── Preset Definition ───────────────────────────────────────────────────────

export interface StudioPreset {
  id: string;
  label: string;
  emoji: string;
  description: string;
  category: 'game' | 'film' | 'art' | 'web' | 'iot' | 'education' | 'ai' | 'robotics' | 'science';
  studioMode: StudioMode;
  domainProfile: DomainProfile;
  openPanels: PanelKey[];
  sidebarTabs: PanelTab[];
  suggestedTemplateCategory?: string;
}

// ─── Project Specifics (from wizard step 3) ──────────────────────────────────

export interface ProjectSpecifics {
  projectSize: 'sketch' | 'small' | 'production';
  artStyle: 'realistic' | 'stylized' | 'lowpoly' | 'abstract';
  platforms: ('web' | 'vr' | 'mobile' | 'desktop')[];
  characterCount?: 'none' | 'few' | 'many';
  needsMultiplayer?: boolean;
  needsAI?: boolean;
  needsDialogue?: boolean;
  exportFormat?: 'gltf' | 'usd' | 'fbx';
  needsDeployment?: boolean;
}

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

// ─── Preset Definitions ──────────────────────────────────────────────────────

export const STUDIO_PRESETS: StudioPreset[] = [
  {
    id: 'vr-game',
    label: 'VR Game Builder',
    emoji: '🎮',
    description: 'Build interactive VR games with physics, AI, and combat',
    category: 'game',
    studioMode: 'creator',
    domainProfile: 'game',
    openPanels: ['chat', 'physics'],
    sidebarTabs: [
      'safety', 'traits', 'physics', 'behavior', 'ai', 'combat',
      'pathfinding', 'statemachine', 'input', 'character', 'scene',
      'assets', 'compiler', 'saveload',
    ],
    suggestedTemplateCategory: 'game',
  },
  {
    id: 'animated-film',
    label: 'Animated Film',
    emoji: '🎬',
    description: 'Direct animated short films, cutscenes, and music videos',
    category: 'film',
    studioMode: 'filmmaker',
    domainProfile: 'film',
    openPanels: ['chat', 'timeline'],
    sidebarTabs: [
      'animation', 'camera', 'lighting', 'cinematic', 'timeline',
      'audio', 'shader', 'scene', 'assets', 'models', 'saveload',
    ],
    suggestedTemplateCategory: 'film',
  },
  {
    id: '3d-artist',
    label: '3D Artist',
    emoji: '🎨',
    description: 'Create materials, shaders, and 3D models with advanced tools',
    category: 'art',
    studioMode: 'artist',
    domainProfile: 'all',
    openPanels: ['chat', 'material'],
    sidebarTabs: [
      'traits', 'shader', 'animation', 'lighting', 'lod',
      'pipeline', 'models', 'assets', 'scene', 'camera', 'saveload',
    ],
    suggestedTemplateCategory: 'environment',
  },
  {
    id: 'web-experience',
    label: 'Web Experience',
    emoji: '🌐',
    description: 'Build interactive 3D web apps, portfolios, and configurators',
    category: 'web',
    studioMode: 'creator',
    domainProfile: 'all',
    openPanels: ['chat', 'export'],
    sidebarTabs: [
      'traits', 'scene', 'assets', 'animation', 'lighting',
      'camera', 'compiler', 'saveload',
    ],
    suggestedTemplateCategory: 'minimal',
  },
  {
    id: 'iot-dashboard',
    label: 'IoT Dashboard',
    emoji: '📡',
    description: 'Visualize sensor data, digital twins, and control panels',
    category: 'iot',
    studioMode: 'creator',
    domainProfile: 'iot',
    openPanels: ['chat', 'inspector'],
    sidebarTabs: [
      'traits', 'state', 'network', 'scene', 'compiler', 'saveload',
    ],
    suggestedTemplateCategory: 'minimal',
  },
  {
    id: 'character-designer',
    label: 'Character Designer',
    emoji: '🧑‍🎨',
    description: 'Design avatars, NPCs, and animated characters',
    category: 'art',
    studioMode: 'character',
    domainProfile: 'game',
    openPanels: ['chat', 'assetLib'],
    sidebarTabs: [
      'character', 'animation', 'behavior', 'dialogue', 'models',
      'assets', 'scene', 'lighting', 'saveload',
    ],
    suggestedTemplateCategory: 'art',
  },
  {
    id: 'ai-composer',
    label: 'AI Scene Composer',
    emoji: '🤖',
    description: 'Use AI to generate and iterate on 3D scenes with natural language',
    category: 'ai',
    studioMode: 'creator',
    domainProfile: 'all',
    openPanels: ['chat', 'generator'],
    sidebarTabs: [
      'traits', 'scene', 'assets', 'lighting', 'camera',
      'animation', 'saveload',
    ],
    suggestedTemplateCategory: 'sci-fi',
  },
  {
    id: 'educator',
    label: 'Educator',
    emoji: '📚',
    description: 'Simplified studio for teaching and learning 3D creation',
    category: 'education',
    studioMode: 'creator',
    domainProfile: 'game',
    openPanels: ['chat', 'tutorial', 'examples'],
    sidebarTabs: [
      'templates', 'traits', 'scene', 'assets', 'physics',
      'animation', 'saveload',
    ],
    suggestedTemplateCategory: 'minimal',
  },
  {
    id: 'vr-world',
    label: 'VR World Builder',
    emoji: '🌍',
    description: 'Create social VR spaces with multiplayer and collaboration',
    category: 'game',
    studioMode: 'creator',
    domainProfile: 'vr',
    openPanels: ['chat', 'physics', 'multiplayer'],
    sidebarTabs: [
      'traits', 'physics', 'multiplayer', 'network', 'collaboration',
      'terrain', 'lighting', 'scene', 'assets', 'saveload',
    ],
    suggestedTemplateCategory: 'environment',
  },
  {
    id: 'music-viz',
    label: 'Music Visualizer',
    emoji: '🎵',
    description: 'Build audio-reactive visual experiences and art',
    category: 'art',
    studioMode: 'artist',
    domainProfile: 'all',
    openPanels: ['chat', 'audio', 'audioVisualizer'],
    sidebarTabs: [
      'audio', 'shader', 'particles', 'animation', 'camera',
      'lighting', 'scene', 'saveload',
    ],
    suggestedTemplateCategory: 'minimal',
  },
  {
    id: 'robotics-lab',
    label: 'Robotics Lab',
    emoji: '🦾',
    description: 'Design, simulate, and export robots with URDF, ROS2, and Gazebo',
    category: 'robotics',
    studioMode: 'creator',
    domainProfile: 'all',
    openPanels: ['chat', 'physics', 'inspector'],
    sidebarTabs: [
      'traits', 'physics', 'behavior', 'ai', 'pathfinding',
      'scene', 'assets', 'compiler', 'saveload',
    ],
    suggestedTemplateCategory: 'robotics',
  },
  {
    id: 'molecular-lab',
    label: 'Molecular Lab',
    emoji: '🧬',
    description: 'Visualize molecules, run simulations, and design drugs with Narupa',
    category: 'science',
    studioMode: 'creator',
    domainProfile: 'all',
    openPanels: ['chat', 'inspector', 'particles'],
    sidebarTabs: [
      'traits', 'scene', 'physics', 'particles', 'shader',
      'assets', 'compiler', 'saveload',
    ],
    suggestedTemplateCategory: 'science',
  },
  {
    id: 'medical-sim',
    label: 'Medical Simulation',
    emoji: '🏥',
    description: 'Surgical training, anatomy exploration, and therapeutic VR',
    category: 'science',
    studioMode: 'creator',
    domainProfile: 'vr',
    openPanels: ['chat', 'physics', 'inspector'],
    sidebarTabs: [
      'traits', 'physics', 'behavior', 'animation', 'scene',
      'assets', 'lighting', 'camera', 'saveload',
    ],
    suggestedTemplateCategory: 'science',
  },
];

// ─── Sub-category → Preset Mapping ──────────────────────────────────────────

export const SUBCATEGORY_PRESET_MAP: Record<string, string> = {
  // Game
  'vr-game': 'vr-game',
  'platformer': 'vr-game',
  'rpg': 'vr-game',
  'puzzle': 'vr-game',
  'social-vr': 'vr-world',
  // Film
  'short-film': 'animated-film',
  'music-video': 'animated-film',
  'product-viz': 'animated-film',
  'cutscene': 'animated-film',
  // Art
  'character-design': 'character-designer',
  'environment-art': '3d-artist',
  'material-study': '3d-artist',
  'music-visualizer': 'music-viz',
  // Web
  'portfolio': 'web-experience',
  'interactive-story': 'web-experience',
  'data-dashboard': 'iot-dashboard',
  'product-configurator': 'web-experience',
  // IoT
  'sensor-dashboard': 'iot-dashboard',
  'digital-twin': 'iot-dashboard',
  'control-panel': 'iot-dashboard',
  // Education
  'tutorial-creator': 'educator',
  'student-sandbox': 'educator',
  'classroom-demo': 'educator',
  // Robotics
  'robot-arm': 'robotics-lab',
  'factory-automation': 'robotics-lab',
  'drone-sim': 'robotics-lab',
  'warehouse-robotics': 'robotics-lab',
  // Science
  'molecular-design': 'molecular-lab',
  'narupa-sim': 'molecular-lab',
  'anatomy-explorer': 'medical-sim',
  'surgical-training': 'medical-sim',
};

// ─── Category → Sub-categories ───────────────────────────────────────────────

export interface SubCategory {
  id: string;
  label: string;
  emoji: string;
  description: string;
}

export const SUBCATEGORIES: Record<string, SubCategory[]> = {
  game: [
    { id: 'vr-game', label: 'VR Game', emoji: '🥽', description: 'Immersive VR gameplay' },
    { id: 'platformer', label: 'Platformer', emoji: '🏃', description: '2D/3D platforming action' },
    { id: 'rpg', label: 'RPG', emoji: '⚔️', description: 'Role-playing with quests and dialogue' },
    { id: 'puzzle', label: 'Puzzle', emoji: '🧩', description: 'Brain-teasing challenges' },
    { id: 'social-vr', label: 'Social VR', emoji: '👥', description: 'Multiplayer social spaces' },
  ],
  film: [
    { id: 'short-film', label: 'Short Film', emoji: '🎥', description: 'Narrative animated films' },
    { id: 'music-video', label: 'Music Video', emoji: '🎶', description: 'Visual music experiences' },
    { id: 'product-viz', label: 'Product Viz', emoji: '📦', description: 'Product showcases and ads' },
    { id: 'cutscene', label: 'Cutscene', emoji: '🎭', description: 'In-game cinematics' },
  ],
  art: [
    { id: 'character-design', label: 'Character Design', emoji: '🧑‍🎨', description: 'Avatars and NPCs' },
    { id: 'environment-art', label: 'Environment Art', emoji: '🏔️', description: 'Worlds and landscapes' },
    { id: 'material-study', label: 'Material Study', emoji: '✨', description: 'Shaders and materials' },
    { id: 'music-visualizer', label: 'Music Visualizer', emoji: '🎵', description: 'Audio-reactive art' },
  ],
  web: [
    { id: 'portfolio', label: 'Portfolio', emoji: '💼', description: 'Showcase your work in 3D' },
    { id: 'interactive-story', label: 'Interactive Story', emoji: '📖', description: 'Branching narratives' },
    { id: 'data-dashboard', label: 'Data Dashboard', emoji: '📊', description: '3D data visualization' },
    { id: 'product-configurator', label: 'Product Config', emoji: '🔧', description: 'Customizable product viewer' },
  ],
  iot: [
    { id: 'sensor-dashboard', label: 'Sensor Dashboard', emoji: '📡', description: 'Live sensor monitoring' },
    { id: 'digital-twin', label: 'Digital Twin', emoji: '🏭', description: 'Physical system mirror' },
    { id: 'control-panel', label: 'Control Panel', emoji: '🎛️', description: 'Device management UI' },
  ],
  education: [
    { id: 'tutorial-creator', label: 'Tutorial Creator', emoji: '📝', description: 'Build learning modules' },
    { id: 'student-sandbox', label: 'Student Sandbox', emoji: '🎓', description: 'Safe experimentation space' },
    { id: 'classroom-demo', label: 'Classroom Demo', emoji: '🏫', description: 'Live teaching demos' },
  ],
  robotics: [
    { id: 'robot-arm', label: 'Robot Arm', emoji: '🦾', description: 'URDF robot with joint control' },
    { id: 'factory-automation', label: 'Factory Floor', emoji: '🏭', description: 'Industrial automation twin' },
    { id: 'drone-sim', label: 'Drone Simulator', emoji: '🚁', description: 'Autonomous flight planning' },
    { id: 'warehouse-robotics', label: 'Warehouse Robots', emoji: '📦', description: 'Pick-and-place swarms' },
  ],
  science: [
    { id: 'molecular-design', label: 'Molecular Design', emoji: '🧬', description: 'Drug design and docking' },
    { id: 'narupa-sim', label: 'Narupa MD', emoji: '🔬', description: 'Interactive molecular dynamics' },
    { id: 'anatomy-explorer', label: 'Anatomy Explorer', emoji: '🫀', description: 'Medical 3D visualization' },
    { id: 'surgical-training', label: 'Surgical Training', emoji: '🏥', description: 'VR procedure practice' },
  ],
};

// ─── Category-specific Questions ─────────────────────────────────────────────

export interface WizardQuestion {
  id: string;
  label: string;
  type: 'card-select' | 'toggle' | 'multi-select';
  options?: { value: string; label: string; emoji?: string }[];
  categories: string[]; // which categories show this question
}

export const PROJECT_QUESTIONS: WizardQuestion[] = [
  // Common
  {
    id: 'projectSize',
    label: 'How big is this project?',
    type: 'card-select',
    options: [
      { value: 'sketch', label: 'Quick sketch', emoji: '⚡' },
      { value: 'small', label: 'Small project', emoji: '📁' },
      { value: 'production', label: 'Full production', emoji: '🏗️' },
    ],
    categories: ['game', 'film', 'art', 'web', 'iot', 'education', 'robotics', 'science'],
  },
  {
    id: 'artStyle',
    label: 'What art style?',
    type: 'card-select',
    options: [
      { value: 'realistic', label: 'Realistic', emoji: '📷' },
      { value: 'stylized', label: 'Stylized', emoji: '🎨' },
      { value: 'lowpoly', label: 'Low-poly', emoji: '🔺' },
      { value: 'abstract', label: 'Abstract', emoji: '🌀' },
    ],
    categories: ['game', 'film', 'art'],
  },
  {
    id: 'platforms',
    label: 'Target platforms?',
    type: 'multi-select',
    options: [
      { value: 'web', label: 'Web browser', emoji: '🌐' },
      { value: 'vr', label: 'VR headset', emoji: '🥽' },
      { value: 'mobile', label: 'Mobile', emoji: '📱' },
      { value: 'desktop', label: 'Desktop', emoji: '🖥️' },
    ],
    categories: ['game', 'film', 'art', 'web'],
  },
  // Game-specific
  {
    id: 'needsMultiplayer',
    label: 'Need multiplayer?',
    type: 'toggle',
    categories: ['game'],
  },
  {
    id: 'needsAI',
    label: 'Need AI enemies/NPCs?',
    type: 'toggle',
    categories: ['game'],
  },
  {
    id: 'characterCount',
    label: 'How many characters?',
    type: 'card-select',
    options: [
      { value: 'none', label: 'None', emoji: '0️⃣' },
      { value: 'few', label: '1-5', emoji: '👤' },
      { value: 'many', label: '6+', emoji: '👥' },
    ],
    categories: ['game', 'film'],
  },
  // Film-specific
  {
    id: 'needsDialogue',
    label: 'Need voice/dialogue?',
    type: 'toggle',
    categories: ['film'],
  },
  // Web-specific
  {
    id: 'needsDeployment',
    label: 'Need cloud deployment?',
    type: 'toggle',
    categories: ['web'],
  },
  // Art-specific
  {
    id: 'exportFormat',
    label: 'Export format?',
    type: 'card-select',
    options: [
      { value: 'gltf', label: 'glTF', emoji: '📦' },
      { value: 'usd', label: 'USD', emoji: '🎬' },
      { value: 'fbx', label: 'FBX', emoji: '📐' },
    ],
    categories: ['art'],
  },
  // Robotics-specific
  {
    id: 'needsAI',
    label: 'Need AI behavior / path planning?',
    type: 'toggle',
    categories: ['robotics'],
  },
  {
    id: 'exportFormat',
    label: 'Export target?',
    type: 'card-select',
    options: [
      { value: 'gltf', label: 'WebXR Preview', emoji: '🌐' },
      { value: 'usd', label: 'Isaac Sim', emoji: '🤖' },
      { value: 'fbx', label: 'Gazebo / ROS2', emoji: '🦾' },
    ],
    categories: ['robotics'],
  },
  // Science-specific
  {
    id: 'platforms',
    label: 'Target platform?',
    type: 'multi-select',
    options: [
      { value: 'web', label: 'Web browser', emoji: '🌐' },
      { value: 'vr', label: 'VR headset', emoji: '🥽' },
      { value: 'desktop', label: 'Desktop', emoji: '🖥️' },
    ],
    categories: ['science'],
  },
];

// ─── Extra Panel Logic ───────────────────────────────────────────────────────

/** Compute extra panels to add based on project specifics. */
export function getExtraPanels(specifics: ProjectSpecifics): PanelKey[] {
  const extra: PanelKey[] = [];

  // Project size
  if (specifics.projectSize === 'production') {
    extra.push('versions', 'profiler');
  }

  // Art style
  if (specifics.artStyle === 'lowpoly') {
    extra.push('generator');
  }
  if (specifics.artStyle === 'realistic') {
    extra.push('material', 'environment');
  }

  // Platforms
  if (specifics.platforms.includes('vr')) {
    extra.push('physics');
  }

  // Game specifics
  if (specifics.needsMultiplayer) {
    extra.push('multiplayer');
  }
  if (specifics.needsAI) {
    extra.push('behaviorTree');
  }
  if (specifics.needsDialogue) {
    extra.push('chat');
  }

  // Characters
  if (specifics.characterCount === 'many' || specifics.characterCount === 'few') {
    extra.push('assetLib');
  }

  // Web specifics
  if (specifics.needsDeployment) {
    extra.push('cloudDeploy');
  }

  // Export format
  if (specifics.exportFormat === 'usd') {
    extra.push('exportV2');
  }

  return [...new Set(extra)];
}

/** Filter panels by experience level. */
export function filterByExperience(
  basePanels: PanelKey[],
  extraPanels: PanelKey[],
  level: ExperienceLevel,
): PanelKey[] {
  switch (level) {
    case 'beginner':
      // Only the preset's base panels (3-5 panels max)
      return basePanels.slice(0, 4);
    case 'intermediate':
      // Base + specifics-driven extras
      return [...basePanels, ...extraPanels];
    case 'advanced':
      // Everything + bonus tools
      return [...basePanels, ...extraPanels, 'profiler', 'debugger', 'console'];
  }
}
