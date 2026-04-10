/**
 * HoloScript Generator
 *
 * Generates HoloScript code from natural language descriptions.
 * Works locally with templates, optionally enhanced by Brittney AI.
 */

import { suggestTraits } from './traits';

export interface GeneratorOptions {
  brittneyUrl?: string;
  timeout?: number;
  verbose?: boolean;
}

export interface GeneratedObject {
  code: string;
  traits: string[];
  source: 'local' | 'brittney';
}

/**
 * Object templates for common VR objects
 */
const OBJECT_TEMPLATES: Record<string, { traits: string[]; template: string }> = {
  button: {
    traits: ['clickable', 'hoverable', 'glowing'],
    template: `orb {{name}} {
  @clickable(on_click: handle{{Name}}Click)
  @hoverable(highlight_color: "#ffff00")
  @glowing(intensity: 0.5)
  position: [{{x}}, {{y}}, {{z}}]
  color: "{{color}}"
  scale: [0.2, 0.2, 0.05]
}`,
  },
  ball: {
    traits: ['grabbable', 'throwable', 'physics', 'collidable'],
    template: `orb {{name}} {
  @grabbable
  @throwable(bounce: true)
  @physics(mass: 1, restitution: 0.8)
  @collidable
  position: [{{x}}, {{y}}, {{z}}]
  color: "{{color}}"
  scale: [0.15, 0.15, 0.15]
}`,
  },
  weapon: {
    traits: ['grabbable', 'holdable', 'collidable'],
    template: `orb {{name}} {
  @grabbable(snap_to_hand: true)
  @holdable(use_action: swing)
  @collidable(layer: "weapon")
  position: [{{x}}, {{y}}, {{z}}]
  color: "{{color}}"
  scale: [0.1, 0.1, 0.5]
}`,
  },
  npc: {
    traits: ['animated', 'collidable', 'clickable', 'state'],
    template: `orb {{name}} {
  @animated(clip: "idle", loop: true)
  @collidable
  @clickable(on_click: talk)
  @state
  position: [{{x}}, {{y}}, {{z}}]
  state {
    dialogue_index: 0
    friendly: true
  }
}`,
  },
  collectible: {
    traits: ['grabbable', 'glowing', 'consumable'],
    template: `orb {{name}} {
  @grabbable
  @glowing(color: "#ffcc00", intensity: 1.5)
  @consumable(on_consume: collect)
  position: [{{x}}, {{y}}, {{z}}]
  color: "{{color}}"
  scale: [0.1, 0.1, 0.1]
}`,
  },
  portal: {
    traits: ['portal', 'glowing', 'particle_emitter'],
    template: `orb {{name}} {
  @portal(destination: "{{destination}}", preview: true)
  @glowing(color: "#8800ff", intensity: 2)
  @particle_emitter(type: "sparkle", rate: 30)
  position: [{{x}}, {{y}}, {{z}}]
  color: "#6600cc"
  scale: [2, 3, 0.1]
}`,
  },
  lamp: {
    traits: ['emissive', 'glowing', 'clickable'],
    template: `orb {{name}} {
  @emissive(color: "#ffffcc", power: 30)
  @glowing(color: "#ffff88", intensity: 1)
  @clickable(on_click: toggleLight)
  position: [{{x}}, {{y}}, {{z}}]
  color: "#ffffee"
  scale: [0.3, 0.5, 0.3]
  state { on: true }
}`,
  },
  platform: {
    traits: ['collidable', 'kinematic'],
    template: `orb {{name}} {
  @collidable(layer: "terrain")
  @kinematic
  position: [{{x}}, {{y}}, {{z}}]
  color: "{{color}}"
  scale: [3, 0.2, 3]
}`,
  },
  crate: {
    traits: ['grabbable', 'physics', 'collidable', 'destructible'],
    template: `orb {{name}} {
  @grabbable
  @physics(mass: 10)
  @collidable
  @destructible(health: 50)
  position: [{{x}}, {{y}}, {{z}}]
  color: "#885522"
  scale: [0.5, 0.5, 0.5]
}`,
  },
  magic_orb: {
    traits: ['grabbable', 'glowing', 'particle_emitter', 'spatial_audio'],
    template: `orb {{name}} {
  @grabbable
  @glowing(color: "#00ffff", intensity: 2)
  @particle_emitter(type: "sparkle", rate: 20)
  @spatial_audio(source: "hum.mp3", loop: true, range: 5)
  position: [{{x}}, {{y}}, {{z}}]
  color: "#0088ff"
  scale: [0.2, 0.2, 0.2]
}`,
  },
};

/**
 * Detect object type from description
 */
function detectObjectType(description: string): string | null {
  const desc = description.toLowerCase();

  const typeKeywords: Record<string, string[]> = {
    button: ['button', 'switch', 'toggle', 'control'],
    ball: ['ball', 'sphere', 'orb'],
    weapon: ['weapon', 'sword', 'gun', 'axe', 'knife', 'tool'],
    npc: ['npc', 'character', 'person', 'shopkeeper', 'merchant', 'enemy', 'creature'],
    collectible: ['coin', 'gem', 'collectible', 'pickup', 'loot', 'treasure'],
    portal: ['portal', 'gate', 'door', 'teleport', 'entrance', 'exit'],
    lamp: ['lamp', 'light', 'torch', 'lantern', 'candle'],
    platform: ['platform', 'floor', 'ground', 'bridge', 'walkway'],
    crate: ['crate', 'box', 'container', 'barrel'],
    magic_orb: ['magic', 'magical', 'enchanted', 'mystical', 'arcane'],
  };

  for (const [type, keywords] of Object.entries(typeKeywords)) {
    if (keywords.some((kw) => desc.includes(kw))) {
      return type;
    }
  }

  return null;
}

/**
 * Extract properties from description
 */
function extractProperties(description: string): Record<string, string> {
  const props: Record<string, string> = {
    name: 'object',
    Name: 'Object',
    x: '0',
    y: '1',
    z: '0',
    color: '#00ffff',
    destination: 'world://default',
  };

  // Extract name hints
  const nameMatch = description.match(/(?:called|named|for)\s+["']?(\w+)["']?/i);
  if (nameMatch) {
    props.name = nameMatch[1].toLowerCase();
    props.Name = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1);
  }

  // Extract color hints
  const colorMatch = description.match(
    /(red|blue|green|yellow|purple|orange|pink|white|black|cyan|magenta)/i
  );
  if (colorMatch) {
    const colorMap: Record<string, string> = {
      red: '#ff0000',
      blue: '#0000ff',
      green: '#00ff00',
      yellow: '#ffff00',
      purple: '#8800ff',
      orange: '#ff8800',
      pink: '#ff88cc',
      white: '#ffffff',
      black: '#222222',
      cyan: '#00ffff',
      magenta: '#ff00ff',
    };
    props.color = colorMap[colorMatch[1].toLowerCase()] || '#00ffff';
  }

  // Extract position hints
  const posMatch = description.match(/at\s*\(?(\d+)[,\s]+(\d+)[,\s]+(\d+)\)?/);
  if (posMatch) {
    props.x = posMatch[1];
    props.y = posMatch[2];
    props.z = posMatch[3];
  }

  return props;
}

/**
 * Generate object from template
 */
function generateFromTemplate(type: string, props: Record<string, string>): string {
  const template = OBJECT_TEMPLATES[type];
  if (!template) {
    return generateGenericObject(props);
  }

  let code = template.template;
  for (const [key, value] of Object.entries(props)) {
    code = code.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  return code;
}

/**
 * Generate a generic object when no template matches
 */
function generateGenericObject(props: Record<string, string>): string {
  return `orb ${props.name} {
  @grabbable
  @collidable
  position: [${props.x}, ${props.y}, ${props.z}]
  color: "${props.color}"
  scale: [0.5, 0.5, 0.5]
}`;
}

/**
 * Try to call Brittney for enhanced generation (optional)
 */
async function tryBrittneyGeneration(
  description: string,
  options: GeneratorOptions
): Promise<string | null> {
  if (!options.brittneyUrl) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 5000);

    const response = await fetch(`${options.brittneyUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: `Generate HoloScript code for: ${description}\n\nReturn ONLY the HoloScript code, no explanation.`,
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      if (data.content) {
        // Extract code block if present
        const codeMatch = data.content.match(/```(?:holoscript|hsplus|hs)?\n([\s\S]*?)```/);
        return codeMatch ? codeMatch[1].trim() : data.content.trim();
      }
    }
  } catch (_error) {
    if (options.verbose) {
      console.log('\x1b[2mBrittney unavailable, using local generation\x1b[0m');
    }
  }

  return null;
}

/**
 * Generate HoloScript object from description
 */
export async function generateObject(
  description: string,
  options: GeneratorOptions = {}
): Promise<GeneratedObject> {
  // Try Brittney first if available
  const brittneyCode = await tryBrittneyGeneration(description, options);
  if (brittneyCode) {
    const traits = suggestTraits(description).map((t) => t.name);
    return {
      code: brittneyCode,
      traits,
      source: 'brittney',
    };
  }

  // Fall back to local template generation
  const objectType = detectObjectType(description);
  const props = extractProperties(description);
  const traits = await suggestTraits(description);

  let code: string;
  if (objectType && OBJECT_TEMPLATES[objectType]) {
    code = generateFromTemplate(objectType, props);
  } else if (traits.length > 0) {
    // Generate from suggested traits
    const traitLines = traits.map((t) => `  @${t.name}`).join('\n');
    code = `orb ${props.name} {
${traitLines}
  position: [${props.x}, ${props.y}, ${props.z}]
  color: "${props.color}"
}`;
  } else {
    code = generateGenericObject(props);
  }

  return {
    code,
    traits: traits.map((t) => t.name),
    source: 'local',
  };
}

/**
 * Generate .holo scene composition from description
 */
export async function generateScene(
  description: string,
  options: GeneratorOptions = {}
): Promise<string> {
  // Try Brittney first
  const brittneyCode = await tryBrittneyGeneration(
    `Generate a complete .holo scene composition for: ${description}`,
    options
  );
  if (brittneyCode) {
    return brittneyCode;
  }

  // Local template-based generation
  const props = extractProperties(description);
  const name = description.slice(0, 50).replace(/[^a-zA-Z0-9\s]/g, '');

  return `composition "${name}" {
  environment {
    skybox: "default"
    ambient_light: 0.4
    fog: false
  }

  // Main scene object
  object "${props.Name}" {
    position: [${props.x}, ${props.y}, ${props.z}]
    color: "${props.color}"
  }

  // Add more objects here...

  logic {
    on_scene_ready() {
      // Initialization logic
    }
  }
}`;
}

/**
 * List available templates
 */
export function listTemplates(): string[] {
  return Object.keys(OBJECT_TEMPLATES);
}

/**
 * Get template details
 */
export function getTemplate(name: string): { traits: string[]; template: string } | null {
  return OBJECT_TEMPLATES[name] || null;
}
