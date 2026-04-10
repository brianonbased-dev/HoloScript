/**
 * Ollama Local Model Integration for HoloScript
 *
 * Run HoloScript generation locally with Ollama for privacy,
 * offline use, and cost savings.
 */

import { Ollama } from 'ollama';

const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || 'http://localhost:11434',
});

// Recommended models for HoloScript generation
const RECOMMENDED_MODELS = {
  fast: 'llama3.2:3b', // Quick responses, good for simple scenes
  balanced: 'llama3.1:8b', // Good balance of speed and quality
  quality: 'llama3.1:70b', // Best quality, slower
  coding: 'codellama:13b', // Specialized for code generation
  mixtral: 'mixtral:8x7b', // Great for complex reasoning
};

// System prompt optimized for local models
const SYSTEM_PROMPT = `You are a HoloScript code generator. Generate ONLY valid HoloScript code, no explanations.

HoloScript syntax:
\`\`\`
composition "Scene Name" {
  environment {
    skybox: "sunset"
    ambient_light: 0.3
  }

  object "ObjectName" @trait1 @trait2 {
    geometry: "sphere"
    position: [x, y, z]
    color: "#hexcolor"
  }
}
\`\`\`

Traits: @grabbable @collidable @glowing @physics @networked @hoverable @transparent
Geometry: cube sphere cylinder cone torus plane capsule "path.glb"

Respond with code only, wrapped in \`\`\`holo blocks.`;

interface GenerationOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Generate HoloScript scene using local Ollama model
 */
export async function generateLocal(
  prompt: string,
  options: GenerationOptions = {}
): Promise<string> {
  const model = options.model || RECOMMENDED_MODELS.balanced;

  const response = await ollama.chat({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Create a VR scene: ${prompt}` },
    ],
    options: {
      temperature: options.temperature ?? 0.7,
      num_predict: options.maxTokens ?? 2048,
    },
  });

  // Extract code from response
  const codeMatch = response.message.content.match(/```(?:holo|holoscript)?\n([\s\S]*?)```/);
  return codeMatch ? codeMatch[1].trim() : response.message.content.trim();
}

/**
 * Stream generation for real-time display
 */
export async function* streamLocal(
  prompt: string,
  options: GenerationOptions = {}
): AsyncGenerator<string> {
  const model = options.model || RECOMMENDED_MODELS.balanced;

  const response = await ollama.chat({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Create a VR scene: ${prompt}` },
    ],
    stream: true,
    options: {
      temperature: options.temperature ?? 0.7,
      num_predict: options.maxTokens ?? 2048,
    },
  });

  let inCodeBlock = false;
  let buffer = '';
  let codeStarted = false;

  for await (const chunk of response) {
    const content = chunk.message.content;
    buffer += content;

    // Detect code block start
    if (!codeStarted && buffer.includes('```')) {
      inCodeBlock = true;
      const afterTicks = buffer.split('```')[1];
      // Skip language identifier line
      if (afterTicks?.includes('\n')) {
        codeStarted = true;
        const codeContent = afterTicks.split('\n').slice(1).join('\n');
        if (codeContent) yield codeContent;
        buffer = codeContent;
      }
      continue;
    }

    if (codeStarted) {
      // Check for end of code block
      if (content.includes('```')) {
        const remaining = content.split('```')[0];
        if (remaining) yield remaining;
        return;
      }
      yield content;
    }
  }
}

/**
 * Batch generation with different models for comparison
 */
export async function compareModels(
  prompt: string,
  models: string[] = [RECOMMENDED_MODELS.fast, RECOMMENDED_MODELS.balanced]
): Promise<Map<string, { code: string; duration: number }>> {
  const results = new Map();

  for (const model of models) {
    const start = Date.now();
    try {
      const code = await generateLocal(prompt, { model });
      results.set(model, {
        code,
        duration: Date.now() - start,
      });
    } catch (error) {
      results.set(model, {
        code: `// Error: ${error}`,
        duration: Date.now() - start,
      });
    }
  }

  return results;
}

/**
 * Interactive refinement loop
 */
export async function* interactiveRefinement(
  initialPrompt: string,
  options: GenerationOptions = {}
): AsyncGenerator<{ code: string; iteration: number }> {
  let currentCode = await generateLocal(initialPrompt, options);
  let iteration = 1;

  yield { code: currentCode, iteration };

  // This would be called by external input
  while (true) {
    const feedback: string = yield { code: currentCode, iteration };

    if (!feedback || feedback === 'done') break;

    const refinedPrompt = `Current HoloScript code:
\`\`\`holo
${currentCode}
\`\`\`

User feedback: ${feedback}

Generate an improved version based on the feedback. Output only the new code.`;

    currentCode = await generateLocal(refinedPrompt, options);
    iteration++;

    yield { code: currentCode, iteration };
  }
}

/**
 * Check available models
 */
export async function listModels(): Promise<string[]> {
  const models = await ollama.list();
  return models.models.map((m) => m.name);
}

/**
 * Pull a recommended model
 */
export async function pullModel(model: string = RECOMMENDED_MODELS.balanced): Promise<void> {
  console.log(`Pulling ${model}...`);

  const response = await ollama.pull({ model, stream: true });

  for await (const progress of response) {
    if (progress.total && progress.completed) {
      const percent = Math.round((progress.completed / progress.total) * 100);
      process.stdout.write(`\rDownloading: ${percent}%`);
    }
  }

  console.log('\nModel ready!');
}

/**
 * Create a fine-tuned Modelfile for HoloScript
 */
export function createModelfile(baseModel: string = 'llama3.1'): string {
  return `FROM ${baseModel}

SYSTEM """${SYSTEM_PROMPT}"""

PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER num_predict 2048

# HoloScript-specific examples
MESSAGE user Create a simple cube
MESSAGE assistant \`\`\`holo
composition "Simple Cube" {
  object "Cube" @grabbable {
    geometry: "cube"
    position: [0, 1, 0]
    color: "#4488ff"
  }
}
\`\`\`

MESSAGE user Create a bouncing ball
MESSAGE assistant \`\`\`holo
composition "Bouncing Ball" {
  object "Ball" @physics @collidable {
    geometry: "sphere"
    position: [0, 5, 0]
    color: "#ff4444"
  }
  
  object "Floor" @collidable {
    geometry: "plane"
    position: [0, 0, 0]
    scale: 10
  }
}
\`\`\``;
}

// Example usage
async function main() {
  // List available models
  console.log('=== Available Models ===');
  const models = await listModels();
  console.log(models.join('\n'));

  // Simple generation
  console.log('\n=== Simple Generation ===');
  const scene = await generateLocal('a forest clearing with fireflies');
  console.log(scene);

  // Streaming generation
  console.log('\n=== Streaming Generation ===');
  for await (const chunk of streamLocal('an underwater cave')) {
    process.stdout.write(chunk);
  }
  console.log('\n');

  // Compare models
  console.log('\n=== Model Comparison ===');
  const comparison = await compareModels('a sci-fi corridor');
  for (const [model, result] of comparison) {
    console.log(`\n${model} (${result.duration}ms):`);
    console.log(result.code.slice(0, 200) + '...');
  }

  // Generate Modelfile for custom training
  console.log('\n=== Custom Modelfile ===');
  console.log(createModelfile());
}

main().catch(console.error);
