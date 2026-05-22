export * from './securitysolver';

export const GAME_SECURITY_KEYWORDS = [
  {
    term: 'anti cheat',
    traits: ['authoritative_action_guard', 'ai_watchdog'],
    spatialRole: 'security',
  },
  {
    term: 'server authoritative game',
    traits: ['authoritative_action_guard'],
    spatialRole: 'authority',
  },
  {
    term: 'replay evidence',
    traits: ['authoritative_action_guard', 'replay_evidence'],
    spatialRole: 'evidence',
  },
  {
    term: 'ai watchdog',
    traits: ['ai_watchdog'],
    spatialRole: 'monitor',
  },
] as const;

export const VERSION = '0.1.0';
