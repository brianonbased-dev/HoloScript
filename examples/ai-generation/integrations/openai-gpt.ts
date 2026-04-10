/**
 * OpenAI GPT Integration for HoloScript
 *
 * Use GPT-4 to generate HoloScript scenes with function calling
 * for structured output and validation.
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// HoloScript generation tools for function calling
const HOLOSCRIPT_TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'generate_holoscript',
      description: 'Generate a HoloScript scene from a description',
      parameters: {
        type: 'object',
        properties: {
          composition_name: {
            type: 'string',
            description: 'Name of the scene composition',
          },
          environment: {
            type: 'object',
            properties: {
              skybox: { type: 'string' },
              ambient_light: { type: 'number' },
              fog: { type: 'boolean' },
            },
          },
          objects: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                geometry: { type: 'string' },
                position: {
                  type: 'array',
                  items: { type: 'number' },
                  minItems: 3,
                  maxItems: 3,
                },
                traits: {
                  type: 'array',
                  items: { type: 'string' },
                },
                color: { type: 'string' },
                scale: { type: 'number' },
              },
              required: ['name', 'geometry', 'position'],
            },
          },
          logic: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                event: { type: 'string' },
                action: { type: 'string' },
              },
            },
          },
        },
        required: ['composition_name', 'objects'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_traits',
      description: 'Suggest appropriate VR traits for an object',
      parameters: {
        type: 'object',
        properties: {
          object_type: { type: 'string' },
          purpose: { type: 'string' },
        },
        required: ['object_type'],
      },
    },
  },
];

// System prompt
const SYSTEM_PROMPT = `You are a HoloScript scene generator. When asked to create VR scenes, use the generate_holoscript function with structured data.

Available traits:
- Interaction: @grabbable, @throwable, @pointable, @hoverable, @clickable
- Physics: @collidable, @physics, @rigid, @trigger
- Visual: @glowing, @emissive, @transparent, @animated
- Networking: @networked, @synced, @persistent
- Spatial: @anchor, @tracked, @billboard

Geometry options: cube, sphere, cylinder, cone, torus, plane, capsule, or "path/to/model.glb"`;

interface SceneData {
  composition_name: string;
  environment?: {
    skybox?: string;
    ambient_light?: number;
    fog?: boolean;
  };
  objects: Array<{
    name: string;
    geometry: string;
    position: [number, number, number];
    traits?: string[];
    color?: string;
    scale?: number;
  }>;
  logic?: Array<{
    event: string;
    action: string;
  }>;
}

/**
 * Convert structured scene data to HoloScript code
 */
function sceneDataToHoloScript(data: SceneData): string {
  let code = `composition "${data.composition_name}" {\n`;

  // Environment
  if (data.environment) {
    code += '  environment {\n';
    if (data.environment.skybox) {
      code += `    skybox: "${data.environment.skybox}"\n`;
    }
    if (data.environment.ambient_light !== undefined) {
      code += `    ambient_light: ${data.environment.ambient_light}\n`;
    }
    if (data.environment.fog) {
      code += '    fog: true\n';
    }
    code += '  }\n\n';
  }

  // Objects
  for (const obj of data.objects) {
    const traits = obj.traits?.map((t) => (t.startsWith('@') ? t : `@${t}`)).join(' ') || '';
    code += `  object "${obj.name}" ${traits} {\n`;
    code += `    geometry: "${obj.geometry}"\n`;
    code += `    position: [${obj.position.join(', ')}]\n`;
    if (obj.color) {
      code += `    color: "${obj.color}"\n`;
    }
    if (obj.scale && obj.scale !== 1) {
      code += `    scale: ${obj.scale}\n`;
    }
    code += '  }\n\n';
  }

  // Logic
  if (data.logic && data.logic.length > 0) {
    code += '  logic {\n';
    for (const rule of data.logic) {
      code += `    ${rule.event} {\n`;
      code += `      ${rule.action}\n`;
      code += '    }\n';
    }
    code += '  }\n';
  }

  code += '}';
  return code;
}

/**
 * Generate HoloScript using GPT-4 with function calling
 */
export async function generateWithGPT(prompt: string): Promise<{
  code: string;
  data: SceneData;
}> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Create a VR scene: ${prompt}` },
    ],
    tools: HOLOSCRIPT_TOOLS,
    tool_choice: { type: 'function', function: { name: 'generate_holoscript' } },
  });

  const toolCall = response.choices[0].message.tool_calls?.[0];
  if (!toolCall || toolCall.function.name !== 'generate_holoscript') {
    throw new Error('Expected generate_holoscript function call');
  }

  const data: SceneData = JSON.parse(toolCall.function.arguments);
  const code = sceneDataToHoloScript(data);

  return { code, data };
}

/**
 * Stream generation for real-time feedback
 */
export async function* streamGeneration(prompt: string): AsyncGenerator<string> {
  const stream = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Create a VR scene and respond with HoloScript code: ${prompt}`,
      },
    ],
    stream: true,
  });

  let inCodeBlock = false;
  let buffer = '';

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    buffer += content;

    // Detect code block boundaries
    if (buffer.includes('```holo')) {
      inCodeBlock = true;
      buffer = buffer.split('```holo')[1] || '';
    }

    if (inCodeBlock && buffer.includes('```')) {
      const code = buffer.split('```')[0];
      yield code;
      return;
    }

    if (inCodeBlock) {
      yield content;
    }
  }
}

/**
 * Vision-based scene generation from reference image
 */
export async function generateFromImage(
  imageUrl: string,
  additionalContext?: string
): Promise<{ code: string; data: SceneData }> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: imageUrl },
          },
          {
            type: 'text',
            text: `Recreate this scene in HoloScript. ${additionalContext || ''}`,
          },
        ],
      },
    ],
    tools: HOLOSCRIPT_TOOLS,
    tool_choice: { type: 'function', function: { name: 'generate_holoscript' } },
  });

  const toolCall = response.choices[0].message.tool_calls?.[0];
  if (!toolCall) {
    throw new Error('No function call in response');
  }

  const data: SceneData = JSON.parse(toolCall.function.arguments);
  return { code: sceneDataToHoloScript(data), data };
}

// Example usage
async function main() {
  // Structured generation
  console.log('=== Structured Generation ===');
  const result = await generateWithGPT(
    "A space station control room with holographic displays and a captain's chair"
  );
  console.log(result.code);
  console.log(`\nObjects: ${result.data.objects.length}`);

  // Streaming generation
  console.log('\n=== Streaming Generation ===');
  process.stdout.write('Generating: ');
  for await (const chunk of streamGeneration('underwater coral reef')) {
    process.stdout.write(chunk);
  }
  console.log('\n');

  // Vision-based (requires image URL)
  // const fromImage = await generateFromImage(
  //   'https://example.com/reference-scene.jpg',
  //   'Make it interactive and add ambient sounds'
  // );
}

main().catch(console.error);
