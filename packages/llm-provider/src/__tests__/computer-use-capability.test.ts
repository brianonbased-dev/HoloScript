/**
 * computerUse capability axis (board task 30l0, A-020 2026-07-10).
 *
 * Verifies the two-axis design in types.ts:
 *  - UNIVERSAL axis: Capabilities.computerUse is a swap/routing flag. The three
 *    frontier providers (Anthropic/OpenAI/Gemini) declare it true and local/edge
 *    providers do not, so a brain that `requires: ["computerUse"]` can route to
 *    whichever capable provider is available (one HoloDoor policy chokepoint).
 *  - SEGREGATED axis: ProviderExtensions.<name>.computerUse carries each vendor's
 *    OWN action dialect — Anthropic coordinate, OpenAI environment, Gemini intent.
 *    Those shapes must stay structurally distinct; this file only COMPILES if they
 *    are not flattened into one shape.
 */
import { describe, it, expect } from 'vitest';

import type { Capabilities, ProviderExtensions } from '../types';
import { ANTHROPIC_CAPABILITIES } from '../adapters/anthropic';
import { OPENAI_CAPABILITIES } from '../adapters/openai';
import { GEMINI_CAPABILITIES } from '../adapters/gemini';
import { BITNET_CAPABILITIES } from '../adapters/bitnet';
import { LOCAL_LLM_CAPABILITIES } from '../adapters/local-llm';

describe('computerUse universal capability axis', () => {
  it('the three frontier providers declare computerUse=true', () => {
    expect(ANTHROPIC_CAPABILITIES.computerUse).toBe(true);
    expect(OPENAI_CAPABILITIES.computerUse).toBe(true);
    expect(GEMINI_CAPABILITIES.computerUse).toBe(true);
  });

  it('local/edge providers do not claim computerUse (the axis discriminates)', () => {
    expect(BITNET_CAPABILITIES.computerUse ?? false).toBe(false);
    expect(LOCAL_LLM_CAPABILITIES.computerUse ?? false).toBe(false);
  });

  it('capability-driven swap: requiring computerUse selects exactly the capable providers', () => {
    const pool: Array<{ name: string; caps: Capabilities }> = [
      { name: 'anthropic', caps: ANTHROPIC_CAPABILITIES },
      { name: 'openai', caps: OPENAI_CAPABILITIES },
      { name: 'gemini', caps: GEMINI_CAPABILITIES },
      { name: 'bitnet', caps: BITNET_CAPABILITIES },
      { name: 'local', caps: LOCAL_LLM_CAPABILITIES },
    ];
    const capable = pool.filter((p) => p.caps.computerUse === true).map((p) => p.name);
    expect(capable).toEqual(['anthropic', 'openai', 'gemini']);
  });
});

describe('computerUse segregated action dialects (not flattened)', () => {
  it('each provider extension carries its own distinct action-dialect shape', () => {
    const ext: ProviderExtensions = {
      anthropic: {
        // Coordinate dialect: dated tool version + pixel display dims.
        computerUse: {
          toolVersion: 'computer_20250124',
          displayWidthPx: 1280,
          displayHeightPx: 800,
          displayNumber: 1,
        },
      },
      openai: {
        // Environment dialect: environment + display dims (different key names).
        computerUse: {
          environment: 'browser',
          displayWidth: 1280,
          displayHeight: 800,
        },
      },
      gemini: {
        // Intent dialect: environment + predefined-action exclusion, no pixel dims.
        computerUse: {
          environment: 'desktop',
          excludedActions: ['drag_and_drop'],
        },
      },
    };

    expect(ext.anthropic?.computerUse?.toolVersion).toBe('computer_20250124');
    expect(ext.anthropic?.computerUse?.displayWidthPx).toBe(1280);
    expect(ext.openai?.computerUse?.environment).toBe('browser');
    expect(ext.openai?.computerUse?.displayWidth).toBe(1280);
    expect(ext.gemini?.computerUse?.environment).toBe('desktop');
    expect(ext.gemini?.computerUse?.excludedActions).toContain('drag_and_drop');
  });
});
