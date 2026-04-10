/**
 * timeCapsule.ts — Time Capsule Creator Engine
 *
 * 3D-scanned object arrangement, voice memo attachment, encryption,
 * scheduled unlock dates, and capsule sharing.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type CapsuleStatus = 'draft' | 'sealed' | 'locked' | 'unlocked' | 'expired';
export type ItemType = '3d-scan' | 'photo' | 'video' | 'audio' | 'text' | 'document';

export interface CapsuleItem {
  id: string;
  type: ItemType;
  name: string;
  position: Vec3;
  rotation: Vec3;
  scale: number;
  fileUrl: string;
  dateCaptured: number;
  description: string;
}

export interface VoiceMemo {
  id: string;
  duration: number; // seconds
  linkedItemId?: string;
  transcript?: string;
  recordedDate: number;
}

export interface TimeCapsule {
  id: string;
  title: string;
  creatorName: string;
  createdDate: number;
  unlockDate: number;
  status: CapsuleStatus;
  items: CapsuleItem[];
  memos: VoiceMemo[];
  recipients: string[];
  isEncrypted: boolean;
  message: string;
}

export function capsuleStatus(capsule: TimeCapsule, now: number): CapsuleStatus {
  if (capsule.status === 'draft') return 'draft';
  if (now >= capsule.unlockDate) return 'unlocked';
  return 'locked';
}

export function daysUntilUnlock(capsule: TimeCapsule, now: number): number {
  const ms = capsule.unlockDate - now;
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function yearsUntilUnlock(capsule: TimeCapsule, now: number): number {
  return daysUntilUnlock(capsule, now) / 365.25;
}

export function capsuleItemCount(capsule: TimeCapsule): Record<ItemType, number> {
  const counts: Record<ItemType, number> = {
    '3d-scan': 0,
    photo: 0,
    video: 0,
    audio: 0,
    text: 0,
    document: 0,
  };
  for (const item of capsule.items) counts[item.type]++;
  return counts;
}

export function totalMemoDuration(memos: VoiceMemo[]): number {
  return memos.reduce((sum, m) => sum + m.duration, 0);
}

export function isUnlockable(capsule: TimeCapsule, now: number): boolean {
  return capsule.status !== 'draft' && now >= capsule.unlockDate;
}

export function capsuleSizeEstimate(capsule: TimeCapsule): string {
  const mb = capsule.items.length * 5 + capsule.memos.length * 2;
  if (mb < 100) return `${mb} MB`;
  return `${(mb / 1000).toFixed(1)} GB`;
}

// ═══════════════════════════════════════════════════════════════════
// Blockchain Timestamp Proof
// ═══════════════════════════════════════════════════════════════════

export interface TimestampProof {
  hash: string;
  timestamp: number;
  blockNumber: number;
  verified: boolean;
  capsuleId: string;
}

/**
 * Generates a simulated blockchain timestamp proof for a sealed capsule.
 * In production this would call a real timestamping service (e.g. OpenTimestamps).
 * Here we generate a deterministic hash from capsule data.
 */
export function blockchainTimestampProof(capsule: TimeCapsule): TimestampProof {
  // Deterministic "hash" based on capsule content
  const data = `${capsule.id}:${capsule.title}:${capsule.createdDate}:${capsule.items.length}:${capsule.message}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const chr = data.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32-bit int
  }
  const hexHash = Math.abs(hash).toString(16).padStart(8, '0');
  const fullHash = `0x${hexHash}${hexHash}${hexHash}${hexHash}`; // 32-char hex

  return {
    hash: fullHash,
    timestamp: capsule.createdDate,
    blockNumber: Math.floor(capsule.createdDate / 12000), // ~12s block time
    verified: capsule.status === 'sealed' || capsule.status === 'locked',
    capsuleId: capsule.id,
  };
}

// ═══════════════════════════════════════════════════════════════════
// AR Reveal — Capsule Preview
// ═══════════════════════════════════════════════════════════════════

export interface ARRevealPreview {
  capsuleId: string;
  itemPreviews: { id: string; thumbnailUrl: string; position: Vec3; opacity: number }[];
  totalItems: number;
  isEncrypted: boolean;
  revealAnimation: 'fade-in' | 'particle-burst' | 'unfold';
}

/**
 * Generate an AR reveal preview of capsule contents.
 * Shows ghostly previews of items at their scanning positions.
 */
export function arReveal(capsule: TimeCapsule): ARRevealPreview {
  return {
    capsuleId: capsule.id,
    itemPreviews: capsule.items.map((item) => ({
      id: item.id,
      thumbnailUrl: `${item.fileUrl}.thumb.jpg`,
      position: item.position,
      opacity: capsule.isEncrypted ? 0.2 : 0.6,
    })),
    totalItems: capsule.items.length,
    isEncrypted: capsule.isEncrypted,
    revealAnimation: capsule.isEncrypted ? 'particle-burst' : 'fade-in',
  };
}
