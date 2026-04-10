/**
 * TypoDetector - Utility for detecting typos and suggesting corrections
 *
 * Uses Levenshtein distance to find the closest match from a set of valid options.
 */

export class TypoDetector {
  /**
   * Find the closest match to the input string from a list of candidates
   * @param input - The potentially misspelled string
   * @param candidates - List of valid options
   * @param maxDistance - Maximum edit distance to consider (default: 2)
   * @returns The closest match, or null if no match within threshold
   */
  static findClosestMatch(
    input: string,
    candidates: string[],
    maxDistance: number = 2
  ): string | null {
    let closest: string | null = null;
    let minDistance = Infinity;

    const inputLower = input.toLowerCase();

    for (const candidate of candidates) {
      const distance = this.levenshteinDistance(inputLower, candidate.toLowerCase());
      if (distance <= maxDistance && distance < minDistance) {
        minDistance = distance;
        closest = candidate;
      }
    }

    return closest;
  }

  /**
   * Find all matches within the distance threshold
   * @param input - The potentially misspelled string
   * @param candidates - List of valid options
   * @param maxDistance - Maximum edit distance to consider (default: 2)
   * @returns Array of matches sorted by distance
   */
  static findAllMatches(
    input: string,
    candidates: string[],
    maxDistance: number = 2
  ): Array<{ match: string; distance: number }> {
    const matches: Array<{ match: string; distance: number }> = [];
    const inputLower = input.toLowerCase();

    for (const candidate of candidates) {
      const distance = this.levenshteinDistance(inputLower, candidate.toLowerCase());
      if (distance <= maxDistance) {
        matches.push({ match: candidate, distance });
      }
    }

    return matches.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Calculate Levenshtein distance between two strings
   * Uses dynamic programming for efficiency
   */
  static levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    // Create a 2D array for dynamic programming
    const matrix: number[][] = [];

    // Initialize first column
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    // Initialize first row
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Check if a string is likely a typo of another (case-insensitive)
   */
  static isLikelyTypo(input: string, target: string): boolean {
    return this.levenshteinDistance(input.toLowerCase(), target.toLowerCase()) <= 2;
  }
}
