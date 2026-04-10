/**
 * xAI Grok Integration for HoloScript
 *
 * Example showing how Grok can generate and share HoloScript scenes on X.
 * This can run in Grok's Python environment or as a TypeScript module.
 */

import { HoloScriptPlusParser, HoloCompositionParser, parseHolo } from '@holoscript/core';
import { extractTraits, capitalize } from '@holoscript/std';

// Types
interface GrokContext {
  userPrompt: string;
  conversationHistory?: string[];
  platform: 'x' | 'console';
}

interface GeneratedScene {
  code: string;
  title: string;
  description: string;
  traits: string[];
  objectCount: number;
}

interface ShareResult {
  playgroundUrl: string;
  tweetText: string;
  previewUrl?: string;
}

// MCP-style tool implementations
const tools = {
  /**
   * Generate a complete HoloScript scene from natural language
   */
  async generateScene(
    description: string,
    style: 'minimal' | 'detailed' | 'production' = 'detailed'
  ): Promise<GeneratedScene> {
    // Parse the description for key elements
    const elements = parseDescription(description);

    // Generate the scene code
    const code = generateSceneCode(elements, style);

    // Extract metadata
    const traits = extractTraits(code);
    const objectCount = (code.match(/object\s+"/g) || []).length;

    return {
      code,
      title: elements.sceneName,
      description: elements.summary,
      traits,
      objectCount,
    };
  },

  /**
   * Validate HoloScript code
   */
  async validate(
    code: string
  ): Promise<{ valid: boolean; errors: string[]; suggestions: string[] }> {
    const errors: string[] = [];
    const suggestions: string[] = [];

    try {
      // Try parsing
      const result = parseHolo(code);

      if (result.errors && result.errors.length > 0) {
        for (const err of result.errors) {
          errors.push(`Line ${err.line}: ${err.message}`);
        }
      }

      // Check for common issues
      if (!code.includes('environment')) {
        suggestions.push('Consider adding an environment block for skybox and lighting');
      }

      if (!code.includes('@')) {
        suggestions.push('Add VR traits like @grabbable, @glowing for interactivity');
      }

      return {
        valid: errors.length === 0,
        errors,
        suggestions,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return { valid: false, errors, suggestions };
    }
  },

  /**
   * Create shareable links for X
   */
  async share(code: string, title: string): Promise<ShareResult> {
    // Encode code for URL
    const encoded = Buffer.from(code).toString('base64');
    const playgroundUrl = `https://play.holoscript.net?code=${encodeURIComponent(encoded)}`;

    // Generate tweet text
    const hashtags = '#HoloScript #VR #XR #Metaverse #3D';
    const tweetText = `🎮 ${title}

Built with HoloScript! Experience it in VR/AR:
${playgroundUrl}

${hashtags}`;

    return {
      playgroundUrl,
      tweetText,
      previewUrl: `${playgroundUrl}/preview`,
    };
  },

  /**
   * Suggest appropriate traits for an object
   */
  suggestTraits(objectDescription: string): string[] {
    const desc = objectDescription.toLowerCase();
    const traits: string[] = [];

    // Interaction traits
    if (desc.includes('grab') || desc.includes('pick up') || desc.includes('hold')) {
      traits.push('@grabbable');
    }
    if (desc.includes('throw')) {
      traits.push('@throwable');
    }
    if (desc.includes('click') || desc.includes('button') || desc.includes('press')) {
      traits.push('@clickable');
    }
    if (desc.includes('point') || desc.includes('teleport')) {
      traits.push('@pointable');
    }

    // Visual traits
    if (desc.includes('glow') || desc.includes('light') || desc.includes('luminous')) {
      traits.push('@glowing');
    }
    if (desc.includes('transparent') || desc.includes('glass') || desc.includes('see through')) {
      traits.push('@transparent');
    }
    if (desc.includes('animate') || desc.includes('move') || desc.includes('float')) {
      traits.push('@animated');
    }

    // Physics
    if (desc.includes('physics') || desc.includes('fall') || desc.includes('bounce')) {
      traits.push('@physics');
      traits.push('@collidable');
    }

    // Networking
    if (desc.includes('multiplayer') || desc.includes('shared') || desc.includes('sync')) {
      traits.push('@networked');
    }

    // Default if none found
    if (traits.length === 0) {
      traits.push('@pointable');
    }

    return traits;
  },
};

// Helper functions
function parseDescription(description: string): {
  sceneName: string;
  objects: { name: string; description: string }[];
  environment: string;
  summary: string;
} {
  // Extract scene name
  const nameMatch = description.match(
    /(?:a|an|the)?\s*([a-z]+(?:\s+[a-z]+)?)\s*(?:scene|world|room)/i
  );
  const sceneName = nameMatch ? capitalize(nameMatch[1]) : 'Generated Scene';

  // Extract objects
  const objectMatch = description.match(/(?:with|containing|featuring|has)\s+([^.]+)/i);
  const objects: { name: string; description: string }[] = [];

  if (objectMatch) {
    const items = objectMatch[1].split(/,\s*and\s*|,\s*|\s+and\s+/);
    for (const item of items) {
      if (item.trim()) {
        objects.push({
          name: extractName(item),
          description: item.trim(),
        });
      }
    }
  }

  // Determine environment
  let environment = 'gradient';
  const lower = description.toLowerCase();
  if (lower.includes('forest') || lower.includes('nature')) environment = 'forest';
  if (lower.includes('space') || lower.includes('galaxy')) environment = 'nebula';
  if (lower.includes('night')) environment = 'night';
  if (lower.includes('cave') || lower.includes('dark')) environment = 'dark';

  return {
    sceneName,
    objects: objects.length > 0 ? objects : [{ name: 'MainObject', description }],
    environment,
    summary: `${sceneName} with ${objects.length} objects`,
  };
}

function generateSceneCode(elements: ReturnType<typeof parseDescription>, style: string): string {
  const objects = elements.objects
    .map((obj) => {
      const traits = tools.suggestTraits(obj.description);
      const geometry = extractGeometry(obj.description);
      const color = extractColor(obj.description);

      return `    object "${obj.name}" ${traits.join(' ')} {
      geometry: "${geometry}"
      color: "${color}"
      position: [${randomPosition()}]
    }`;
    })
    .join('\n\n');

  const ambientLight = elements.environment === 'dark' ? 0.1 : 0.3;

  return `composition "${elements.sceneName}" {
  environment {
    skybox: "${elements.environment}"
    ambient_light: ${ambientLight}
${style !== 'minimal' ? '    fog: { enabled: true, density: 0.01 }' : ''}
  }

  spatial_group "Main" {
${objects}
  }
${style === 'production' ? generateLogicBlock() : ''}}`;
}

function generateLogicBlock(): string {
  return `
  logic {
    on_scene_start() {
      console.log("Scene loaded!")
    }
  }
`;
}

function extractGeometry(description: string): string {
  const lower = description.toLowerCase();
  const geometryMap: Record<string, string> = {
    cube: 'cube',
    box: 'cube',
    sphere: 'sphere',
    ball: 'sphere',
    orb: 'sphere',
    cylinder: 'cylinder',
    crystal: 'model/crystal.glb',
    tree: 'model/tree.glb',
    mushroom: 'model/mushroom.glb',
  };

  for (const [key, value] of Object.entries(geometryMap)) {
    if (lower.includes(key)) return value;
  }
  return 'sphere';
}

function extractColor(description: string): string {
  const lower = description.toLowerCase();
  const colorMap: Record<string, string> = {
    red: '#ff0000',
    blue: '#0000ff',
    green: '#00ff00',
    cyan: '#00ffff',
    purple: '#8800ff',
    gold: '#ffd700',
    white: '#ffffff',
    black: '#333333',
    glow: '#00ffff',
  };

  for (const [key, value] of Object.entries(colorMap)) {
    if (lower.includes(key)) return value;
  }
  return '#00ffff';
}

function extractName(description: string): string {
  const words = description.split(/\s+/);
  const last = words[words.length - 1];
  return capitalize(last.replace(/[^a-zA-Z0-9]/g, ''));
}

function randomPosition(): string {
  const x = (Math.random() * 4 - 2).toFixed(1);
  const y = (Math.random() * 2 + 0.5).toFixed(1);
  const z = (Math.random() * -3 - 1).toFixed(1);
  return `${x}, ${y}, ${z}`;
}

// Main workflow for Grok
export async function grokBuildScene(context: GrokContext): Promise<string> {
  const { userPrompt, platform } = context;

  // 1. Generate the scene
  console.log('🎨 Generating HoloScript scene...');
  const scene = await tools.generateScene(userPrompt, 'detailed');

  // 2. Validate
  console.log('✅ Validating code...');
  const validation = await tools.validate(scene.code);

  if (!validation.valid) {
    return `❌ Generated code has errors:\n${validation.errors.join('\n')}\n\nLet me fix that...`;
  }

  // 3. Create share link
  console.log('🔗 Creating share link...');
  const share = await tools.share(scene.code, scene.title);

  // 4. Format response
  if (platform === 'x') {
    return `🎮 **${scene.title}**

I built this VR scene for you! Here's the HoloScript code:

\`\`\`holo
${scene.code}
\`\`\`

**Try it now:** ${share.playgroundUrl}

**Stats:**
- ${scene.objectCount} objects
- ${scene.traits.length} VR traits: ${scene.traits.slice(0, 5).join(', ')}

${validation.suggestions.length > 0 ? `💡 **Tips:** ${validation.suggestions[0]}` : ''}

${share.tweetText}`;
  }

  return scene.code;
}

// Example usage
if (require.main === module) {
  grokBuildScene({
    userPrompt: 'Create a mystical forest with glowing mushrooms and a floating crystal',
    platform: 'x',
  }).then(console.log);
}

export { tools };
