/**
 * LocalLLMTrait Research Implementation Tests
 *
 * Tests for XR inference backends (P.XR.02, W.032),
 * speculative decoding config (P.XR.03), and KV cache tracking (P.XR.07).
 */

import { describe, it, expect } from 'vitest';
import type {
  LLMBackend,
  LocalLLMConfig,
  SpeculativeConfig,
  LocalLLMState,
} from '../LocalLLMTrait';

// =============================================================================
// LLMBackend — executorch + bitnet (P.XR.02, W.032)
// =============================================================================

describe('LLMBackend (XR extensions)', () => {
  it('includes executorch for on-device XR inference', () => {
    const backend: LLMBackend = 'executorch';
    expect(backend).toBe('executorch');
  });

  it('includes bitnet for ultra-low-power inference', () => {
    const backend: LLMBackend = 'bitnet';
    expect(backend).toBe('bitnet');
  });

  it('all 6 backends are assignable', () => {
    const backends: LLMBackend[] = [
      'ollama',
      'lmstudio',
      'llamacpp',
      'openai',
      'executorch',
      'bitnet',
    ];
    expect(backends).toHaveLength(6);
  });
});

// =============================================================================
// SpeculativeConfig (P.XR.03)
// =============================================================================

describe('SpeculativeConfig', () => {
  it('accepts a complete speculative decoding config', () => {
    const config: SpeculativeConfig = {
      cloudEndpoint: 'https://api.together.xyz/v1/chat/completions',
      verifierModel: 'llama-3.1-70b',
      batchSize: 8,
      maxRejectionRate: 0.3,
    };
    expect(config.cloudEndpoint).toContain('together');
    expect(config.verifierModel).toBe('llama-3.1-70b');
    expect(config.batchSize).toBe(8);
    expect(config.maxRejectionRate).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// LocalLLMConfig.max_kv_cache_mb (P.XR.07)
// =============================================================================

describe('LocalLLMConfig (KV cache)', () => {
  it('has max_kv_cache_mb field', () => {
    const config: LocalLLMConfig = {
      model: 'llama3',
      backend: 'executorch',
      base_url: '',
      temperature: 0.7,
      max_tokens: 2048,
      stream: false,
      system_prompt: '',
      context_length: 4096,
      fallback_to_remote: false,
      fallback_api_key: '',
      fallback_model: '',
      timeout_ms: 30000,
      max_kv_cache_mb: 512,
    };
    expect(config.max_kv_cache_mb).toBe(512);
  });

  it('supports optional speculative config', () => {
    const config: LocalLLMConfig = {
      model: 'llama3.2-1b',
      backend: 'executorch',
      base_url: '',
      temperature: 0.5,
      max_tokens: 512,
      stream: false,
      system_prompt: '',
      context_length: 4096,
      fallback_to_remote: true,
      fallback_api_key: 'key',
      fallback_model: 'gpt-4o-mini',
      timeout_ms: 5000,
      max_kv_cache_mb: 256,
      speculative: {
        cloudEndpoint: 'https://cloud.example.com',
        verifierModel: 'llama-3.1-70b',
        batchSize: 4,
        maxRejectionRate: 0.2,
      },
    };
    expect(config.speculative?.verifierModel).toBe('llama-3.1-70b');
  });
});

// =============================================================================
// LocalLLMState (KV + speculative tracking)
// =============================================================================

describe('LocalLLMState (research fields)', () => {
  it('tracks kvCacheSizeMB', () => {
    const state: LocalLLMState = {
      isReady: true,
      backend: 'executorch',
      activeModel: 'llama3.2-1b',
      availableModels: ['llama3.2-1b'],
      activeRequests: new Map(),
      usingFallback: false,
      totalRequests: 10,
      totalTokens: 5000,
      kvCacheSizeMB: 128,
      speculativeActive: false,
    };
    expect(state.kvCacheSizeMB).toBe(128);
  });

  it('tracks speculativeActive flag', () => {
    const state: LocalLLMState = {
      isReady: true,
      backend: 'executorch',
      activeModel: 'llama3.2-1b',
      availableModels: [],
      activeRequests: new Map(),
      usingFallback: false,
      totalRequests: 0,
      totalTokens: 0,
      kvCacheSizeMB: 0,
      speculativeActive: true,
    };
    expect(state.speculativeActive).toBe(true);
  });
});
