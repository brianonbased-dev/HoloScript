/**
 * A2AHandshake -- comprehensive test suite
 */
import { describe, it, expect } from 'vitest';
import {
  validateA2AAgentCard,
  deriveScopesFromCard,
  negotiateRepresentation,
  executeA2AHandshake,
  handshakeToRequestEntryPayload,
  type A2AHandshakeOptions,
  type SpatialScope,
  type PortalRepresentation,
} from '../A2AHandshake';
import type { A2AAgentCard } from '../../../compiler/A2AAgentCardCompiler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeValidCard(overrides: Partial<A2AAgentCard> = {}): A2AAgentCard {
  return {
    name: 'Test Agent',
    description: 'A test A2A agent',
    url: 'https://agent.example.com',
    version: '1.0.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    authentication: {
      schemes: ['none'],
    },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [
      {
        id: 'spatial_coordination',
        name: 'Spatial Coordination',
        description: 'Manages spatial groups',
        tags: ['spatial', '3d', 'coordination'],
      },
    ],
    ...overrides,
  };
}

function makeOptions(overrides: Partial<A2AHandshakeOptions> = {}): A2AHandshakeOptions {
  return {
    incomingCard: null,
    portalCard: makeValidCard({ name: 'Portal Agent' }),
    maxScopes: ['read-only', 'mutate-zone', 'drive-avatar'],
    defaultScopes: ['read-only'],
    defaultRepresentation: 'dual',
    requireAgentCard: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateA2AAgentCard
// ---------------------------------------------------------------------------

describe('validateA2AAgentCard', () => {
  it('should reject null card', () => {
    const result = validateA2AAgentCard(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('No Agent Card provided');
  });

  it('should accept a valid card', () => {
    const card = makeValidCard();
    const result = validateA2AAgentCard(card);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject card missing name', () => {
    const card = makeValidCard({ name: '' as unknown as string });
    // Need to cast through unknown since name is required in the type
    const result = validateA2AAgentCard({ ...card, name: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('should reject card missing url', () => {
    const result = validateA2AAgentCard(makeValidCard({ url: '' as unknown as string }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('url'))).toBe(true);
  });

  it('should reject card with invalid URL', () => {
    const result = validateA2AAgentCard(makeValidCard({ url: 'not-a-url' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not a valid URL'))).toBe(true);
  });

  it('should warn on non-semver version', () => {
    const result = validateA2AAgentCard(makeValidCard({ version: 'abc' }));
    expect(result.warnings.some((w) => w.includes('semver'))).toBe(true);
  });

  it('should reject card with empty authentication.schemes', () => {
    const result = validateA2AAgentCard(makeValidCard({ authentication: { schemes: [] } }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('authentication.schemes'))).toBe(true);
  });

  it('should reject card with empty defaultInputModes', () => {
    const result = validateA2AAgentCard(
      makeValidCard({ defaultInputModes: [] as unknown as string[] })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('defaultInputModes'))).toBe(true);
  });

  it('should reject card with empty defaultOutputModes', () => {
    const result = validateA2AAgentCard(
      makeValidCard({ defaultOutputModes: [] as unknown as string[] })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('defaultOutputModes'))).toBe(true);
  });

  it('should reject card with empty skills', () => {
    const result = validateA2AAgentCard(makeValidCard({ skills: [] }));
    // Empty skills is a warning, not an error
    expect(result.warnings.some((w) => w.includes('skills'))).toBe(true);
  });

  it('should reject skills missing id', () => {
    const card = makeValidCard({
      skills: [
        {
          name: 'BadSkill',
          description: 'No ID',
          tags: ['test'],
        } as unknown as A2AAgentCard['skills'][0],
      ],
    });
    const result = validateA2AAgentCard(card);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('missing required "id"'))).toBe(true);
  });

  it('should reject skills missing name', () => {
    const card = makeValidCard({
      skills: [
        {
          id: 'test',
          description: 'No name',
          tags: ['test'],
        } as unknown as A2AAgentCard['skills'][0],
      ],
    });
    const result = validateA2AAgentCard(card);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('missing required "name"'))).toBe(true);
  });

  it('should reject skills missing description', () => {
    const card = makeValidCard({
      skills: [
        { id: 'test', name: 'Test', tags: ['test'] } as unknown as A2AAgentCard['skills'][0],
      ],
    });
    const result = validateA2AAgentCard(card);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('missing required "description"'))).toBe(true);
  });

  it('should warn on skills missing tags', () => {
    const card = makeValidCard({
      skills: [
        { id: 'test', name: 'Test', description: 'A test', tags: undefined as unknown as string[] },
      ],
    });
    const result = validateA2AAgentCard(card);
    expect(result.warnings.some((w) => w.includes('tags'))).toBe(true);
  });

  it('should accept a card with valid capabilities booleans', () => {
    const card = makeValidCard({
      capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: true },
    });
    const result = validateA2AAgentCard(card);
    expect(result.valid).toBe(true);
  });

  it('should accept a valid URL with https', () => {
    const card = makeValidCard({ url: 'https://agent.example.com/a2a' });
    const result = validateA2AAgentCard(card);
    expect(result.valid).toBe(true);
  });

  it('should reject card missing multiple required fields', () => {
    const card = {} as A2AAgentCard;
    const result = validateA2AAgentCard(card);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// deriveScopesFromCard
// ---------------------------------------------------------------------------

describe('deriveScopesFromCard', () => {
  it('should return read-only for null card', () => {
    const result = deriveScopesFromCard(null, ['read-only', 'mutate-zone', 'drive-avatar']);
    expect(result.scopes).toEqual(['read-only']);
    expect(result.maxScope).toBe('read-only');
  });

  it('should return read-only for card with no skills', () => {
    const card = makeValidCard({ skills: [] });
    const result = deriveScopesFromCard(card, ['read-only', 'mutate-zone', 'drive-avatar']);
    expect(result.scopes).toEqual(['read-only']);
    expect(result.maxScope).toBe('read-only');
  });

  it('should derive read-only from spatial-only skills', () => {
    const card = makeValidCard({
      skills: [
        { id: 'spatial', name: 'Spatial', description: 'Spatial ops', tags: ['spatial', '3d'] },
      ],
    });
    const result = deriveScopesFromCard(card, ['read-only', 'mutate-zone', 'drive-avatar']);
    expect(result.scopes).toContain('read-only');
    expect(result.maxScope).toBe('read-only');
  });

  it('should derive mutate-zone from interactive skills', () => {
    const card = makeValidCard({
      skills: [
        {
          id: 'interact',
          name: 'Interact',
          description: 'Interactive',
          tags: ['interactive', 'stateful'],
        },
      ],
    });
    const result = deriveScopesFromCard(card, ['read-only', 'mutate-zone', 'drive-avatar']);
    expect(result.maxScope).toBe('mutate-zone');
    expect(result.scopes).toContain('mutate-zone');
    expect(result.scopes).toContain('read-only');
  });

  it('should derive drive-avatar from autonomous skills', () => {
    const card = makeValidCard({
      skills: [
        {
          id: 'auto',
          name: 'Autonomous',
          description: 'Self-driving agent',
          tags: ['autonomous', 'agent'],
        },
      ],
    });
    const result = deriveScopesFromCard(card, ['read-only', 'mutate-zone', 'drive-avatar']);
    expect(result.maxScope).toBe('drive-avatar');
    expect(result.scopes).toEqual(['read-only', 'mutate-zone', 'drive-avatar']);
  });

  it('should clamp derived scopes to portal maxScopes', () => {
    const card = makeValidCard({
      skills: [
        {
          id: 'auto',
          name: 'Autonomous',
          description: 'Self-driving agent',
          tags: ['autonomous'],
        },
      ],
    });
    // Portal only allows up to mutate-zone
    const result = deriveScopesFromCard(card, ['read-only', 'mutate-zone']);
    expect(result.maxScope).toBe('mutate-zone');
    expect(result.scopes).not.toContain('drive-avatar');
  });

  it('should always include at least read-only', () => {
    const card = makeValidCard({
      skills: [
        {
          id: 'auto',
          name: 'Autonomous',
          description: 'Self-driving agent',
          tags: ['autonomous'],
        },
      ],
    });
    // Portal only allows read-only
    const result = deriveScopesFromCard(card, ['read-only']);
    expect(result.scopes).toEqual(['read-only']);
    expect(result.maxScope).toBe('read-only');
  });

  it('should collect contributing tags', () => {
    const card = makeValidCard({
      skills: [
        {
          id: 'agent',
          name: 'Agent',
          description: 'Agent skill',
          tags: ['agent', 'ai', 'spatial'],
        },
      ],
    });
    const result = deriveScopesFromCard(card, ['read-only', 'mutate-zone', 'drive-avatar']);
    expect(result.contributingTags).toContain('agent');
    expect(result.contributingTags).toContain('ai');
    expect(result.contributingTags).toContain('spatial');
  });

  it('should deduplicate contributing tags', () => {
    const card = makeValidCard({
      skills: [
        { id: 's1', name: 'S1', description: 'Skill 1', tags: ['agent'] },
        { id: 's2', name: 'S2', description: 'Skill 2', tags: ['agent'] },
      ],
    });
    const result = deriveScopesFromCard(card, ['read-only', 'mutate-zone', 'drive-avatar']);
    const agentCount = result.contributingTags.filter((t) => t === 'agent').length;
    expect(agentCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// negotiateRepresentation
// ---------------------------------------------------------------------------

describe('negotiateRepresentation', () => {
  it('should return semantic when card is valid and requested semantic', () => {
    const result = negotiateRepresentation(true, 'semantic', false);
    expect(result).toBe('semantic');
  });

  it('should return dual when card is valid and requested dual', () => {
    const result = negotiateRepresentation(true, 'dual', false);
    expect(result).toBe('dual');
  });

  it('should return rendered when card is valid but requested rendered', () => {
    const result = negotiateRepresentation(true, 'rendered', false);
    expect(result).toBe('rendered');
  });

  it('should downgrade semantic to rendered when no valid card', () => {
    const result = negotiateRepresentation(false, 'semantic', false);
    expect(result).toBe('rendered');
  });

  it('should downgrade dual to rendered when no valid card', () => {
    const result = negotiateRepresentation(false, 'dual', false);
    expect(result).toBe('rendered');
  });

  it('should keep rendered when no valid card and requested rendered', () => {
    const result = negotiateRepresentation(false, 'rendered', false);
    expect(result).toBe('rendered');
  });

  it('should return semantic when card required but not valid (caller rejects)', () => {
    const result = negotiateRepresentation(false, 'semantic', true);
    // Returns the requested mode so caller can detect the mismatch
    expect(result).toBe('semantic');
  });

  it('should return dual when card required but not valid (caller rejects)', () => {
    const result = negotiateRepresentation(false, 'dual', true);
    expect(result).toBe('dual');
  });
});

// ---------------------------------------------------------------------------
// executeA2AHandshake
// ---------------------------------------------------------------------------

describe('executeA2AHandshake', () => {
  it('should succeed with valid incoming card', () => {
    const incomingCard = makeValidCard({
      skills: [
        {
          id: 'spatial',
          name: 'Spatial',
          description: 'Spatial skill',
          tags: ['spatial', '3d'],
        },
      ],
    });
    const result = executeA2AHandshake(makeOptions({ incomingCard }));
    expect(result.success).toBe(true);
    expect(result.agentCardPresent).toBe(true);
    expect(result.representation).toBe('dual');
    expect(result.scopes).toContain('read-only');
    expect(result.incomingCard).toBe(incomingCard);
  });

  it('should succeed with no incoming card (rendered lane)', () => {
    const result = executeA2AHandshake(makeOptions({ incomingCard: null }));
    expect(result.success).toBe(true);
    expect(result.agentCardPresent).toBe(false);
    expect(result.representation).toBe('rendered');
    expect(result.scopes).toEqual(['read-only']);
  });

  it('should fail when card required but not presented', () => {
    const result = executeA2AHandshake(
      makeOptions({ incomingCard: null, requireAgentCard: true, defaultRepresentation: 'semantic' })
    );
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('agent_card_required');
    expect(result.agentCardPresent).toBe(false);
  });

  it('should fail when card required but card is invalid', () => {
    const invalidCard = makeValidCard({ name: '' as unknown as string });
    const result = executeA2AHandshake(
      makeOptions({ incomingCard: invalidCard, requireAgentCard: true })
    );
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('agent_card_invalid');
  });

  it('should allow rendered lane even without card when not required', () => {
    const result = executeA2AHandshake(
      makeOptions({
        incomingCard: null,
        requireAgentCard: false,
        defaultRepresentation: 'rendered',
      })
    );
    expect(result.success).toBe(true);
    expect(result.representation).toBe('rendered');
  });

  it('should derive drive-avatar scopes from autonomous agent card', () => {
    const agentCard = makeValidCard({
      skills: [
        {
          id: 'auto',
          name: 'Autonomous Agent',
          description: 'Self-driving',
          tags: ['autonomous', 'agent'],
        },
      ],
    });
    const result = executeA2AHandshake(makeOptions({ incomingCard: agentCard }));
    expect(result.success).toBe(true);
    expect(result.scopeDerivation.maxScope).toBe('drive-avatar');
    expect(result.scopes).toEqual(['read-only', 'mutate-zone', 'drive-avatar']);
  });

  it('should clamp scopes to portal maxScopes', () => {
    const agentCard = makeValidCard({
      skills: [
        {
          id: 'auto',
          name: 'Autonomous Agent',
          description: 'Self-driving',
          tags: ['autonomous'],
        },
      ],
    });
    const result = executeA2AHandshake(
      makeOptions({ incomingCard: agentCard, maxScopes: ['read-only', 'mutate-zone'] })
    );
    expect(result.scopes).not.toContain('drive-avatar');
    expect(result.scopes).toContain('mutate-zone');
  });

  it('should include portal card in result', () => {
    const portalCard = makeValidCard({ name: 'My Portal' });
    const result = executeA2AHandshake(makeOptions({ portalCard }));
    expect(result.portalCard).toBe(portalCard);
  });

  it('should set timestamp', () => {
    const before = Date.now();
    const result = executeA2AHandshake(makeOptions());
    const after = Date.now();
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
  });

  it('should set agentCardPresent to false for invalid card', () => {
    const invalidCard = makeValidCard({ url: 'not-a-url' });
    const result = executeA2AHandshake(makeOptions({ incomingCard: invalidCard }));
    expect(result.agentCardPresent).toBe(false);
    expect(result.incomingCard).toBeNull();
  });

  it('should handle invalid card gracefully when not required', () => {
    const invalidCard = makeValidCard({ url: 'not-a-url' });
    const result = executeA2AHandshake(
      makeOptions({ incomingCard: invalidCard, requireAgentCard: false })
    );
    expect(result.success).toBe(true);
    expect(result.agentCardPresent).toBe(false);
    expect(result.representation).toBe('rendered');
  });

  it('should use default scopes when no card presented', () => {
    const result = executeA2AHandshake(
      makeOptions({ incomingCard: null, defaultScopes: ['read-only', 'mutate-zone'] })
    );
    expect(result.scopes).toEqual(['read-only', 'mutate-zone']);
  });

  it('should use read-only as minimum fallback when default scopes empty', () => {
    const result = executeA2AHandshake(makeOptions({ incomingCard: null, defaultScopes: [] }));
    expect(result.scopes).toEqual(['read-only']);
  });
});

// ---------------------------------------------------------------------------
// handshakeToRequestEntryPayload
// ---------------------------------------------------------------------------

describe('handshakeToRequestEntryPayload', () => {
  it('should produce correct payload for portal_presence:request_entry', () => {
    const handshake = executeA2AHandshake(
      makeOptions({
        incomingCard: makeValidCard({
          skills: [
            {
              id: 'agent',
              name: 'Agent',
              description: 'Agent skill',
              tags: ['agent'],
            },
          ],
        }),
      })
    );
    const payload = handshakeToRequestEntryPayload(handshake, 'agent-1', 'Test Agent');
    expect(payload.entrantId).toBe('agent-1');
    expect(payload.name).toBe('Test Agent');
    expect(payload.agentCardPresent).toBe(true);
    expect(payload.representation).toBe('dual');
    expect(Array.isArray(payload.scopes)).toBe(true);
  });

  it('should produce rendered representation for no-card handshake', () => {
    const handshake = executeA2AHandshake(makeOptions({ incomingCard: null }));
    const payload = handshakeToRequestEntryPayload(handshake, 'human-1', 'VR User');
    expect(payload.agentCardPresent).toBe(false);
    expect(payload.representation).toBe('rendered');
    expect(payload.scopes).toEqual(['read-only']);
  });
});
