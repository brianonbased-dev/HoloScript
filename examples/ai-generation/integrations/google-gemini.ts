/**
 * Google Gemini Integration for HoloScript
 *
 * Use Gemini's multimodal capabilities to generate VR scenes
 * from text, images, and even video references.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

// System instruction for HoloScript generation
const SYSTEM_INSTRUCTION = `You are a HoloScript expert. Generate valid HoloScript code for VR/AR scenes.

HoloScript uses .holo files with this structure:
\`\`\`holo
composition "Scene Name" {
  environment {
    skybox: "skybox_name"
    ambient_light: 0.3
  }
  
  object "ObjectName" @trait1 @trait2 {
    geometry: "sphere"
    position: [x, y, z]
    color: "#hexcolor"
  }
  
  logic {
    on_event { action }
  }
}
\`\`\`

Available traits:
- @grabbable, @throwable, @pointable, @hoverable (interaction)
- @collidable, @physics, @rigid, @trigger (physics)
- @glowing, @emissive, @transparent, @animated (visual)
- @networked, @synced, @persistent (multiplayer)
- @spatial_audio, @ambient (audio)

Always wrap code in \`\`\`holo blocks.`;

interface GenerationResult {
  code: string;
  explanation: string;
  suggestions: string[];
}

/**
 * Generate HoloScript from text description
 */
export async function generateFromText(prompt: string): Promise<GenerationResult> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const result = await model.generateContent([
    `Create a VR scene: ${prompt}
    
After the code, provide:
1. Brief scene explanation
2. 3 suggestions for enhancements`,
  ]);

  const text = result.response.text();

  // Parse response
  const codeMatch = text.match(/```holo\n([\s\S]*?)```/);
  const code = codeMatch ? codeMatch[1].trim() : '';

  const parts = text.split('```');
  const afterCode = parts[2] || '';

  const suggestionMatch = afterCode.match(/suggestions?:?\s*\n([\s\S]*)/i);
  const suggestions = suggestionMatch
    ? suggestionMatch[1]
        .split('\n')
        .filter((s) => s.trim().match(/^\d+\.|^-/))
        .map((s) => s.replace(/^\d+\.|-/, '').trim())
    : [];

  return {
    code,
    explanation: parts[0]?.trim() || 'VR scene generated',
    suggestions: suggestions.slice(0, 3),
  };
}

/**
 * Generate HoloScript from reference image
 */
export async function generateFromImage(
  imageData: Buffer | string,
  mimeType: string = 'image/png',
  context?: string
): Promise<GenerationResult> {
  // Gemini 2.0 has unified multimodal support (no separate -vision model)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  // Handle base64 or buffer
  const base64 = typeof imageData === 'string' ? imageData : imageData.toString('base64');

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: base64,
      },
    },
    `Recreate this scene in HoloScript VR format. ${context || ''}
    
Make it interactive with appropriate traits.
Include environment settings that match the mood.`,
  ]);

  const text = result.response.text();
  const codeMatch = text.match(/```holo\n([\s\S]*?)```/);

  return {
    code: codeMatch ? codeMatch[1].trim() : '',
    explanation: text.split('```')[0]?.trim() || 'Scene recreated from image',
    suggestions: [],
  };
}

/**
 * Generate from video reference (analyze key frames)
 */
export async function generateFromVideo(
  videoUrl: string,
  context?: string
): Promise<GenerationResult> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const result = await model.generateContent([
    {
      fileData: {
        mimeType: 'video/mp4',
        fileUri: videoUrl,
      },
    },
    `Analyze this video and create a HoloScript VR scene that captures its essence.
    
${context || 'Focus on the key visual elements and atmosphere.'}

Include:
- Environment that matches the video's setting
- Key objects that appear
- Appropriate interactivity`,
  ]);

  const text = result.response.text();
  const codeMatch = text.match(/```holo\n([\s\S]*?)```/);

  return {
    code: codeMatch ? codeMatch[1].trim() : '',
    explanation: text.split('```')[0]?.trim() || 'Scene generated from video',
    suggestions: [],
  };
}

/**
 * Multi-turn scene building with context
 */
export class GeminiSceneBuilder {
  private model;
  private chat;

  constructor() {
    this.model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: SYSTEM_INSTRUCTION,
    });
    this.chat = this.model.startChat();
  }

  async start(initialPrompt: string): Promise<GenerationResult> {
    const result = await this.chat.sendMessage(`Create a VR scene: ${initialPrompt}`);
    return this.parseResponse(result.response.text());
  }

  async refine(feedback: string): Promise<GenerationResult> {
    const result = await this.chat.sendMessage(feedback);
    return this.parseResponse(result.response.text());
  }

  async addObject(description: string): Promise<GenerationResult> {
    const result = await this.chat.sendMessage(
      `Add to the scene: ${description}. Show the complete updated code.`
    );
    return this.parseResponse(result.response.text());
  }

  private parseResponse(text: string): GenerationResult {
    const codeMatch = text.match(/```holo\n([\s\S]*?)```/);
    return {
      code: codeMatch ? codeMatch[1].trim() : '',
      explanation: text.split('```')[0]?.trim() || '',
      suggestions: [],
    };
  }
}

/**
 * Grounded generation with search (for real-world references)
 */
export async function generateGrounded(
  prompt: string,
  searchContext: boolean = true
): Promise<GenerationResult> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_INSTRUCTION,
    // Enable grounding with Google Search
    tools: searchContext ? [{ googleSearch: {} }] : undefined,
  });

  const result = await model.generateContent([
    `Create an accurate VR recreation: ${prompt}

Use real-world references for accuracy.
Include historically/architecturally accurate details.`,
  ]);

  const text = result.response.text();
  const codeMatch = text.match(/```holo\n([\s\S]*?)```/);

  return {
    code: codeMatch ? codeMatch[1].trim() : '',
    explanation: text.split('```')[0]?.trim() || 'Grounded scene generated',
    suggestions: [],
  };
}

// Example usage
async function main() {
  // Text-based generation
  console.log('=== Text Generation ===');
  const scene = await generateFromText('A Japanese temple garden with a koi pond and stone bridge');
  console.log(scene.code);
  console.log(`\nSuggestions: ${scene.suggestions.join(', ')}`);

  // Multi-turn building
  console.log('\n=== Multi-turn Building ===');
  const builder = new GeminiSceneBuilder();
  await builder.start('An art gallery');
  await builder.addObject('A sculpture in the center');
  const final = await builder.refine('Make the lighting more dramatic');
  console.log(final.code);

  // Grounded generation
  console.log('\n=== Grounded Generation ===');
  const historic = await generateGrounded('The interior of the Sistine Chapel');
  console.log(historic.code);

  // Image-based generation (requires image)
  // const fromImage = await generateFromImage(
  //   fs.readFileSync('reference.png'),
  //   'image/png',
  //   'Make it a playable VR environment'
  // );
}

main().catch(console.error);
