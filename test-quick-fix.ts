// Quick test to validate the calculateAverage function works
import { calculateAverage } from './packages/core/src/utils/math';

console.log('Testing calculateAverage function...');

// Test basic functionality
const test1 = calculateAverage([1, 2, 3, 4, 5]);
console.log(`calculateAverage([1, 2, 3, 4, 5]) = ${test1} (expected: 3)`);

const test2 = calculateAverage([]);
console.log(`calculateAverage([]) = ${test2} (expected: 0)`);

const test3 = calculateAverage([10, 20, 30]);
console.log(`calculateAverage([10, 20, 30]) = ${test3} (expected: 20)`);

console.log('All tests completed!');