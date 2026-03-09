/**
 * aiCharacterGeneration.ts — AI Character Generation Service
 *
 * MEME-018: AI character creation (Meshy/Rodin APIs)
 *
 * Features:
 * - Text-to-3D character generation
 * - Image-to-3D character generation
 * - Progress polling and status tracking
 * - Multiple AI provider support (Meshy, Rodin)
 * - Fallback handling
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type AIProvider = 'meshy' | 'rodin';

export interface GenerationRequest {
  provider: AIProvider;
  prompt: string;
  imageUrl?: string; // For image-to-3D
  style?: 'realistic' | 'stylized' | 'anime' | 'cartoon';
  quality?: 'draft' | 'standard' | 'high';
}

export interface GenerationStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  glbUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  estimatedTimeRemaining?: number; // seconds
}

// ─── API Configuration ───────────────────────────────────────────────────────

/**
 * Get API key from localStorage (transitioning to HoloScript Cloud Pro subscription)
 */
function getAPIKey(service: 'meshy' | 'rodin'): string {
  if (typeof window === 'undefined') return '';

  const storageKey = service === 'meshy' ? 'holoscript_meshy_api_key' : 'holoscript_rodin_api_key';

  return localStorage.getItem(storageKey) || '';
}

/**
 * API configuration
 * Uses localStorage for API keys (transitioning to HoloScript Cloud vision model)
 */
function getAPIConfig() {
  return {
    meshy: {
      baseUrl: 'https://api.meshy.ai/v2',
      apiKey: getAPIKey('meshy'),
    },
    rodin: {
      baseUrl: 'https://api.rodin.ai/v1',
      apiKey: getAPIKey('rodin'),
    },
  };
}

// ─── Mock Mode (Development) ─────────────────────────────────────────────────

/**
 * Check if mock mode should be used
 * Mock mode is enabled when no API keys are configured
 */
function shouldUseMockMode(): boolean {
  const config = getAPIConfig();
  return !config.meshy.apiKey && !config.rodin.apiKey;
}

/**
 * Mock generation (simulates 30 second wait)
 */
async function mockGeneration(request: GenerationRequest): Promise<GenerationStatus> {
  const id = `mock-${Date.now()}`;

  // Simulate processing time
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return {
    id,
    status: 'completed',
    progress: 100,
    // Use a sample GLB model for development
    glbUrl:
      'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMan/glTF/CesiumMan.gltf',
    thumbnailUrl:
      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="%231a1a2e"/><text x="50%" y="50%" font-size="100" text-anchor="middle" dy=".3em">🤖</text></svg>',
  };
}

// ─── Meshy API Implementation ────────────────────────────────────────────────

/**
 * Generate character using Meshy API
 * Docs: https://docs.meshy.ai/api-text-to-3d
 */
async function generateWithMeshy(request: GenerationRequest): Promise<string> {
  const response = await fetch(`${getAPIConfig().meshy.baseUrl}/text-to-3d`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAPIConfig().meshy.apiKey}`,
    },
    body: JSON.stringify({
      object_prompt: request.prompt,
      style_prompt: request.style || 'stylized',
      enable_pbr: true,
      negative_prompt: 'low quality, blurry, distorted',
      art_style: request.style === 'realistic' ? 'realistic' : 'cartoon-line-art',
      topology: 'quad',
    }),
  });

  if (!response.ok) {
    throw new Error(`Meshy API error: ${response.status}`);
  }

  const data = await response.json();
  return data.result; // Task ID
}

/**
 * Poll Meshy task status
 */
async function pollMeshyStatus(taskId: string): Promise<GenerationStatus> {
  const response = await fetch(`${getAPIConfig().meshy.baseUrl}/text-to-3d/${taskId}`, {
    headers: {
      Authorization: `Bearer ${getAPIConfig().meshy.apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Meshy API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    id: taskId,
    status:
      data.status === 'SUCCEEDED'
        ? 'completed'
        : data.status === 'FAILED'
          ? 'failed'
          : 'processing',
    progress: data.progress || 0,
    glbUrl: data.model_urls?.glb,
    thumbnailUrl: data.thumbnail_url,
    error: data.status === 'FAILED' ? 'Generation failed' : undefined,
    estimatedTimeRemaining:
      data.status === 'PENDING' ? 120 : data.status === 'IN_PROGRESS' ? 60 : 0,
  };
}

// ─── Rodin API Implementation ────────────────────────────────────────────────

/**
 * Generate character using Rodin API
 * Docs: https://docs.rodin.ai/api-reference
 */
async function generateWithRodin(request: GenerationRequest): Promise<string> {
  const response = await fetch(`${getAPIConfig().rodin.baseUrl}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAPIConfig().rodin.apiKey}`,
    },
    body: JSON.stringify({
      prompt: request.prompt,
      image_url: request.imageUrl,
      style: request.style || 'stylized',
      quality: request.quality || 'standard',
    }),
  });

  if (!response.ok) {
    throw new Error(`Rodin API error: ${response.status}`);
  }

  const data = await response.json();
  return data.task_id;
}

/**
 * Poll Rodin task status
 */
async function pollRodinStatus(taskId: string): Promise<GenerationStatus> {
  const response = await fetch(`${getAPIConfig().rodin.baseUrl}/status/${taskId}`, {
    headers: {
      Authorization: `Bearer ${getAPIConfig().rodin.apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Rodin API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    id: taskId,
    status:
      data.status === 'completed'
        ? 'completed'
        : data.status === 'failed'
          ? 'failed'
          : 'processing',
    progress: data.progress || 0,
    glbUrl: data.output?.glb_url,
    thumbnailUrl: data.output?.thumbnail_url,
    error: data.error,
    estimatedTimeRemaining: 120 - (data.progress / 100) * 120,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Start AI character generation
 * Returns task ID for polling
 */
export async function startGeneration(request: GenerationRequest): Promise<string> {
  console.log('[AICharacterGen] Starting generation:', request);

  // Use mock mode if API keys not configured
  if (shouldUseMockMode()) {
    console.warn('[AICharacterGen] Using mock mode (no API keys configured)');
    return `mock-${Date.now()}`;
  }

  try {
    if (request.provider === 'meshy') {
      return await generateWithMeshy(request);
    } else {
      return await generateWithRodin(request);
    }
  } catch (error) {
    console.error('[AICharacterGen] Generation failed:', error);
    throw new Error('Failed to start character generation. Please check your API configuration.');
  }
}

/**
 * Poll generation status
 * Call this repeatedly until status is 'completed' or 'failed'
 */
export async function pollGenerationStatus(
  provider: AIProvider,
  taskId: string
): Promise<GenerationStatus> {
  // Mock mode
  if (shouldUseMockMode() || taskId.startsWith('mock-')) {
    console.log('[AICharacterGen] Mock polling:', taskId);

    // Simulate progress
    const elapsed = Date.now() - parseInt(taskId.split('-')[1] || '0');
    const progress = Math.min(100, (elapsed / 30000) * 100);

    if (progress >= 100) {
      return {
        id: taskId,
        status: 'completed',
        progress: 100,
        glbUrl:
          'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMan/glTF/CesiumMan.gltf',
        thumbnailUrl:
          'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="%231a1a2e"/><text x="50%" y="50%" font-size="100" text-anchor="middle" dy=".3em">🤖</text></svg>',
      };
    }

    return {
      id: taskId,
      status: 'processing',
      progress,
      estimatedTimeRemaining: Math.ceil((30000 - elapsed) / 1000),
    };
  }

  try {
    if (provider === 'meshy') {
      return await pollMeshyStatus(taskId);
    } else {
      return await pollRodinStatus(taskId);
    }
  } catch (error) {
    console.error('[AICharacterGen] Polling failed:', error);
    throw new Error('Failed to check generation status');
  }
}

/**
 * Cancel generation task
 */
export async function cancelGeneration(provider: AIProvider, taskId: string): Promise<void> {
  if (shouldUseMockMode() || taskId.startsWith('mock-')) {
    console.log('[AICharacterGen] Mock cancellation:', taskId);
    return;
  }

  // Implementation depends on provider API
  console.warn('[AICharacterGen] Cancellation not implemented for provider:', provider);
}

/**
 * Check if AI generation is available (API keys configured)
 */
export function isAIGenerationAvailable(): boolean {
  return !shouldUseMockMode();
}

/**
 * Get list of available AI providers
 */
export function getAvailableProviders(): AIProvider[] {
  const providers: AIProvider[] = [];

  if (getAPIConfig().meshy.apiKey) {
    providers.push('meshy');
  }

  if (getAPIConfig().rodin.apiKey) {
    providers.push('rodin');
  }

  // Default to meshy if none configured (will use mock mode)
  if (providers.length === 0) {
    providers.push('meshy');
  }

  return providers;
}

/**
 * Estimate generation cost (credits/tokens)
 */
export function estimateGenerationCost(quality: GenerationRequest['quality']): string {
  switch (quality) {
    case 'draft':
      return '~5 credits';
    case 'standard':
      return '~10 credits';
    case 'high':
      return '~20 credits';
    default:
      return '~10 credits';
  }
}

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Convert image file to data URL (for image-to-3D)
 */
export async function imageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Validate prompt for AI generation
 */
export function validatePrompt(prompt: string): { valid: boolean; error?: string } {
  if (!prompt || prompt.trim().length === 0) {
    return { valid: false, error: 'Prompt cannot be empty' };
  }

  if (prompt.length < 10) {
    return { valid: false, error: 'Prompt too short (min 10 characters)' };
  }

  if (prompt.length > 500) {
    return { valid: false, error: 'Prompt too long (max 500 characters)' };
  }

  return { valid: true };
}
