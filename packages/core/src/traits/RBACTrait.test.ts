/**
 * RBACTrait Tests
 *
 * Tests for enterprise multi-tenant capability-based access control.
 * Covers:
 * - Existing RBAC role/permission functionality
 * - checkCapability (agentDID, capability) via rbac_check_capability event
 * - setTenant (tenantId) via rbac_set_tenant event
 * - delegateSceneCapability via rbac_delegate_scene_capability event
 * - getTenantId accessor via rbac_get_tenant_id event
 * - Multi-tenant isolation (cross-tenant access prevention)
 * - Delegation attenuation enforcement
 * - Capability grant expiration
 * - Delegation usage constraints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rbacHandler } from './RBACTrait';
import type { RBACConfig } from './RBACTrait';
import type { TraitContext, TraitEvent } from './TraitTypes';

// =============================================================================
// TEST HELPERS
// =============================================================================

/** Create a minimal mock node */
function createMockNode(id = 'test-node') {
  return { id, type: 'entity', name: id } as any;
}

/** Create a mock trait context that captures emitted events */
function createMockContext() {
  const emittedEvents: Array<{ event: string; payload: any }> = [];
  const state: Record<string, unknown> = {};

  const context: TraitContext = {
    vr: {
      hands: { left: null, right: null },
      headset: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      getPointerRay: () => null,
      getDominantHand: () => null,
    },
    physics: {
      applyVelocity: vi.fn(),
      applyAngularVelocity: vi.fn(),
      setKinematic: vi.fn(),
      raycast: () => null,
      getBodyPosition: () => null,
      getBodyVelocity: () => null,
    },
    audio: {
      playSound: vi.fn(),
    } as any,
    haptics: {
      pulse: vi.fn(),
      rumble: vi.fn(),
    },
    emit: (event: string, payload?: unknown) => {
      emittedEvents.push({ event, payload });
    },
    getState: () => state,
    setState: (updates) => Object.assign(state, updates),
    getScaleMultiplier: () => 1,
    setScaleContext: vi.fn(),
  };

  return { context, emittedEvents };
}

/** Create a default RBAC config for testing */
function createTestConfig(overrides: Partial<RBACConfig> = {}): RBACConfig {
  return {
    tenantId: 'tenant-alpha',
    enabled: true,
    defaultRole: 'viewer',
    allowCustomRoles: true,
    maxCustomRoles: 10,
    requireMfaForAdmin: false,
    logAccessChecks: true,
    ownerIpAllowlist: [],
    sessionTimeouts: { owner: 30, admin: 60, editor: 120, viewer: 480 },
    ...overrides,
  };
}

/** Dispatch an event to the handler */
function dispatchEvent(
  node: any,
  config: RBACConfig,
  context: TraitContext,
  event: Record<string, any>
) {
  rbacHandler.onEvent!(node, config, context, event as TraitEvent);
}

/** Find emitted events by name */
function findEmitted(emittedEvents: Array<{ event: string; payload: any }>, eventName: string) {
  return emittedEvents.filter((e) => e.event === eventName);
}

/** Get the last emitted event with a specific name */
function lastEmitted(emittedEvents: Array<{ event: string; payload: any }>, eventName: string) {
  const events = findEmitted(emittedEvents, eventName);
  return events.length > 0 ? events[events.length - 1] : undefined;
}

// =============================================================================
// TESTS
// =============================================================================

describe('RBACTrait', () => {
  let node: any;
  let config: RBACConfig;
  let context: TraitContext;
  let emittedEvents: Array<{ event: string; payload: any }>;

  beforeEach(() => {
    node = createMockNode();
    config = createTestConfig();
    const mock = createMockContext();
    context = mock.context;
    emittedEvents = mock.emittedEvents;

    // Initialize the trait
    rbacHandler.onAttach!(node, config, context);
  });

  // ===========================================================================
  // EXISTING RBAC FUNCTIONALITY (Preserve backward compatibility)
  // ===========================================================================

  describe('initialization', () => {
    it('should initialize with tenant ID', () => {
      const initEvent = lastEmitted(emittedEvents, 'rbac_initialized');
      expect(initEvent).toBeDefined();
      expect(initEvent!.payload.tenantId).toBe('tenant-alpha');
    });

    it('should emit error when no tenant ID provided', () => {
      const emptyNode = createMockNode('empty');
      const emptyConfig = createTestConfig({ tenantId: '' });
      const mock2 = createMockContext();

      rbacHandler.onAttach!(emptyNode, emptyConfig, mock2.context);

      const errorEvent = lastEmitted(mock2.emittedEvents, 'rbac_error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.payload.error).toBe('TENANT_ID_REQUIRED');
    });

    it('should initialize built-in roles', () => {
      const initEvent = lastEmitted(emittedEvents, 'rbac_initialized');
      expect(initEvent!.payload.rolesCount).toBe(4); // viewer, editor, admin, owner
    });
  });

  describe('role assignment', () => {
    it('should assign a role to a user', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_assign_role',
        userId: 'user-1',
        role: 'editor',
        assignedBy: 'admin-1',
      });

      const assigned = lastEmitted(emittedEvents, 'rbac_role_assigned');
      expect(assigned).toBeDefined();
      expect(assigned!.payload.userId).toBe('user-1');
      expect(assigned!.payload.role).toBe('editor');
    });

    it('should emit error for non-existent role', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_assign_role',
        userId: 'user-1',
        role: 'nonexistent',
        assignedBy: 'admin-1',
      });

      const error = lastEmitted(emittedEvents, 'rbac_error');
      expect(error).toBeDefined();
      expect(error!.payload.error).toBe('ROLE_NOT_FOUND');
    });
  });

  describe('permission checks (legacy)', () => {
    it('should grant permission for assigned role', () => {
      // Assign editor role
      dispatchEvent(node, config, context, {
        type: 'rbac_assign_role',
        userId: 'user-1',
        role: 'editor',
        assignedBy: 'admin-1',
      });

      // Check permission
      dispatchEvent(node, config, context, {
        type: 'rbac_check_permission',
        userId: 'user-1',
        permission: 'scene.create',
        checkId: 'check-1',
      });

      const result = lastEmitted(emittedEvents, 'rbac_permission_result');
      expect(result).toBeDefined();
      expect(result!.payload.granted).toBe(true);
    });

    it('should deny permission for viewer creating scenes', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_assign_role',
        userId: 'user-2',
        role: 'viewer',
        assignedBy: 'admin-1',
      });

      dispatchEvent(node, config, context, {
        type: 'rbac_check_permission',
        userId: 'user-2',
        permission: 'scene.create',
        checkId: 'check-2',
      });

      const result = lastEmitted(emittedEvents, 'rbac_permission_result');
      expect(result!.payload.granted).toBe(false);
    });
  });

  // ===========================================================================
  // CAPABILITY-BASED ACCESS CONTROL
  // ===========================================================================

  describe('capability grants', () => {
    it('should grant a capability to an agent', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:agent-1',
        capabilityWith: 'holoscript://scenes/main',
        capabilityCan: 'scene/edit',
        grantedBy: 'did:key:admin',
      });

      const granted = lastEmitted(emittedEvents, 'rbac_capability_granted');
      expect(granted).toBeDefined();
      expect(granted!.payload.agentDID).toBe('did:key:agent-1');
      expect(granted!.payload.capability.can).toBe('scene/edit');
      expect(granted!.payload.tenantId).toBe('tenant-alpha');
    });

    it('should emit error when missing required parameters for grant', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:agent-1',
        // missing capabilityCan
      });

      const error = lastEmitted(emittedEvents, 'rbac_error');
      expect(error).toBeDefined();
      expect(error!.payload.error).toBe('MISSING_PARAMETERS');
    });
  });

  describe('checkCapability', () => {
    it('should verify an agent has a granted capability', () => {
      // Grant capability
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:agent-1',
        capabilityWith: 'holoscript://scenes/main',
        capabilityCan: 'scene/edit',
        grantedBy: 'did:key:admin',
      });

      // Check capability
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:agent-1',
        capability: 'scene/edit',
        checkId: 'cap-check-1',
      });

      const result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result).toBeDefined();
      expect(result!.payload.result.granted).toBe(true);
      expect(result!.payload.result.source).toBe('direct_grant');
    });

    it('should deny capability for agent without grant', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:unknown-agent',
        capability: 'scene/edit',
        checkId: 'cap-check-2',
      });

      const result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result).toBeDefined();
      expect(result!.payload.result.granted).toBe(false);
    });

    it('should deny capability for wrong action', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:agent-2',
        capabilityCan: 'scene/read',
        grantedBy: 'did:key:admin',
      });

      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:agent-2',
        capability: 'scene/edit',
        checkId: 'cap-check-3',
      });

      const result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(false);
    });

    it('should grant wildcard capability', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:superagent',
        capabilityCan: '*',
        grantedBy: 'did:key:root',
      });

      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:superagent',
        capability: 'scene/edit',
        checkId: 'cap-check-wildcard',
      });

      const result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(true);
    });

    it('should grant namespace wildcard capability', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:scene-admin',
        capabilityCan: 'scene/*',
        grantedBy: 'did:key:admin',
      });

      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:scene-admin',
        capability: 'scene/edit',
        checkId: 'cap-check-ns-wildcard',
      });

      const result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(true);
    });

    it('should emit error when missing parameters', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        // missing agentDID and capability
        checkId: 'cap-check-missing',
      });

      const error = lastEmitted(emittedEvents, 'rbac_error');
      expect(error).toBeDefined();
      expect(error!.payload.error).toBe('MISSING_PARAMETERS');
    });

    it('should log capability check in access log', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:logged-agent',
        capabilityCan: 'ast/read',
        grantedBy: 'did:key:admin',
      });

      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:logged-agent',
        capability: 'ast/read',
        checkId: 'cap-check-log',
      });

      const auditLog = lastEmitted(emittedEvents, 'audit_log');
      expect(auditLog).toBeDefined();
      expect(auditLog!.payload.action).toBe('rbac.capability.check');
    });
  });

  describe('capability revocation', () => {
    it('should revoke a capability from an agent', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:revoke-test',
        capabilityCan: 'scene/edit',
        grantedBy: 'did:key:admin',
      });

      // Verify granted
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:revoke-test',
        capability: 'scene/edit',
        checkId: 'revoke-check-1',
      });

      let result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(true);

      // Revoke
      dispatchEvent(node, config, context, {
        type: 'rbac_revoke_capability',
        agentDID: 'did:key:revoke-test',
        capabilityCan: 'scene/edit',
        revokedBy: 'did:key:admin',
      });

      const revoked = lastEmitted(emittedEvents, 'rbac_capability_revoked');
      expect(revoked).toBeDefined();

      // Verify denied after revocation
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:revoke-test',
        capability: 'scene/edit',
        checkId: 'revoke-check-2',
      });

      result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(false);
    });
  });

  // ===========================================================================
  // TENANT MANAGEMENT
  // ===========================================================================

  describe('setTenant', () => {
    it('should change the current tenant ID', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_set_tenant',
        tenantId: 'tenant-beta',
      });

      const changed = lastEmitted(emittedEvents, 'rbac_tenant_changed');
      expect(changed).toBeDefined();
      expect(changed!.payload.previousTenantId).toBe('tenant-alpha');
      expect(changed!.payload.newTenantId).toBe('tenant-beta');
    });

    it('should emit error when tenant ID is empty', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_set_tenant',
        tenantId: '',
      });

      const error = lastEmitted(emittedEvents, 'rbac_error');
      expect(error).toBeDefined();
      expect(error!.payload.error).toBe('TENANT_ID_REQUIRED');
    });

    it('should scope subsequent capability checks to new tenant', () => {
      // Grant capability in tenant-alpha
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:agent-tenant',
        capabilityCan: 'scene/edit',
        grantedBy: 'did:key:admin',
      });

      // Switch to tenant-beta
      dispatchEvent(node, config, context, {
        type: 'rbac_set_tenant',
        tenantId: 'tenant-beta',
      });

      // Capability from tenant-alpha should NOT be visible in tenant-beta
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:agent-tenant',
        capability: 'scene/edit',
        checkId: 'tenant-scope-1',
      });

      const result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(false);
      expect(result!.payload.tenantId).toBe('tenant-beta');
    });
  });

  describe('getTenantId', () => {
    it('should return the current tenant ID', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_get_tenant_id',
        queryId: 'query-1',
      });

      const tenantIdEvent = lastEmitted(emittedEvents, 'rbac_tenant_id');
      expect(tenantIdEvent).toBeDefined();
      expect(tenantIdEvent!.payload.tenantId).toBe('tenant-alpha');
    });

    it('should reflect tenant changes', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_set_tenant',
        tenantId: 'tenant-gamma',
      });

      dispatchEvent(node, config, context, {
        type: 'rbac_get_tenant_id',
        queryId: 'query-2',
      });

      const tenantIdEvent = lastEmitted(emittedEvents, 'rbac_tenant_id');
      expect(tenantIdEvent!.payload.tenantId).toBe('tenant-gamma');
    });
  });

  // ===========================================================================
  // MULTI-TENANT ISOLATION
  // ===========================================================================

  describe('multi-tenant isolation', () => {
    it('should prevent cross-tenant access to capabilities', () => {
      // Grant capability in tenant-alpha
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:agent-x',
        capabilityCan: 'scene/edit',
        grantedBy: 'did:key:admin',
      });

      // Verify it works in tenant-alpha
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:agent-x',
        capability: 'scene/edit',
        checkId: 'isolation-1',
      });

      let result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(true);

      // Switch to tenant-beta
      dispatchEvent(node, config, context, {
        type: 'rbac_set_tenant',
        tenantId: 'tenant-beta',
      });

      // Same agent, same capability, different tenant => DENIED
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:agent-x',
        capability: 'scene/edit',
        checkId: 'isolation-2',
      });

      result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(false);
    });

    it('should allow same agent different capabilities per tenant', () => {
      // Grant scene/edit in tenant-alpha
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:multi-tenant-agent',
        capabilityCan: 'scene/edit',
        grantedBy: 'did:key:admin',
      });

      // Switch to tenant-beta
      dispatchEvent(node, config, context, {
        type: 'rbac_set_tenant',
        tenantId: 'tenant-beta',
      });

      // Grant scene/read in tenant-beta
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:multi-tenant-agent',
        capabilityCan: 'scene/read',
        grantedBy: 'did:key:beta-admin',
      });

      // Check scene/read in tenant-beta => GRANTED
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:multi-tenant-agent',
        capability: 'scene/read',
        checkId: 'multi-tenant-1',
      });

      let result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(true);

      // Check scene/edit in tenant-beta => DENIED (only granted in alpha)
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:multi-tenant-agent',
        capability: 'scene/edit',
        checkId: 'multi-tenant-2',
      });

      result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(false);

      // Switch back to tenant-alpha
      dispatchEvent(node, config, context, {
        type: 'rbac_set_tenant',
        tenantId: 'tenant-alpha',
      });

      // Check scene/edit in tenant-alpha => GRANTED
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:multi-tenant-agent',
        capability: 'scene/edit',
        checkId: 'multi-tenant-3',
      });

      result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(true);
    });

    it('should isolate delegations per tenant', () => {
      // Grant capability to delegator in tenant-alpha
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:delegator',
        capabilityCan: 'scene/edit',
        grantedBy: 'did:key:admin',
      });

      // Delegate in tenant-alpha
      dispatchEvent(node, config, context, {
        type: 'rbac_delegate_scene_capability',
        fromDID: 'did:key:delegator',
        toDID: 'did:key:delegatee',
        capabilityCan: 'scene/edit',
      });

      // Verify delegation works in tenant-alpha
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:delegatee',
        capability: 'scene/edit',
        checkId: 'deleg-isolation-1',
      });

      let result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(true);

      // Switch to tenant-beta
      dispatchEvent(node, config, context, {
        type: 'rbac_set_tenant',
        tenantId: 'tenant-beta',
      });

      // Delegation should NOT carry over to tenant-beta
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:delegatee',
        capability: 'scene/edit',
        checkId: 'deleg-isolation-2',
      });

      result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(false);
    });
  });

  // ===========================================================================
  // DELEGATION
  // ===========================================================================

  describe('delegateSceneCapability', () => {
    beforeEach(() => {
      // Grant base capability to the delegator (wildcard resource scope)
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:delegator',
        capabilityCan: 'scene/edit',
        grantedBy: 'did:key:admin',
      });
    });

    it('should delegate a capability from one agent to another', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_delegate_scene_capability',
        fromDID: 'did:key:delegator',
        toDID: 'did:key:receiver',
        capabilityCan: 'scene/edit',
      });

      const delegated = lastEmitted(emittedEvents, 'rbac_capability_delegated');
      expect(delegated).toBeDefined();
      expect(delegated!.payload.fromDID).toBe('did:key:delegator');
      expect(delegated!.payload.toDID).toBe('did:key:receiver');
      expect(delegated!.payload.delegationId).toBeDefined();
    });

    it('should allow delegatee to use the delegated capability', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_delegate_scene_capability',
        fromDID: 'did:key:delegator',
        toDID: 'did:key:receiver',
        capabilityCan: 'scene/edit',
      });

      // Check the delegatee has the capability
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:receiver',
        capability: 'scene/edit',
        checkId: 'deleg-check-1',
      });

      const result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(true);
      expect(result!.payload.result.source).toBe('delegation');
    });

    it('should deny delegation when delegator lacks the capability', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_delegate_scene_capability',
        fromDID: 'did:key:unauthorized-agent',
        toDID: 'did:key:receiver',
        capabilityCan: 'scene/edit',
      });

      const error = lastEmitted(emittedEvents, 'rbac_error');
      expect(error).toBeDefined();
      expect(error!.payload.error).toBe('DELEGATION_UNAUTHORIZED');
    });

    it('should emit error when required parameters are missing', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_delegate_scene_capability',
        fromDID: 'did:key:delegator',
        // missing toDID and capabilityCan
      });

      const error = lastEmitted(emittedEvents, 'rbac_error');
      expect(error).toBeDefined();
      expect(error!.payload.error).toBe('MISSING_PARAMETERS');
    });

    it('should enforce attenuation (narrowing only)', () => {
      // Grant a specific resource scope
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:narrow-delegator',
        capabilityWith: 'holoscript://scenes/room-a',
        capabilityCan: 'scene/edit',
        grantedBy: 'did:key:admin',
      });

      // Try to delegate a wider scope than what delegator has
      dispatchEvent(node, config, context, {
        type: 'rbac_delegate_scene_capability',
        fromDID: 'did:key:narrow-delegator',
        toDID: 'did:key:greedy-receiver',
        capabilityWith: 'holoscript://scenes', // wider than room-a
        capabilityCan: 'scene/edit',
      });

      const error = lastEmitted(emittedEvents, 'rbac_error');
      expect(error).toBeDefined();
      expect(error!.payload.error).toBe('ATTENUATION_VIOLATION');
    });

    it('should allow narrower delegation', () => {
      // Grant at scenes level
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:broad-delegator',
        capabilityWith: 'holoscript://scenes',
        capabilityCan: 'scene/edit',
        grantedBy: 'did:key:admin',
      });

      // Delegate a narrower scope (specific sub-path)
      dispatchEvent(node, config, context, {
        type: 'rbac_delegate_scene_capability',
        fromDID: 'did:key:broad-delegator',
        toDID: 'did:key:narrow-receiver',
        capabilityWith: 'holoscript://scenes/room-b',
        capabilityCan: 'scene/edit',
      });

      const delegated = lastEmitted(emittedEvents, 'rbac_capability_delegated');
      expect(delegated).toBeDefined();
      expect(delegated!.payload.capability.with).toBe('holoscript://scenes/room-b');
    });

    it('should respect delegation usage constraints (maxUses)', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_delegate_scene_capability',
        fromDID: 'did:key:delegator',
        toDID: 'did:key:limited-receiver',
        capabilityCan: 'scene/edit',
        constraints: { maxUses: 2 },
      });

      // Use 1
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:limited-receiver',
        capability: 'scene/edit',
        checkId: 'use-1',
      });
      let result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(true);

      // Use 2
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:limited-receiver',
        capability: 'scene/edit',
        checkId: 'use-2',
      });
      result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(true);

      // Use 3 should be DENIED (maxUses exceeded)
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:limited-receiver',
        capability: 'scene/edit',
        checkId: 'use-3',
      });
      result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(false);
    });

    it('should emit audit log for delegation', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_delegate_scene_capability',
        fromDID: 'did:key:delegator',
        toDID: 'did:key:audited-receiver',
        capabilityCan: 'scene/edit',
      });

      const auditLogs = findEmitted(emittedEvents, 'audit_log');
      const delegationLog = auditLogs.find(
        (e) => e.payload.action === 'rbac.capability.delegate'
      );
      expect(delegationLog).toBeDefined();
      expect(delegationLog!.payload.details.fromDID).toBe('did:key:delegator');
      expect(delegationLog!.payload.details.toDID).toBe('did:key:audited-receiver');
    });
  });

  // ===========================================================================
  // QUERY AGENT CAPABILITIES
  // ===========================================================================

  describe('query agent capabilities', () => {
    it('should list all capabilities for an agent in current tenant', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:queried-agent',
        capabilityCan: 'scene/edit',
        grantedBy: 'did:key:admin',
      });

      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:queried-agent',
        capabilityCan: 'ast/read',
        grantedBy: 'did:key:admin',
      });

      dispatchEvent(node, config, context, {
        type: 'rbac_query_agent_capabilities',
        agentDID: 'did:key:queried-agent',
        queryId: 'query-caps-1',
      });

      const caps = lastEmitted(emittedEvents, 'rbac_agent_capabilities');
      expect(caps).toBeDefined();
      expect(caps!.payload.directGrants.length).toBe(2);
      expect(caps!.payload.tenantId).toBe('tenant-alpha');
    });

    it('should include delegated capabilities in query', () => {
      // Grant to delegator
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:cap-delegator',
        capabilityCan: 'scene/edit',
        grantedBy: 'did:key:admin',
      });

      // Delegate
      dispatchEvent(node, config, context, {
        type: 'rbac_delegate_scene_capability',
        fromDID: 'did:key:cap-delegator',
        toDID: 'did:key:cap-receiver',
        capabilityCan: 'scene/edit',
      });

      // Query
      dispatchEvent(node, config, context, {
        type: 'rbac_query_agent_capabilities',
        agentDID: 'did:key:cap-receiver',
        queryId: 'query-deleg-1',
      });

      const caps = lastEmitted(emittedEvents, 'rbac_agent_capabilities');
      expect(caps!.payload.directGrants.length).toBe(0);
      expect(caps!.payload.delegatedGrants.length).toBe(1);
      expect(caps!.payload.delegatedGrants[0].fromDID).toBe('did:key:cap-delegator');
    });
  });

  // ===========================================================================
  // CAPABILITY EXPIRATION
  // ===========================================================================

  describe('capability grant expiration', () => {
    it('should expire grants during onUpdate', () => {
      // Grant a capability that already expired
      const pastDate = new Date(Date.now() - 10000).toISOString();

      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:expiring-agent',
        capabilityCan: 'scene/edit',
        grantedBy: 'did:key:admin',
        expiresAt: pastDate,
      });

      // Run update to trigger expiration
      rbacHandler.onUpdate!(node, config, context, 0.016);

      // Check should now be denied
      dispatchEvent(node, config, context, {
        type: 'rbac_check_capability',
        agentDID: 'did:key:expiring-agent',
        capability: 'scene/edit',
        checkId: 'expire-check-1',
      });

      const result = lastEmitted(emittedEvents, 'rbac_capability_result');
      expect(result!.payload.result.granted).toBe(false);
    });
  });

  // ===========================================================================
  // TEARDOWN
  // ===========================================================================

  describe('teardown', () => {
    it('should include capability stats in teardown audit log', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_grant_capability',
        agentDID: 'did:key:teardown-agent',
        capabilityCan: 'scene/edit',
        grantedBy: 'did:key:admin',
      });

      rbacHandler.onDetach!(node, config, context);

      const auditLogs = findEmitted(emittedEvents, 'audit_log');
      const teardownLog = auditLogs.find((e) => e.payload.action === 'rbac.teardown');
      expect(teardownLog).toBeDefined();
      expect(teardownLog!.payload.details.totalCapabilityGrants).toBe(1);
      expect(teardownLog!.payload.details.totalDelegations).toBe(0);
    });
  });

  // ===========================================================================
  // EXISTING ROLE FUNCTIONALITY STILL WORKS (Regression)
  // ===========================================================================

  describe('backward compatibility', () => {
    it('should still support role assignment events', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_assign_role',
        userId: 'legacy-user',
        role: 'admin',
        assignedBy: 'system',
      });

      const assigned = lastEmitted(emittedEvents, 'rbac_role_assigned');
      expect(assigned!.payload.role).toBe('admin');
    });

    it('should still support role revocation events', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_assign_role',
        userId: 'revoke-user',
        role: 'editor',
        assignedBy: 'system',
      });

      dispatchEvent(node, config, context, {
        type: 'rbac_revoke_role',
        userId: 'revoke-user',
        role: 'editor',
        revokedBy: 'admin',
      });

      const revoked = lastEmitted(emittedEvents, 'rbac_role_revoked');
      expect(revoked).toBeDefined();
    });

    it('should still support custom role creation', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_create_custom_role',
        role: 'scene-designer',
        label: 'Scene Designer',
        description: 'Can design scenes',
        permissions: [{ category: 'scene', action: 'create' }],
        inheritsFrom: 'viewer',
      });

      const created = lastEmitted(emittedEvents, 'rbac_custom_role_created');
      expect(created).toBeDefined();
      expect(created!.payload.role).toBe('scene-designer');
    });

    it('should still support permission checks with inherited roles', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_assign_role',
        userId: 'admin-user',
        role: 'admin',
        assignedBy: 'owner',
      });

      // Admin inherits from editor, which inherits from viewer
      // Viewer has trait.view
      dispatchEvent(node, config, context, {
        type: 'rbac_check_permission',
        userId: 'admin-user',
        permission: 'trait.view',
        checkId: 'inherit-check',
      });

      const result = lastEmitted(emittedEvents, 'rbac_permission_result');
      expect(result!.payload.granted).toBe(true);
    });

    it('should still support user role queries', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_assign_role',
        userId: 'queried-user',
        role: 'editor',
        assignedBy: 'admin',
      });

      dispatchEvent(node, config, context, {
        type: 'rbac_query_user_roles',
        userId: 'queried-user',
        queryId: 'roles-query-1',
      });

      const rolesEvent = lastEmitted(emittedEvents, 'rbac_user_roles');
      expect(rolesEvent).toBeDefined();
      expect(rolesEvent!.payload.roles.length).toBe(1);
      expect(rolesEvent!.payload.roles[0].role).toBe('editor');
    });

    it('should still support access log queries', () => {
      dispatchEvent(node, config, context, {
        type: 'rbac_assign_role',
        userId: 'log-user',
        role: 'viewer',
        assignedBy: 'admin',
      });

      dispatchEvent(node, config, context, {
        type: 'rbac_check_permission',
        userId: 'log-user',
        permission: 'scene.read',
        checkId: 'log-check',
      });

      dispatchEvent(node, config, context, {
        type: 'rbac_query_access_log',
        queryId: 'log-query-1',
        limit: 50,
      });

      const logEvent = lastEmitted(emittedEvents, 'rbac_access_log');
      expect(logEvent).toBeDefined();
      expect(logEvent!.payload.entries.length).toBeGreaterThan(0);
    });
  });
});
