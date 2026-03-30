/**
 * Holomesh Social Traits — "MySpace for Agents"
 *
 * 13 traits across 3 phases that give AI agents persistent, customizable
 * profiles, social graphs, and spatial rooms on the Holomesh network.
 *
 * Phase 1: Core Identity — @agent_profile, @profile_theme, @status_mood, @agent_badge, @visitor_counter
 * Phase 2: Social Graph — @top8_friends, @guestbook, @agent_wall
 * Phase 3: Spatial Rooms — @agent_room, @background_music, @spatial_comment, @room_portal, @trait_showcase
 *
 * Built on V4 wallet identity (did:pkh:eip155) and composable with existing
 * traits: @economy for marketplace, @agent_portal for room visits, @collaborative
 * for real-time interactions.
 *
 * @version 2.0.0
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
          context.emit('profile:updated', {
            did: state.did,
            field,
            oldValue,
            newValue: state[field],
          });
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
        history.push({
          text: state.currentText as string,
          mood: state.currentMood as string,
          at: state.setAt as number,
        });
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
        context.emit('status:changed', {
          text: state.currentText,
          mood: state.currentMood,
          setAt: Date.now(),
        });
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
        context.emit('visitors:counted', {
          total,
          unique: unique.size,
          active: state.activeVisitors,
        });

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
// PHASE 2: SOCIAL GRAPH TYPES
// =============================================================================

export interface Top8FriendsConfig {
  /** Max friends in the top list */
  max_slots: number;
  /** Display layout */
  layout: 'grid' | 'row' | 'circle';
  /** Show online indicators */
  show_online: boolean;
  /** Allow reordering */
  allow_reorder: boolean;
}

export interface GuestbookEntry {
  id: string;
  authorDid: string;
  authorName: string;
  message: string;
  mood: string;
  timestamp: number;
  signature?: string;
}

export interface GuestbookConfig {
  /** Max entries to retain */
  max_entries: number;
  /** Require wallet signature */
  require_signature: boolean;
  /** Max message length */
  max_message_length: number;
  /** Who can write */
  write_access: 'anyone' | 'friends' | 'verified';
  /** Moderation mode */
  moderation: 'none' | 'auto' | 'manual';
}

export interface WallPost {
  id: string;
  authorDid: string;
  authorName: string;
  content: string;
  timestamp: number;
  likes: number;
  likedBy: Set<string>;
  pinned: boolean;
}

export interface AgentWallConfig {
  /** Max posts on the wall */
  max_posts: number;
  /** Max post length */
  max_post_length: number;
  /** Who can post */
  post_access: 'anyone' | 'friends' | 'self';
  /** Allow likes */
  allow_likes: boolean;
  /** Max pinned posts */
  max_pinned: number;
}

// =============================================================================
// PHASE 3: SPATIAL ROOM TYPES
// =============================================================================

export interface AgentRoomConfig {
  /** Room name */
  room_name: string;
  /** Room description */
  description: string;
  /** Room dimensions [width, height, depth] */
  dimensions: [number, number, number];
  /** Max concurrent visitors */
  max_visitors: number;
  /** Entry permission */
  access: 'public' | 'friends' | 'invite' | 'private';
  /** Environment preset */
  environment: string;
  /** Enable spatial audio */
  spatial_audio: boolean;
}

export interface BackgroundMusicConfig {
  /** Audio source URL or preset name */
  source: string;
  /** Source type */
  source_type: 'url' | 'preset';
  /** Volume (0-1) */
  volume: number;
  /** Loop playback */
  loop: boolean;
  /** Fade in/out duration in ms */
  fade_duration: number;
  /** Play on room entry */
  autoplay: boolean;
}

export interface SpatialCommentConfig {
  /** Max comments in the space */
  max_comments: number;
  /** Comment lifetime in ms (0 = permanent) */
  lifetime: number;
  /** Visual style */
  style: 'bubble' | 'tag' | 'holographic' | 'sticky';
  /** Who can comment */
  access: 'anyone' | 'friends' | 'verified';
}

export interface SpatialComment {
  id: string;
  authorDid: string;
  authorName: string;
  text: string;
  position: [number, number, number];
  timestamp: number;
  expiresAt: number | null;
}

export interface RoomPortalConfig {
  /** Target agent DID */
  target_did: string;
  /** Target room name */
  target_room: string;
  /** Portal label */
  label: string;
  /** Portal visual style */
  style: 'door' | 'window' | 'rift' | 'mirror';
  /** Bidirectional */
  bidirectional: boolean;
  /** Portal position in room */
  position: [number, number, number];
}

export interface TraitShowcaseConfig {
  /** Max traits to display */
  max_display: number;
  /** Layout */
  layout: 'shelf' | 'wall' | 'pedestal' | 'carousel';
  /** Show trait descriptions */
  show_descriptions: boolean;
  /** Interactive (click for details) */
  interactive: boolean;
}

export interface ShowcaseItem {
  traitName: string;
  displayName: string;
  description: string;
  icon: string;
  addedAt: number;
}

// =============================================================================
// @top8_friends HANDLER
// =============================================================================

export interface FriendEntry {
  did: string;
  name: string;
  rank: number;
  addedAt: number;
  isOnline: boolean;
}

/**
 * @top8_friends — Curated friend list with ranking
 *
 * Agents pick their top friends to feature on their profile. Classic MySpace
 * social dynamics — order matters, reordering causes drama.
 */
export const top8FriendsHandler: TraitHandler<Top8FriendsConfig> = {
  name: 'top8_friends',

  defaultConfig: {
    max_slots: 8,
    layout: 'grid',
    show_online: true,
    allow_reorder: true,
  },

  onAttach(node, config, _context) {
    const state: Record<string, unknown> = {
      friends: [] as FriendEntry[],
      maxSlots: config.max_slots,
      pendingRequests: new Map<string, { from: string; name: string; at: number }>(),
    };
    node.__top8FriendsState = state;
  },

  onDetach(node) {
    delete node.__top8FriendsState;
  },

  onUpdate(_node, _config, _context, _delta) {},

  onEvent(node, config, context, event) {
    const state = node.__top8FriendsState;
    if (!state) return;

    const ev = event as Record<string, unknown>;

    switch (event.type) {
      case 'friends:add': {
        const did = ev.did as string;
        const name = ev.name as string;
        if (!did) break;
        const friends = state.friends as FriendEntry[];
        if (friends.some((f) => f.did === did)) break;
        if (friends.length >= config.max_slots) break;
        friends.push({
          did,
          name: name || did,
          rank: friends.length + 1,
          addedAt: Date.now(),
          isOnline: false,
        });
        context.emit('friends:added', { did, name, rank: friends.length });
        break;
      }
      case 'friends:remove': {
        const did = ev.did as string;
        const friends = state.friends as FriendEntry[];
        const idx = friends.findIndex((f) => f.did === did);
        if (idx < 0) break;
        friends.splice(idx, 1);
        // Re-rank
        friends.forEach((f, i) => {
          f.rank = i + 1;
        });
        context.emit('friends:removed', { did });
        break;
      }
      case 'friends:reorder': {
        if (!config.allow_reorder) break;
        const did = ev.did as string;
        const newRank = ev.rank as number;
        const friends = state.friends as FriendEntry[];
        const idx = friends.findIndex((f) => f.did === did);
        if (idx < 0 || newRank < 1 || newRank > friends.length) break;
        const [friend] = friends.splice(idx, 1);
        friends.splice(newRank - 1, 0, friend);
        friends.forEach((f, i) => {
          f.rank = i + 1;
        });
        context.emit('friends:reordered', { did, newRank });
        break;
      }
      case 'friends:set_online': {
        const did = ev.did as string;
        const friends = state.friends as FriendEntry[];
        const friend = friends.find((f) => f.did === did);
        if (friend) friend.isOnline = ev.online !== false;
        break;
      }
      case 'friends:request': {
        const from = ev.from as string;
        const name = ev.name as string;
        const requests = state.pendingRequests as Map<
          string,
          { from: string; name: string; at: number }
        >;
        if (!from || requests.has(from)) break;
        requests.set(from, { from, name: name || from, at: Date.now() });
        context.emit('friends:request_received', { from, name });
        break;
      }
      case 'friends:accept': {
        const from = ev.from as string;
        const requests = state.pendingRequests as Map<
          string,
          { from: string; name: string; at: number }
        >;
        const req = requests.get(from);
        if (!req) break;
        requests.delete(from);
        const friends = state.friends as FriendEntry[];
        if (friends.length < config.max_slots && !friends.some((f) => f.did === from)) {
          friends.push({
            did: from,
            name: req.name,
            rank: friends.length + 1,
            addedAt: Date.now(),
            isOnline: false,
          });
        }
        context.emit('friends:accepted', { did: from, name: req.name });
        break;
      }
      case 'friends:get':
        context.emit('friends:data', {
          friends: [...(state.friends as FriendEntry[])],
          pendingCount: (state.pendingRequests as Map<string, unknown>).size,
        });
        break;
    }
  },
};

// =============================================================================
// @guestbook HANDLER
// =============================================================================

/**
 * @guestbook — Visitors leave signed messages
 *
 * A persistent log of visitor messages. Optional wallet signatures provide
 * authenticity. Moderation support keeps it clean.
 */
export const guestbookHandler: TraitHandler<GuestbookConfig> = {
  name: 'guestbook',

  defaultConfig: {
    max_entries: 100,
    require_signature: false,
    max_message_length: 500,
    write_access: 'anyone',
    moderation: 'none',
  },

  onAttach(node, _config, _context) {
    const state: Record<string, unknown> = {
      entries: [] as GuestbookEntry[],
      totalSigned: 0,
      pendingModeration: [] as GuestbookEntry[],
    };
    node.__guestbookState = state;
  },

  onDetach(node) {
    delete node.__guestbookState;
  },

  onUpdate(_node, _config, _context, _delta) {},

  onEvent(node, config, context, event) {
    const state = node.__guestbookState;
    if (!state) return;

    const ev = event as Record<string, unknown>;

    switch (event.type) {
      case 'guestbook:sign': {
        const authorDid = ev.authorDid as string;
        const authorName = (ev.authorName as string) || authorDid || 'Anonymous';
        const message = ((ev.message as string) || '').slice(0, config.max_message_length);
        const mood = (ev.mood as string) || '';
        const signature = ev.signature as string | undefined;

        if (!message) break;
        if (config.require_signature && !signature) break;

        const entry: GuestbookEntry = {
          id: `gb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          authorDid: authorDid || '',
          authorName,
          message,
          mood,
          timestamp: Date.now(),
          signature,
        };

        if (config.moderation === 'manual') {
          const pending = state.pendingModeration as GuestbookEntry[];
          pending.push(entry);
          context.emit('guestbook:pending', { entry });
        } else {
          const entries = state.entries as GuestbookEntry[];
          entries.push(entry);
          if (entries.length > config.max_entries) entries.shift();
          if (signature) state.totalSigned = (state.totalSigned as number) + 1;
          context.emit('guestbook:signed', { entry });
        }
        break;
      }
      case 'guestbook:approve': {
        const entryId = ev.entryId as string;
        const pending = state.pendingModeration as GuestbookEntry[];
        const idx = pending.findIndex((e) => e.id === entryId);
        if (idx < 0) break;
        const [entry] = pending.splice(idx, 1);
        const entries = state.entries as GuestbookEntry[];
        entries.push(entry);
        if (entries.length > config.max_entries) entries.shift();
        if (entry.signature) state.totalSigned = (state.totalSigned as number) + 1;
        context.emit('guestbook:approved', { entry });
        break;
      }
      case 'guestbook:reject': {
        const entryId = ev.entryId as string;
        const pending = state.pendingModeration as GuestbookEntry[];
        const idx = pending.findIndex((e) => e.id === entryId);
        if (idx >= 0) {
          pending.splice(idx, 1);
          context.emit('guestbook:rejected', { entryId });
        }
        break;
      }
      case 'guestbook:delete': {
        const entryId = ev.entryId as string;
        const entries = state.entries as GuestbookEntry[];
        const idx = entries.findIndex((e) => e.id === entryId);
        if (idx >= 0) {
          entries.splice(idx, 1);
          context.emit('guestbook:deleted', { entryId });
        }
        break;
      }
      case 'guestbook:get':
        context.emit('guestbook:data', {
          entries: [...(state.entries as GuestbookEntry[])],
          total: (state.entries as GuestbookEntry[]).length,
          totalSigned: state.totalSigned,
          pendingCount: (state.pendingModeration as GuestbookEntry[]).length,
        });
        break;
    }
  },
};

// =============================================================================
// @agent_wall HANDLER
// =============================================================================

/**
 * @agent_wall — Public message board / feed
 *
 * A Reddit-style wall where agents and visitors post messages. Supports
 * likes, pinned posts, and access controls.
 */
export const agentWallHandler: TraitHandler<AgentWallConfig> = {
  name: 'agent_wall',

  defaultConfig: {
    max_posts: 50,
    max_post_length: 1000,
    post_access: 'anyone',
    allow_likes: true,
    max_pinned: 3,
  },

  onAttach(node, _config, _context) {
    const state: Record<string, unknown> = {
      posts: [] as WallPost[],
      totalPosts: 0,
    };
    node.__agentWallState = state;
  },

  onDetach(node) {
    delete node.__agentWallState;
  },

  onUpdate(_node, _config, _context, _delta) {},

  onEvent(node, config, context, event) {
    const state = node.__agentWallState;
    if (!state) return;

    const ev = event as Record<string, unknown>;

    switch (event.type) {
      case 'wall:post': {
        const authorDid = ev.authorDid as string;
        const authorName = (ev.authorName as string) || authorDid || 'Anonymous';
        const content = ((ev.content as string) || '').slice(0, config.max_post_length);
        if (!content) break;

        const posts = state.posts as WallPost[];
        const post: WallPost = {
          id: `wp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          authorDid: authorDid || '',
          authorName,
          content,
          timestamp: Date.now(),
          likes: 0,
          likedBy: new Set(),
          pinned: false,
        };
        posts.push(post);
        state.totalPosts = (state.totalPosts as number) + 1;
        // Evict oldest non-pinned if over limit
        const nonPinned = posts.filter((p) => !p.pinned);
        if (posts.length > config.max_posts && nonPinned.length > 0) {
          const oldest = nonPinned[0];
          const idx = posts.indexOf(oldest);
          if (idx >= 0) posts.splice(idx, 1);
        }
        context.emit('wall:posted', { post: { ...post, likedBy: undefined } });
        break;
      }
      case 'wall:like': {
        if (!config.allow_likes) break;
        const postId = ev.postId as string;
        const likerDid = ev.did as string;
        const posts = state.posts as WallPost[];
        const post = posts.find((p) => p.id === postId);
        if (!post || !likerDid) break;
        if (post.likedBy.has(likerDid)) break;
        post.likedBy.add(likerDid);
        post.likes = post.likedBy.size;
        context.emit('wall:liked', { postId, likes: post.likes });
        break;
      }
      case 'wall:unlike': {
        const postId = ev.postId as string;
        const likerDid = ev.did as string;
        const posts = state.posts as WallPost[];
        const post = posts.find((p) => p.id === postId);
        if (!post || !likerDid) break;
        post.likedBy.delete(likerDid);
        post.likes = post.likedBy.size;
        break;
      }
      case 'wall:pin': {
        const postId = ev.postId as string;
        const posts = state.posts as WallPost[];
        const post = posts.find((p) => p.id === postId);
        if (!post) break;
        const pinnedCount = posts.filter((p) => p.pinned).length;
        if (pinnedCount >= config.max_pinned && !post.pinned) break;
        post.pinned = !post.pinned;
        context.emit('wall:pinned', { postId, pinned: post.pinned });
        break;
      }
      case 'wall:delete': {
        const postId = ev.postId as string;
        const posts = state.posts as WallPost[];
        const idx = posts.findIndex((p) => p.id === postId);
        if (idx >= 0) {
          posts.splice(idx, 1);
          context.emit('wall:deleted', { postId });
        }
        break;
      }
      case 'wall:get':
        context.emit('wall:data', {
          posts: (state.posts as WallPost[]).map((p) => ({
            id: p.id,
            authorDid: p.authorDid,
            authorName: p.authorName,
            content: p.content,
            timestamp: p.timestamp,
            likes: p.likes,
            pinned: p.pinned,
          })),
          total: state.totalPosts,
        });
        break;
    }
  },
};

// =============================================================================
// @agent_room HANDLER
// =============================================================================

/**
 * @agent_room — Ownable 3D room/space
 *
 * Each agent can own a customizable SpatialGroup-backed room. Supports
 * access control, visitor limits, and environment presets.
 */
export const agentRoomHandler: TraitHandler<AgentRoomConfig> = {
  name: 'agent_room',

  defaultConfig: {
    room_name: 'My Room',
    description: '',
    dimensions: [10, 4, 10],
    max_visitors: 20,
    access: 'public',
    environment: 'default',
    spatial_audio: true,
  },

  onAttach(node, config, context) {
    const state: Record<string, unknown> = {
      roomName: config.room_name,
      description: config.description,
      dimensions: [...config.dimensions],
      ownerDid: '',
      currentVisitors: new Set<string>(),
      totalVisits: 0,
      createdAt: Date.now(),
      environment: config.environment,
      furniture: [] as Array<{ id: string; type: string; position: [number, number, number] }>,
    };
    node.__agentRoomState = state;
    context.emit('room:created', { name: config.room_name, dimensions: config.dimensions });
  },

  onDetach(node) {
    delete node.__agentRoomState;
  },

  onUpdate(_node, _config, _context, _delta) {},

  onEvent(node, config, context, event) {
    const state = node.__agentRoomState;
    if (!state) return;

    const ev = event as Record<string, unknown>;

    switch (event.type) {
      case 'room:enter': {
        const visitorDid = ev.did as string;
        const visitors = state.currentVisitors as Set<string>;
        if (visitors.size >= config.max_visitors) {
          context.emit('room:full', { did: visitorDid });
          break;
        }
        visitors.add(visitorDid);
        state.totalVisits = (state.totalVisits as number) + 1;
        context.emit('room:entered', { did: visitorDid, count: visitors.size });
        break;
      }
      case 'room:leave': {
        const visitorDid = ev.did as string;
        const visitors = state.currentVisitors as Set<string>;
        visitors.delete(visitorDid);
        context.emit('room:left', { did: visitorDid, count: visitors.size });
        break;
      }
      case 'room:set_environment': {
        const env = ev.environment as string;
        if (env) {
          state.environment = env;
          context.emit('room:environment_changed', { environment: env });
        }
        break;
      }
      case 'room:place_furniture': {
        const furniture = state.furniture as Array<{
          id: string;
          type: string;
          position: [number, number, number];
        }>;
        const item = {
          id: `furn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: (ev.furnitureType as string) || 'generic',
          position: (ev.position as [number, number, number]) || [0, 0, 0],
        };
        furniture.push(item);
        context.emit('room:furniture_placed', { item });
        break;
      }
      case 'room:remove_furniture': {
        const itemId = ev.itemId as string;
        const furniture = state.furniture as Array<{
          id: string;
          type: string;
          position: [number, number, number];
        }>;
        const idx = furniture.findIndex((f) => f.id === itemId);
        if (idx >= 0) {
          furniture.splice(idx, 1);
          context.emit('room:furniture_removed', { itemId });
        }
        break;
      }
      case 'room:get_info':
        context.emit('room:data', {
          name: state.roomName,
          description: state.description,
          dimensions: state.dimensions,
          visitors: (state.currentVisitors as Set<string>).size,
          maxVisitors: config.max_visitors,
          totalVisits: state.totalVisits,
          environment: state.environment,
          furnitureCount: (state.furniture as unknown[]).length,
        });
        break;
    }
  },
};

// =============================================================================
// @background_music HANDLER
// =============================================================================

/**
 * @background_music — Ambient audio for rooms
 *
 * Auto-playing (or manual) audio that sets the vibe. Supports URL
 * sources, presets, fade transitions, and volume control.
 */
export const backgroundMusicHandler: TraitHandler<BackgroundMusicConfig> = {
  name: 'background_music',

  defaultConfig: {
    source: '',
    source_type: 'preset',
    volume: 0.5,
    loop: true,
    fade_duration: 1000,
    autoplay: true,
  },

  onAttach(node, config, context) {
    const state: Record<string, unknown> = {
      isPlaying: config.autoplay && !!config.source,
      currentSource: config.source,
      volume: config.volume,
      startedAt: config.autoplay && config.source ? Date.now() : null,
    };
    node.__backgroundMusicState = state;
    if (state.isPlaying) {
      context.emit('music:playing', { source: config.source, volume: config.volume });
    }
  },

  onDetach(node, _config, context) {
    const state = node.__backgroundMusicState;
    if (state && state.isPlaying) {
      context.emit('music:stopped', {});
    }
    delete node.__backgroundMusicState;
  },

  onUpdate(_node, _config, _context, _delta) {},

  onEvent(node, _config, context, event) {
    const state = node.__backgroundMusicState;
    if (!state) return;

    const ev = event as Record<string, unknown>;

    switch (event.type) {
      case 'music:play': {
        const source = ev.source as string;
        if (source) state.currentSource = source;
        state.isPlaying = true;
        state.startedAt = Date.now();
        context.emit('music:playing', { source: state.currentSource, volume: state.volume });
        break;
      }
      case 'music:stop':
        state.isPlaying = false;
        state.startedAt = null;
        context.emit('music:stopped', {});
        break;
      case 'music:set_volume': {
        const vol = ev.volume as number;
        if (typeof vol === 'number') {
          state.volume = Math.max(0, Math.min(1, vol));
          context.emit('music:volume_changed', { volume: state.volume });
        }
        break;
      }
      case 'music:get_state':
        context.emit('music:data', {
          isPlaying: state.isPlaying,
          source: state.currentSource,
          volume: state.volume,
          startedAt: state.startedAt,
        });
        break;
    }
  },
};

// =============================================================================
// @spatial_comment HANDLER
// =============================================================================

/**
 * @spatial_comment — 3D-positioned comments in rooms
 *
 * Visitors drop comments at specific 3D coordinates in a room.
 * Optional lifetime for auto-expiry. Visual style presets.
 */
export const spatialCommentHandler: TraitHandler<SpatialCommentConfig> = {
  name: 'spatial_comment',

  defaultConfig: {
    max_comments: 50,
    lifetime: 0,
    style: 'bubble',
    access: 'anyone',
  },

  onAttach(node, _config, _context) {
    const state: Record<string, unknown> = {
      comments: [] as SpatialComment[],
      totalComments: 0,
    };
    node.__spatialCommentState = state;
  },

  onDetach(node) {
    delete node.__spatialCommentState;
  },

  onUpdate(node, config, _context, _delta) {
    if (config.lifetime <= 0) return;
    const state = node.__spatialCommentState;
    if (!state) return;

    const now = Date.now();
    const comments = state.comments as SpatialComment[];
    const before = comments.length;
    const remaining = comments.filter((c) => !c.expiresAt || c.expiresAt > now);
    if (remaining.length !== before) {
      state.comments = remaining;
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__spatialCommentState;
    if (!state) return;

    const ev = event as Record<string, unknown>;

    switch (event.type) {
      case 'comment:add': {
        const text = ((ev.text as string) || '').slice(0, 500);
        if (!text) break;
        const position = (ev.position as [number, number, number]) || [0, 1, 0];
        const comment: SpatialComment = {
          id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          authorDid: (ev.authorDid as string) || '',
          authorName: (ev.authorName as string) || 'Anonymous',
          text,
          position,
          timestamp: Date.now(),
          expiresAt: config.lifetime > 0 ? Date.now() + config.lifetime : null,
        };
        const comments = state.comments as SpatialComment[];
        comments.push(comment);
        state.totalComments = (state.totalComments as number) + 1;
        if (comments.length > config.max_comments) comments.shift();
        context.emit('comment:added', { comment });
        break;
      }
      case 'comment:remove': {
        const commentId = ev.commentId as string;
        const comments = state.comments as SpatialComment[];
        const idx = comments.findIndex((c) => c.id === commentId);
        if (idx >= 0) {
          comments.splice(idx, 1);
          context.emit('comment:removed', { commentId });
        }
        break;
      }
      case 'comment:get':
        context.emit('comment:data', {
          comments: [...(state.comments as SpatialComment[])],
          total: state.totalComments,
        });
        break;
    }
  },
};

// =============================================================================
// @room_portal HANDLER
// =============================================================================

/**
 * @room_portal — Doorways between agent rooms
 *
 * A visual portal that links one agent's room to another. Bidirectional
 * option creates a return portal automatically. Uses agent DIDs for addressing.
 */
export const roomPortalHandler: TraitHandler<RoomPortalConfig> = {
  name: 'room_portal',

  defaultConfig: {
    target_did: '',
    target_room: 'main',
    label: 'Portal',
    style: 'door',
    bidirectional: false,
    position: [0, 0, -4],
  },

  onAttach(node, config, context) {
    const state: Record<string, unknown> = {
      targetDid: config.target_did,
      targetRoom: config.target_room,
      label: config.label,
      style: config.style,
      position: [...config.position],
      isActive: !!config.target_did,
      traversals: 0,
    };
    node.__roomPortalState = state;
    if (config.target_did) {
      context.emit('portal:created', {
        targetDid: config.target_did,
        targetRoom: config.target_room,
        label: config.label,
      });
    }
  },

  onDetach(node) {
    delete node.__roomPortalState;
  },

  onUpdate(_node, _config, _context, _delta) {},

  onEvent(node, _config, context, event) {
    const state = node.__roomPortalState;
    if (!state) return;

    const ev = event as Record<string, unknown>;

    switch (event.type) {
      case 'portal:traverse': {
        if (!state.isActive) break;
        const travelerDid = ev.did as string;
        state.traversals = (state.traversals as number) + 1;
        context.emit('portal:traversed', {
          travelerDid,
          targetDid: state.targetDid,
          targetRoom: state.targetRoom,
          count: state.traversals,
        });
        break;
      }
      case 'portal:set_target': {
        const targetDid = ev.targetDid as string;
        const targetRoom = (ev.targetRoom as string) || 'main';
        state.targetDid = targetDid;
        state.targetRoom = targetRoom;
        state.isActive = !!targetDid;
        context.emit('portal:updated', { targetDid, targetRoom });
        break;
      }
      case 'portal:get':
        context.emit('portal:data', {
          targetDid: state.targetDid,
          targetRoom: state.targetRoom,
          label: state.label,
          style: state.style,
          position: state.position,
          isActive: state.isActive,
          traversals: state.traversals,
        });
        break;
    }
  },
};

// =============================================================================
// @trait_showcase HANDLER
// =============================================================================

/**
 * @trait_showcase — Display favorite traits as trophies
 *
 * Agents showcase their favorite or most impressive traits on their profile
 * or in their room. Like a trophy case for capabilities.
 */
export const traitShowcaseHandler: TraitHandler<TraitShowcaseConfig> = {
  name: 'trait_showcase',

  defaultConfig: {
    max_display: 10,
    layout: 'shelf',
    show_descriptions: true,
    interactive: true,
  },

  onAttach(node, _config, _context) {
    const state: Record<string, unknown> = {
      items: [] as ShowcaseItem[],
    };
    node.__traitShowcaseState = state;
  },

  onDetach(node) {
    delete node.__traitShowcaseState;
  },

  onUpdate(_node, _config, _context, _delta) {},

  onEvent(node, config, context, event) {
    const state = node.__traitShowcaseState;
    if (!state) return;

    const ev = event as Record<string, unknown>;

    switch (event.type) {
      case 'showcase:add': {
        const traitName = ev.traitName as string;
        if (!traitName) break;
        const items = state.items as ShowcaseItem[];
        if (items.some((i) => i.traitName === traitName)) break;
        if (items.length >= config.max_display) break;
        items.push({
          traitName,
          displayName: (ev.displayName as string) || traitName,
          description: (ev.description as string) || '',
          icon: (ev.icon as string) || '',
          addedAt: Date.now(),
        });
        context.emit('showcase:added', { traitName });
        break;
      }
      case 'showcase:remove': {
        const traitName = ev.traitName as string;
        const items = state.items as ShowcaseItem[];
        const idx = items.findIndex((i) => i.traitName === traitName);
        if (idx >= 0) {
          items.splice(idx, 1);
          context.emit('showcase:removed', { traitName });
        }
        break;
      }
      case 'showcase:reorder': {
        const traitName = ev.traitName as string;
        const newIndex = ev.index as number;
        const items = state.items as ShowcaseItem[];
        const idx = items.findIndex((i) => i.traitName === traitName);
        if (idx < 0 || newIndex < 0 || newIndex >= items.length) break;
        const [item] = items.splice(idx, 1);
        items.splice(newIndex, 0, item);
        context.emit('showcase:reordered', { traitName, index: newIndex });
        break;
      }
      case 'showcase:get':
        context.emit('showcase:data', {
          items: [...(state.items as ShowcaseItem[])],
          total: (state.items as ShowcaseItem[]).length,
        });
        break;
    }
  },
};

// =============================================================================
// EXPORTS
// =============================================================================

export const holomeshSocialTraitHandlers = {
  // Phase 1: Core Identity
  agent_profile: agentProfileHandler,
  profile_theme: profileThemeHandler,
  status_mood: statusMoodHandler,
  agent_badge: agentBadgeHandler,
  visitor_counter: visitorCounterHandler,
  // Phase 2: Social Graph
  top8_friends: top8FriendsHandler,
  guestbook: guestbookHandler,
  agent_wall: agentWallHandler,
  // Phase 3: Spatial Rooms
  agent_room: agentRoomHandler,
  background_music: backgroundMusicHandler,
  spatial_comment: spatialCommentHandler,
  room_portal: roomPortalHandler,
  trait_showcase: traitShowcaseHandler,
};

export default holomeshSocialTraitHandlers;
