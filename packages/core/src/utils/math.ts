/**
 * Mathematical utility functions for HoloScript compilation and benchmarking
 */

/**
 * Calculate the average of an array of numbers
 * @param numbers - Array of numbers to average
 * @returns The arithmetic mean, or 0 if array is empty
 */
export function calculateAverage(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

/**
 * Calculate success rate as a percentage
 * @param successCount - Number of successful operations
 * @param totalCount - Total number of operations
 * @returns Success rate as percentage (0-100)
 */
export function calculateSuccessRate(successCount: number, totalCount: number): number {
  return totalCount > 0 ? (successCount / totalCount) * 100 : 0;
}

/**
 * Calculate standard deviation of an array of numbers
 * @param numbers - Array of numbers
 * @returns Standard deviation, or 0 if array is empty or has one element
 */
export function calculateStandardDeviation(numbers: number[]): number {
  if (numbers.length <= 1) return 0;
  const avg = calculateAverage(numbers);
  const squaredDifferences = numbers.map(n => Math.pow(n - avg, 2));
  const avgSquaredDiff = calculateAverage(squaredDifferences);
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Find the median value in an array of numbers
 * @param numbers - Array of numbers (will be sorted internally)
 * @returns The median value, or 0 if array is empty
 */
export function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 
    ? (sorted[mid - 1] + sorted[mid]) / 2 
    : sorted[mid];
}