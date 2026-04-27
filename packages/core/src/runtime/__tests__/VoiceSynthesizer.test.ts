import { describe, it, expect, vi } from 'vitest';

vi.mock('@holoscript/engine/runtime/VoiceSynthesizer', () => ({
  BaseVoiceSynthesizer: class BaseVoiceSynthesizerMock {},
  registerVoiceSynthesizer: vi.fn(),
  getVoiceSynthesizer: vi.fn(),
  voiceSynthesizerRegistry: new Map(),
}));

import {
  BaseVoiceSynthesizer,
  registerVoiceSynthesizer,
  getVoiceSynthesizer,
  voiceSynthesizerRegistry,
} from '../VoiceSynthesizer.js';

describe('VoiceSynthesizer re-exports', () => {
  it('exports BaseVoiceSynthesizer', () => {
    expect(BaseVoiceSynthesizer).toBeDefined();
  });

  it('exports registerVoiceSynthesizer as a function', () => {
    expect(typeof registerVoiceSynthesizer).toBe('function');
  });

  it('exports getVoiceSynthesizer as a function', () => {
    expect(typeof getVoiceSynthesizer).toBe('function');
  });

  it('exports voiceSynthesizerRegistry', () => {
    expect(voiceSynthesizerRegistry).toBeDefined();
  });
});
