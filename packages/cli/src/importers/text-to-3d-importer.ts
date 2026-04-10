/**
 * Text-to-3D Importer
 *
 * Converts text descriptions into .holo files by:
 * 1. Calling a text-to-3D provider (Meshy or Tripo) to generate a glTF model
 * 2. Running the glTF importer to convert to .holo
 * 3. Using trait suggestion from description keywords
 * 4. Merging inferred traits from both model metadata + NLP
 *
 * Environment: MESHY_API_KEY and/or TRIPO_API_KEY
 */

import * as fs from 'fs';
import * as path from 'path';
import { importGltf } from './gltf-importer';
import { suggestTraits } from '../traits';

// =============================================================================
// Provider Interface
// =============================================================================

export interface TextTo3DResult {
  modelUrl: string;
  format: 'glb' | 'gltf' | 'fbx' | 'obj';
  metadata: {
    provider: string;
    jobId: string;
    description: string;
    generationTimeMs: number;
    thumbnailUrl?: string;
  };
}

export interface TextTo3DProvider {
  name: string;
  generateModel(
    description: string,
    opts?: {
      style?: 'realistic' | 'cartoon' | 'low-poly' | 'pbr';
      format?: 'glb' | 'gltf';
    }
  ): Promise<TextTo3DResult>;
}

// =============================================================================
// Meshy Provider (meshy.ai)
// =============================================================================

export class MeshyProvider implements TextTo3DProvider {
  name = 'meshy';
  private apiKey: string;
  private baseUrl = 'https://api.meshy.ai/v2';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.MESHY_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('MESHY_API_KEY required. Set it in .env or pass to constructor.');
    }
  }

  async generateModel(
    description: string,
    opts?: {
      style?: 'realistic' | 'cartoon' | 'low-poly' | 'pbr';
      format?: 'glb' | 'gltf';
    }
  ): Promise<TextTo3DResult> {
    const start = Date.now();

    // Step 1: Submit text-to-3D job
    const submitResponse = await fetch(`${this.baseUrl}/text-to-3d`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        mode: 'preview',
        prompt: description,
        art_style: opts?.style || 'pbr',
        negative_prompt: 'low quality, blurry, distorted',
      }),
    });

    if (!submitResponse.ok) {
      const err = await submitResponse.text();
      throw new Error(`Meshy submit failed (${submitResponse.status}): ${err}`);
    }

    const { result: jobId } = (await submitResponse.json()) as { result: string };

    // Step 2: Poll for completion (max 5 minutes)
    const maxPollMs = 300_000;
    const pollInterval = 5_000;
    let elapsed = 0;

    while (elapsed < maxPollMs) {
      await sleep(pollInterval);
      elapsed += pollInterval;

      const statusResponse = await fetch(`${this.baseUrl}/text-to-3d/${jobId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!statusResponse.ok) continue;

      const job = (await statusResponse.json()) as {
        status: string;
        model_urls?: { glb?: string; gltf?: string };
        thumbnail_url?: string;
      };

      if (job.status === 'SUCCEEDED' && job.model_urls) {
        const format = opts?.format || 'glb';
        const modelUrl = job.model_urls[format] || job.model_urls.glb || '';

        return {
          modelUrl,
          format: format as 'glb' | 'gltf',
          metadata: {
            provider: 'meshy',
            jobId,
            description,
            generationTimeMs: Date.now() - start,
            thumbnailUrl: job.thumbnail_url,
          },
        };
      }

      if (job.status === 'FAILED') {
        throw new Error(`Meshy job ${jobId} failed`);
      }
    }

    throw new Error(`Meshy job ${jobId} timed out after ${maxPollMs / 1000}s`);
  }
}

// =============================================================================
// Tripo Provider (tripo3d.ai)
// =============================================================================

export class TripoProvider implements TextTo3DProvider {
  name = 'tripo';
  private apiKey: string;
  private baseUrl = 'https://api.tripo3d.ai/v2/openapi';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TRIPO_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('TRIPO_API_KEY required. Set it in .env or pass to constructor.');
    }
  }

  async generateModel(
    description: string,
    _opts?: {
      style?: 'realistic' | 'cartoon' | 'low-poly' | 'pbr';
      format?: 'glb' | 'gltf';
    }
  ): Promise<TextTo3DResult> {
    const start = Date.now();

    // Step 1: Submit task
    const submitResponse = await fetch(`${this.baseUrl}/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        type: 'text_to_model',
        prompt: description,
      }),
    });

    if (!submitResponse.ok) {
      const err = await submitResponse.text();
      throw new Error(`Tripo submit failed (${submitResponse.status}): ${err}`);
    }

    const { data } = (await submitResponse.json()) as { data: { task_id: string } };
    const taskId = data.task_id;

    // Step 2: Poll for completion
    const maxPollMs = 300_000;
    const pollInterval = 5_000;
    let elapsed = 0;

    while (elapsed < maxPollMs) {
      await sleep(pollInterval);
      elapsed += pollInterval;

      const statusResponse = await fetch(`${this.baseUrl}/task/${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!statusResponse.ok) continue;

      const result = (await statusResponse.json()) as {
        data: {
          status: string;
          output?: { model?: string };
        };
      };

      if (result.data.status === 'success' && result.data.output?.model) {
        return {
          modelUrl: result.data.output.model,
          format: 'glb',
          metadata: {
            provider: 'tripo',
            jobId: taskId,
            description,
            generationTimeMs: Date.now() - start,
          },
        };
      }

      if (result.data.status === 'failed') {
        throw new Error(`Tripo task ${taskId} failed`);
      }
    }

    throw new Error(`Tripo task ${taskId} timed out after ${maxPollMs / 1000}s`);
  }
}

// =============================================================================
// Pipeline: Text -> 3D Model -> .holo
// =============================================================================

export interface TextTo3DHoloOptions {
  description: string;
  provider: TextTo3DProvider;
  outputDir?: string;
  objectName?: string;
  style?: 'realistic' | 'cartoon' | 'low-poly' | 'pbr';
}

export interface TextTo3DHoloResult {
  holoCode: string;
  holoFilePath?: string;
  modelFilePath: string;
  traits: string[];
  metadata: TextTo3DResult['metadata'];
}

export async function textTo3DToHolo(opts: TextTo3DHoloOptions): Promise<TextTo3DHoloResult> {
  const { description, provider, style } = opts;
  const outputDir = opts.outputDir || process.cwd();
  const objectName = opts.objectName || sanitizeName(description);

  // Step 1: Generate 3D model from text

  const result = await provider.generateModel(description, { style, format: 'glb' });

  // Step 2: Download the model file

  const modelFileName = `${objectName}.${result.format}`;
  const modelFilePath = path.join(outputDir, modelFileName);

  const modelResponse = await fetch(result.modelUrl);
  if (!modelResponse.ok) {
    throw new Error(`Failed to download model: ${modelResponse.status}`);
  }
  const modelBuffer = Buffer.from(await modelResponse.arrayBuffer());
  fs.writeFileSync(modelFilePath, modelBuffer);

  // Step 3: Run glTF importer to get base .holo code

  let baseHolo: string;
  try {
    baseHolo = importGltf(modelFilePath);
  } catch {
    // If glTF import fails (e.g. complex model), generate minimal .holo
    baseHolo = `composition "${objectName}" {\n  object "${objectName}" {\n    model: "${modelFileName}"\n  }\n}`;
  }

  // Step 4: Suggest traits from the text description

  const suggestedTraits = await suggestTraits(description);
  const traitNames = suggestedTraits.map((t: { name: string }) => t.name);

  // Step 5: Merge traits into the .holo code
  const holoCode = mergeTraitsIntoHolo(baseHolo, objectName, traitNames, modelFileName);

  // Step 6: Optionally write .holo file
  let holoFilePath: string | undefined;
  if (outputDir) {
    holoFilePath = path.join(outputDir, `${objectName}.holo`);
    fs.writeFileSync(holoFilePath, holoCode, 'utf-8');

  }

  return {
    holoCode,
    holoFilePath,
    modelFilePath,
    traits: traitNames,
    metadata: result.metadata,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeName(description: string): string {
  return (
    description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || 'generated_object'
  );
}

function mergeTraitsIntoHolo(
  baseHolo: string,
  objectName: string,
  traits: string[],
  modelFile: string
): string {
  if (traits.length === 0) return baseHolo;

  const traitAnnotations = traits.map((t) => `@${t}`).join(' ');

  // Try to inject traits into existing object declaration
  const objectPattern = new RegExp(`(object\\s+"${objectName}")(\\s*\\{)`);
  if (objectPattern.test(baseHolo)) {
    return baseHolo.replace(objectPattern, `$1 ${traitAnnotations}$2`);
  }

  // Fallback: generate a fresh .holo with the traits and model reference
  return `composition "${objectName}" {
  object "${objectName}" ${traitAnnotations} {
    model: "${modelFile}"
  }
}
`;
}
