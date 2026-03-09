/**
 * UserPreferences - LWW-Register per field
 *
 * Stores user/agent preferences with per-field LWW conflict resolution.
 * Each preference field is an independent LWW-Register.
 *
 * Target: <2KB compressed
 * @version 1.0.0
 */

/**
 * Spatial interaction preferences
 */
export interface SpatialPreferences {
  /** Preferred movement speed (m/s) */
  movementSpeed?: number;

  /** Personal space radius (meters) */
  personalSpaceRadius?: number;

  /** Preferred interaction distance (meters) */
  interactionDistance?: number;

  /** Hand dominance for gestures */
  handDominance?: 'left' | 'right' | 'ambidextrous';
}

/**
 * Communication preferences
 */
export interface CommunicationPreferences {
  /** Preferred communication style */
  style?: 'formal' | 'casual' | 'technical' | 'concise';

  /** Preferred language (ISO 639-1) */
  language?: string;

  /** Voice input enabled */
  voiceInput?: boolean;

  /** Text-to-speech enabled */
  textToSpeech?: boolean;

  /** Notification level */
  notifications?: 'all' | 'important' | 'critical' | 'none';
}

/**
 * Visual preferences
 */
export interface VisualPreferences {
  /** Theme preference */
  theme?: 'light' | 'dark' | 'auto' | 'high-contrast';

  /** UI scale factor */
  uiScale?: number;

  /** Color vision mode */
  colorVisionMode?: 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';

  /** Reduced motion preference */
  reducedMotion?: boolean;

  /** Show spatial anchors */
  showAnchors?: boolean;
}

/**
 * Privacy preferences
 */
export interface PrivacyPreferences {
  /** Share location with other agents */
  shareLocation?: boolean;

  /** Share task state with team */
  shareTaskState?: boolean;

  /** Allow agent collaboration */
  allowCollaboration?: boolean;

  /** Visibility mode */
  visibilityMode?: 'public' | 'friends' | 'team' | 'private';
}

/**
 * LWW value wrapper with metadata
 */
export interface LWWValue<T> {
  /** The actual value */
  value: T;

  /** Timestamp when set */
  timestamp: number;

  /** Agent DID that set this value */
  actorDid: string;

  /** Operation ID */
  operationId: string;
}

/**
 * UserPreferences CRDT (Map of LWW-Registers)
 *
 * Each preference field is an independent LWW-Register:
 * - Concurrent updates resolved by timestamp
 * - Last write wins per field
 * - Fields are independent (no cross-field conflicts)
 */
export interface UserPreferences {
  /** CRDT type identifier */
  crdtType: 'lww-map';

  /** Unique CRDT instance ID */
  crdtId: string;

  /** Agent/user DID */
  agentDid: string;

  /** Spatial interaction preferences */
  spatial?: SpatialPreferences;

  /** Communication preferences */
  communication?: CommunicationPreferences;

  /** Visual preferences */
  visual?: VisualPreferences;

  /** Privacy preferences */
  privacy?: PrivacyPreferences;

  /** LWW metadata for each field (field path -> LWW metadata) */
  lwwMetadata: Record<
    string,
    {
      timestamp: number;
      actorDid: string;
      operationId: string;
    }
  >;

  /** Last update timestamp */
  lastUpdated: number;
}

/**
 * UserPreferences metadata
 */
export interface UserPreferencesMetadata {
  /** Total number of set preferences */
  setFieldCount: number;

  /** Preference categories with values */
  categories: string[];

  /** Last updated field */
  lastUpdatedField?: string;

  /** Most frequent updater DID */
  primaryActor?: string;
}
