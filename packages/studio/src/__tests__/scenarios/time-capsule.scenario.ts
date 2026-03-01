/**
 * time-capsule.scenario.ts — LIVING-SPEC: Time Capsule Creator
 *
 * Persona: Mika — creator who arranges 3D-scanned objects,
 * attaches voice memos, and seals capsules for future opening.
 */

import { describe, it, expect } from 'vitest';
import {
  capsuleStatus, daysUntilUnlock, yearsUntilUnlock,
  capsuleItemCount, totalMemoDuration, isUnlockable, capsuleSizeEstimate,
  blockchainTimestampProof, arReveal,
  type TimeCapsule,
} from '@/lib/timeCapsule';

describe('Scenario: Time Capsule — Status & Unlock', () => {
  const now = Date.now();
  const futureDate = now + 365 * 24 * 60 * 60 * 1000; // 1 year from now
  const pastDate = now - 1000;

  const capsule: TimeCapsule = {
    id: 'tc-1', title: 'Class of 2025', creatorName: 'Mika',
    createdDate: now, unlockDate: futureDate, status: 'sealed',
    items: [
      { id: 'i1', type: '3d-scan', name: 'Trophy', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1, fileUrl: '', dateCaptured: now, description: 'Championship trophy' },
      { id: 'i2', type: 'photo', name: 'Group', position: { x: 1, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1, fileUrl: '', dateCaptured: now, description: 'Group photo' },
      { id: 'i3', type: 'photo', name: 'Campus', position: { x: 2, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1, fileUrl: '', dateCaptured: now, description: 'Campus view' },
    ],
    memos: [
      { id: 'm1', duration: 120, linkedItemId: 'i1', recordedDate: now },
      { id: 'm2', duration: 60, recordedDate: now },
    ],
    recipients: ['class@school.edu'], isEncrypted: true, message: 'Open in 2026!',
  };

  it('capsuleStatus() returns locked for future date', () => {
    expect(capsuleStatus(capsule, now)).toBe('locked');
  });

  it('capsuleStatus() returns unlocked after unlock date', () => {
    expect(capsuleStatus(capsule, futureDate + 1000)).toBe('unlocked');
  });

  it('capsuleStatus() returns draft for draft capsules', () => {
    const draft = { ...capsule, status: 'draft' as const };
    expect(capsuleStatus(draft, now)).toBe('draft');
  });

  it('daysUntilUnlock() calculates remaining days', () => {
    const days = daysUntilUnlock(capsule, now);
    expect(days).toBeGreaterThan(364);
    expect(days).toBeLessThanOrEqual(366);
  });

  it('daysUntilUnlock() returns 0 after unlock date', () => {
    expect(daysUntilUnlock(capsule, futureDate + 1000)).toBe(0);
  });

  it('yearsUntilUnlock() ≈ 1.0 for 1-year capsule', () => {
    expect(yearsUntilUnlock(capsule, now)).toBeCloseTo(1.0, 0);
  });

  it('isUnlockable() returns false before unlock date', () => {
    expect(isUnlockable(capsule, now)).toBe(false);
  });

  it('isUnlockable() returns true after unlock date', () => {
    expect(isUnlockable(capsule, futureDate + 1000)).toBe(true);
  });
});

describe('Scenario: Time Capsule — Items & Memos', () => {
  const now = Date.now();
  const capsule: TimeCapsule = {
    id: 'tc-2', title: 'Family', creatorName: 'Jo', createdDate: now, unlockDate: now + 1e10, status: 'sealed',
    items: [
      { id: 'i1', type: '3d-scan', name: 'Toy', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1, fileUrl: '', dateCaptured: now, description: '' },
      { id: 'i2', type: 'video', name: 'Message', position: { x: 1, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1, fileUrl: '', dateCaptured: now, description: '' },
    ],
    memos: [{ id: 'm1', duration: 90, recordedDate: now }, { id: 'm2', duration: 45, recordedDate: now }],
    recipients: [], isEncrypted: false, message: '',
  };

  it('capsuleItemCount() breaks down by type', () => {
    const counts = capsuleItemCount(capsule);
    expect(counts['3d-scan']).toBe(1);
    expect(counts.video).toBe(1);
    expect(counts.photo).toBe(0);
  });

  it('totalMemoDuration() sums all memo lengths', () => {
    expect(totalMemoDuration(capsule.memos)).toBe(135);
  });

  it('capsuleSizeEstimate() returns human-readable size', () => {
    expect(capsuleSizeEstimate(capsule)).toMatch(/MB|GB/);
  });

  it('AR reveal — point phone at location to preview capsule contents', () => {
    const reveal = arReveal(capsule);
    expect(reveal.capsuleId).toBe('tc-2');
    expect(reveal.totalItems).toBe(2);
    expect(reveal.itemPreviews).toHaveLength(2);
    // Non-encrypted capsule uses fade-in
    expect(reveal.revealAnimation).toBe('fade-in');
    expect(reveal.itemPreviews[0].opacity).toBe(0.6);
    // Encrypted capsule uses particle-burst
    const encrypted = arReveal({ ...capsule, isEncrypted: true });
    expect(encrypted.revealAnimation).toBe('particle-burst');
    expect(encrypted.itemPreviews[0].opacity).toBe(0.2);
  });

  it('blockchainTimestampProof() — generates immutable seal proof', () => {
    const now = Date.now();
    const capsule: TimeCapsule = {
      id: 'tc-proof', title: 'Proof Test', creatorName: 'Test',
      createdDate: now, unlockDate: now + 1e10, status: 'sealed',
      items: [{ id: 'i1', type: 'photo', name: 'Photo', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1, fileUrl: '', dateCaptured: now, description: '' }],
      memos: [], recipients: [], isEncrypted: false, message: 'Hello future!',
    };
    const proof = blockchainTimestampProof(capsule);
    expect(proof.hash).toMatch(/^0x[0-9a-f]+$/);
    expect(proof.verified).toBe(true);
    expect(proof.capsuleId).toBe('tc-proof');
    expect(proof.blockNumber).toBeGreaterThan(0);
  });
});
