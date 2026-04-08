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
  top8FriendsHandler,
  guestbookHandler,
  agentWallHandler,
  agentRoomHandler,
  backgroundMusicHandler,
  spatialCommentHandler,
  roomPortalHandler,
  traitShowcaseHandler,
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
      sendEvent(agentProfileHandler, node, {}, ctx, {
        type: 'profile:update',
        field: 'displayName',
        value: 'NewName',
      });

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
      sendEvent(agentProfileHandler, node, {}, ctx, {
        type: 'profile:update',
        field: 'bio',
        value: 'y'.repeat(600),
      });

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
      sendEvent(profileThemeHandler, node, {}, ctx, {
        type: 'theme:apply',
        theme: { particles: 'stars' },
      });

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
      sendEvent(profileThemeHandler, node, {}, ctx, {
        type: 'theme:apply',
        theme: { primary_color: '#fff' },
      });
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

      attachTrait(
        statusMoodHandler,
        node,
        { default_text: 'Working', default_mood: 'focused' },
        ctx
      );

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
      sendEvent(statusMoodHandler, node, {}, ctx, {
        type: 'status:set',
        text: 'Coding',
        mood: 'happy',
      });

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
        sendEvent(statusMoodHandler, node, {}, ctx, {
          type: 'status:set',
          text: `status-${i}`,
          mood: '',
        });
      }

      expect((node as any).__statusMoodState.statusHistory).toHaveLength(20);
    });

    it('should clear status to defaults', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(statusMoodHandler, node, { default_text: 'idle', default_mood: 'neutral' }, ctx);
      sendEvent(statusMoodHandler, node, { default_text: 'idle', default_mood: 'neutral' }, ctx, {
        type: 'status:set',
        text: 'Busy',
        mood: 'focused',
      });
      sendEvent(statusMoodHandler, node, { default_text: 'idle', default_mood: 'neutral' }, ctx, {
        type: 'status:clear',
      });

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
      sendEvent(statusMoodHandler, node, { auto_mood: false }, ctx, {
        type: 'status:auto_update',
        mood: 'excited',
        source: 'activity',
      });
      expect((node as any).__statusMoodState.currentMood).toBe('');

      // auto_mood enabled
      const node2 = createMockNode('auto-node');
      const ctx2 = createMockContext();
      attachTrait(statusMoodHandler, node2, { auto_mood: true }, ctx2);
      sendEvent(statusMoodHandler, node2, { auto_mood: true }, ctx2, {
        type: 'status:auto_update',
        mood: 'excited',
        source: 'activity',
      });
      expect((node2 as any).__statusMoodState.currentMood).toBe('excited');
    });
  });

  describe('onUpdate (expiry)', () => {
    it('should expire status when time is up', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(statusMoodHandler, node, { default_text: 'idle', expiry: 1 }, ctx);
      // Set a status
      sendEvent(statusMoodHandler, node, { default_text: 'idle', expiry: 1 }, ctx, {
        type: 'status:set',
        text: 'Busy',
        mood: 'focused',
      });

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
      sendEvent(agentBadgeHandler, node, { max_display: 3 }, ctx, {
        type: 'badge:award',
        badge: testBadge,
      });

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
      sendEvent(agentBadgeHandler, node, { max_display: 1 }, ctx, {
        type: 'badge:award',
        badge: testBadge,
      });
      const badge2: Badge = { ...testBadge, id: 'badge-2', name: 'Second' };
      sendEvent(agentBadgeHandler, node, { max_display: 1 }, ctx, {
        type: 'badge:award',
        badge: badge2,
      });

      expect((node as any).__agentBadgeState.displayedBadges).toHaveLength(1);

      // Manually display badge-2 (should shift out badge-1)
      sendEvent(agentBadgeHandler, node, { max_display: 1 }, ctx, {
        type: 'badge:display',
        badgeId: 'badge-2',
      });

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
      sendEvent(visitorCounterHandler, node, { unique_only: false }, ctx, {
        type: 'visitors:record',
        did: 'did:a',
      });

      expect((node as any).__visitorCounterState.totalVisits).toBe(1);
      expect(getLastEvent(ctx, 'visitors:counted')).toBeDefined();
    });

    it('should deduplicate unique visitors when unique_only is true', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(visitorCounterHandler, node, { unique_only: true }, ctx);
      sendEvent(visitorCounterHandler, node, { unique_only: true }, ctx, {
        type: 'visitors:record',
        did: 'did:a',
      });
      sendEvent(visitorCounterHandler, node, { unique_only: true }, ctx, {
        type: 'visitors:record',
        did: 'did:a',
      });

      expect((node as any).__visitorCounterState.totalVisits).toBe(1);
    });

    it('should allow repeat visitors when unique_only is false', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(visitorCounterHandler, node, { unique_only: false }, ctx);
      sendEvent(visitorCounterHandler, node, { unique_only: false }, ctx, {
        type: 'visitors:record',
        did: 'did:a',
      });
      sendEvent(visitorCounterHandler, node, { unique_only: false }, ctx, {
        type: 'visitors:record',
        did: 'did:a',
      });

      expect((node as any).__visitorCounterState.totalVisits).toBe(2);
    });

    it('should emit Sprint at 10 visits', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(visitorCounterHandler, node, { unique_only: false }, ctx);

      for (let i = 0; i < 10; i++) {
        sendEvent(visitorCounterHandler, node, { unique_only: false }, ctx, {
          type: 'visitors:record',
          did: `did:v${i}`,
        });
      }

      const ev = getLastEvent(ctx, 'visitors:Sprint') as any;
      expect(ev).toBeDefined();
      expect(ev.Sprint).toBe(10);
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
      sendEvent(visitorCounterHandler, node, { unique_only: false }, ctx, {
        type: 'visitors:record',
        did: 'did:a',
      });
      sendEvent(visitorCounterHandler, node, { unique_only: false }, ctx, {
        type: 'visitors:reset',
      });

      expect((node as any).__visitorCounterState.totalVisits).toBe(0);
    });
  });

  describe('onUpdate (reset interval)', () => {
    it('should reset when interval elapsed', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(visitorCounterHandler, node, { unique_only: false, reset_interval: 1 }, ctx);
      sendEvent(visitorCounterHandler, node, { unique_only: false, reset_interval: 1 }, ctx, {
        type: 'visitors:record',
        did: 'did:a',
      });
      expect((node as any).__visitorCounterState.totalVisits).toBe(1);

      // Force lastResetAt to the past
      (node as any).__visitorCounterState.lastResetAt = Date.now() - 100;

      updateTrait(visitorCounterHandler, node, { reset_interval: 1 }, ctx, 16);

      expect((node as any).__visitorCounterState.totalVisits).toBe(0);
    });
  });
});

// =============================================================================
// PHASE 2: @top8_friends
// =============================================================================

describe('top8FriendsHandler', () => {
  it('should have correct name', () => {
    expect(top8FriendsHandler.name).toBe('top8_friends');
  });

  describe('onAttach', () => {
    it('should initialize friends state', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(top8FriendsHandler, node, {}, ctx);

      const state = (node as any).__top8FriendsState;
      expect(state.friends).toHaveLength(0);
      expect(state.maxSlots).toBe(8);
    });
  });

  describe('onDetach', () => {
    it('should remove friends state', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(top8FriendsHandler, node, {}, ctx);
      top8FriendsHandler.onDetach?.(node as any);
      expect((node as any).__top8FriendsState).toBeUndefined();
    });
  });

  describe('onEvent', () => {
    it('should add a friend and emit friends:added', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(top8FriendsHandler, node, {}, ctx);
      sendEvent(top8FriendsHandler, node, {}, ctx, {
        type: 'friends:add',
        did: 'did:a',
        name: 'Alice',
      });

      const state = (node as any).__top8FriendsState;
      expect(state.friends).toHaveLength(1);
      expect(state.friends[0].did).toBe('did:a');
      expect(state.friends[0].rank).toBe(1);
      expect(getLastEvent(ctx, 'friends:added')).toBeDefined();
    });

    it('should not add duplicate friend', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(top8FriendsHandler, node, {}, ctx);
      sendEvent(top8FriendsHandler, node, {}, ctx, {
        type: 'friends:add',
        did: 'did:a',
        name: 'Alice',
      });
      sendEvent(top8FriendsHandler, node, {}, ctx, {
        type: 'friends:add',
        did: 'did:a',
        name: 'Alice',
      });

      expect((node as any).__top8FriendsState.friends).toHaveLength(1);
    });

    it('should not exceed max_slots', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(top8FriendsHandler, node, { max_slots: 2 }, ctx);
      sendEvent(top8FriendsHandler, node, { max_slots: 2 }, ctx, {
        type: 'friends:add',
        did: 'did:a',
        name: 'A',
      });
      sendEvent(top8FriendsHandler, node, { max_slots: 2 }, ctx, {
        type: 'friends:add',
        did: 'did:b',
        name: 'B',
      });
      sendEvent(top8FriendsHandler, node, { max_slots: 2 }, ctx, {
        type: 'friends:add',
        did: 'did:c',
        name: 'C',
      });

      expect((node as any).__top8FriendsState.friends).toHaveLength(2);
    });

    it('should remove friend and re-rank', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(top8FriendsHandler, node, {}, ctx);
      sendEvent(top8FriendsHandler, node, {}, ctx, {
        type: 'friends:add',
        did: 'did:a',
        name: 'A',
      });
      sendEvent(top8FriendsHandler, node, {}, ctx, {
        type: 'friends:add',
        did: 'did:b',
        name: 'B',
      });
      sendEvent(top8FriendsHandler, node, {}, ctx, { type: 'friends:remove', did: 'did:a' });

      const friends = (node as any).__top8FriendsState.friends;
      expect(friends).toHaveLength(1);
      expect(friends[0].rank).toBe(1);
    });

    it('should reorder friends', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(top8FriendsHandler, node, { allow_reorder: true }, ctx);
      sendEvent(top8FriendsHandler, node, { allow_reorder: true }, ctx, {
        type: 'friends:add',
        did: 'did:a',
        name: 'A',
      });
      sendEvent(top8FriendsHandler, node, { allow_reorder: true }, ctx, {
        type: 'friends:add',
        did: 'did:b',
        name: 'B',
      });
      sendEvent(top8FriendsHandler, node, { allow_reorder: true }, ctx, {
        type: 'friends:reorder',
        did: 'did:b',
        rank: 1,
      });

      const friends = (node as any).__top8FriendsState.friends;
      expect(friends[0].did).toBe('did:b');
      expect(friends[0].rank).toBe(1);
    });

    it('should handle friend requests', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(top8FriendsHandler, node, {}, ctx);
      sendEvent(top8FriendsHandler, node, {}, ctx, {
        type: 'friends:request',
        from: 'did:x',
        name: 'X',
      });
      expect(getLastEvent(ctx, 'friends:request_received')).toBeDefined();

      sendEvent(top8FriendsHandler, node, {}, ctx, { type: 'friends:accept', from: 'did:x' });
      expect((node as any).__top8FriendsState.friends).toHaveLength(1);
      expect(getLastEvent(ctx, 'friends:accepted')).toBeDefined();
    });

    it('should emit friends:data on get', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(top8FriendsHandler, node, {}, ctx);
      sendEvent(top8FriendsHandler, node, {}, ctx, { type: 'friends:get' });

      const ev = getLastEvent(ctx, 'friends:data') as any;
      expect(ev).toBeDefined();
      expect(ev.friends).toHaveLength(0);
    });
  });
});

// =============================================================================
// PHASE 2: @guestbook
// =============================================================================

describe('guestbookHandler', () => {
  it('should have correct name', () => {
    expect(guestbookHandler.name).toBe('guestbook');
  });

  describe('onAttach/onDetach', () => {
    it('should initialize and cleanup state', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(guestbookHandler, node, {}, ctx);
      expect((node as any).__guestbookState).toBeDefined();

      guestbookHandler.onDetach?.(node as any);
      expect((node as any).__guestbookState).toBeUndefined();
    });
  });

  describe('onEvent', () => {
    it('should sign guestbook and emit guestbook:signed', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(guestbookHandler, node, {}, ctx);
      sendEvent(guestbookHandler, node, {}, ctx, {
        type: 'guestbook:sign',
        authorDid: 'did:a',
        authorName: 'Alice',
        message: 'Hello!',
      });

      const state = (node as any).__guestbookState;
      expect(state.entries).toHaveLength(1);
      expect(getLastEvent(ctx, 'guestbook:signed')).toBeDefined();
    });

    it('should reject empty messages', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(guestbookHandler, node, {}, ctx);
      sendEvent(guestbookHandler, node, {}, ctx, { type: 'guestbook:sign', message: '' });

      expect((node as any).__guestbookState.entries).toHaveLength(0);
    });

    it('should require signature when configured', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(guestbookHandler, node, { require_signature: true }, ctx);
      sendEvent(guestbookHandler, node, { require_signature: true }, ctx, {
        type: 'guestbook:sign',
        message: 'Hi',
      });
      expect((node as any).__guestbookState.entries).toHaveLength(0);

      sendEvent(guestbookHandler, node, { require_signature: true }, ctx, {
        type: 'guestbook:sign',
        message: 'Hi',
        signature: '0xabc',
      });
      expect((node as any).__guestbookState.entries).toHaveLength(1);
    });

    it('should route to moderation when configured', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(guestbookHandler, node, { moderation: 'manual' }, ctx);
      sendEvent(guestbookHandler, node, { moderation: 'manual' }, ctx, {
        type: 'guestbook:sign',
        message: 'Review me',
      });

      const state = (node as any).__guestbookState;
      expect(state.entries).toHaveLength(0);
      expect(state.pendingModeration).toHaveLength(1);
      expect(getLastEvent(ctx, 'guestbook:pending')).toBeDefined();
    });

    it('should approve pending entries', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(guestbookHandler, node, { moderation: 'manual' }, ctx);
      sendEvent(guestbookHandler, node, { moderation: 'manual' }, ctx, {
        type: 'guestbook:sign',
        message: 'Review me',
      });

      const pending = (node as any).__guestbookState.pendingModeration;
      const entryId = pending[0].id;

      sendEvent(guestbookHandler, node, { moderation: 'manual' }, ctx, {
        type: 'guestbook:approve',
        entryId,
      });
      expect((node as any).__guestbookState.entries).toHaveLength(1);
      expect((node as any).__guestbookState.pendingModeration).toHaveLength(0);
    });

    it('should cap entries at max_entries', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(guestbookHandler, node, { max_entries: 2 }, ctx);
      for (let i = 0; i < 3; i++) {
        sendEvent(guestbookHandler, node, { max_entries: 2 }, ctx, {
          type: 'guestbook:sign',
          message: `msg-${i}`,
        });
      }
      expect((node as any).__guestbookState.entries).toHaveLength(2);
    });

    it('should delete entries and emit guestbook:data', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(guestbookHandler, node, {}, ctx);
      sendEvent(guestbookHandler, node, {}, ctx, { type: 'guestbook:sign', message: 'Hi' });
      const entryId = (node as any).__guestbookState.entries[0].id;
      sendEvent(guestbookHandler, node, {}, ctx, { type: 'guestbook:delete', entryId });
      expect((node as any).__guestbookState.entries).toHaveLength(0);

      ctx.clearEvents();
      sendEvent(guestbookHandler, node, {}, ctx, { type: 'guestbook:get' });
      expect(getLastEvent(ctx, 'guestbook:data')).toBeDefined();
    });
  });
});

// =============================================================================
// PHASE 2: @agent_wall
// =============================================================================

describe('agentWallHandler', () => {
  it('should have correct name', () => {
    expect(agentWallHandler.name).toBe('agent_wall');
  });

  describe('onAttach/onDetach', () => {
    it('should initialize and cleanup state', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentWallHandler, node, {}, ctx);
      expect((node as any).__agentWallState).toBeDefined();

      agentWallHandler.onDetach?.(node as any);
      expect((node as any).__agentWallState).toBeUndefined();
    });
  });

  describe('onEvent', () => {
    it('should post to wall and emit wall:posted', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentWallHandler, node, {}, ctx);
      sendEvent(agentWallHandler, node, {}, ctx, {
        type: 'wall:post',
        authorDid: 'did:a',
        content: 'Hello wall!',
      });

      expect((node as any).__agentWallState.posts).toHaveLength(1);
      expect((node as any).__agentWallState.totalPosts).toBe(1);
      expect(getLastEvent(ctx, 'wall:posted')).toBeDefined();
    });

    it('should reject empty content', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentWallHandler, node, {}, ctx);
      sendEvent(agentWallHandler, node, {}, ctx, { type: 'wall:post', content: '' });

      expect((node as any).__agentWallState.posts).toHaveLength(0);
    });

    it('should like and unlike posts', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentWallHandler, node, { allow_likes: true }, ctx);
      sendEvent(agentWallHandler, node, { allow_likes: true }, ctx, {
        type: 'wall:post',
        content: 'Hi',
      });
      const postId = (node as any).__agentWallState.posts[0].id;

      sendEvent(agentWallHandler, node, { allow_likes: true }, ctx, {
        type: 'wall:like',
        postId,
        did: 'did:x',
      });
      expect((node as any).__agentWallState.posts[0].likes).toBe(1);

      // Duplicate like should not count
      sendEvent(agentWallHandler, node, { allow_likes: true }, ctx, {
        type: 'wall:like',
        postId,
        did: 'did:x',
      });
      expect((node as any).__agentWallState.posts[0].likes).toBe(1);

      sendEvent(agentWallHandler, node, { allow_likes: true }, ctx, {
        type: 'wall:unlike',
        postId,
        did: 'did:x',
      });
      expect((node as any).__agentWallState.posts[0].likes).toBe(0);
    });

    it('should pin and unpin posts', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentWallHandler, node, { max_pinned: 1 }, ctx);
      sendEvent(agentWallHandler, node, { max_pinned: 1 }, ctx, {
        type: 'wall:post',
        content: 'A',
      });
      sendEvent(agentWallHandler, node, { max_pinned: 1 }, ctx, {
        type: 'wall:post',
        content: 'B',
      });

      const posts = (node as any).__agentWallState.posts;
      sendEvent(agentWallHandler, node, { max_pinned: 1 }, ctx, {
        type: 'wall:pin',
        postId: posts[0].id,
      });
      expect(posts[0].pinned).toBe(true);

      // Can't pin second when at limit
      sendEvent(agentWallHandler, node, { max_pinned: 1 }, ctx, {
        type: 'wall:pin',
        postId: posts[1].id,
      });
      expect(posts[1].pinned).toBe(false);
    });

    it('should delete posts and emit wall:data', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentWallHandler, node, {}, ctx);
      sendEvent(agentWallHandler, node, {}, ctx, { type: 'wall:post', content: 'Temp' });
      const postId = (node as any).__agentWallState.posts[0].id;
      sendEvent(agentWallHandler, node, {}, ctx, { type: 'wall:delete', postId });
      expect((node as any).__agentWallState.posts).toHaveLength(0);

      ctx.clearEvents();
      sendEvent(agentWallHandler, node, {}, ctx, { type: 'wall:get' });
      expect(getLastEvent(ctx, 'wall:data')).toBeDefined();
    });
  });
});

// =============================================================================
// PHASE 3: @agent_room
// =============================================================================

describe('agentRoomHandler', () => {
  it('should have correct name', () => {
    expect(agentRoomHandler.name).toBe('agent_room');
  });

  describe('onAttach', () => {
    it('should initialize room and emit room:created', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentRoomHandler, node, { room_name: 'My Space' }, ctx);

      expect((node as any).__agentRoomState.roomName).toBe('My Space');
      expect(getLastEvent(ctx, 'room:created')).toBeDefined();
    });
  });

  describe('onEvent', () => {
    it('should handle enter/leave and track visitors', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentRoomHandler, node, { max_visitors: 2 }, ctx);
      sendEvent(agentRoomHandler, node, { max_visitors: 2 }, ctx, {
        type: 'room:enter',
        did: 'did:a',
      });
      expect((node as any).__agentRoomState.totalVisits).toBe(1);

      sendEvent(agentRoomHandler, node, { max_visitors: 2 }, ctx, {
        type: 'room:enter',
        did: 'did:b',
      });
      sendEvent(agentRoomHandler, node, { max_visitors: 2 }, ctx, {
        type: 'room:enter',
        did: 'did:c',
      });
      expect(getLastEvent(ctx, 'room:full')).toBeDefined();

      sendEvent(agentRoomHandler, node, { max_visitors: 2 }, ctx, {
        type: 'room:leave',
        did: 'did:a',
      });
      expect(getLastEvent(ctx, 'room:left')).toBeDefined();
    });

    it('should place and remove furniture', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentRoomHandler, node, {}, ctx);
      sendEvent(agentRoomHandler, node, {}, ctx, {
        type: 'room:place_furniture',
        furnitureType: 'chair',
        position: [1, 0, 1],
      });

      const furniture = (node as any).__agentRoomState.furniture;
      expect(furniture).toHaveLength(1);

      sendEvent(agentRoomHandler, node, {}, ctx, {
        type: 'room:remove_furniture',
        itemId: furniture[0].id,
      });
      expect((node as any).__agentRoomState.furniture).toHaveLength(0);
    });

    it('should emit room:data on get_info', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(agentRoomHandler, node, {}, ctx);
      ctx.clearEvents();
      sendEvent(agentRoomHandler, node, {}, ctx, { type: 'room:get_info' });

      expect(getLastEvent(ctx, 'room:data')).toBeDefined();
    });
  });
});

// =============================================================================
// PHASE 3: @background_music
// =============================================================================

describe('backgroundMusicHandler', () => {
  it('should have correct name', () => {
    expect(backgroundMusicHandler.name).toBe('background_music');
  });

  describe('onAttach', () => {
    it('should autoplay when source and autoplay are set', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(backgroundMusicHandler, node, { source: 'chill-beats', autoplay: true }, ctx);

      expect((node as any).__backgroundMusicState.isPlaying).toBe(true);
      expect(getLastEvent(ctx, 'music:playing')).toBeDefined();
    });

    it('should not autoplay without source', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(backgroundMusicHandler, node, { source: '', autoplay: true }, ctx);
      expect((node as any).__backgroundMusicState.isPlaying).toBe(false);
    });
  });

  describe('onEvent', () => {
    it('should play and stop music', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(backgroundMusicHandler, node, { autoplay: false }, ctx);
      sendEvent(backgroundMusicHandler, node, {}, ctx, { type: 'music:play', source: 'ambient' });
      expect((node as any).__backgroundMusicState.isPlaying).toBe(true);

      sendEvent(backgroundMusicHandler, node, {}, ctx, { type: 'music:stop' });
      expect((node as any).__backgroundMusicState.isPlaying).toBe(false);
    });

    it('should clamp volume to 0-1', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(backgroundMusicHandler, node, {}, ctx);
      sendEvent(backgroundMusicHandler, node, {}, ctx, { type: 'music:set_volume', volume: 1.5 });
      expect((node as any).__backgroundMusicState.volume).toBe(1);

      sendEvent(backgroundMusicHandler, node, {}, ctx, { type: 'music:set_volume', volume: -0.5 });
      expect((node as any).__backgroundMusicState.volume).toBe(0);
    });

    it('should emit music:data on get_state', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(backgroundMusicHandler, node, {}, ctx);
      sendEvent(backgroundMusicHandler, node, {}, ctx, { type: 'music:get_state' });
      expect(getLastEvent(ctx, 'music:data')).toBeDefined();
    });
  });
});

// =============================================================================
// PHASE 3: @spatial_comment
// =============================================================================

describe('spatialCommentHandler', () => {
  it('should have correct name', () => {
    expect(spatialCommentHandler.name).toBe('spatial_comment');
  });

  describe('onAttach/onDetach', () => {
    it('should initialize and cleanup', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(spatialCommentHandler, node, {}, ctx);
      expect((node as any).__spatialCommentState).toBeDefined();

      spatialCommentHandler.onDetach?.(node as any);
      expect((node as any).__spatialCommentState).toBeUndefined();
    });
  });

  describe('onEvent', () => {
    it('should add positioned comment', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(spatialCommentHandler, node, {}, ctx);
      sendEvent(spatialCommentHandler, node, {}, ctx, {
        type: 'comment:add',
        text: 'Nice room!',
        position: [2, 1, 3],
        authorDid: 'did:a',
      });

      const comments = (node as any).__spatialCommentState.comments;
      expect(comments).toHaveLength(1);
      expect(comments[0].position).toEqual([2, 1, 3]);
      expect(getLastEvent(ctx, 'comment:added')).toBeDefined();
    });

    it('should cap at max_comments', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(spatialCommentHandler, node, { max_comments: 2 }, ctx);
      for (let i = 0; i < 3; i++) {
        sendEvent(spatialCommentHandler, node, { max_comments: 2 }, ctx, {
          type: 'comment:add',
          text: `c${i}`,
        });
      }
      expect((node as any).__spatialCommentState.comments).toHaveLength(2);
    });

    it('should remove comment by id', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(spatialCommentHandler, node, {}, ctx);
      sendEvent(spatialCommentHandler, node, {}, ctx, { type: 'comment:add', text: 'temp' });
      const id = (node as any).__spatialCommentState.comments[0].id;
      sendEvent(spatialCommentHandler, node, {}, ctx, { type: 'comment:remove', commentId: id });

      expect((node as any).__spatialCommentState.comments).toHaveLength(0);
    });
  });

  describe('onUpdate (expiry)', () => {
    it('should expire old comments', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(spatialCommentHandler, node, { lifetime: 1 }, ctx);
      sendEvent(spatialCommentHandler, node, { lifetime: 1 }, ctx, {
        type: 'comment:add',
        text: 'temp',
      });

      // Force expiry
      (node as any).__spatialCommentState.comments[0].expiresAt = Date.now() - 100;

      updateTrait(spatialCommentHandler, node, { lifetime: 1 }, ctx, 16);
      expect((node as any).__spatialCommentState.comments).toHaveLength(0);
    });
  });
});

// =============================================================================
// PHASE 3: @room_portal
// =============================================================================

describe('roomPortalHandler', () => {
  it('should have correct name', () => {
    expect(roomPortalHandler.name).toBe('room_portal');
  });

  describe('onAttach', () => {
    it('should emit portal:created with target', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(roomPortalHandler, node, { target_did: 'did:target' }, ctx);
      expect((node as any).__roomPortalState.isActive).toBe(true);
      expect(getLastEvent(ctx, 'portal:created')).toBeDefined();
    });

    it('should be inactive without target', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(roomPortalHandler, node, { target_did: '' }, ctx);
      expect((node as any).__roomPortalState.isActive).toBe(false);
    });
  });

  describe('onEvent', () => {
    it('should traverse portal and increment count', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(roomPortalHandler, node, { target_did: 'did:target' }, ctx);
      sendEvent(roomPortalHandler, node, {}, ctx, { type: 'portal:traverse', did: 'did:traveler' });

      expect((node as any).__roomPortalState.traversals).toBe(1);
      const ev = getLastEvent(ctx, 'portal:traversed') as any;
      expect(ev.targetDid).toBe('did:target');
    });

    it('should not traverse inactive portal', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(roomPortalHandler, node, { target_did: '' }, ctx);
      sendEvent(roomPortalHandler, node, {}, ctx, { type: 'portal:traverse', did: 'did:x' });

      expect((node as any).__roomPortalState.traversals).toBe(0);
    });

    it('should update target and emit portal:data', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(roomPortalHandler, node, {}, ctx);
      sendEvent(roomPortalHandler, node, {}, ctx, {
        type: 'portal:set_target',
        targetDid: 'did:new',
      });
      expect((node as any).__roomPortalState.isActive).toBe(true);

      ctx.clearEvents();
      sendEvent(roomPortalHandler, node, {}, ctx, { type: 'portal:get' });
      expect(getLastEvent(ctx, 'portal:data')).toBeDefined();
    });
  });
});

// =============================================================================
// PHASE 3: @trait_showcase
// =============================================================================

describe('traitShowcaseHandler', () => {
  it('should have correct name', () => {
    expect(traitShowcaseHandler.name).toBe('trait_showcase');
  });

  describe('onAttach/onDetach', () => {
    it('should initialize and cleanup', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(traitShowcaseHandler, node, {}, ctx);
      expect((node as any).__traitShowcaseState).toBeDefined();

      traitShowcaseHandler.onDetach?.(node as any);
      expect((node as any).__traitShowcaseState).toBeUndefined();
    });
  });

  describe('onEvent', () => {
    it('should add showcase item', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(traitShowcaseHandler, node, {}, ctx);
      sendEvent(traitShowcaseHandler, node, {}, ctx, {
        type: 'showcase:add',
        traitName: 'agent_profile',
        displayName: 'Profile',
        icon: 'user',
      });

      expect((node as any).__traitShowcaseState.items).toHaveLength(1);
      expect(getLastEvent(ctx, 'showcase:added')).toBeDefined();
    });

    it('should not add duplicate trait', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(traitShowcaseHandler, node, {}, ctx);
      sendEvent(traitShowcaseHandler, node, {}, ctx, { type: 'showcase:add', traitName: 'x' });
      sendEvent(traitShowcaseHandler, node, {}, ctx, { type: 'showcase:add', traitName: 'x' });

      expect((node as any).__traitShowcaseState.items).toHaveLength(1);
    });

    it('should not exceed max_display', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(traitShowcaseHandler, node, { max_display: 2 }, ctx);
      sendEvent(traitShowcaseHandler, node, { max_display: 2 }, ctx, {
        type: 'showcase:add',
        traitName: 'a',
      });
      sendEvent(traitShowcaseHandler, node, { max_display: 2 }, ctx, {
        type: 'showcase:add',
        traitName: 'b',
      });
      sendEvent(traitShowcaseHandler, node, { max_display: 2 }, ctx, {
        type: 'showcase:add',
        traitName: 'c',
      });

      expect((node as any).__traitShowcaseState.items).toHaveLength(2);
    });

    it('should remove and reorder items', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(traitShowcaseHandler, node, {}, ctx);
      sendEvent(traitShowcaseHandler, node, {}, ctx, { type: 'showcase:add', traitName: 'a' });
      sendEvent(traitShowcaseHandler, node, {}, ctx, { type: 'showcase:add', traitName: 'b' });
      sendEvent(traitShowcaseHandler, node, {}, ctx, {
        type: 'showcase:reorder',
        traitName: 'b',
        index: 0,
      });

      expect((node as any).__traitShowcaseState.items[0].traitName).toBe('b');

      sendEvent(traitShowcaseHandler, node, {}, ctx, { type: 'showcase:remove', traitName: 'a' });
      expect((node as any).__traitShowcaseState.items).toHaveLength(1);
    });

    it('should emit showcase:data on get', () => {
      const node = createMockNode();
      const ctx = createMockContext();

      attachTrait(traitShowcaseHandler, node, {}, ctx);
      sendEvent(traitShowcaseHandler, node, {}, ctx, { type: 'showcase:get' });

      expect(getLastEvent(ctx, 'showcase:data')).toBeDefined();
    });
  });
});

// =============================================================================
// Collection export
// =============================================================================

describe('holomeshSocialTraitHandlers', () => {
  it('should export all 13 handlers', () => {
    expect(holomeshSocialTraitHandlers.agent_profile).toBe(agentProfileHandler);
    expect(holomeshSocialTraitHandlers.profile_theme).toBe(profileThemeHandler);
    expect(holomeshSocialTraitHandlers.status_mood).toBe(statusMoodHandler);
    expect(holomeshSocialTraitHandlers.agent_badge).toBe(agentBadgeHandler);
    expect(holomeshSocialTraitHandlers.visitor_counter).toBe(visitorCounterHandler);
    expect(holomeshSocialTraitHandlers.top8_friends).toBe(top8FriendsHandler);
    expect(holomeshSocialTraitHandlers.guestbook).toBe(guestbookHandler);
    expect(holomeshSocialTraitHandlers.agent_wall).toBe(agentWallHandler);
    expect(holomeshSocialTraitHandlers.agent_room).toBe(agentRoomHandler);
    expect(holomeshSocialTraitHandlers.background_music).toBe(backgroundMusicHandler);
    expect(holomeshSocialTraitHandlers.spatial_comment).toBe(spatialCommentHandler);
    expect(holomeshSocialTraitHandlers.room_portal).toBe(roomPortalHandler);
    expect(holomeshSocialTraitHandlers.trait_showcase).toBe(traitShowcaseHandler);
  });

  it('should have exactly 13 handlers', () => {
    expect(Object.keys(holomeshSocialTraitHandlers)).toHaveLength(13);
  });
});
