/**
 * HololandTypes — Type definitions for Hololand Platform integration
 *
 * Defines types for:
 * - VRR (Virtual Reality Reality) real-time synchronization
 * - AR entry points and portals
 * - AgentKit AI wallet integration
 * - Zora Protocol NFT marketplace
 * - StoryWeaver AI narrative generation
 * - Business quest system
 *
 * @version 1.0.0
 */

// =============================================================================
// VRR (Virtual Reality Reality) TYPES
// =============================================================================

export interface WeatherData {
  temperature: number; // Celsius
  condition: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'foggy' | 'stormy';
  humidity: number; // percentage
  windSpeed: number; // km/h
  windDirection: number; // degrees
  precipitation: number; // mm
  visibility: number; // km
  pressure: number; // hPa
  timestamp: number;
}

export interface EventData {
  id: string;
  name: string;
  description: string;
  startTime: number;
  endTime: number;
  location: string;
  attendeeCount: number;
  category: string;
  tags: string[];
}

export interface InventoryData {
  items: InventoryItem[];
  lastUpdated: number;
  businessId: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  category: string;
  inStock: boolean;
  imageUrl?: string;
}

export interface VRRSyncConfig {
  enabled: boolean;
  updateInterval: number; // milliseconds
  sources: {
    weather?: boolean;
    events?: boolean;
    inventory?: boolean;
  };
  apiKeys?: {
    weatherGov?: string;
    eventbrite?: string;
    square?: string;
  };
}

// =============================================================================
// AR ENTRY POINT TYPES
// =============================================================================

export interface ARPortalInfo {
  id: string;
  triggerType: 'qr' | 'image' | 'location';
  triggerData: string; // QR data, image URL, or lat/lng
  destination: string; // VRR twin ID or VR world ID
  requiresPayment: boolean;
  price?: number; // x402 price in wei
  title: string;
  description: string;
  previewImageUrl?: string;
}

export interface QRScanData {
  data: string;
  format: string;
  timestamp: number;
  portalId?: string;
}

export interface LayerTransition {
  from: 'ar' | 'vrr' | 'vr';
  to: 'ar' | 'vrr' | 'vr';
  timestamp: number;
  userId: string;
  portalId?: string;
  paymentTxHash?: string;
}

export interface ARPortal {
  id: string;
  activate(): Promise<void>;
  deactivate(): void;
  onScan(callback: (data: QRScanData) => void): void;
}

// =============================================================================
// AGENTKIT AI WALLET TYPES
// =============================================================================

export interface AgentWallet {
  id: string;
  address: string;
  network: 'base' | 'ethereum' | 'base-sepolia';
  balance: string; // wei
  nonce: number;
  createdAt: number;
}

export interface NFTMetadata {
  name: string;
  description: string;
  image: string; // IPFS URL or data URI
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
  external_url?: string;
  animation_url?: string;
}

export interface PaymentRequest {
  endpoint: string;
  price: number; // wei
  currency: 'ETH' | 'USDC';
  metadata?: Record<string, unknown>;
}

export interface PaymentReceipt {
  txHash: string;
  from: string;
  to: string;
  amount: string; // wei
  currency: string;
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface RoyaltyEvent {
  tokenId: string;
  from: string;
  to: string;
  amount: string; // wei
  percentage: number;
  timestamp: number;
}

// =============================================================================
// ZORA PROTOCOL TYPES
// =============================================================================

export interface ZoraNFTResult {
  tokenId: string;
  contractAddress: string;
  network: string;
  txHash: string;
  ipfsUrl: string;
  marketplaceUrl: string;
  royaltyPercentage: number;
}

export interface ZoraRoyaltyConfig {
  percentage: number; // 10-15% typical
  recipient: string; // wallet address
  permanent: boolean; // enforce on-chain
}

// =============================================================================
// STORYWEAVER AI TYPES
// =============================================================================

export interface AIGeneratedNarrative {
  text: string;
  theme: string;
  genre: string;
  wordCount: number;
  generatedAt: number;
  provider: 'openai' | 'anthropic' | 'gemini' | (string & {});
  model: string;
  prompt: string;
}

export interface AIGeneratedQuest {
  id: string;
  title: string;
  description: string;
  narrative: string;
  objectives: QuestObjective[];
  rewards: QuestReward[];
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedDuration: number; // minutes
  theme: string;
}

export interface StoryWeaverConfig {
  provider: 'openai' | 'anthropic' | 'gemini' | (string & {});
  model?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

// =============================================================================
// BUSINESS QUEST TYPES
// =============================================================================

export interface QuestDefinition {
  id: string;
  businessId: string;
  title: string;
  description: string;
  narrative?: string;
  objectives: QuestObjective[];
  rewards: QuestReward[];
  prerequisites?: string[]; // quest IDs
  layer: 'ar' | 'vrr' | 'vr';
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedDuration: number; // minutes
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface QuestObjective {
  id: string;
  type: 'location' | 'scan' | 'collect' | 'interact' | 'purchase' | 'social';
  description: string;
  targetValue: number;
  currentValue?: number;
  required: boolean;
  metadata?: Record<string, unknown>;
}

export interface QuestProgress {
  questId: string;
  playerId: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'failed';
  objectiveProgress: Record<string, number>; // objectiveId -> progress
  startedAt?: number;
  completedAt?: number;
  lastUpdatedAt: number;
}

export interface QuestCompletion {
  questId: string;
  playerId: string;
  completedAt: number;
  rewards: QuestReward[];
  achievements?: string[];
}

export interface QuestReward {
  type: 'xp' | 'currency' | 'item' | 'coupon' | 'discount' | 'nft' | 'unlock';
  value: number | string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface QuestConfig {
  businessId: string;
  title: string;
  description: string;
  objectives: Omit<QuestObjective, 'id'>[];
  rewards: QuestReward[];
  layer: 'ar' | 'vrr' | 'vr';
  difficulty: 'easy' | 'medium' | 'hard';
  aiGenerate?: boolean; // use StoryWeaver AI
}

// =============================================================================
// EVENT PAYLOAD TYPES
// =============================================================================

export interface VRREventPayloads {
  'vrr:weather_updated': WeatherData;
  'vrr:events_synced': { events: EventData[]; count: number };
  'vrr:inventory_updated': InventoryData;
}

export interface AREventPayloads {
  'ar:portal_opened': ARPortalInfo;
  'ar:layer_transition': LayerTransition;
  'ar:qr_scanned': QRScanData;
}

export interface AgentKitEventPayloads {
  'agentkit:wallet_created': AgentWallet;
  'agentkit:nft_minted': { tokenId: string; metadata: NFTMetadata };
  'agentkit:royalty_received': RoyaltyEvent;
  'agentkit:payment_sent': PaymentReceipt;
}

export interface StoryWeaverEventPayloads {
  'storyweaver:narrative_generated': AIGeneratedNarrative;
  'storyweaver:quest_created': AIGeneratedQuest;
}

export interface QuestEventPayloads {
  'quest:created': QuestDefinition;
  'quest:progress_updated': QuestProgress;
  'quest:completed': QuestCompletion;
  'quest:reward_claimed': QuestReward;
}

// Union of all Hololand event payloads
export type HololandEventPayloads = VRREventPayloads &
  AREventPayloads &
  AgentKitEventPayloads &
  StoryWeaverEventPayloads &
  QuestEventPayloads;
