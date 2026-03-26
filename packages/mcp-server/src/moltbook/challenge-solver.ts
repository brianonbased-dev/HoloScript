/**
 * Moltbook verification challenge solver.
 *
 * Moltbook requires solving a scrambled math word problem for every post/comment.
 * The challenge text uses alternating caps, scattered symbols, and doubled letters.
 * Example: "lO^bSt-Er S[wImS aT/ tW]eNn-Tyy mE^tE[rS" → "lobster swims at twenty meters"
 */

// Word-number mapping
const WORD_TO_NUM: Record<string, number> = {
  zero: 0, one: 1, two: 2, thre: 3, four: 4,
  five: 5, fyive: 5, fift: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, twelv: 12, thirten: 13,
  fourten: 14, fiften: 15, sixten: 16, seventen: 17,
  eighten: 18, nineten: 19, tweny: 20, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000
};

export function solveChallenge(challengeText: string): string | null {
  // 1. Strip all non-alphanumeric except math operators + - * / .
  let s = challengeText.toLowerCase().replace(/[^a-z0-9.+\-*/]/g, '');
  
  // 2. Collapse runs of duplicate letters (e.g., "tWwEe" -> "twe")
  s = s.replace(/([a-z])\1+/g, '$1');

  // Match numbers (longest first to prevent "eighten" matching "eight")
  const numbersRegex = /(seventen|thirten|fourten|eighten|nineten|fiften|sixten|twelve|eleven|twenty|thirty|seventy|eighty|ninety|hundred|thousand|tweny|twelv|forty|fifty|sixty|fyive|thre|four|five|fift|nine|eight|seven|zero|one|two|six|ten|\d+(?:\.\d+)?)/g;
  
  const numTokens: string[] = [];
  let match;
  while ((match = numbersRegex.exec(s)) !== null) {
    numTokens.push(match[1]);
  }

  const rawValues: number[] = [];
  for (const t of numTokens) {
    if (/\d/.test(t)) {
      rawValues.push(parseFloat(t));
    } else {
      rawValues.push(WORD_TO_NUM[t]);
    }
  }

  // Compound parsing (e.g. 20, 5 -> 25)
  const numbers: number[] = [];
  for (let i = 0; i < rawValues.length; i++) {
    const val = rawValues[i];
    if (val >= 20 && val <= 90 && i + 1 < rawValues.length && rawValues[i+1] < 10) {
      numbers.push(val + rawValues[i+1]);
      i++;
    } else if (val === 100 && numbers.length > 0) {
      const prev = numbers.pop()!;
      let compound = prev * 100;
      if (i + 1 < rawValues.length && rawValues[i+1] < 100) {
        compound += rawValues[i+1];
        i++;
        if (i + 1 < rawValues.length && rawValues[i] >= 20 && rawValues[i+1] < 10) {
          compound += rawValues[i+1];
          i++;
        }
      }
      numbers.push(compound);
    } else {
      numbers.push(val);
    }
  }

  if (numbers.length < 2) {
    console.warn('[moltbook-solver] Could not extract 2+ numbers from:', s);
    return null;
  }

  // 3. Find operation
  let operation: string | null = null;
  if (s.match(/times|multiply|double|triple|\*/)) operation = '*';
  else if (s.match(/divide|split|half|\//)) operation = '/';
  else if (s.match(/subtract|minus|lose|los|les|slow|\-/)) operation = '-';
  else if (s.match(/ads|plus|gain|increas|faster|\+/)) operation = '+';
  else if (s.match(/total/)) operation = '+'; // Force computation (e.g. "what is total force")

  const [a, b] = numbers;
  let result: number;

  switch (operation) {
    case '+': result = a + b; break;
    case '-': result = a - b; break;
    case '*': result = a * b; break;
    case '/': if (b === 0) return null; result = a / b; break;
    default: result = a + b; // fallback to addition
  }

  return result.toFixed(2);
}
