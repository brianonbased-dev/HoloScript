/**
 * Anthropic Claude Integration for HoloScript
 *
 * Use Claude to generate, validate, and iterate on HoloScript scenes
 * with advanced reasoning and multi-turn conversations.
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// System prompt for HoloScript generation
const HOLOSCRIPT_SYSTEM = `You are an expert HoloScript developer. HoloScript is a declarative language for VR/AR/XR experiences.

Key syntax:
- \`.holo\` files use \`composition "Name" { ... }\` structure
- Objects: \`object "Name" @trait1 @trait2 { properties }\`
- Common traits: @grabbable, @collidable, @glowing, @networked, @physics
- Geometry: cube, sphere, cylinder, cone, torus, plane, "model.glb"

Always respond with valid HoloScript code wrapped in \`\`\`holo blocks.
Include appropriate traits for interactivity.
Add comments explaining complex sections.`;

interface SceneRequest {
  description: string;
  style?: 'realistic' | 'stylized' | 'minimal';
  interactivity?: 'low' | 'medium' | 'high';
}

interface GeneratedScene {
  code: string;
  explanation: string;
  traits: string[];
  objectCount: number;
}

/**
 * Generate a HoloScript scene from natural language using Claude
 */
export async function generateWithClaude(request: SceneRequest): Promise<GeneratedScene> {
  const interactivityHint = {
    low: 'Use minimal traits, focus on static visuals',
    medium: 'Add @hoverable, @pointable for basic interactions',
    high: 'Include @grabbable, @physics, @networked for full interactivity',
  }[request.interactivity || 'medium'];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: HOLOSCRIPT_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Create a HoloScript scene: ${request.description}

Style: ${request.style || 'stylized'}
Interactivity: ${interactivityHint}

Respond with:
1. The complete .holo code
2. Brief explanation of the scene
3. List of traits used`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  // Parse the response
  const codeMatch = content.text.match(/```holo\n([\s\S]*?)```/);
  const code = codeMatch ? codeMatch[1].trim() : '';

  // Extract traits from code
  const traitMatches = code.match(/@\w+/g) || [];
  const traits = [...new Set(traitMatches)];

  // Count objects
  const objectCount = (code.match(/object\s+"/g) || []).length;

  return {
    code,
    explanation: content.text.split('```')[0].trim(),
    traits,
    objectCount,
  };
}

/**
 * Iterative refinement - improve a scene based on feedback
 */
export async function refineScene(currentCode: string, feedback: string): Promise<GeneratedScene> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: HOLOSCRIPT_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Here's my current HoloScript scene:

\`\`\`holo
${currentCode}
\`\`\`

Please improve it based on this feedback: ${feedback}

Respond with the updated code and explain what you changed.`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  const codeMatch = content.text.match(/```holo\n([\s\S]*?)```/);
  const code = codeMatch ? codeMatch[1].trim() : currentCode;
  const traitMatches = code.match(/@\w+/g) || [];

  return {
    code,
    explanation: content.text.split('```')[2]?.trim() || 'Scene refined',
    traits: [...new Set(traitMatches)],
    objectCount: (code.match(/object\s+"/g) || []).length,
  };
}

/**
 * Multi-turn conversation for complex scene building
 */
export class ClaudeSceneBuilder {
  private messages: Anthropic.MessageParam[] = [];

  async start(initialPrompt: string): Promise<GeneratedScene> {
    this.messages = [{ role: 'user', content: initialPrompt }];

    return this.sendAndParse();
  }

  async addRequest(request: string): Promise<GeneratedScene> {
    this.messages.push({ role: 'user', content: request });
    return this.sendAndParse();
  }

  private async sendAndParse(): Promise<GeneratedScene> {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: HOLOSCRIPT_SYSTEM,
      messages: this.messages,
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Add assistant response to history
    this.messages.push({ role: 'assistant', content: content.text });

    const codeMatch = content.text.match(/```holo\n([\s\S]*?)```/);
    const code = codeMatch ? codeMatch[1].trim() : '';
    const traitMatches = code.match(/@\w+/g) || [];

    return {
      code,
      explanation: content.text.split('```')[0].trim(),
      traits: [...new Set(traitMatches)],
      objectCount: (code.match(/object\s+"/g) || []).length,
    };
  }
}

// Example usage
async function main() {
  // Single generation
  const scene = await generateWithClaude({
    description: 'A zen garden with a koi pond and stone lanterns',
    style: 'stylized',
    interactivity: 'medium',
  });

  console.log('Generated scene:');
  console.log(scene.code);
  console.log(`\nTraits used: ${scene.traits.join(', ')}`);
  console.log(`Objects: ${scene.objectCount}`);

  // Iterative refinement
  const refined = await refineScene(
    scene.code,
    'Add ambient sounds and make the lanterns glow at night'
  );
  console.log('\nRefined scene:');
  console.log(refined.code);

  // Multi-turn building
  const builder = new ClaudeSceneBuilder();
  await builder.start('Create a medieval tavern interior');
  await builder.addRequest('Add a fireplace with crackling fire');
  const final = await builder.addRequest('Add some NPCs - a bartender and patrons');
  console.log('\nFinal tavern scene:');
  console.log(final.code);
}

main().catch(console.error);
