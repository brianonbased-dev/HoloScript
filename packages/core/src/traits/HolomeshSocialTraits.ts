/**
 * Holomesh Social Traits — "MySpace for Agents"
 *
 * Phase 1 core identity traits that give AI agents persistent, customizable
 * profiles on the Holomesh network. Each agent gets a DID-anchored identity
 * card, visual theme, status indicator, achievement badges, and visitor tracking.
 *
 * Built on V4 wallet identity (did:pkh:eip155) and composable with existing
 * traits: @economy for marketplace, @agent_portal for room visits, @collaborative
 * for real-time interactions.
 *
 * @version 1.0.0
 * @module holomesh/social-traits
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface AgentProfileConfig {
  /** Agent DID from V4 wallet identity */
  did: string;
  /** Display name */
  display_name: string;
  /** Bio text (max 500 chars) */
  bio: string;
  /** Avatar URL or procedural seed */
  avatar: string;
  /** Avatar source type */
  avatar_type: 'url' | 'procedural';
  /** Custom title (e.g., "Knowledge Architect") */
  custom_title: string;
  /** Profile visibility */
  visibility: 'public' | 'peers_only' | 'private';
  /** Pinned knowledge entry IDs (max 3) */
  pinned_entries: string[];
  /** Social links (platform → handle/url) */
  links: Record<string, string>;
}

export interface ProfileThemeConfig {
  /** Primary color (hex) */
  primary_color: string;
  /** Accent color (hex) */
  accent_color: string;
  /** Background gradient stops */
  background_gradient: string[];
  /** Font family override */
  font_family: string;
  /** Particle effect preset */
  particles: 'none' | 'stars' | 'fireflies' | 'snow' | 'matrix' | 'bubbles';
  /** Surface material preset */
  surface_material: 'matte' | 'glossy' | 'neon' | 'holographic' | 'glass';
  /** Custom CSS class for UI targets */
  custom_class: string;
  /** Skybox preset or URL */
  skybox: string;
}

export interface StatusMoodConfig {
  /** Default status text */
  default_text: string;
  /** Default mood (emoji or keyword) */
  default_mood: string;
  /** Auto-generate mood from activity */
  auto_mood: boolean;
  /** Status expiry in ms (0 = manual clear) */
  expiry: number;
  /** Who can see the status */
  visibility: 'everyone' | 'friends' | 'nobody';
}

export interface AgentBadgeConfig {
  /** Max badges to display */
  max_display: number;
  /** Badge display style */
  display: 'ribbon' | 'shield' | 'icon' | 'holographic';
  /** Show total badge count */
  show_count: boolean;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'diamond';
  earnedAt: number;
  criteria: string;
}

export interface VisitorCounterConfig {
  /** Display style */
  display: 'counter' | 'ticker' | 'hidden';
  /** Track unique visitors only (by DID) */
  unique_only: boolean;
  /** Reset interval in ms (0 = never) */
  reset_interval: number;
  /** Show "currently viewing" count */
  show_active: boolean;
}

// =============================================================================
// MILESTONE THRESHOLDS
// =============================================================================

const VISITOR_MILESTONES = [10, 50, 100, 500, 1000, 5000, 10000];

// =============================================================================
// @agent_profile HANDLER
// =============================================================================

/**
 * @agent_profile — Persistent agent identity card
 *
 * Anchors an agent's public identity to their wallet DID. Provides display
 * name, bio, avatar, custom title, and social links. All other Holomesh
 * social traits depend on this as the identity root.
 */
export const agentProfileHandler: TraitHandler<AgentProfileConfig> = {
  name: 'agent_profile',

  defaultConfig: {
    did: '',
    display_name: 'Agent',
    bio: '',
    avatar: '',
    avatar_type: 'procedural',
    custom_title: '',
    visibility: 'public',
    pinned_entries: [],
    links: {},
  },

  onAttach(node, config, context) {
    const state: Record<string, unknown> = {
      did: config.did,
      displayName: config.display_name,
      bio: config.bio.slice(0, 500),
      avatar: config.avatar,
      avatarType: config.avatar_type,
      customTitle: config.custom_title,
      visibility: config.visibility,
      pinnedEntries: config.pinned_entries.slice(0, 3),
      links: { ...config.links },
      reputation: 0,
      reputationTier: 'newcomer',
      totalContributions: 0,
      totalVisitors: 0,
      friendCount: 0,
      isOnline: true,
      lastSeenAt: Date.now(),
      profileVersion: 1,
    };
    node.__agentProfileState = state;
    context.emit('profile:created', { did: config.did, displayName: config.display_name });
  },

  onDetach(node) {
    delete node.__agentProfileState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Profile is event-driven, no per-frame updates needed
  },

  onEvent(node, _config, context, event) {
    const state = node.__agentProfileState;
    if (!state) return;

    const ev = event as Record<string, unknown>;

    switch (event.type) {
      case 'profile:update': {
        const field = ev.field as string;
        const value = ev.value;
        if (field && field in state) {
          const oldValue = state[field];
          if (field === 'bio' && typeof value === 'string') {
            state[field] = value.slice(0, 500);
          } else if (field === 'pinnedEntries' && Array.isArray(value)) {
            state[field] = value.slice(0, 3);
          } else {
            state[field] = value;
          }
          state.profileVersion = (state.profileVersion as number) + 1;
          context.emit('profile:updated', { did: state.did, field, oldValue, newValue: state[field] });
        }
        break;
      }
      case 'profile:get':
        context.emit('profile:data', { ...state });
        break;
      case 'profile:set_online':
        state.isOnline = true;
        state.lastSeenAt = Date.now();
        break;
      case 'profile:set_offline':
        state.isOnline = false;
        state.lastSeenAt = Date.now();
        break;
      case 'profile:viewed':
        state.totalVisitors = (state.totalVisitors as number) + 1;
        context.emit('profile:viewed', { did: state.did, viewerDid: ev.viewerDid });
        break;
    }
  },
};

// =============================================================================
// @profile_theme HANDLER
// =============================================================================

/**
 * @profile_theme — Visual customization for agent profiles/rooms
 *
 * Colors, gradients, particles, materials, and skybox. Saved presets allow
 * quick theme switching. Emits theme:applied for renderers to pick up.
 */
export const profileThemeHandler: TraitHandler<ProfileThemeConfig> = {
  name: 'profile_theme',

  defaultConfig: {
    primary_color: '#6366f1',
    accent_color: '#a78bfa',
    background_gradient: ['#1a0533', '#0a1628'],
    font_family: 'system-ui',
    particles: 'none',
    surface_material: 'matte',
    custom_class: '',
    skybox: 'default',
  },

  onAttach(node, config, context) {
    const state: Record<string, unknown> = {
      activeTheme: { ...config },
      savedThemes: new Map<string, ProfileThemeConfig>(),
      themeVersion: 1,
    };
    node.__profileThemeState = state;
    context.emit('theme:applied', { theme: { ...config } });
  },

  onDetach(node) {
    delete node.__profileThemeState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Theme is event-driven
  },

  onEvent(node, _config, context, event) {
    const state = node.__profileThemeState;
    if (!state) return;

    const ev = event as Record<string, unknown>;

    switch (event.type) {
      case 'theme:apply': {
        const theme = ev.theme as Partial<ProfileThemeConfig>;
        if (theme) {
          state.activeTheme = { ...(state.activeTheme as ProfileThemeConfig), ...theme };
          state.themeVersion = (state.themeVersion as number) + 1;
          context.emit('theme:applied', { theme: { ...state.activeTheme } });
        }
        break;
      }
      case 'theme:save': {
        const name = ev.name as string;
        if (name) {
          const themes = state.savedThemes as Map<string, ProfileThemeConfig>;
          themes.set(name, { ...(state.activeTheme as ProfileThemeConfig) });
          context.emit('theme:saved', { name, theme: { ...state.activeTheme } });
        }
        break;
      }
      case 'theme:load': {
        const name = ev.name as string;
        const themes = state.savedThemes as Map<string, ProfileThemeConfig>;
        const saved = themes.get(name);
        if (saved) {
          state.activeTheme = { ...saved };
          state.themeVersion = (state.themeVersion as number) + 1;
          context.emit('theme:applied', { theme: { ...state.activeTheme } });
        }
        break;
      }
      case 'theme:reset':
        state.activeTheme = { ...profileThemeHandler.defaultConfig! };
        state.themeVersion = (state.themeVersion as number) + 1;
        context.emit('theme:applied', { theme: { ...state.activeTheme } });
        break;
    }
  },
};

// =============================================================================
// @status_mood HANDLER
// =============================================================================

/**
 * @status_mood — Current mood/status indicator
 *
 * Agents broadcast what they're doing or feeling. Supports auto-mood
 * derived from activity, manual text+emoji, and configurable expiry.
 */
export const statusMoodHandler: TraitHandler<StatusMoodConfig> = {
  name: 'status_mood',

  defaultConfig: {
    default_text: '',
    default_mood: '',
    auto_mood: false,
    expiry: 0,
    visibility: 'everyone',
  },

  onAttach(node, config, _context) {
    const state: Record<string, unknown> = {
      currentText: config.default_text,
      currentMood: config.default_mood,
      setAt: Date.now(),
      expiresAt: config.expiry > 0 ? Date.now() + config.expiry : null,
      autoMoodSource: null,
      statusHistory: [] as Array<{ text: string; mood: string; at: number }>,
    };
    node.__statusMoodState = state;
  },

  onDetach(node) {
    delete node.__statusMoodState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__statusMoodState;
    if (!state) return;

    // Check expiry
    const expiresAt = state.expiresAt as number | null;
    if (expiresAt && Date.now() >= expiresAt) {
      const prevText = state.currentText;
      const prevMood = state.currentMood;
      state.currentText = config.default_text;
      state.currentMood = config.default_mood;
      state.expiresAt = null;
      context.emit('status:expired', { previousText: prevText, previousMood: prevMood });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__statusMoodState;
    if (!state) return;

    const ev = event as Record<string, unknown>;

    switch (event.type) {
      case 'status:set': {
        const text = (ev.text as string) || '';
        const mood = (ev.mood as string) || '';
        const history = state.statusHistory as Array<{ text: string; mood: string; at: number }>;
        history.push({ text: state.currentText as string, mood: state.currentMood as string, at: state.setAt as number });
        if (history.length > 20) history.shift();
        state.currentText = text;
        state.currentMood = mood;
        state.setAt = Date.now();
        state.expiresAt = config.expiry > 0 ? Date.now() + config.expiry : null;
        context.emit('status:changed', { text, mood, setAt: state.setAt });
        break;
      }
      case 'status:clear':
        state.currentText = config.default_text;
        state.currentMood = config.default_mood;
        state.expiresAt = null;
        context.emit('status:changed', { text: state.currentText, mood: state.currentMood, setAt: Date.now() });
        break;
      case 'status:get':
        context.emit('status:data', {
          text: state.currentText,
          mood: state.currentMood,
          setAt: state.setAt,
          expiresAt: state.expiresAt,
        });
        break;
      case 'status:auto_update': {
        if (!config.auto_mood) break;
        const mood = ev.mood as string;
        const source = ev.source as string;
        if (mood) {
          state.currentMood = mood;
          state.autoMoodSource = source || null;
          context.emit('status:auto_updated', { mood, source });
        }
        break;
      }
    }
  },
};

// =============================================================================
// @agent_badge HANDLER
// =============================================================================

/**
 * @agent_badge — Achievement badges earned by agents
 *
 * Tracks badges earned through reputation milestones, contributions,
 * and community recognition. Displayed on profile as visual trophies.
 */
export const agentBadgeHandler: TraitHandler<AgentBadgeConfig> = {
  name: 'agent_badge',

  defaultConfig: {
    max_display: 5,
    display: 'icon',
    show_count: true,
  },

  onAttach(node, _config, _context) {
    const state: Record<string, unknown> = {
      displayedBadges: [] as Badge[],
      allBadges: new Map<string, Badge>(),
      totalBadges: 0,
    };
    node.__agentBadgeState = state;
  },

  onDetach(node) {
    delete node.__agentBadgeState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Badges are event-driven
  },

  onEvent(node, config, context, event) {
    const state = node.__agentBadgeState;
    if (!state) return;

    const ev = event as Record<string, unknown>;

    switch (event.type) {
      case 'badge:award': {
        const badge = ev.badge as Badge;
        if (!badge || !badge.id) break;
        const allBadges = state.allBadges as Map<string, Badge>;
        if (allBadges.has(badge.id)) break; // Already earned
        allBadges.set(badge.id, badge);
        state.totalBadges = allBadges.size;
        // Auto-display if under limit
        const displayed = state.displayedBadges as Badge[];
        if (displayed.length < config.max_display) {
          displayed.push(badge);
        }
        context.emit('badge:earned', { badge });
        break;
      }
      case 'badge:display': {
        const badgeId = ev.badgeId as string;
        const allBadges = state.allBadges as Map<string, Badge>;
        const badge = allBadges.get(badgeId);
        if (!badge) break;
        const displayed = state.displayedBadges as Badge[];
        if (displayed.some((b) => b.id === badgeId)) break; // Already displayed
        if (displayed.length >= config.max_display) displayed.shift();
        displayed.push(badge);
        context.emit('badge:displayed', { badgeId });
        break;
      }
      case 'badge:hide': {
        const badgeId = ev.badgeId as string;
        const displayed = state.displayedBadges as Badge[];
        const idx = displayed.findIndex((b) => b.id === badgeId);
        if (idx >= 0) {
          displayed.splice(idx, 1);
          context.emit('badge:hidden', { badgeId });
        }
        break;
      }
      case 'badge:get_all':
        context.emit('badge:data', {
          displayed: [...(state.displayedBadges as Badge[])],
          total: state.totalBadges,
          all: Array.from((state.allBadges as Map<string, Badge>).values()),
        });
        break;
    }
  },
};

// =============================================================================
// @visitor_counter HANDLER
// =============================================================================

/**
 * @visitor_counter — Track and display visitors
 *
 * Counts visits to an agent's profile or room. Supports unique-only tracking,
 * active visitor count, peak tracking, and milestone celebrations.
 */
export const visitorCounterHandler: TraitHandler<VisitorCounterConfig> = {
  name: 'visitor_counter',

  defaultConfig: {
    display: 'counter',
    unique_only: true,
    reset_interval: 0,
    show_active: true,
  },

  onAttach(node, _config, _context) {
    const state: Record<string, unknown> = {
      totalVisits: 0,
      uniqueVisitors: new Set<string>(),
      activeVisitors: 0,
      peakVisitors: 0,
      peakAt: 0,
      lastVisitorDid: null,
      lastVisitAt: 0,
      lastResetAt: Date.now(),
      lastMilestone: 0,
    };
    node.__visitorCounterState = state;
  },

  onDetach(node) {
    delete node.__visitorCounterState;
  },

  onUpdate(node, config, _context, _delta) {
    const state = node.__visitorCounterState;
    if (!state) return;

    // Check reset interval
    if (config.reset_interval > 0) {
      const lastReset = state.lastResetAt as number;
      if (Date.now() - lastReset >= config.reset_interval) {
        state.totalVisits = 0;
        (state.uniqueVisitors as Set<string>).clear();
        state.activeVisitors = 0;
        state.peakVisitors = 0;
        state.lastMilestone = 0;
        state.lastResetAt = Date.now();
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__visitorCounterState;
    if (!state) return;

    const ev = event as Record<string, unknown>;

    switch (event.type) {
      case 'visitors:record': {
        const visitorDid = ev.did as string;
        const unique = state.uniqueVisitors as Set<string>;

        if (config.unique_only && visitorDid && unique.has(visitorDid)) {
          break; // Already counted
        }

        state.totalVisits = (state.totalVisits as number) + 1;
        if (visitorDid) unique.add(visitorDid);
        state.lastVisitorDid = visitorDid || null;
        state.lastVisitAt = Date.now();

        const total = state.totalVisits as number;
        context.emit('visitors:counted', { total, unique: unique.size, active: state.activeVisitors });

        // Check milestones
        const lastMilestone = state.lastMilestone as number;
        for (const milestone of VISITOR_MILESTONES) {
          if (total >= milestone && lastMilestone < milestone) {
            state.lastMilestone = milestone;
            context.emit('visitors:milestone', { milestone, total });
            break;
          }
        }
        break;
      }
      case 'visitors:enter': {
        state.activeVisitors = (state.activeVisitors as number) + 1;
        const active = state.activeVisitors as number;
        const peak = state.peakVisitors as number;
        if (active > peak) {
          state.peakVisitors = active;
          state.peakAt = Date.now();
          context.emit('visitors:peak', { peak: active, when: state.peakAt });
        }
        break;
      }
      case 'visitors:leave':
        state.activeVisitors = Math.max(0, (state.activeVisitors as number) - 1);
        break;
      case 'visitors:get_stats':
        context.emit('visitors:data', {
          total: state.totalVisits,
          unique: (state.uniqueVisitors as Set<string>).size,
          active: state.activeVisitors,
          peak: state.peakVisitors,
          peakAt: state.peakAt,
          lastVisitorDid: state.lastVisitorDid,
          lastVisitAt: state.lastVisitAt,
        });
        break;
      case 'visitors:reset':
        state.totalVisits = 0;
        (state.uniqueVisitors as Set<string>).clear();
        state.activeVisitors = 0;
        state.peakVisitors = 0;
        state.lastMilestone = 0;
        state.lastResetAt = Date.now();
        break;
    }
  },
};

// =============================================================================
// EXPORTS
// =============================================================================

export const holomeshSocialTraitHandlers = {
  agent_profile: agentProfileHandler,
  profile_theme: profileThemeHandler,
  status_mood: statusMoodHandler,
  agent_badge: agentBadgeHandler,
  visitor_counter: visitorCounterHandler,
};

export default holomeshSocialTraitHandlers;
