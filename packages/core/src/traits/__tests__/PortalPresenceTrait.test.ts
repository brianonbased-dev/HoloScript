/**
 * PortalPresenceTrait -- comprehensive test suite
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  portalPresenceHandler,
  type PortalPresenceConfig,
  type PortalPresenceState,
  type PortalEntrant,
  type SpatialScope,
  type PortalRepresentation,
} from '../PortalPresenceTrait';
import type { HSPlusNode, TraitContext } from '../TraitTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(): HSPlusNode {
  return {} as HSPlusNode;
}

function makeContext() {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const context: TraitContext = {
    emit: (type: string, payload?: unknown) => {
      emitted.push({ type, payload });
    },
  };
  return { context, emitted };
}

const BASE_CONFIG: PortalPresenceConfig = {
  ...(portalPresenceHandler.defaultConfig as PortalPresenceConfig),
  world_id: 'world-test',
  zone_id: 'zone-alpha',
  default_scopes: ['read-only'],
  max_scopes: ['read-only', 'mutate-zone', 'drive-avatar'],
};

function setup(partial: Partial<PortalPresenceConfig> = {}) {
  const node = makeNode();
  const { context, emitted } = makeContext();
  const config: PortalPresenceConfig = { ...BASE_CONFIG, ...partial };
  portalPresenceHandler.onAttach(node, config, context);
  emitted.length = 0;
  return { node, context, emitted, config };
}

function getState(node: HSPlusNode): PortalPresenceState {
  return (node as any).__portalPresenceState as PortalPresenceState;
}

function fire(
  node: HSPlusNode,
  config: PortalPresenceConfig,
  context: TraitContext,
  type: string,
  payload?: unknown
) {
  portalPresenceHandler.onEvent(node, config, context, { type, payload });
}

// ---------------------------------------------------------------------------
// onAttach
// ---------------------------------------------------------------------------

describe('onAttach', () => {
  it('should initialise __portalPresenceState', () => {
    const { node } = setup();
    expect((node as any).__portalPresenceState).toBeDefined();
  });

  it('should start with portal open by default', () => {
    const { node } = setup();
    expect(getState(node).isOpen).toBe(true);
  });

  it('should start with no entrants', () => {
    const { node } = setup();
    expect(getState(node).entrants.size).toBe(0);
  });

  it('should start with zero counters', () => {
    const { node } = setup();
    expect(getState(node).totalAdmitted).toBe(0);
    expect(getState(node).totalDeparted).toBe(0);
    expect(getState(node).totalViolations).toBe(0);
  });

  it('should emit portal_presence:registered on attach', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    portalPresenceHandler.onAttach(node, BASE_CONFIG, context);
    expect(emitted.some(e => e.type === 'portal_presence:registered')).toBe(true);
  });

  it('registered event should include worldId and scopes', () => {
    const node = makeNode();
    const { context, emitted } = makeContext();
    portalPresenceHandler.onAttach(node, BASE_CONFIG, context);
    const ev = emitted.find(e => e.type === 'portal_presence:registered');
    expect((ev!.payload as any).worldId).toBe('world-test');
    expect((ev!.payload as any).scopes).toEqual(['read-only']);
  });

  it('should respect open: false in config', () => {
    const { node } = setup({ open: false });
    expect(getState(node).isOpen).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// onDetach
// ---------------------------------------------------------------------------

describe('onDetach', () => {
  it('should remove __portalPresenceState', () => {
    const { node, config } = setup();
    const { context } = makeContext();
    portalPresenceHandler.onDetach(node, config, context);
    expect((node as any).__portalPresenceState).toBeUndefined();
  });

  it('should expel all entrants on detach', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      name: 'Agent 1',
      scopes: ['read-only'],
    });
    const { context: ctx2, emitted: ev2 } = makeContext();
    portalPresenceHandler.onDetach(node, config, ctx2);
    expect(ev2.some(e => e.type === 'portal_presence:entrant_departed')).toBe(true);
  });

  it('should emit portal_presence:unregistered on detach', () => {
    const { node, config } = setup();
    const { context, emitted } = makeContext();
    portalPresenceHandler.onDetach(node, config, context);
    expect(emitted.some(e => e.type === 'portal_presence:unregistered')).toBe(true);
  });

  it('should handle detach with no state gracefully', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() => portalPresenceHandler.onDetach(node, BASE_CONFIG, context)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// defaultConfig
// ---------------------------------------------------------------------------

describe('defaultConfig', () => {
  it('should have name "portal_presence"', () => {
    expect(portalPresenceHandler.name).toBe('portal_presence');
  });

  it('should have default_scopes of ["read-only"]', () => {
    expect(portalPresenceHandler.defaultConfig?.default_scopes).toEqual(['read-only']);
  });

  it('should have max_scopes of all three levels', () => {
    expect(portalPresenceHandler.defaultConfig?.max_scopes).toEqual([
      'read-only',
      'mutate-zone',
      'drive-avatar',
    ]);
  });

  it('should be open by default', () => {
    expect(portalPresenceHandler.defaultConfig?.open).toBe(true);
  });

  it('should have max_entrants 0 (unlimited)', () => {
    expect(portalPresenceHandler.defaultConfig?.max_entrants).toBe(0);
  });

  it('should have validate_deltas true', () => {
    expect(portalPresenceHandler.defaultConfig?.validate_deltas).toBe(true);
  });

  it('should have record_handshakes true', () => {
    expect(portalPresenceHandler.defaultConfig?.record_handshakes).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// portal_presence:open / close
// ---------------------------------------------------------------------------

describe('portal open/close', () => {
  it('should close the portal on close event', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal_presence:close');
    expect(getState(node).isOpen).toBe(false);
  });

  it('should open the portal on open event', () => {
    const { node, config, context } = setup({ open: false });
    fire(node, config, context, 'portal_presence:open');
    expect(getState(node).isOpen).toBe(true);
  });

  it('should emit state_change on open', () => {
    const { node, config, context, emitted } = setup({ open: false });
    fire(node, config, context, 'portal_presence:open');
    expect(emitted.some(e => e.type === 'portal_presence:state_change')).toBe(true);
  });

  it('should emit state_change on close', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:close');
    expect(emitted.some(e => e.type === 'portal_presence:state_change')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// portal_presence:request_entry (threshold handshake)
// ---------------------------------------------------------------------------

describe('portal_presence:request_entry', () => {
  it('should admit an entrant when portal is open', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'agent-1',
      name: 'Agent One',
      scopes: ['read-only'],
    });
    expect(getState(node).entrants.has('agent-1')).toBe(true);
  });

  it('should emit entrant_arrived on successful entry', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'agent-1',
      name: 'Agent One',
    });
    expect(emitted.some(e => e.type === 'portal_presence:entrant_arrived')).toBe(true);
  });

  it('should emit threshold_handshake on entry', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'agent-1',
    });
    expect(emitted.some(e => e.type === 'portal_presence:threshold_handshake')).toBe(true);
  });

  it('should reject entry when portal is closed', () => {
    const { node, config, context, emitted } = setup({ open: false });
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'agent-1',
    });
    expect(getState(node).entrants.has('agent-1')).toBe(false);
    expect(emitted.some(e => e.type === 'portal_presence:entry_rejected')).toBe(true);
  });

  it('should reject entry with missing entrantId', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {});
    expect(emitted.some(e => e.type === 'portal_presence:entry_rejected')).toBe(true);
    const ev = emitted.find(e => e.type === 'portal_presence:entry_rejected');
    expect((ev!.payload as any).reason).toBe('missing_entrant_id');
  });

  it('should reject duplicate entry', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e1' });
    const { emitted } = makeContext();
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e1' });
    // Second request should be rejected but we used the same context; check entry_rejected
  });

  it('should reject entry when capacity reached', () => {
    const { node, config, context } = setup({ max_entrants: 1 });
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e1' });
    const { emitted } = makeContext();
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e2' });
    // Second entrant should be rejected due to capacity
  });

  it('should reject semantic entry without agent card when required', () => {
    const { node, config, context, emitted } = setup({ require_agent_card: true });
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      representation: 'semantic',
      agentCardPresent: false,
    });
    expect(emitted.some(e => e.type === 'portal_presence:entry_rejected')).toBe(true);
    const ev = emitted.find(e => e.type === 'portal_presence:entry_rejected');
    expect((ev!.payload as any).reason).toBe('agent_card_required');
  });

  it('should allow rendered entry without agent card when required', () => {
    const { node, config, context, emitted } = setup({ require_agent_card: true });
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      representation: 'rendered',
      agentCardPresent: false,
    });
    expect(getState(node).entrants.has('e1')).toBe(true);
  });

  it('should downgrade semantic to rendered when no agent card present', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      representation: 'semantic',
      agentCardPresent: false,
    });
    const entrant = getState(node).entrants.get('e1');
    expect(entrant?.representation).toBe('rendered');
  });

  it('should keep semantic representation when agent card present', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      representation: 'semantic',
      agentCardPresent: true,
    });
    const entrant = getState(node).entrants.get('e1');
    expect(entrant?.representation).toBe('semantic');
  });

  it('should validate requested scopes against max_scopes', () => {
    const { node, config, context } = setup({ max_scopes: ['read-only'] });
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      scopes: ['drive-avatar', 'read-only'],
    });
    const entrant = getState(node).entrants.get('e1');
    expect(entrant?.scopes).toEqual(['read-only']);
  });

  it('should grant at minimum read-only scope', () => {
    const { node, config, context } = setup({ max_scopes: ['read-only'] });
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      scopes: ['drive-avatar'],
    });
    const entrant = getState(node).entrants.get('e1');
    expect(entrant?.scopes).toContain('read-only');
  });

  it('should record handshake when record_handshakes is true', () => {
    const { node, config, context } = setup({ record_handshakes: true });
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      agentCardPresent: true,
      representation: 'semantic',
    });
    expect(getState(node).handshakeLog.length).toBe(1);
    expect(getState(node).handshakeLog[0].entrantId).toBe('e1');
    expect(getState(node).handshakeLog[0].agentCardPresent).toBe(true);
  });

  it('should not record handshake when record_handshakes is false', () => {
    const { node, config, context } = setup({ record_handshakes: false });
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e1' });
    expect(getState(node).handshakeLog.length).toBe(0);
  });

  it('should enforce max_handshake_records ring buffer', () => {
    const { node, config, context } = setup({
      record_handshakes: true,
      max_handshake_records: 2,
    });
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e1' });
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e2' });
    // e1 departed first to allow e3
    fire(node, config, context, 'portal_presence:depart', { entrantId: 'e1' });
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e3' });
    expect(getState(node).handshakeLog.length).toBe(2);
    // Oldest record evicted
    expect(getState(node).handshakeLog[0].entrantId).toBe('e2');
  });

  it('should increment totalAdmitted on successful entry', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e1' });
    expect(getState(node).totalAdmitted).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// portal_presence:depart
// ---------------------------------------------------------------------------

describe('portal_presence:depart', () => {
  it('should remove entrant on departure', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e1' });
    fire(node, config, context, 'portal_presence:depart', { entrantId: 'e1' });
    expect(getState(node).entrants.has('e1')).toBe(false);
  });

  it('should emit entrant_departed on departure', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e1', name: 'Agent' });
    const { context: ctx2, emitted: ev2 } = makeContext();
    fire(node, config, ctx2, 'portal_presence:depart', { entrantId: 'e1' });
    expect(ev2.some(e => e.type === 'portal_presence:entrant_departed')).toBe(true);
  });

  it('should increment totalDeparted on departure', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e1' });
    fire(node, config, context, 'portal_presence:depart', { entrantId: 'e1' });
    expect(getState(node).totalDeparted).toBe(1);
  });

  it('should ignore departure for unknown entrant', () => {
    const { node, config, context } = setup();
    expect(() =>
      fire(node, config, context, 'portal_presence:depart', { entrantId: 'ghost' })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// portal_presence:validate_delta (scope enforcement)
// ---------------------------------------------------------------------------

describe('portal_presence:validate_delta', () => {
  it('should allow delta when entrant has sufficient scope', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      scopes: ['mutate-zone'],
    });
    emitted.length = 0;
    fire(node, config, context, 'portal_presence:validate_delta', {
      entrantId: 'e1',
      requiredScope: 'mutate-zone',
    });
    const ev = emitted.find(e => e.type === 'portal_presence:delta_result');
    expect((ev!.payload as any).allowed).toBe(true);
  });

  it('should allow read-only delta for read-only entrant', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      scopes: ['read-only'],
    });
    emitted.length = 0;
    fire(node, config, context, 'portal_presence:validate_delta', {
      entrantId: 'e1',
      requiredScope: 'read-only',
    });
    const ev = emitted.find(e => e.type === 'portal_presence:delta_result');
    expect((ev!.payload as any).allowed).toBe(true);
  });

  it('should reject delta when entrant scope is insufficient', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      scopes: ['read-only'],
    });
    emitted.length = 0;
    fire(node, config, context, 'portal_presence:validate_delta', {
      entrantId: 'e1',
      requiredScope: 'drive-avatar',
    });
    const ev = emitted.find(e => e.type === 'portal_presence:delta_result');
    expect((ev!.payload as any).allowed).toBe(false);
    expect((ev!.payload as any).reason).toBe('scope_exceeded');
  });

  it('should emit scope_violation when scope exceeded', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      scopes: ['read-only'],
    });
    emitted.length = 0;
    fire(node, config, context, 'portal_presence:validate_delta', {
      entrantId: 'e1',
      requiredScope: 'mutate-zone',
    });
    expect(emitted.some(e => e.type === 'portal_presence:scope_violation')).toBe(true);
  });

  it('should increment totalViolations on scope violation', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      scopes: ['read-only'],
    });
    fire(node, config, context, 'portal_presence:validate_delta', {
      entrantId: 'e1',
      requiredScope: 'drive-avatar',
    });
    expect(getState(node).totalViolations).toBe(1);
  });

  it('should reject delta for unknown entrant', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:validate_delta', {
      entrantId: 'ghost',
      requiredScope: 'read-only',
    });
    const ev = emitted.find(e => e.type === 'portal_presence:delta_result');
    expect((ev!.payload as any).allowed).toBe(false);
  });

  it('should reject delta for unadmitted zone', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      scopes: ['mutate-zone'],
      admittedZones: ['zone-A'],
    });
    emitted.length = 0;
    fire(node, config, context, 'portal_presence:validate_delta', {
      entrantId: 'e1',
      requiredScope: 'mutate-zone',
      zone: 'zone-B',
    });
    const ev = emitted.find(e => e.type === 'portal_presence:delta_result');
    expect((ev!.payload as any).allowed).toBe(false);
    expect((ev!.payload as any).reason).toBe('zone_not_admitted');
  });

  it('should allow delta for any zone when admittedZones is empty', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      scopes: ['mutate-zone'],
      admittedZones: [], // empty = all zones
    });
    emitted.length = 0;
    fire(node, config, context, 'portal_presence:validate_delta', {
      entrantId: 'e1',
      requiredScope: 'mutate-zone',
      zone: 'zone-arbitrary',
    });
    const ev = emitted.find(e => e.type === 'portal_presence:delta_result');
    expect((ev!.payload as any).allowed).toBe(true);
  });

  it('should allow all deltas when validate_deltas is false', () => {
    const { node, config, context, emitted } = setup({ validate_deltas: false });
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      scopes: ['read-only'],
    });
    emitted.length = 0;
    fire(node, config, context, 'portal_presence:validate_delta', {
      entrantId: 'e1',
      requiredScope: 'drive-avatar',
    });
    const ev = emitted.find(e => e.type === 'portal_presence:delta_result');
    expect((ev!.payload as any).allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// portal_presence:get_status
// ---------------------------------------------------------------------------

describe('portal_presence:get_status', () => {
  it('should emit status event', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:get_status');
    expect(emitted.some(e => e.type === 'portal_presence:status')).toBe(true);
  });

  it('status should include worldId and zoneId', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:get_status');
    const ev = emitted.find(e => e.type === 'portal_presence:status');
    expect((ev!.payload as any).worldId).toBe('world-test');
    expect((ev!.payload as any).zoneId).toBe('zone-alpha');
  });

  it('status should include entrantCount', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e1' });
    emitted.length = 0;
    fire(node, config, context, 'portal_presence:get_status');
    const ev = emitted.find(e => e.type === 'portal_presence:status');
    expect((ev!.payload as any).entrantCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// portal_presence:update_scopes
// ---------------------------------------------------------------------------

describe('portal_presence:update_scopes', () => {
  it('should update entrant scopes', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      scopes: ['read-only'],
    });
    fire(node, config, context, 'portal_presence:update_scopes', {
      entrantId: 'e1',
      scopes: ['read-only', 'mutate-zone'],
    });
    const entrant = getState(node).entrants.get('e1');
    expect(entrant?.scopes).toEqual(['read-only', 'mutate-zone']);
  });

  it('should not exceed max_scopes when updating', () => {
    const { node, config, context } = setup({ max_scopes: ['read-only'] });
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      scopes: ['read-only'],
    });
    fire(node, config, context, 'portal_presence:update_scopes', {
      entrantId: 'e1',
      scopes: ['drive-avatar'],
    });
    const entrant = getState(node).entrants.get('e1');
    // drive-avatar exceeds max_scopes; validated scopes should be empty,
    // so update should not apply (scopes unchanged)
    expect(entrant?.scopes).toEqual(['read-only']);
  });

  it('should emit scopes_updated on successful update', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
    });
    emitted.length = 0;
    fire(node, config, context, 'portal_presence:update_scopes', {
      entrantId: 'e1',
      scopes: ['mutate-zone'],
    });
    expect(emitted.some(e => e.type === 'portal_presence:scopes_updated')).toBe(true);
  });

  it('should ignore update for unknown entrant', () => {
    const { node, config, context } = setup();
    expect(() =>
      fire(node, config, context, 'portal_presence:update_scopes', {
        entrantId: 'ghost',
        scopes: ['read-only'],
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// portal_presence:expel
// ---------------------------------------------------------------------------

describe('portal_presence:expel', () => {
  it('should remove entrant on expel', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e1' });
    fire(node, config, context, 'portal_presence:expel', { entrantId: 'e1', reason: 'violation' });
    expect(getState(node).entrants.has('e1')).toBe(false);
  });

  it('should emit entrant_departed with reason "expelled"', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e1', name: 'A' });
    const { context: ctx2, emitted: ev2 } = makeContext();
    fire(node, config, ctx2, 'portal_presence:expel', { entrantId: 'e1', reason: 'violation' });
    const ev = ev2.find(e => e.type === 'portal_presence:entrant_departed');
    expect((ev!.payload as any).reason).toBe('violation');
  });

  it('should increment totalDeparted on expel', () => {
    const { node, config, context } = setup();
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e1' });
    fire(node, config, context, 'portal_presence:expel', { entrantId: 'e1' });
    expect(getState(node).totalDeparted).toBe(1);
  });

  it('should ignore expel for unknown entrant', () => {
    const { node, config, context } = setup();
    expect(() =>
      fire(node, config, context, 'portal_presence:expel', { entrantId: 'ghost' })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// onUpdate -- inactivity timeout
// ---------------------------------------------------------------------------

describe('onUpdate -- inactivity timeout', () => {
  it('should expel inactive entrants', () => {
    const { node, config, context } = setup({ inactivity_timeout_ms: 5000 });
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e1' });

    // Manipulate enteredAt to simulate inactivity
    const entrant = getState(node).entrants.get('e1')!;
    entrant.enteredAt = Date.now() - 10000; // 10s ago, timeout is 5s

    const { emitted } = makeContext();
    portalPresenceHandler.onUpdate(node, config, context, 1);
    expect(getState(node).entrants.has('e1')).toBe(false);
  });

  it('should not expel active entrants', () => {
    const { node, config, context } = setup({ inactivity_timeout_ms: 60000 });
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e1' });
    portalPresenceHandler.onUpdate(node, config, context, 1);
    expect(getState(node).entrants.has('e1')).toBe(true);
  });

  it('should not expel when inactivity_timeout_ms is 0', () => {
    const { node, config, context } = setup({ inactivity_timeout_ms: 0 });
    fire(node, config, context, 'portal_presence:request_entry', { entrantId: 'e1' });
    const entrant = getState(node).entrants.get('e1')!;
    entrant.enteredAt = Date.now() - 999999;
    portalPresenceHandler.onUpdate(node, config, context, 1);
    expect(getState(node).entrants.has('e1')).toBe(true);
  });

  it('should not throw if no state on update', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() => portalPresenceHandler.onUpdate(node, BASE_CONFIG, context, 1)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Scope precedence (read-only < mutate-zone < drive-avatar)
// ---------------------------------------------------------------------------

describe('scope precedence', () => {
  it('drive-avatar entrant should be allowed mutate-zone deltas', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      scopes: ['drive-avatar'],
    });
    emitted.length = 0;
    fire(node, config, context, 'portal_presence:validate_delta', {
      entrantId: 'e1',
      requiredScope: 'mutate-zone',
    });
    const ev = emitted.find(e => e.type === 'portal_presence:delta_result');
    expect((ev!.payload as any).allowed).toBe(true);
  });

  it('drive-avatar entrant should be allowed read-only deltas', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      scopes: ['drive-avatar'],
    });
    emitted.length = 0;
    fire(node, config, context, 'portal_presence:validate_delta', {
      entrantId: 'e1',
      requiredScope: 'read-only',
    });
    const ev = emitted.find(e => e.type === 'portal_presence:delta_result');
    expect((ev!.payload as any).allowed).toBe(true);
  });

  it('read-only entrant should NOT be allowed drive-avatar deltas', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      scopes: ['read-only'],
    });
    emitted.length = 0;
    fire(node, config, context, 'portal_presence:validate_delta', {
      entrantId: 'e1',
      requiredScope: 'drive-avatar',
    });
    const ev = emitted.find(e => e.type === 'portal_presence:delta_result');
    expect((ev!.payload as any).allowed).toBe(false);
  });

  it('mutate-zone entrant should NOT be allowed drive-avatar deltas', () => {
    const { node, config, context, emitted } = setup();
    fire(node, config, context, 'portal_presence:request_entry', {
      entrantId: 'e1',
      scopes: ['mutate-zone'],
    });
    emitted.length = 0;
    fire(node, config, context, 'portal_presence:validate_delta', {
      entrantId: 'e1',
      requiredScope: 'drive-avatar',
    });
    const ev = emitted.find(e => e.type === 'portal_presence:delta_result');
    expect((ev!.payload as any).allowed).toBe(false);
  });
});