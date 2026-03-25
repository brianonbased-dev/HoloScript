/**
 * Moltbook verification challenge solver.
 *
 * Moltbook requires solving a scrambled math word problem for every post/comment.
 * The challenge text uses alternating caps, scattered symbols, and doubled letters.
 * Example: "lO^bSt-Er S[wImS aT/ tW]eNn-Tyy mE^tE[rS" → "lobster swims at twenty meters"
 */

// Word-number mapping
const WORD_TO_NUM: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4,
  five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
};

// Operation keyword patterns
const ADD_WORDS = ['add', 'adds', 'plus', 'gain', 'gains', 'increase', 'increases', 'speeds up', 'speed up', 'faster'];
const SUB_WORDS = ['subtract', 'subtracts', 'minus', 'lose', 'loses', 'slow', 'slows', 'decrease', 'decreases', 'less', 'slower'];
const MUL_WORDS = ['times', 'multiply', 'multiplied', 'double', 'triple', 'quadruple'];
const DIV_WORDS = ['divide', 'divided', 'split', 'half'];

/**
 * Normalize the scrambled challenge text into readable lowercase words.
 */
function normalizeText(text: string): string {
  return text
    // Strip all non-alpha, non-digit, non-space, non-period characters
    .replace(/[^a-zA-Z0-9\s.]/g, '')
    // Collapse runs of the same letter (e.g., "NoOtOnS" → "NotonS")
    .replace(/([a-zA-Z])\1+/gi, (_match, letter) => letter)
    // Lowercase
    .toLowerCase()
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract all numbers (both digit strings and word-numbers) from normalized text.
 */
function extractNumbers(text: string): number[] {
  const numbers: number[] = [];
  const words = text.split(' ');

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    // Check for digit strings (including decimals)
    const digitMatch = word.match(/^(\d+(?:\.\d+)?)$/);
    if (digitMatch) {
      numbers.push(parseFloat(digitMatch[1]));
      continue;
    }

    // Check for word-numbers
    if (WORD_TO_NUM[word] !== undefined) {
      const val = WORD_TO_NUM[word];

      // Handle compound: "twenty three" → 23
      if (val >= 20 && val <= 90 && i + 1 < words.length) {
        const nextVal = WORD_TO_NUM[words[i + 1]];
        if (nextVal !== undefined && nextVal >= 1 && nextVal <= 9) {
          numbers.push(val + nextVal);
          i++; // skip next word
          continue;
        }
      }

      // Handle "X hundred Y"
      if (i + 1 < words.length && words[i + 1] === 'hundred') {
        let compound = val * 100;
        i++; // skip "hundred"
        // Check for additional tens/ones
        if (i + 1 < words.length && WORD_TO_NUM[words[i + 1]] !== undefined) {
          const nextVal = WORD_TO_NUM[words[i + 1]];
          if (nextVal < 100) {
            compound += nextVal;
            i++;
            // Check for compound tens+ones after hundred
            if (nextVal >= 20 && i + 1 < words.length) {
              const onesVal = WORD_TO_NUM[words[i + 1]];
              if (onesVal !== undefined && onesVal >= 1 && onesVal <= 9) {
                compound += onesVal;
                i++;
              }
            }
          }
        }
        numbers.push(compound);
        continue;
      }

      numbers.push(val);
    }
  }

  return numbers;
}

/**
 * Detect the math operation from the normalized text.
 */
function extractOperation(text: string): '+' | '-' | '*' | '/' | null {
  // Check multiplication first (most specific)
  for (const word of MUL_WORDS) {
    if (text.includes(word)) return '*';
  }
  // Division
  for (const word of DIV_WORDS) {
    if (text.includes(word)) return '/';
  }
  // Addition
  for (const word of ADD_WORDS) {
    if (text.includes(word)) return '+';
  }
  // Subtraction
  for (const word of SUB_WORDS) {
    if (text.includes(word)) return '-';
  }

  // Fallback: look for "what is total" / "each other" patterns (implies multiplication)
  if (text.includes('total') && text.includes('each other')) return '*';
  if (text.includes('total force') || text.includes('total power')) return '*';

  return null;
}

/**
 * Solve a Moltbook verification challenge.
 *
 * @param challengeText The scrambled challenge text from the API
 * @returns The answer as a string with 2 decimal places, or null if unsolvable
 */
export function solveChallenge(challengeText: string): string | null {
  const normalized = normalizeText(challengeText);
  const numbers = extractNumbers(normalized);
  const operation = extractOperation(normalized);

  if (numbers.length < 2) {
    console.warn('[moltbook-solver] Could not extract 2+ numbers from:', normalized);
    return null;
  }

  if (!operation) {
    console.warn('[moltbook-solver] Could not detect operation from:', normalized);
    // Default: if we have exactly 2 numbers and text mentions "what is" or "total",
    // try multiplication as the most common challenge pattern
    if (numbers.length === 2 && (normalized.includes('what') || normalized.includes('total'))) {
      const result = numbers[0] * numbers[1];
      return result.toFixed(2);
    }
    return null;
  }

  // Apply operation to the first two numbers
  const [a, b] = numbers;
  let result: number;

  switch (operation) {
    case '+': result = a + b; break;
    case '-': result = a - b; break;
    case '*': result = a * b; break;
    case '/':
      if (b === 0) return null;
      result = a / b;
      break;
    default: return null;
  }

  return result.toFixed(2);
}
