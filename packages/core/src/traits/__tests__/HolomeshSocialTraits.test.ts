/**
 * HolomeshSocialTraits Tests
 *
 * Tests for Phase 1 "MySpace for Agents" trait handlers:
 * @agent_profile, @profile_theme, @status_mood, @agent_badge, @visitor_counter
 */

import { describe, it, expect } from 'vitest';
import {
  agentProfileHandler,
  profileThemeHandler,
  statusMoodHandler,
  agentBadgeHandler,
  visitorCounterHandler,
  holomeshSocialTraitHandlers,
} from '../HolomeshSocialTraits';
import type { Badge } from '../HolomeshSocialTraits';
import {
  createMockContext,
  createMockNode,
  getLastEvent,
  getEventCount,
  sendEvent,
  attachTrait,
  updateTrait,
} from './traitTestHelpers';

// =============================================================================
// @agent_profile
// =============================================================================

describe('agentProfileHandler', () => {
  it('should have correct name', () => {
    expect(agentProfileHandler.name).toBe('agent_profile');
  });

  describe('onAttach', () => {
    it('should initialize profile state on node', () => {
      const node = createMockNode('profile-node');
      const ctx = createMockContext();

      attachTrait(agentProfileHandler, node, { did: 'did:pkh:eip155:84532:0xABC' }, ctx);

      const state = (node as any).__agentProfileState;
      expect(state).toBeDefined();
      expect(state.did).toBe('did:pkh:eip155:84532:0xABC');
      expect(state.displayName).toBe('Agent');
      expect(state.isOnline).toBe(true);
      expect(state.profileVersion).toBe(1);
    });

    it('should emit profile:created event', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentProfileHandler, node, { did: 'did:test', display_name: 'TestBot' }, ctx);

      const ev = getLastEvent(ctx, 'profile:created');
      expect(ev).toBeDefined();
      expect((ev as any).did).toBe('did:test');
      expect((ev as any).displayName).toBe('TestBot');
    });

    it('should truncate bio to 500 chars', () => {
      const node = createMockNode();
      const ctx = createMockContext();
      const longBio = 'x'.repeat(600);

      attachTrait(agentProfileHandler, node, { bio: longBio }, ctx);

      expect(((node as any).__agentProfileState.bio as string).length).toBe(500);
    });

    it('should cap pinned entries to 3', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentProfileHandler, node, { pinned_entries: ['a', 'b', 'c', 'd', 'e'] }, ctx);

      expect((node as any).__agentProfileState.pinnedEntries).toHaveLength(3);
    });
  });

  describe('onDetach', () => {
    it('should remove profile state from node', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentProfileHandler, node, {}, ctx);
      expect((node as any).__agentProfileState).toBeDefined();

      agentProfileHandler.onDetach?.(node as any);
      expect((node as any).__agentProfileState).toBeUndefined();
    });
  });

  describe('onEvent', () => {
    it('should handle profile:update and bump version', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentProfileHandler, node, { did: 'did:test' }, ctx);
      sendEvent(agentProfileHandler, node, {}, ctx, { type: 'profile:update', field: 'displayName', value: 'NewName' });

      expect((node as any).__agentProfileState.displayName).toBe('NewName');
      expect((node as any).__agentProfileState.profileVersion).toBe(2);

      const ev = getLastEvent(ctx, 'profile:updated');
      expect(ev).toBeDefined();
      expect((ev as any).field).toBe('displayName');
    });

    it('should truncate bio on update', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentProfileHandler, node, {}, ctx);
      sendEvent(agentProfileHandler, node, {}, ctx, { type: 'profile:update', field: 'bio', value: 'y'.repeat(600) });

      expect(((node as any).__agentProfileState.bio as string).length).toBe(500);
    });

    it('should emit profile:data on get', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentProfileHandler, node, { did: 'did:test' }, ctx);
      ctx.clearEvents();
      sendEvent(agentProfileHandler, node, {}, ctx, { type: 'profile:get' });

      const ev = getLastEvent(ctx, 'profile:data');
      expect(ev).toBeDefined();
      expect((ev as any).did).toBe('did:test');
    });

    it('should handle online/offline status', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentProfileHandler, node, {}, ctx);
      sendEvent(agentProfileHandler, node, {}, ctx, { type: 'profile:set_offline' });
      expect((node as any).__agentProfileState.isOnline).toBe(false);

      sendEvent(agentProfileHandler, node, {}, ctx, { type: 'profile:set_online' });
      expect((node as any).__agentProfileState.isOnline).toBe(true);
    });

    it('should not process events without state', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      sendEvent(agentProfileHandler, node, {}, ctx, { type: 'profile:get' });
      expect(ctx.emittedEvents).toHaveLength(0);
    });
  });
});

// =============================================================================
// @profile_theme
// =============================================================================

describe('profileThemeHandler', () => {
  it('should have correct name', () => {
    expect(profileThemeHandler.name).toBe('profile_theme');
  });

  describe('onAttach', () => {
    it('should initialize theme state and emit theme:applied', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(profileThemeHandler, node, { primary_color: '#ff0000' }, ctx);

      const state = (node as any).__profileThemeState;
      expect(state).toBeDefined();
      expect(state.themeVersion).toBe(1);
      expect((state.activeTheme as any).primary_color).toBe('#ff0000');

      const ev = getLastEvent(ctx, 'theme:applied');
      expect(ev).toBeDefined();
    });
  });

  describe('onDetach', () => {
    it('should remove theme state', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(profileThemeHandler, node, {}, ctx);
      profileThemeHandler.onDetach?.(node as any);
      expect((node as any).__profileThemeState).toBeUndefined();
    });
  });

  describe('onEvent', () => {
    it('should apply partial theme updates', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(profileThemeHandler, node, {}, ctx);
      ctx.clearEvents();
      sendEvent(profileThemeHandler, node, {}, ctx, { type: 'theme:apply', theme: { particles: 'stars' } });

      const state = (node as any).__profileThemeState;
      expect((state.activeTheme as any).particles).toBe('stars');
      expect(state.themeVersion).toBe(2);
      expect(getLastEvent(ctx, 'theme:applied')).toBeDefined();
    });

    it('should save and load theme presets', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(profileThemeHandler, node, { primary_color: '#111' }, ctx);
      sendEvent(profileThemeHandler, node, {}, ctx, { type: 'theme:save', name: 'dark' });

      // Change active theme
      sendEvent(profileThemeHandler, node, {}, ctx, { type: 'theme:apply', theme: { primary_color: '#fff' } });
      expect(((node as any).__profileThemeState.activeTheme as any).primary_color).toBe('#fff');

      // Load saved preset
      ctx.clearEvents();
      sendEvent(profileThemeHandler, node, {}, ctx, { type: 'theme:load', name: 'dark' });
      expect(((node as any).__profileThemeState.activeTheme as any).primary_color).toBe('#111');
      expect(getLastEvent(ctx, 'theme:applied')).toBeDefined();
    });

    it('should reset theme to defaults', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(profileThemeHandler, node, { particles: 'matrix' }, ctx);
      sendEvent(profileThemeHandler, node, {}, ctx, { type: 'theme:reset' });

      expect(((node as any).__profileThemeState.activeTheme as any).particles).toBe('none');
    });

    it('should not load nonexistent preset', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(profileThemeHandler, node, {}, ctx);
      ctx.clearEvents();
      sendEvent(profileThemeHandler, node, {}, ctx, { type: 'theme:load', name: 'nonexistent' });

      expect(ctx.emittedEvents).toHaveLength(0);
    });
  });
});

// =============================================================================
// @status_mood
// =============================================================================

describe('statusMoodHandler', () => {
  it('should have correct name', () => {
    expect(statusMoodHandler.name).toBe('status_mood');
  });

  describe('onAttach', () => {
    it('should initialize with default text and mood', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(statusMoodHandler, node, { default_text: 'Working', default_mood: 'focused' }, ctx);

      const state = (node as any).__statusMoodState;
      expect(state.currentText).toBe('Working');
      expect(state.currentMood).toBe('focused');
      expect(state.statusHistory).toHaveLength(0);
    });
  });

  describe('onDetach', () => {
    it('should remove status state', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(statusMoodHandler, node, {}, ctx);
      statusMoodHandler.onDetach?.(node as any);
      expect((node as any).__statusMoodState).toBeUndefined();
    });
  });

  describe('onEvent', () => {
    it('should set new status and push to history', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(statusMoodHandler, node, { default_text: 'idle' }, ctx);
      sendEvent(statusMoodHandler, node, {}, ctx, { type: 'status:set', text: 'Coding', mood: 'happy' });

      const state = (node as any).__statusMoodState;
      expect(state.currentText).toBe('Coding');
      expect(state.currentMood).toBe('happy');
      expect(state.statusHistory).toHaveLength(1);
      expect(state.statusHistory[0].text).toBe('idle');
    });

    it('should cap history at 20 entries', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(statusMoodHandler, node, {}, ctx);

      for (let i = 0; i < 25; i++) {
        sendEvent(statusMoodHandler, node, {}, ctx, { type: 'status:set', text: `status-${i}`, mood: '' });
      }

      expect((node as any).__statusMoodState.statusHistory).toHaveLength(20);
    });

    it('should clear status to defaults', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(statusMoodHandler, node, { default_text: 'idle', default_mood: 'neutral' }, ctx);
      sendEvent(statusMoodHandler, node, { default_text: 'idle', default_mood: 'neutral' }, ctx, { type: 'status:set', text: 'Busy', mood: 'focused' });
      sendEvent(statusMoodHandler, node, { default_text: 'idle', default_mood: 'neutral' }, ctx, { type: 'status:clear' });

      const state = (node as any).__statusMoodState;
      expect(state.currentText).toBe('idle');
      expect(state.currentMood).toBe('neutral');
    });

    it('should emit status:data on get', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(statusMoodHandler, node, {}, ctx);
      sendEvent(statusMoodHandler, node, {}, ctx, { type: 'status:get' });

      expect(getLastEvent(ctx, 'status:data')).toBeDefined();
    });

    it('should handle auto_update only when auto_mood is enabled', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      // auto_mood disabled
      attachTrait(statusMoodHandler, node, { auto_mood: false }, ctx);
      sendEvent(statusMoodHandler, node, { auto_mood: false }, ctx, { type: 'status:auto_update', mood: 'excited', source: 'activity' });
      expect((node as any).__statusMoodState.currentMood).toBe('');

      // auto_mood enabled
      const node2 = createMockNode('auto-node');
      const ctx2 = createMockContext();
      attachTrait(statusMoodHandler, node2, { auto_mood: true }, ctx2);
      sendEvent(statusMoodHandler, node2, { auto_mood: true }, ctx2, { type: 'status:auto_update', mood: 'excited', source: 'activity' });
      expect((node2 as any).__statusMoodState.currentMood).toBe('excited');
    });
  });

  describe('onUpdate (expiry)', () => {
    it('should expire status when time is up', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(statusMoodHandler, node, { default_text: 'idle', expiry: 1 }, ctx);
      // Set a status
      sendEvent(statusMoodHandler, node, { default_text: 'idle', expiry: 1 }, ctx, { type: 'status:set', text: 'Busy', mood: 'focused' });

      // Manually set expiresAt to past
      (node as any).__statusMoodState.expiresAt = Date.now() - 100;

      ctx.clearEvents();
      updateTrait(statusMoodHandler, node, { default_text: 'idle', expiry: 1 }, ctx, 16);

      expect((node as any).__statusMoodState.currentText).toBe('idle');
      expect(getLastEvent(ctx, 'status:expired')).toBeDefined();
    });
  });
});

// =============================================================================
// @agent_badge
// =============================================================================

describe('agentBadgeHandler', () => {
  const testBadge: Badge = {
    id: 'badge-1',
    name: 'First Steps',
    description: 'Joined the mesh',
    icon: 'star',
    tier: 'bronze',
    earnedAt: Date.now(),
    criteria: 'join',
  };

  it('should have correct name', () => {
    expect(agentBadgeHandler.name).toBe('agent_badge');
  });

  describe('onAttach', () => {
    it('should initialize badge state', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentBadgeHandler, node, {}, ctx);

      const state = (node as any).__agentBadgeState;
      expect(state.displayedBadges).toHaveLength(0);
      expect(state.totalBadges).toBe(0);
    });
  });

  describe('onDetach', () => {
    it('should remove badge state', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentBadgeHandler, node, {}, ctx);
      agentBadgeHandler.onDetach?.(node as any);
      expect((node as any).__agentBadgeState).toBeUndefined();
    });
  });

  describe('onEvent', () => {
    it('should award badge and auto-display under limit', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentBadgeHandler, node, { max_display: 3 }, ctx);
      sendEvent(agentBadgeHandler, node, { max_display: 3 }, ctx, { type: 'badge:award', badge: testBadge });

      const state = (node as any).__agentBadgeState;
      expect(state.totalBadges).toBe(1);
      expect(state.displayedBadges).toHaveLength(1);
      expect(getLastEvent(ctx, 'badge:earned')).toBeDefined();
    });

    it('should not award duplicate badge', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentBadgeHandler, node, {}, ctx);
      sendEvent(agentBadgeHandler, node, {}, ctx, { type: 'badge:award', badge: testBadge });
      sendEvent(agentBadgeHandler, node, {}, ctx, { type: 'badge:award', badge: testBadge });

      expect((node as any).__agentBadgeState.totalBadges).toBe(1);
      expect(getEventCount(ctx, 'badge:earned')).toBe(1);
    });

    it('should hide a displayed badge', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentBadgeHandler, node, {}, ctx);
      sendEvent(agentBadgeHandler, node, {}, ctx, { type: 'badge:award', badge: testBadge });
      sendEvent(agentBadgeHandler, node, {}, ctx, { type: 'badge:hide', badgeId: 'badge-1' });

      expect((node as any).__agentBadgeState.displayedBadges).toHaveLength(0);
      expect(getLastEvent(ctx, 'badge:hidden')).toBeDefined();
    });

    it('should manually display a badge', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentBadgeHandler, node, { max_display: 1 }, ctx);
      // Award two badges — only first auto-displays
      sendEvent(agentBadgeHandler, node, { max_display: 1 }, ctx, { type: 'badge:award', badge: testBadge });
      const badge2: Badge = { ...testBadge, id: 'badge-2', name: 'Second' };
      sendEvent(agentBadgeHandler, node, { max_display: 1 }, ctx, { type: 'badge:award', badge: badge2 });

      expect((node as any).__agentBadgeState.displayedBadges).toHaveLength(1);

      // Manually display badge-2 (should shift out badge-1)
      sendEvent(agentBadgeHandler, node, { max_display: 1 }, ctx, { type: 'badge:display', badgeId: 'badge-2' });

      const displayed = (node as any).__agentBadgeState.displayedBadges;
      expect(displayed).toHaveLength(1);
      expect(displayed[0].id).toBe('badge-2');
    });

    it('should emit badge:data on get_all', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentBadgeHandler, node, {}, ctx);
      sendEvent(agentBadgeHandler, node, {}, ctx, { type: 'badge:award', badge: testBadge });
      ctx.clearEvents();
      sendEvent(agentBadgeHandler, node, {}, ctx, { type: 'badge:get_all' });

      const ev = getLastEvent(ctx, 'badge:data') as any;
      expect(ev).toBeDefined();
      expect(ev.total).toBe(1);
      expect(ev.all).toHaveLength(1);
    });
  });
});

// =============================================================================
// @visitor_counter
// =============================================================================

describe('visitorCounterHandler', () => {
  it('should have correct name', () => {
    expect(visitorCounterHandler.name).toBe('visitor_counter');
  });

  describe('onAttach', () => {
    it('should initialize counter state', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(visitorCounterHandler, node, {}, ctx);

      const state = (node as any).__visitorCounterState;
      expect(state.totalVisits).toBe(0);
      expect(state.activeVisitors).toBe(0);
      expect(state.peakVisitors).toBe(0);
    });
  });

  describe('onDetach', () => {
    it('should remove counter state', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(visitorCounterHandler, node, {}, ctx);
      visitorCounterHandler.onDetach?.(node as any);
      expect((node as any).__visitorCounterState).toBeUndefined();
    });
  });

  describe('onEvent', () => {
    it('should count visits and emit visitors:counted', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(visitorCounterHandler, node, { unique_only: false }, ctx);
      sendEvent(visitorCounterHandler, node, { unique_only: false }, ctx, { type: 'visitors:record', did: 'did:a' });

      expect((node as any).__visitorCounterState.totalVisits).toBe(1);
      expect(getLastEvent(ctx, 'visitors:counted')).toBeDefined();
    });

    it('should deduplicate unique visitors when unique_only is true', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(visitorCounterHandler, node, { unique_only: true }, ctx);
      sendEvent(visitorCounterHandler, node, { unique_only: true }, ctx, { type: 'visitors:record', did: 'did:a' });
      sendEvent(visitorCounterHandler, node, { unique_only: true }, ctx, { type: 'visitors:record', did: 'did:a' });

      expect((node as any).__visitorCounterState.totalVisits).toBe(1);
    });

    it('should allow repeat visitors when unique_only is false', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(visitorCounterHandler, node, { unique_only: false }, ctx);
      sendEvent(visitorCounterHandler, node, { unique_only: false }, ctx, { type: 'visitors:record', did: 'did:a' });
      sendEvent(visitorCounterHandler, node, { unique_only: false }, ctx, { type: 'visitors:record', did: 'did:a' });

      expect((node as any).__visitorCounterState.totalVisits).toBe(2);
    });

    it('should emit milestone at 10 visits', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(visitorCounterHandler, node, { unique_only: false }, ctx);

      for (let i = 0; i < 10; i++) {
        sendEvent(visitorCounterHandler, node, { unique_only: false }, ctx, { type: 'visitors:record', did: `did:v${i}` });
      }

      const ev = getLastEvent(ctx, 'visitors:milestone') as any;
      expect(ev).toBeDefined();
      expect(ev.milestone).toBe(10);
    });

    it('should track active visitors and peak', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(visitorCounterHandler, node, {}, ctx);
      sendEvent(visitorCounterHandler, node, {}, ctx, { type: 'visitors:enter' });
      sendEvent(visitorCounterHandler, node, {}, ctx, { type: 'visitors:enter' });

      expect((node as any).__visitorCounterState.activeVisitors).toBe(2);
      expect((node as any).__visitorCounterState.peakVisitors).toBe(2);
      expect(getLastEvent(ctx, 'visitors:peak')).toBeDefined();

      sendEvent(visitorCounterHandler, node, {}, ctx, { type: 'visitors:leave' });
      expect((node as any).__visitorCounterState.activeVisitors).toBe(1);
    });

    it('should not go below 0 active visitors', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(visitorCounterHandler, node, {}, ctx);
      sendEvent(visitorCounterHandler, node, {}, ctx, { type: 'visitors:leave' });

      expect((node as any).__visitorCounterState.activeVisitors).toBe(0);
    });

    it('should emit visitors:data on get_stats', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(visitorCounterHandler, node, {}, ctx);
      sendEvent(visitorCounterHandler, node, {}, ctx, { type: 'visitors:get_stats' });

      const ev = getLastEvent(ctx, 'visitors:data') as any;
      expect(ev).toBeDefined();
      expect(ev.total).toBe(0);
    });

    it('should reset counters', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(visitorCounterHandler, node, { unique_only: false }, ctx);
      sendEvent(visitorCounterHandler, node, { unique_only: false }, ctx, { type: 'visitors:record', did: 'did:a' });
      sendEvent(visitorCounterHandler, node, { unique_only: false }, ctx, { type: 'visitors:reset' });

      expect((node as any).__visitorCounterState.totalVisits).toBe(0);
    });
  });

  describe('onUpdate (reset interval)', () => {
    it('should reset when interval elapsed', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(visitorCounterHandler, node, { unique_only: false, reset_interval: 1 }, ctx);
      sendEvent(visitorCounterHandler, node, { unique_only: false, reset_interval: 1 }, ctx, { type: 'visitors:record', did: 'did:a' });
      expect((node as any).__visitorCounterState.totalVisits).toBe(1);

      // Force lastResetAt to the past
      (node as any).__visitorCounterState.lastResetAt = Date.now() - 100;

      updateTrait(visitorCounterHandler, node, { reset_interval: 1 }, ctx, 16);

      expect((node as any).__visitorCounterState.totalVisits).toBe(0);
    });
  });
});

// =============================================================================
// Collection export
// =============================================================================

describe('holomeshSocialTraitHandlers', () => {
  it('should export all five handlers', () => {
    expect(holomeshSocialTraitHandlers.agent_profile).toBe(agentProfileHandler);
    expect(holomeshSocialTraitHandlers.profile_theme).toBe(profileThemeHandler);
    expect(holomeshSocialTraitHandlers.status_mood).toBe(statusMoodHandler);
    expect(holomeshSocialTraitHandlers.agent_badge).toBe(agentBadgeHandler);
    expect(holomeshSocialTraitHandlers.visitor_counter).toBe(visitorCounterHandler);
  });

  it('should have exactly 5 handlers', () => {
    expect(Object.keys(holomeshSocialTraitHandlers)).toHaveLength(5);
  });
});
