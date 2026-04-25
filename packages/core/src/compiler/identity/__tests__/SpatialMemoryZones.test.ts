/**
 * Tests for SpatialMemoryZones
 *
 * Covers:
 * - Zone creation (geospatial, local, named bounds)
 * - Zone access enforcement (allow/deny based on role)
 * - Agent-specific overrides
 * - Position-in-zone checking for geospatial and local bounds
 * - GDPR audit trail generation
 * - Default permission fallback by classification
 * - Factory functions
 * - Global singleton lifecycle
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks (vi.mock factories are hoisted above all const/let)
// ---------------------------------------------------------------------------

const { mockVerifyToken } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
}));

vi.mock('../AgentTokenIssuer', () => ({
  AgentTokenIssuer: vi.fn().mockImplementation(function () {
    return { verifyToken: mockVerifyToken };
  }),
  getTokenIssuer: vi.fn(() => ({ verifyToken: mockVerifyToken })),
  resetTokenIssuer: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import {
  SpatialPermission,
  SpatialZoneEnforcer,
  createSpatialZone,
  createGeospatialZone,
  createLocalZone,
  createNamedZone,
  createZonePolicy,
  createSpatialZoneEnforcer,
  getSpatialZoneEnforcer,
  resetSpatialZoneEnforcer,
} from '../SpatialMemoryZones';

import type {
  SpatialZone,
  SpatialZonePolicy,
  SpatialPosition,
  SpatialAccessAuditEntry,
} from '../SpatialMemoryZones';

import { AgentRole } from '../AgentIdentity';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock IntentTokenPayload that passes verification. */
function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    iss: 'holoscript-orchestrator',
    sub: overrides.sub ?? 'agent:orchestrator:test',
    aud: 'holoscript-compiler',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    jti: 'test-jti',
    agent_role: overrides.agent_role ?? AgentRole.ORCHESTRATOR,
    agent_checksum: { hash: 'abc', algorithm: 'sha256', calculatedAt: '', label: '' },
    permissions: overrides.permissions ?? [],
    scope: overrides.scope ?? undefined,
    intent: {
      workflow_id: 'wf-1',
      workflow_step: 'parse_tokens',
      executed_by: overrides.agent_role ?? AgentRole.ORCHESTRATOR,
      initiated_by: AgentRole.ORCHESTRATOR,
      delegation_chain: [],
    },
    ...((overrides.extra as Record<string, unknown>) ?? {}),
  };
}

function setupValidToken(overrides: Record<string, unknown> = {}) {
  mockVerifyToken.mockReturnValue({
    valid: true,
    payload: validPayload(overrides),
  });
}

function setupInvalidToken(error = 'Token expired') {
  mockVerifyToken.mockReturnValue({
    valid: false,
    error,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpatialMemoryZones', () => {
  let enforcer: SpatialZoneEnforcer;

  beforeEach(() => {
    mockVerifyToken.mockReset();
    resetSpatialZoneEnforcer();
    enforcer = createSpatialZoneEnforcer();
  });

  // =========================================================================
  // Zone Creation
  // =========================================================================

  describe('Zone creation', () => {
    it('creates a geospatial zone with full bounds', () => {
      const zone = createGeospatialZone(
        'geo-1',
        'Downtown SF',
        'public',
        37.77,
        37.79,
        -122.43,
        -122.41,
        0,
        500
      );

      expect(zone.id).toBe('geo-1');
      expect(zone.name).toBe('Downtown SF');
      expect(zone.classification).toBe('public');
      expect(zone.bounds).toBeDefined();
      expect(zone.bounds!.type).toBe('geospatial');
      if (zone.bounds!.type === 'geospatial') {
        expect(zone.bounds!.minLat).toBe(37.77);
        expect(zone.bounds!.maxLat).toBe(37.79);
        expect(zone.bounds!.minLon).toBe(-122.43);
        expect(zone.bounds!.maxLon).toBe(-122.41);
        expect(zone.bounds!.minAlt).toBe(0);
        expect(zone.bounds!.maxAlt).toBe(500);
      }
    });

    it('creates a geospatial zone without altitude', () => {
      const zone = createGeospatialZone(
        'geo-2',
        'Flat Area',
        'restricted',
        40.0,
        41.0,
        -74.0,
        -73.0
      );
      expect(zone.bounds!.type).toBe('geospatial');
      if (zone.bounds!.type === 'geospatial') {
        expect(zone.bounds!.minAlt).toBeUndefined();
        expect(zone.bounds!.maxAlt).toBeUndefined();
      }
    });

    it('creates a local-coordinate zone', () => {
      const zone = createLocalZone('local-1', 'Meeting Room A', 'private', 0, 10, 0, 5, 0, 3);

      expect(zone.id).toBe('local-1');
      expect(zone.bounds!.type).toBe('local');
      if (zone.bounds!.type === 'local') {
        expect(zone.bounds!.minX).toBe(0);
        expect(zone.bounds!.maxX).toBe(10);
        expect(zone.bounds!.minY).toBe(0);
        expect(zone.bounds!.maxY).toBe(5);
        expect(zone.bounds!.minZ).toBe(0);
        expect(zone.bounds!.maxZ).toBe(3);
      }
    });

    it('creates a named (logical) zone', () => {
      const zone = createNamedZone('named-1', 'Lobby', 'public');

      expect(zone.id).toBe('named-1');
      expect(zone.name).toBe('Lobby');
      expect(zone.classification).toBe('public');
      expect(zone.bounds).toEqual({ type: 'named' });
    });

    it('creates a generic spatial zone with the factory', () => {
      const zone = createSpatialZone('z-1', 'Generic', 'sensitive');

      expect(zone.id).toBe('z-1');
      expect(zone.name).toBe('Generic');
      expect(zone.classification).toBe('sensitive');
      expect(zone.bounds).toBeUndefined();
    });

    it('creates a generic spatial zone with custom bounds', () => {
      const zone = createSpatialZone('z-2', 'Custom', 'restricted', {
        type: 'local',
        minX: -1,
        maxX: 1,
        minY: -1,
        maxY: 1,
        minZ: -1,
        maxZ: 1,
      });

      expect(zone.bounds).toBeDefined();
      expect(zone.bounds!.type).toBe('local');
    });
  });

  // =========================================================================
  // Zone Registration & Policy
  // =========================================================================

  describe('Zone registration and policy', () => {
    it('registers and retrieves a zone', () => {
      const zone = createNamedZone('z-reg', 'Test Zone', 'public');
      enforcer.registerZone(zone);
      expect(enforcer.getZone('z-reg')).toBe(zone);
    });

    it('returns undefined for unregistered zone', () => {
      expect(enforcer.getZone('nonexistent')).toBeUndefined();
    });

    it('removes a zone and its policy', () => {
      const zone = createNamedZone('z-rm', 'Remove Me', 'public');
      enforcer.registerZone(zone);
      const policy = createZonePolicy('z-rm');
      enforcer.setPolicy(policy);

      expect(enforcer.removeZone('z-rm')).toBe(true);
      expect(enforcer.getZone('z-rm')).toBeUndefined();
      expect(enforcer.getPolicy('z-rm')).toBeUndefined();
    });

    it('returns false when removing a nonexistent zone', () => {
      expect(enforcer.removeZone('nope')).toBe(false);
    });

    it('lists all registered zone IDs', () => {
      enforcer.registerZone(createNamedZone('a', 'A', 'public'));
      enforcer.registerZone(createNamedZone('b', 'B', 'private'));
      expect(enforcer.getRegisteredZoneIds()).toEqual(expect.arrayContaining(['a', 'b']));
      expect(enforcer.getRegisteredZoneIds()).toHaveLength(2);
    });

    it('throws when setting policy for an unregistered zone', () => {
      const policy = createZonePolicy('ghost-zone');
      expect(() => enforcer.setPolicy(policy)).toThrow('unregistered zone');
    });

    it('sets and retrieves a policy', () => {
      const zone = createNamedZone('z-p', 'Policy Zone', 'public');
      enforcer.registerZone(zone);

      const policy = createZonePolicy(
        'z-p',
        { [AgentRole.ORCHESTRATOR]: [SpatialPermission.SPATIAL_ADMIN] },
        { 'special-agent': [SpatialPermission.SPATIAL_WRITE] },
        [SpatialPermission.SPATIAL_READ]
      );
      enforcer.setPolicy(policy);

      const retrieved = enforcer.getPolicy('z-p');
      expect(retrieved).toBeDefined();
      expect(retrieved!.zoneId).toBe('z-p');
      expect(retrieved!.rolePermissions[AgentRole.ORCHESTRATOR]).toContain(
        SpatialPermission.SPATIAL_ADMIN
      );
      expect(retrieved!.agentOverrides['special-agent']).toContain(SpatialPermission.SPATIAL_WRITE);
      expect(retrieved!.defaultPermissions).toContain(SpatialPermission.SPATIAL_READ);
    });
  });

  // =========================================================================
  // Zone Access Enforcement
  // =========================================================================

  describe('checkZoneAccess', () => {
    it('denies access when token verification fails', () => {
      setupInvalidToken('Token expired');

      enforcer.registerZone(createNamedZone('z1', 'Zone', 'public'));

      const decision = enforcer.checkZoneAccess('bad-token', 'z1', SpatialPermission.SPATIAL_READ);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Token verification failed');
    });

    it('denies access when zone does not exist', () => {
      setupValidToken();

      const decision = enforcer.checkZoneAccess(
        'token',
        'nonexistent',
        SpatialPermission.SPATIAL_READ
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Zone not found');
    });

    it('grants access based on role permissions in policy', () => {
      setupValidToken({ agent_role: AgentRole.ORCHESTRATOR, sub: 'agent:orch:main' });

      const zone = createNamedZone('z-role', 'Role Zone', 'private');
      enforcer.registerZone(zone);
      enforcer.setPolicy(
        createZonePolicy(
          'z-role',
          {
            [AgentRole.ORCHESTRATOR]: [
              SpatialPermission.SPATIAL_READ,
              SpatialPermission.SPATIAL_WRITE,
            ],
          },
          {},
          []
        )
      );

      const readDecision = enforcer.checkZoneAccess(
        'token',
        'z-role',
        SpatialPermission.SPATIAL_READ
      );
      expect(readDecision.allowed).toBe(true);

      const writeDecision = enforcer.checkZoneAccess(
        'token',
        'z-role',
        SpatialPermission.SPATIAL_WRITE
      );
      expect(writeDecision.allowed).toBe(true);
    });

    it('denies access when role lacks required permission', () => {
      setupValidToken({ agent_role: AgentRole.SYNTAX_ANALYZER, sub: 'agent:sa:main' });

      const zone = createNamedZone('z-deny', 'Deny Zone', 'private');
      enforcer.registerZone(zone);
      enforcer.setPolicy(
        createZonePolicy(
          'z-deny',
          { [AgentRole.SYNTAX_ANALYZER]: [SpatialPermission.SPATIAL_READ] },
          {},
          []
        )
      );

      const decision = enforcer.checkZoneAccess('token', 'z-deny', SpatialPermission.SPATIAL_WRITE);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('lacks');
    });

    it('uses default permissions when role has no explicit grant', () => {
      setupValidToken({ agent_role: AgentRole.EXPORTER, sub: 'agent:exp:main' });

      const zone = createNamedZone('z-def', 'Default Zone', 'public');
      enforcer.registerZone(zone);
      enforcer.setPolicy(
        createZonePolicy(
          'z-def',
          {}, // no role grants
          {},
          [SpatialPermission.SPATIAL_READ]
        )
      );

      const decision = enforcer.checkZoneAccess('token', 'z-def', SpatialPermission.SPATIAL_READ);
      expect(decision.allowed).toBe(true);
    });

    it('denies via default permissions when operation not in defaults', () => {
      setupValidToken({ agent_role: AgentRole.EXPORTER, sub: 'agent:exp:main' });

      const zone = createNamedZone('z-def2', 'Default Zone 2', 'public');
      enforcer.registerZone(zone);
      enforcer.setPolicy(createZonePolicy('z-def2', {}, {}, [SpatialPermission.SPATIAL_READ]));

      const decision = enforcer.checkZoneAccess(
        'token',
        'z-def2',
        SpatialPermission.SPATIAL_DELETE
      );
      expect(decision.allowed).toBe(false);
    });
  });

  // =========================================================================
  // Agent-specific Overrides
  // =========================================================================

  describe('Agent-specific overrides', () => {
    it('agent override takes priority over role permissions', () => {
      const agentSub = 'agent:sa:scanner';
      setupValidToken({ agent_role: AgentRole.SYNTAX_ANALYZER, sub: agentSub });

      const zone = createNamedZone('z-ov', 'Override Zone', 'private');
      enforcer.registerZone(zone);
      enforcer.setPolicy(
        createZonePolicy(
          'z-ov',
          { [AgentRole.SYNTAX_ANALYZER]: [SpatialPermission.SPATIAL_READ] },
          {
            [agentSub]: [
              SpatialPermission.SPATIAL_READ,
              SpatialPermission.SPATIAL_WRITE,
              SpatialPermission.SPATIAL_ADMIN,
            ],
          },
          []
        )
      );

      // Agent override gives ADMIN, even though role only gives READ
      const adminDecision = enforcer.checkZoneAccess(
        'token',
        'z-ov',
        SpatialPermission.SPATIAL_ADMIN
      );
      expect(adminDecision.allowed).toBe(true);

      const writeDecision = enforcer.checkZoneAccess(
        'token',
        'z-ov',
        SpatialPermission.SPATIAL_WRITE
      );
      expect(writeDecision.allowed).toBe(true);
    });

    it('agent override can restrict below role permissions', () => {
      const agentSub = 'agent:orch:restricted';
      setupValidToken({ agent_role: AgentRole.ORCHESTRATOR, sub: agentSub });

      const zone = createNamedZone('z-ov-restrict', 'Restricted Override', 'public');
      enforcer.registerZone(zone);
      enforcer.setPolicy(
        createZonePolicy(
          'z-ov-restrict',
          {
            [AgentRole.ORCHESTRATOR]: [
              SpatialPermission.SPATIAL_READ,
              SpatialPermission.SPATIAL_WRITE,
              SpatialPermission.SPATIAL_ADMIN,
            ],
          },
          { [agentSub]: [] }, // empty override = no permissions
          [SpatialPermission.SPATIAL_READ]
        )
      );

      const decision = enforcer.checkZoneAccess(
        'token',
        'z-ov-restrict',
        SpatialPermission.SPATIAL_READ
      );
      expect(decision.allowed).toBe(false);
    });
  });

  // =========================================================================
  // Classification-based Default Fallback
  // =========================================================================

  describe('Classification-based default fallback', () => {
    it('public zones grant SPATIAL_READ by default (no policy)', () => {
      setupValidToken();
      enforcer.registerZone(createNamedZone('pub', 'Public', 'public'));

      const decision = enforcer.checkZoneAccess('token', 'pub', SpatialPermission.SPATIAL_READ);
      expect(decision.allowed).toBe(true);
    });

    it('public zones deny SPATIAL_WRITE by default (no policy)', () => {
      setupValidToken();
      enforcer.registerZone(createNamedZone('pub2', 'Public 2', 'public'));

      const decision = enforcer.checkZoneAccess('token', 'pub2', SpatialPermission.SPATIAL_WRITE);
      expect(decision.allowed).toBe(false);
    });

    it('restricted zones grant SPATIAL_READ by default (no policy)', () => {
      setupValidToken();
      enforcer.registerZone(createNamedZone('res', 'Restricted', 'restricted'));

      const decision = enforcer.checkZoneAccess('token', 'res', SpatialPermission.SPATIAL_READ);
      expect(decision.allowed).toBe(true);
    });

    it('private zones deny all by default (no policy)', () => {
      setupValidToken();
      enforcer.registerZone(createNamedZone('priv', 'Private', 'private'));

      const readDecision = enforcer.checkZoneAccess(
        'token',
        'priv',
        SpatialPermission.SPATIAL_READ
      );
      expect(readDecision.allowed).toBe(false);
    });

    it('sensitive zones deny all by default (no policy)', () => {
      setupValidToken();
      enforcer.registerZone(createNamedZone('sens', 'Sensitive', 'sensitive'));

      const readDecision = enforcer.checkZoneAccess(
        'token',
        'sens',
        SpatialPermission.SPATIAL_READ
      );
      expect(readDecision.allowed).toBe(false);
    });
  });

  // =========================================================================
  // Position-in-Zone Checking
  // =========================================================================

  describe('validateSpatialOperation', () => {
    it('grants access when position is inside a geospatial zone', () => {
      setupValidToken({ agent_role: AgentRole.ORCHESTRATOR, sub: 'agent:orch:1' });

      const zone = createGeospatialZone(
        'geo-check',
        'SF Check',
        'public',
        37.77,
        37.79,
        -122.43,
        -122.41,
        0,
        500
      );
      enforcer.registerZone(zone);
      enforcer.setPolicy(
        createZonePolicy('geo-check', {
          [AgentRole.ORCHESTRATOR]: [
            SpatialPermission.SPATIAL_READ,
            SpatialPermission.SPATIAL_WRITE,
          ],
        })
      );

      const position: SpatialPosition = [37.78, -122.42, 100];
      const decision = enforcer.validateSpatialOperation(
        'token',
        position,
        SpatialPermission.SPATIAL_READ
      );
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toContain('geo-check');
    });

    it('denies access when position is outside all geospatial zones', () => {
      setupValidToken({ agent_role: AgentRole.ORCHESTRATOR, sub: 'agent:orch:1' });

      const zone = createGeospatialZone(
        'geo-miss',
        'SF Miss',
        'public',
        37.77,
        37.79,
        -122.43,
        -122.41
      );
      enforcer.registerZone(zone);
      enforcer.setPolicy(
        createZonePolicy('geo-miss', { [AgentRole.ORCHESTRATOR]: [SpatialPermission.SPATIAL_READ] })
      );

      // Position outside the zone bounds
      const position: SpatialPosition = [40.0, -74.0, 0];
      const decision = enforcer.validateSpatialOperation(
        'token',
        position,
        SpatialPermission.SPATIAL_READ
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('No registered zone contains position');
    });

    it('grants access when position is inside a local zone', () => {
      setupValidToken({ agent_role: AgentRole.AST_OPTIMIZER, sub: 'agent:opt:1' });

      const zone = createLocalZone('room-1', 'Room 1', 'restricted', 0, 10, 0, 5, 0, 3);
      enforcer.registerZone(zone);
      enforcer.setPolicy(
        createZonePolicy('room-1', { [AgentRole.AST_OPTIMIZER]: [SpatialPermission.SPATIAL_READ] })
      );

      const position: SpatialPosition = [5, 2.5, 1.5];
      const decision = enforcer.validateSpatialOperation(
        'token',
        position,
        SpatialPermission.SPATIAL_READ
      );
      expect(decision.allowed).toBe(true);
    });

    it('denies access when position is inside zone but agent lacks permission', () => {
      setupValidToken({ agent_role: AgentRole.SYNTAX_ANALYZER, sub: 'agent:sa:1' });

      const zone = createLocalZone('room-2', 'Room 2', 'private', 0, 10, 0, 5, 0, 3);
      enforcer.registerZone(zone);
      enforcer.setPolicy(
        createZonePolicy(
          'room-2',
          { [AgentRole.SYNTAX_ANALYZER]: [SpatialPermission.SPATIAL_READ] },
          {},
          []
        )
      );

      const position: SpatialPosition = [5, 2.5, 1.5];
      const decision = enforcer.validateSpatialOperation(
        'token',
        position,
        SpatialPermission.SPATIAL_WRITE
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('denied');
    });

    it('named zones are not matched by position lookup', () => {
      setupValidToken({ agent_role: AgentRole.ORCHESTRATOR, sub: 'agent:orch:1' });

      const zone = createNamedZone('lobby', 'Lobby', 'public');
      enforcer.registerZone(zone);
      enforcer.setPolicy(
        createZonePolicy('lobby', { [AgentRole.ORCHESTRATOR]: [SpatialPermission.SPATIAL_READ] })
      );

      const position: SpatialPosition = [0, 0, 0];
      const decision = enforcer.validateSpatialOperation(
        'token',
        position,
        SpatialPermission.SPATIAL_READ
      );
      // Named zones have no bounds, so the position cannot match
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('No registered zone');
    });

    it('denies access when token is invalid', () => {
      setupInvalidToken('Expired token');

      const zone = createLocalZone('room-3', 'Room 3', 'public', 0, 10, 0, 5, 0, 3);
      enforcer.registerZone(zone);

      const position: SpatialPosition = [5, 2.5, 1.5];
      const decision = enforcer.validateSpatialOperation(
        'bad-token',
        position,
        SpatialPermission.SPATIAL_READ
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('Token verification failed');
    });

    it('checks altitude bounds for geospatial zones', () => {
      setupValidToken({ agent_role: AgentRole.ORCHESTRATOR, sub: 'agent:orch:1' });

      const zone = createGeospatialZone(
        'geo-alt',
        'Alt Check',
        'public',
        37.77,
        37.79,
        -122.43,
        -122.41,
        100,
        200
      );
      enforcer.registerZone(zone);
      enforcer.setPolicy(
        createZonePolicy('geo-alt', { [AgentRole.ORCHESTRATOR]: [SpatialPermission.SPATIAL_READ] })
      );

      // Inside altitude range
      const inside: SpatialPosition = [37.78, -122.42, 150];
      const insideDecision = enforcer.validateSpatialOperation(
        'token',
        inside,
        SpatialPermission.SPATIAL_READ
      );
      expect(insideDecision.allowed).toBe(true);

      // Outside altitude range (too high)
      const above: SpatialPosition = [37.78, -122.42, 300];
      const aboveDecision = enforcer.validateSpatialOperation(
        'token',
        above,
        SpatialPermission.SPATIAL_READ
      );
      expect(aboveDecision.allowed).toBe(false);

      // Outside altitude range (too low)
      const below: SpatialPosition = [37.78, -122.42, 50];
      const belowDecision = enforcer.validateSpatialOperation(
        'token',
        below,
        SpatialPermission.SPATIAL_READ
      );
      expect(belowDecision.allowed).toBe(false);
    });

    it('position on exact boundary is included (inclusive bounds)', () => {
      setupValidToken({ agent_role: AgentRole.ORCHESTRATOR, sub: 'agent:orch:1' });

      const zone = createLocalZone('edge', 'Edge Zone', 'public', 0, 10, 0, 5, 0, 3);
      enforcer.registerZone(zone);
      enforcer.setPolicy(
        createZonePolicy('edge', { [AgentRole.ORCHESTRATOR]: [SpatialPermission.SPATIAL_READ] })
      );

      // Exact corner
      const corner: SpatialPosition = [0, 0, 0];
      expect(
        enforcer.validateSpatialOperation('token', corner, SpatialPermission.SPATIAL_READ).allowed
      ).toBe(true);

      // Opposite exact corner
      const farCorner: SpatialPosition = [10, 5, 3];
      expect(
        enforcer.validateSpatialOperation('token', farCorner, SpatialPermission.SPATIAL_READ)
          .allowed
      ).toBe(true);
    });
  });

  // =========================================================================
  // getAccessibleZones
  // =========================================================================

  describe('getAccessibleZones', () => {
    it('returns zones where agent has at least one permission', () => {
      setupValidToken({ agent_role: AgentRole.CODE_GENERATOR, sub: 'agent:cg:1' });

      enforcer.registerZone(createNamedZone('open', 'Open', 'public'));
      enforcer.registerZone(createNamedZone('closed', 'Closed', 'private'));
      enforcer.registerZone(createNamedZone('partial', 'Partial', 'restricted'));

      // open: public classification -> SPATIAL_READ default
      // closed: private classification -> no defaults
      // partial: restricted classification -> SPATIAL_READ default

      const zones = enforcer.getAccessibleZones('token');
      expect(zones).toContain('open');
      expect(zones).toContain('partial');
      expect(zones).not.toContain('closed');
    });

    it('returns empty array when token is invalid', () => {
      setupInvalidToken();
      enforcer.registerZone(createNamedZone('any', 'Any', 'public'));

      const zones = enforcer.getAccessibleZones('bad-token');
      expect(zones).toEqual([]);
    });

    it('includes zones where agent has explicit grants via policy', () => {
      setupValidToken({ agent_role: AgentRole.SYNTAX_ANALYZER, sub: 'agent:sa:1' });

      const zone = createNamedZone('granted', 'Granted', 'private');
      enforcer.registerZone(zone);
      enforcer.setPolicy(
        createZonePolicy(
          'granted',
          { [AgentRole.SYNTAX_ANALYZER]: [SpatialPermission.SPATIAL_READ] },
          {},
          []
        )
      );

      const zones = enforcer.getAccessibleZones('token');
      expect(zones).toContain('granted');
    });
  });

  // =========================================================================
  // GDPR Audit Trail
  // =========================================================================

  describe('GDPR audit trail', () => {
    it('records audit entry for every access check', () => {
      setupValidToken({ agent_role: AgentRole.ORCHESTRATOR, sub: 'agent:orch:audit' });

      enforcer.registerZone(createNamedZone('audit-zone', 'Audit Zone', 'public'));
      enforcer.checkZoneAccess('token', 'audit-zone', SpatialPermission.SPATIAL_READ);

      const log = enforcer.getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].agentId).toBe('agent:orch:audit');
      expect(log[0].agentRole).toBe(AgentRole.ORCHESTRATOR);
      expect(log[0].zoneId).toBe('audit-zone');
      expect(log[0].operation).toBe(SpatialPermission.SPATIAL_READ);
      expect(log[0].allowed).toBe(true);
      expect(log[0].timestamp).toBeGreaterThan(0);
    });

    it('records audit entry for denied access', () => {
      setupValidToken({ agent_role: AgentRole.EXPORTER, sub: 'agent:exp:audit' });

      enforcer.registerZone(createNamedZone('audit-deny', 'Audit Deny', 'private'));
      enforcer.checkZoneAccess('token', 'audit-deny', SpatialPermission.SPATIAL_WRITE);

      const log = enforcer.getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].allowed).toBe(false);
    });

    it('records audit entry for failed token verification', () => {
      setupInvalidToken('Bad signature');

      enforcer.registerZone(createNamedZone('audit-bad', 'Audit Bad', 'public'));
      enforcer.checkZoneAccess('bad', 'audit-bad', SpatialPermission.SPATIAL_READ);

      const log = enforcer.getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].agentId).toBe('unknown');
      expect(log[0].allowed).toBe(false);
    });

    it('filters audit entries by agent ID', () => {
      setupValidToken({ agent_role: AgentRole.ORCHESTRATOR, sub: 'agent:A' });
      enforcer.registerZone(createNamedZone('z-a', 'A', 'public'));
      enforcer.checkZoneAccess('token', 'z-a', SpatialPermission.SPATIAL_READ);

      setupValidToken({ agent_role: AgentRole.ORCHESTRATOR, sub: 'agent:B' });
      enforcer.checkZoneAccess('token', 'z-a', SpatialPermission.SPATIAL_READ);

      const agentAEntries = enforcer.getAuditEntriesForAgent('agent:A');
      expect(agentAEntries).toHaveLength(1);
      expect(agentAEntries[0].agentId).toBe('agent:A');
    });

    it('filters audit entries by zone ID', () => {
      setupValidToken({ agent_role: AgentRole.ORCHESTRATOR, sub: 'agent:orch:z' });

      enforcer.registerZone(createNamedZone('zone-x', 'X', 'public'));
      enforcer.registerZone(createNamedZone('zone-y', 'Y', 'public'));

      enforcer.checkZoneAccess('token', 'zone-x', SpatialPermission.SPATIAL_READ);
      enforcer.checkZoneAccess('token', 'zone-y', SpatialPermission.SPATIAL_READ);

      const zoneXEntries = enforcer.getAuditEntriesForZone('zone-x');
      expect(zoneXEntries).toHaveLength(1);
      expect(zoneXEntries[0].zoneId).toBe('zone-x');
    });

    it('erases audit entries for a specific agent (GDPR right-to-erasure)', () => {
      setupValidToken({ agent_role: AgentRole.ORCHESTRATOR, sub: 'agent:erase-me' });
      enforcer.registerZone(createNamedZone('z-e', 'E', 'public'));
      enforcer.checkZoneAccess('token', 'z-e', SpatialPermission.SPATIAL_READ);
      enforcer.checkZoneAccess('token', 'z-e', SpatialPermission.SPATIAL_READ);

      setupValidToken({ agent_role: AgentRole.ORCHESTRATOR, sub: 'agent:keep-me' });
      enforcer.checkZoneAccess('token', 'z-e', SpatialPermission.SPATIAL_READ);

      const removed = enforcer.eraseAuditEntriesForAgent('agent:erase-me');
      expect(removed).toBe(2);
      expect(enforcer.getAuditLog()).toHaveLength(1);
      expect(enforcer.getAuditLog()[0].agentId).toBe('agent:keep-me');
    });

    it('clears the entire audit log', () => {
      setupValidToken();
      enforcer.registerZone(createNamedZone('z-clear', 'Clear', 'public'));
      enforcer.checkZoneAccess('token', 'z-clear', SpatialPermission.SPATIAL_READ);
      enforcer.checkZoneAccess('token', 'z-clear', SpatialPermission.SPATIAL_READ);

      enforcer.clearAuditLog();
      expect(enforcer.getAuditLog()).toHaveLength(0);
    });

    it('evicts oldest entries when audit log exceeds max size', () => {
      const smallEnforcer = createSpatialZoneEnforcer({ maxAuditEntries: 3 });
      setupValidToken({ agent_role: AgentRole.ORCHESTRATOR, sub: 'agent:orch:evict' });

      const zone = createNamedZone('z-evict', 'Evict', 'public');
      smallEnforcer.registerZone(zone);

      // Generate 5 entries
      for (let i = 0; i < 5; i++) {
        smallEnforcer.checkZoneAccess('token', 'z-evict', SpatialPermission.SPATIAL_READ);
      }

      const log = smallEnforcer.getAuditLog();
      expect(log.length).toBeLessThanOrEqual(3);
    });

    it('records audit for validateSpatialOperation', () => {
      setupValidToken({ agent_role: AgentRole.ORCHESTRATOR, sub: 'agent:orch:spatial' });

      const zone = createLocalZone('spatial-audit', 'SA', 'public', 0, 10, 0, 10, 0, 10);
      enforcer.registerZone(zone);
      enforcer.setPolicy(
        createZonePolicy('spatial-audit', {
          [AgentRole.ORCHESTRATOR]: [SpatialPermission.SPATIAL_READ],
        })
      );

      enforcer.validateSpatialOperation(
        'token',
        [5, 5, 5],
        SpatialPermission.SPATIAL_READ
      );

      const log = enforcer.getAuditLog();
      expect(log.length).toBeGreaterThanOrEqual(1);
      expect(log[0].agentId).toBe('agent:orch:spatial');
    });
  });

  // =========================================================================
  // SpatialPermission Enum
  // =========================================================================

  describe('SpatialPermission enum values', () => {
    it('has SPATIAL_READ', () => {
      expect(SpatialPermission.SPATIAL_READ).toBe('spatial:read');
    });

    it('has SPATIAL_WRITE', () => {
      expect(SpatialPermission.SPATIAL_WRITE).toBe('spatial:write');
    });

    it('has SPATIAL_DELETE', () => {
      expect(SpatialPermission.SPATIAL_DELETE).toBe('spatial:delete');
    });

    it('has SPATIAL_ADMIN', () => {
      expect(SpatialPermission.SPATIAL_ADMIN).toBe('spatial:admin');
    });
  });

  // =========================================================================
  // Factory function: createZonePolicy
  // =========================================================================

  describe('createZonePolicy factory', () => {
    it('creates a policy with defaults', () => {
      const policy = createZonePolicy('z-factory');
      expect(policy.zoneId).toBe('z-factory');
      expect(policy.rolePermissions).toEqual({});
      expect(policy.agentOverrides).toEqual({});
      expect(policy.defaultPermissions).toEqual([]);
    });

    it('creates a policy with all parameters', () => {
      const policy = createZonePolicy(
        'z-full',
        { admin: [SpatialPermission.SPATIAL_ADMIN] },
        { 'special:agent': [SpatialPermission.SPATIAL_WRITE] },
        [SpatialPermission.SPATIAL_READ]
      );
      expect(policy.zoneId).toBe('z-full');
      expect(policy.rolePermissions['admin']).toContain(SpatialPermission.SPATIAL_ADMIN);
      expect(policy.agentOverrides['special:agent']).toContain(SpatialPermission.SPATIAL_WRITE);
      expect(policy.defaultPermissions).toContain(SpatialPermission.SPATIAL_READ);
    });
  });

  // =========================================================================
  // Global Singleton
  // =========================================================================

  describe('Global singleton', () => {
    it('getSpatialZoneEnforcer returns the same instance', () => {
      resetSpatialZoneEnforcer();
      const a = getSpatialZoneEnforcer();
      const b = getSpatialZoneEnforcer();
      expect(a).toBe(b);
    });

    it('resetSpatialZoneEnforcer creates a new instance', () => {
      resetSpatialZoneEnforcer();
      const a = getSpatialZoneEnforcer();
      resetSpatialZoneEnforcer();
      const b = getSpatialZoneEnforcer();
      expect(a).not.toBe(b);
    });
  });

  // =========================================================================
  // Multiple overlapping zones
  // =========================================================================

  describe('Overlapping zones', () => {
    it('grants access if ANY overlapping zone grants the permission', () => {
      setupValidToken({ agent_role: AgentRole.CODE_GENERATOR, sub: 'agent:cg:overlap' });

      // Zone A: denies write
      const zoneA = createLocalZone('overlap-a', 'A', 'private', 0, 10, 0, 10, 0, 10);
      enforcer.registerZone(zoneA);
      enforcer.setPolicy(
        createZonePolicy(
          'overlap-a',
          { [AgentRole.CODE_GENERATOR]: [SpatialPermission.SPATIAL_READ] },
          {},
          []
        )
      );

      // Zone B: overlaps and grants write
      const zoneB = createLocalZone('overlap-b', 'B', 'private', 5, 15, 0, 10, 0, 10);
      enforcer.registerZone(zoneB);
      enforcer.setPolicy(
        createZonePolicy(
          'overlap-b',
          {
            [AgentRole.CODE_GENERATOR]: [
              SpatialPermission.SPATIAL_READ,
              SpatialPermission.SPATIAL_WRITE,
            ],
          },
          {},
          []
        )
      );

      // Position in overlap region
      const position: SpatialPosition = [7, 5, 5];
      const decision = enforcer.validateSpatialOperation(
        'token',
        position,
        SpatialPermission.SPATIAL_WRITE
      );
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toContain('overlap-b');
    });

    it('denies access if NO overlapping zone grants the permission', () => {
      setupValidToken({ agent_role: AgentRole.CODE_GENERATOR, sub: 'agent:cg:overlap2' });

      const zoneA = createLocalZone('deny-a', 'DA', 'private', 0, 10, 0, 10, 0, 10);
      enforcer.registerZone(zoneA);
      enforcer.setPolicy(createZonePolicy('deny-a', {}, {}, []));

      const zoneB = createLocalZone('deny-b', 'DB', 'private', 5, 15, 0, 10, 0, 10);
      enforcer.registerZone(zoneB);
      enforcer.setPolicy(createZonePolicy('deny-b', {}, {}, []));

      const position: SpatialPosition = [7, 5, 5];
      const decision = enforcer.validateSpatialOperation(
        'token',
        position,
        SpatialPermission.SPATIAL_READ
      );
      expect(decision.allowed).toBe(false);
    });
  });
});
