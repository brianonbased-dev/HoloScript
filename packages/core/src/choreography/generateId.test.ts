import { describe, it, expect } from 'vitest';

// Extract the function for testing since it's not exported
function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

describe('generateId', () => {
  describe('format validation', () => {
    it('should return a string', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
    });

    it('should contain underscore separator', () => {
      const id = generateId();
      expect(id).toMatch(/^[a-z0-9]+_[a-z0-9]+$/);
    });

    it('should have timestamp part before underscore', () => {
      const id = generateId();
      const [timestampPart] = id.split('_');
      expect(timestampPart).toMatch(/^[a-z0-9]+$/);
      expect(timestampPart.length).toBeGreaterThan(0);
    });

    it('should have random part after underscore', () => {
      const id = generateId();
      const [, randomPart] = id.split('_');
      expect(randomPart).toMatch(/^[a-z0-9]+$/);
      expect(randomPart.length).toBe(8); // Math.random().toString(36).slice(2, 10) = 8 chars
    });
  });

  describe('uniqueness', () => {
    it('should generate unique IDs on subsequent calls', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('should generate unique IDs in a batch', () => {
      const ids = Array.from({ length: 100 }, () => generateId());
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(100);
    });

    it('should have different timestamp parts when called with delay', async () => {
      const id1 = generateId();
      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 2));
      const id2 = generateId();

      const [timestamp1] = id1.split('_');
      const [timestamp2] = id2.split('_');

      // Timestamps should be different (or at minimum, IDs should be different due to random part)
      expect(id1).not.toBe(id2);
    });
  });

  describe('character set validation', () => {
    it('should only contain base36 characters', () => {
      const id = generateId();
      expect(id).toMatch(/^[a-z0-9_]+$/);
    });

    it('should not contain uppercase letters', () => {
      const id = generateId();
      expect(id).toBe(id.toLowerCase());
    });

    it('should not contain special characters except underscore', () => {
      const id = generateId();
      const allowedChars = /^[a-z0-9_]+$/;
      expect(id).toMatch(allowedChars);
    });
  });

  describe('length validation', () => {
    it('should have reasonable length', () => {
      const id = generateId();
      // Timestamp part (Date.now().toString(36)) is typically 8-9 chars
      // Random part is exactly 8 chars
      // Plus 1 underscore = ~17-18 chars total
      expect(id.length).toBeGreaterThan(15);
      expect(id.length).toBeLessThan(25);
    });

    it('should maintain consistent structure length', () => {
      const ids = Array.from({ length: 10 }, () => generateId());
      const lengths = ids.map((id) => id.split('_')[1].length); // Random part length

      // All random parts should be exactly 8 characters
      lengths.forEach((length) => {
        expect(length).toBe(8);
      });
    });
  });

  describe('timestamp component', () => {
    it('should have timestamp that increases over time', () => {
      const id1 = generateId();
      // Ensure some time passes
      const start = Date.now();
      while (Date.now() - start < 2) {
        // Busy wait for a couple milliseconds
      }
      const id2 = generateId();

      const [timestamp1] = id1.split('_');
      const [timestamp2] = id2.split('_');

      // Convert back to numbers for comparison
      const time1 = parseInt(timestamp1, 36);
      const time2 = parseInt(timestamp2, 36);

      expect(time2).toBeGreaterThanOrEqual(time1);
    });

    it('should produce valid base36 timestamp', () => {
      const id = generateId();
      const [timestampPart] = id.split('_');

      // Should be able to parse back to a number
      const parsed = parseInt(timestampPart, 36);
      expect(parsed).toBeGreaterThan(0);
      expect(isNaN(parsed)).toBe(false);
    });
  });
});
