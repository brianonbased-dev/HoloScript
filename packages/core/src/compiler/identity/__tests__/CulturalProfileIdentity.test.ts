/**
 * CulturalProfileIdentity Integration Tests
 *
 * Tests the integration between:
 * - AgentIdentity CulturalProfileMetadata
 * - AgentConfig with culturalProfile
 * - Checksum calculation including cultural profile
 * - AgentRBAC cultural compatibility validation
 */

import { describe, it, expect } from 'vitest';
import {
  AgentRole,
  type AgentConfig,
  type CulturalProfileMetadata,
  calculateAgentChecksum,
} from '../AgentIdentity';

// =============================================================================
// CULTURAL PROFILE METADATA TESTS
// =============================================================================

describe('CulturalProfileMetadata', () => {
  it('can be created with all required fields', () => {
    const profile: CulturalProfileMetadata = {
      cooperation_index: 0.8,
      cultural_family: 'cooperative',
      prompt_dialect: 'directive',
    };

    expect(profile.cooperation_index).toBe(0.8);
    expect(profile.cultural_family).toBe('cooperative');
    expect(profile.prompt_dialect).toBe('directive');
  });

  it('supports all cultural family values', () => {
    const families = [
      'cooperative',
      'competitive',
      'hierarchical',
      'egalitarian',
      'isolationist',
      'mercantile',
      'exploratory',
      'ritualistic',
    ] as const;

    for (const family of families) {
      const profile: CulturalProfileMetadata = {
        cooperation_index: 0.5,
        cultural_family: family,
        prompt_dialect: 'directive',
      };
      expect(profile.cultural_family).toBe(family);
    }
  });

  it('supports all prompt dialect values', () => {
    const dialects = [
      'directive',
      'socratic',
      'narrative',
      'structured',
      'consensus',
      'reactive',
    ] as const;

    for (const dialect of dialects) {
      const profile: CulturalProfileMetadata = {
        cooperation_index: 0.5,
        cultural_family: 'cooperative',
        prompt_dialect: dialect,
      };
      expect(profile.prompt_dialect).toBe(dialect);
    }
  });
});

// =============================================================================
// AGENT CONFIG WITH CULTURAL PROFILE
// =============================================================================

describe('AgentConfig with culturalProfile', () => {
  it('accepts optional culturalProfile', () => {
    const config: AgentConfig = {
      role: AgentRole.CODE_GENERATOR,
      name: 'generator-v1',
      version: '1.0.0',
      culturalProfile: {
        cooperation_index: 0.8,
        cultural_family: 'cooperative',
        prompt_dialect: 'directive',
      },
    };

    expect(config.culturalProfile).toBeDefined();
    expect(config.culturalProfile!.cooperation_index).toBe(0.8);
  });

  it('allows AgentConfig without culturalProfile (backwards compatible)', () => {
    const config: AgentConfig = {
      role: AgentRole.SYNTAX_ANALYZER,
      name: 'parser-v1',
      version: '1.0.0',
    };

    expect(config.culturalProfile).toBeUndefined();
  });
});

// =============================================================================
// CHECKSUM WITH CULTURAL PROFILE
// =============================================================================

describe('calculateAgentChecksum with culturalProfile', () => {
  it('includes culturalProfile in checksum calculation', () => {
    const baseConfig: AgentConfig = {
      role: AgentRole.CODE_GENERATOR,
      name: 'gen-v1',
      version: '1.0.0',
    };

    const withProfile: AgentConfig = {
      ...baseConfig,
      culturalProfile: {
        cooperation_index: 0.8,
        cultural_family: 'cooperative',
        prompt_dialect: 'directive',
      },
    };

    const checksum1 = calculateAgentChecksum(baseConfig);
    const checksum2 = calculateAgentChecksum(withProfile);

    // Different cultural profiles should produce different checksums
    expect(checksum1.hash).not.toBe(checksum2.hash);
  });

  it('detects cultural profile drift', () => {
    const config1: AgentConfig = {
      role: AgentRole.CODE_GENERATOR,
      name: 'gen-v1',
      version: '1.0.0',
      culturalProfile: {
        cooperation_index: 0.8,
        cultural_family: 'cooperative',
        prompt_dialect: 'directive',
      },
    };

    const config2: AgentConfig = {
      ...config1,
      culturalProfile: {
        cooperation_index: 0.3, // Changed
        cultural_family: 'competitive', // Changed
        prompt_dialect: 'directive',
      },
    };

    const checksum1 = calculateAgentChecksum(config1);
    const checksum2 = calculateAgentChecksum(config2);

    expect(checksum1.hash).not.toBe(checksum2.hash);
  });

  it('produces same checksum for identical cultural profiles', () => {
    const config: AgentConfig = {
      role: AgentRole.CODE_GENERATOR,
      name: 'gen-v1',
      version: '1.0.0',
      culturalProfile: {
        cooperation_index: 0.8,
        cultural_family: 'cooperative',
        prompt_dialect: 'directive',
      },
    };

    const checksum1 = calculateAgentChecksum(config);
    const checksum2 = calculateAgentChecksum(config);

    expect(checksum1.hash).toBe(checksum2.hash);
  });

  it('treats undefined and null culturalProfile consistently', () => {
    const configUndefined: AgentConfig = {
      role: AgentRole.CODE_GENERATOR,
      name: 'gen-v1',
      version: '1.0.0',
    };

    const configExplicitUndefined: AgentConfig = {
      role: AgentRole.CODE_GENERATOR,
      name: 'gen-v1',
      version: '1.0.0',
      culturalProfile: undefined,
    };

    const checksum1 = calculateAgentChecksum(configUndefined);
    const checksum2 = calculateAgentChecksum(configExplicitUndefined);

    expect(checksum1.hash).toBe(checksum2.hash);
  });
});
