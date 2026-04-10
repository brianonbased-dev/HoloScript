/**
 * Prompt Templates System
 *
 * Provides pre-built prompt templates for common HoloScript generation tasks.
 * Supports:
 * - Variable interpolation
 * - Context-aware suggestions
 * - Template composition
 * - Custom template creation
 */

// =============================================================================
// TYPES
// =============================================================================

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  template: string;
  variables: string[];
  examples: string[];
  bestFor: string;
}

export interface TemplateContext {
  [key: string]: string | number | boolean;
}

// =============================================================================
// BUILT-IN TEMPLATES
// =============================================================================

const PROMPT_TEMPLATES: Record<string, PromptTemplate> = {
  // =========================================================================
  // BASIC OBJECTS
  // =========================================================================

  'basic-object': {
    id: 'basic-object',
    name: 'Basic Object',
    description: 'Create a simple object with geometry',
    category: 'basic',
    template: 'Create a {{geometry}} with color {{color}} at position {{position}}',
    variables: ['geometry', 'color', 'position'],
    examples: [
      'Create a sphere with color blue at position [0, 1, 0]',
      'Create a cube with color red at position [1, 0, 1]',
    ],
    bestFor: 'Simple object creation',
  },

  'interactive-object': {
    id: 'interactive-object',
    name: 'Interactive Object',
    description: 'Create an interactive object with traits',
    category: 'interaction',
    template: 'Create a {{color}} {{geometry}} that {{interaction}} for {{purpose}}',
    variables: ['color', 'geometry', 'interaction', 'purpose'],
    examples: [
      'Create a blue sphere that responds to touch for feedback',
      'Create a red cube that is grabbable for manipulation',
    ],
    bestFor: 'Interactive UI and gameplay elements',
  },

  'physics-object': {
    id: 'physics-object',
    name: 'Physics Object',
    description: 'Create an object with physics enabled',
    category: 'physics',
    template:
      'Create a {{geometry}} with {{physics_type}} physics, mass {{mass}}, and {{restitution}} bounce',
    variables: ['geometry', 'physics_type', 'mass', 'restitution'],
    examples: [
      'Create a sphere with dynamic physics, mass 1.0, and 0.8 bounce',
      'Create a cube with kinematic physics, mass 2.0, and 0.3 bounce',
    ],
    bestFor: 'Physics-based gameplay',
  },

  // =========================================================================
  // SCENES
  // =========================================================================

  'game-scene': {
    id: 'game-scene',
    name: 'Game Scene',
    description: 'Create a complete game scene',
    category: 'scene',
    template: `Create a {{game_type}} game scene with:
- {{element1}}
- {{element2}}
- {{element3}}
Set the skybox to {{skybox}} and lighting to {{lighting_level}}`,
    variables: ['game_type', 'element1', 'element2', 'element3', 'skybox', 'lighting_level'],
    examples: [
      'Create a puzzle game scene with: a lever, a door, and a trigger zone. Set the skybox to forest and lighting to bright',
    ],
    bestFor: 'Complete game environments',
  },

  'level-design': {
    id: 'level-design',
    name: 'Level Design',
    description: 'Design a game level',
    category: 'design',
    template: `Design a {{level_type}} level with:
- Difficulty: {{difficulty}}
- Player start position: {{start_pos}}
- Goal position: {{goal_pos}}
- Obstacles: {{obstacles}}
- Number of enemies: {{enemy_count}}`,
    variables: ['level_type', 'difficulty', 'start_pos', 'goal_pos', 'obstacles', 'enemy_count'],
    examples: [
      'Design a platformer level with: difficulty hard, player start [0,0,0], goal [10,5,0], obstacles spikes, 5 enemies',
    ],
    bestFor: 'Level layout and progression',
  },

  // =========================================================================
  // INTERACTIONS
  // =========================================================================

  'button-ui': {
    id: 'button-ui',
    name: 'Button UI',
    description: 'Create interactive buttons',
    category: 'ui',
    template: 'Create a {{button_type}} button labeled "{{label}}" that {{action}} when pressed',
    variables: ['button_type', 'label', 'action'],
    examples: [
      'Create a play button labeled "Start Game" that loads the game scene when pressed',
      'Create a quit button labeled "Exit" that closes the application when pressed',
    ],
    bestFor: 'UI buttons and controls',
  },

  'menu-system': {
    id: 'menu-system',
    name: 'Menu System',
    description: 'Create a complete menu',
    category: 'ui',
    template: `Create a {{menu_type}} menu with buttons:
{{buttons}}
Position it {{position}} with {{styling}}`,
    variables: ['menu_type', 'buttons', 'position', 'styling'],
    examples: [
      'Create a main menu with buttons: Play, Settings, Credits, Quit. Position it centered with dark background',
    ],
    bestFor: 'Complete menu systems',
  },

  // =========================================================================
  // CHARACTERS
  // =========================================================================

  'player-controller': {
    id: 'player-controller',
    name: 'Player Controller',
    description: 'Create a player character controller',
    category: 'character',
    template: `Create a player controller with:
- Geometry: {{geometry}}
- Movement: {{movement_type}}
- Health: {{health}}
- Abilities: {{abilities}}
- Equipment: {{equipment}}`,
    variables: ['geometry', 'movement_type', 'health', 'abilities', 'equipment'],
    examples: [
      'Create a player controller with: humanoid geometry, WASD movement, 100 health, jump/dash abilities, sword equipment',
    ],
    bestFor: 'Player character definition',
  },

  'enemy-type': {
    id: 'enemy-type',
    name: 'Enemy Type',
    description: 'Create an enemy character',
    category: 'character',
    template: `Create a {{enemy_type}} enemy with:
- Appearance: {{appearance}}
- Behavior: {{behavior}}
- Difficulty: {{difficulty}}
- Reward: {{reward}}`,
    variables: ['enemy_type', 'appearance', 'behavior', 'difficulty', 'reward'],
    examples: [
      'Create a goblin enemy with: green humanoid appearance, patrol behavior, medium difficulty, 50 gold reward',
    ],
    bestFor: 'Enemy definitions',
  },

  // =========================================================================
  // EFFECTS & ANIMATION
  // =========================================================================

  'visual-effect': {
    id: 'visual-effect',
    name: 'Visual Effect',
    description: 'Create a visual effect',
    category: 'effect',
    template:
      'Create a {{effect_type}} effect with {{color}} color at {{position}} that {{behavior}}',
    variables: ['effect_type', 'color', 'position', 'behavior'],
    examples: [
      'Create a particle effect with blue color at [0,2,0] that explodes on impact',
      'Create a glow effect with yellow color at [1,1,1] that pulses continuously',
    ],
    bestFor: 'Visual effects and animations',
  },

  'animation-sequence': {
    id: 'animation-sequence',
    name: 'Animation Sequence',
    description: 'Create an animation',
    category: 'animation',
    template: `Create an animation that:
- Animates: {{target}}
- From: {{from_value}}
- To: {{to_value}}
- Duration: {{duration}}ms
- Loop: {{loop_type}}`,
    variables: ['target', 'from_value', 'to_value', 'duration', 'loop_type'],
    examples: [
      'Create an animation that: animates position.y, from 1.0 to 2.0, duration 1000ms, loop infinite',
    ],
    bestFor: 'Object animations',
  },

  // =========================================================================
  // NETWORKING
  // =========================================================================

  'networked-object': {
    id: 'networked-object',
    name: 'Networked Object',
    description: 'Create a networked object',
    category: 'networking',
    template: `Create a networked {{object_type}} that:
- Syncs: {{synced_properties}}
- Rate: {{sync_rate}}Hz
- Owned by: {{owner_type}}`,
    variables: ['object_type', 'synced_properties', 'sync_rate', 'owner_type'],
    examples: [
      'Create a networked ball that: syncs position and rotation, rate 20Hz, owned by grabber',
    ],
    bestFor: 'Multiplayer objects',
  },

  'multiplayer-scene': {
    id: 'multiplayer-scene',
    name: 'Multiplayer Scene',
    description: 'Create a multiplayer environment',
    category: 'networking',
    template: `Create a multiplayer scene with:
- Max players: {{max_players}}
- Spawn points: {{spawn_points}}
- Shared objects: {{shared_objects}}
- Team support: {{team_support}}`,
    variables: ['max_players', 'spawn_points', 'shared_objects', 'team_support'],
    examples: [
      'Create a multiplayer scene with: max 4 players, 4 spawn points, shared ball, team support enabled',
    ],
    bestFor: 'Multiplayer game setup',
  },
};

// =============================================================================
// TEMPLATE SYSTEM
// =============================================================================

export class PromptTemplateSystem {
  private customTemplates: Map<string, PromptTemplate> = new Map();

  /**
   * Get all available templates
   */
  getAvailableTemplates(): PromptTemplate[] {
    const builtIn = Object.values(PROMPT_TEMPLATES);
    const custom = Array.from(this.customTemplates.values());
    return [...builtIn, ...custom];
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: string): PromptTemplate[] {
    return this.getAvailableTemplates().filter((t) => t.category === category);
  }

  /**
   * Get a specific template
   */
  getTemplate(id: string): PromptTemplate | null {
    return PROMPT_TEMPLATES[id] || this.customTemplates.get(id) || null;
  }

  /**
   * Create a prompt from template with context
   */
  createPrompt(templateId: string, context: TemplateContext): string {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    let prompt = template.template;

    // Replace all variables
    for (const [key, value] of Object.entries(context)) {
      const pattern = new RegExp(`{{${key}}}`, 'g');
      prompt = prompt.replace(pattern, String(value));
    }

    return prompt;
  }

  /**
   * Validate context against template
   */
  validateContext(
    templateId: string,
    context: TemplateContext
  ): { valid: boolean; missing: string[] } {
    const template = this.getTemplate(templateId);
    if (!template) {
      return { valid: false, missing: ['Template not found'] };
    }

    const missing = template.variables.filter((v) => !(v in context));

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Register custom template
   */
  registerTemplate(template: PromptTemplate): void {
    this.customTemplates.set(template.id, template);
  }

  /**
   * Get template suggestions for a category
   */
  suggestTemplates(category: string, query?: string): PromptTemplate[] {
    let suggestions = this.getTemplatesByCategory(category);

    if (query) {
      const lowerQuery = query.toLowerCase();
      suggestions = suggestions.filter(
        (t) =>
          t.name.toLowerCase().includes(lowerQuery) ||
          t.description.toLowerCase().includes(lowerQuery) ||
          t.examples.some((e) => e.toLowerCase().includes(lowerQuery))
      );
    }

    return suggestions.slice(0, 5);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    this.getAvailableTemplates().forEach((t) => categories.add(t.category));
    return Array.from(categories).sort();
  }

  /**
   * Create a batch of prompts from templates
   */
  createBatch(templates: Array<{ templateId: string; context: TemplateContext }>): string[] {
    return templates.map((t) => this.createPrompt(t.templateId, t.context));
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Quick prompt creation helpers
 */
export const QuickPrompts = {
  /**
   * Create prompt for a simple object
   */
  object(geometry: string, color: string, position: [number, number, number]): string {
    const system = new PromptTemplateSystem();
    return system.createPrompt('basic-object', {
      geometry,
      color,
      position: JSON.stringify(position),
    });
  },

  /**
   * Create prompt for an interactive object
   */
  interactive(color: string, geometry: string, interaction: string, purpose: string): string {
    const system = new PromptTemplateSystem();
    return system.createPrompt('interactive-object', {
      color,
      geometry,
      interaction,
      purpose,
    });
  },

  /**
   * Create prompt for a physics object
   */
  physics(geometry: string, physics_type: string, mass: number, restitution: number): string {
    const system = new PromptTemplateSystem();
    return system.createPrompt('physics-object', {
      geometry,
      physics_type,
      mass,
      restitution,
    });
  },

  /**
   * Create prompt for a player controller
   */
  player(geometry: string, movement_type: string, health: number, abilities: string): string {
    const system = new PromptTemplateSystem();
    return system.createPrompt('player-controller', {
      geometry,
      movement_type,
      health,
      abilities,
    });
  },

  /**
   * Create prompt for networked object
   */
  networked(object_type: string, synced_properties: string, sync_rate: number): string {
    const system = new PromptTemplateSystem();
    return system.createPrompt('networked-object', {
      object_type,
      synced_properties,
      sync_rate,
      owner_type: 'first-grabber',
    });
  },
};
