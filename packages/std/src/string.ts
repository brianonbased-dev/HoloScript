/**
 * @holoscript/std - String Module
 *
 * String manipulation utilities for HoloScript Plus programs.
 */

/**
 * Check if a string is empty or only whitespace
 */
export function isBlank(s: string): boolean {
  return s.trim().length === 0;
}

/**
 * Check if a string is not empty and not only whitespace
 */
export function isNotBlank(s: string): boolean {
  return s.trim().length > 0;
}

/**
 * Capitalize the first letter of a string
 */
export function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s[0].toUpperCase() + s.slice(1);
}

/**
 * Capitalize the first letter of each word
 */
export function titleCase(s: string): string {
  return s.split(/\s+/).map(capitalize).join(' ');
}

/**
 * Convert to camelCase
 */
export function camelCase(s: string): string {
  return s
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

/**
 * Convert to PascalCase
 */
export function pascalCase(s: string): string {
  const camel = camelCase(s);
  return camel.length > 0 ? camel[0].toUpperCase() + camel.slice(1) : camel;
}

/**
 * Convert to snake_case
 */
export function snakeCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

/**
 * Convert to kebab-case
 */
export function kebabCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}

/**
 * Convert to SCREAMING_SNAKE_CASE
 */
export function constantCase(s: string): string {
  return snakeCase(s).toUpperCase();
}

/**
 * Pad a string on the left to reach target length
 */
export function padLeft(s: string, length: number, char = ' '): string {
  return s.padStart(length, char);
}

/**
 * Pad a string on the right to reach target length
 */
export function padRight(s: string, length: number, char = ' '): string {
  return s.padEnd(length, char);
}

/**
 * Pad a string on both sides to center it
 */
export function center(s: string, length: number, char = ' '): string {
  if (s.length >= length) return s;
  const totalPadding = length - s.length;
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return char.repeat(leftPadding) + s + char.repeat(rightPadding);
}

/**
 * Truncate a string to max length, adding ellipsis if needed
 */
export function truncate(s: string, maxLength: number, ellipsis = '...'): string {
  if (s.length <= maxLength) return s;
  return s.slice(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Truncate a string in the middle
 */
export function truncateMiddle(s: string, maxLength: number, ellipsis = '...'): string {
  if (s.length <= maxLength) return s;
  const availableLength = maxLength - ellipsis.length;
    const leftLength = Math.floor(availableLength / 2);
    const rightLength = Math.ceil(availableLength / 2);
  return s.slice(0, leftLength) + ellipsis + s.slice(-rightLength);
}

/**
 * Repeat a string n times
 */
export function repeat(s: string, count: number): string {
  return s.repeat(count);
}

/**
 * Reverse a string
 */
export function reverse(s: string): string {
  return [...s].reverse().join('');
}

/**
 * Count occurrences of a substring
 */
export function count(s: string, substring: string): number {
  if (substring.length === 0) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = s.indexOf(substring, pos)) !== -1) {
    count++;
     pos += 1;
  }
  return count;
}

/**
 * Check if string contains a substring (case-insensitive)
 */
export function containsIgnoreCase(s: string, substring: string): boolean {
  return s.toLowerCase().includes(substring.toLowerCase());
}

/**
 * Check if string starts with prefix (case-insensitive)
 */
export function startsWithIgnoreCase(s: string, prefix: string): boolean {
  return s.toLowerCase().startsWith(prefix.toLowerCase());
}

/**
 * Check if string ends with suffix (case-insensitive)
 */
export function endsWithIgnoreCase(s: string, suffix: string): boolean {
  return s.toLowerCase().endsWith(suffix.toLowerCase());
}

/**
 * Remove all whitespace from a string
 */
export function removeWhitespace(s: string): string {
  return s.replace(/\s+/g, '');
}

/**
 * Collapse multiple spaces into single space
 */
export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Remove a prefix if present
 */
export function removePrefix(s: string, prefix: string): string {
  return s.startsWith(prefix) ? s.slice(prefix.length) : s;
}

/**
 * Remove a suffix if present
 */
export function removeSuffix(s: string, suffix: string): string {
  return s.endsWith(suffix) ? s.slice(0, -suffix.length) : s;
}

/**
 * Wrap a string with prefix and suffix
 */
export function wrap(s: string, wrapper: string): string;
export function wrap(s: string, prefix: string, suffix: string): string;
export function wrap(s: string, prefixOrWrapper: string, suffix?: string): string {
  if (suffix === undefined) {
    return prefixOrWrapper + s + prefixOrWrapper;
  }
  return prefixOrWrapper + s + suffix;
}

/**
 * Unwrap a string by removing matching prefix and suffix
 */
export function unwrap(s: string, wrapper: string): string;
export function unwrap(s: string, prefix: string, suffix: string): string;
export function unwrap(s: string, prefixOrWrapper: string, suffix?: string): string {
  const prefix = prefixOrWrapper;
  const actualSuffix = suffix ?? prefixOrWrapper;
  if (s.startsWith(prefix) && s.endsWith(actualSuffix)) {
    return s.slice(prefix.length, -actualSuffix.length || undefined);
  }
  return s;
}

/**
 * Split a string into lines
 */
export function lines(s: string): string[] {
  return s.split(/\r?\n/);
}

/**
 * Split a string into words
 */
export function words(s: string): string[] {
  return s.split(/\s+/).filter((w) => w.length > 0);
}

/**
 * Split a string into characters
 */
export function chars(s: string): string[] {
  return [...s];
}

/**
 * Join strings with a separator
 */
export function join(strings: string[], separator = ''): string {
  return strings.join(separator);
}

/**
 * Format a template string with values
 */
export function format(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return key in values ? String(values[key]) : match;
  });
}

/**
 * Format a number as a string with grouping
 */
export function formatNumber(n: number, options: Intl.NumberFormatOptions = {}): string {
  return n.toLocaleString('en-US', options);
}

/**
 * Format a number with commas
 */
export function numberWithCommas(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Format bytes as human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
    if (bytes < 0) return `${bytes} B`;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

/**
 * Format duration in milliseconds as human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) {
    return `${(ms / 60000).toFixed(1)}m`;
  }
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(s: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return s.replace(/[&<>"']/g, (c) => htmlEntities[c]);
}

/**
 * Unescape HTML entities
 */
export function unescapeHtml(s: string): string {
  const htmlEntities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
  };
  return s.replace(
    /&(?:amp|lt|gt|quot|#39|#x27|#x2F);/g,
    (entity) => htmlEntities[entity] || entity
  );
}

/**
 * Escape regex special characters
 */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate a slug from a string
 */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Check if string is a valid identifier
 */
export function isValidIdentifier(s: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(s);
}

/**
 * Check if string is numeric
 */
export function isNumeric(s: string): boolean {
  return !isNaN(parseFloat(s)) && isFinite(Number(s));
}

/**
 * Check if string is alphanumeric
 */
export function isAlphanumeric(s: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(s);
}

/**
 * Check if string is alphabetic
 */
export function isAlpha(s: string): boolean {
  return /^[a-zA-Z]+$/.test(s);
}

/**
 * Generate a random string
 */
export function randomString(
  length: number,
  charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[Math.floor(Math.random() * charset.length)];
  }
  return result;
}

/**
 * Generate a UUID v4
 */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Indent each line of a string
 */
export function indent(s: string, spaces: number, char = ' '): string {
  const prefix = char.repeat(spaces);
  return s
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}

/**
 * Dedent a string (remove common leading whitespace)
 */
export function dedent(s: string): string {
  const linesList = lines(s);
  const nonEmptyLines = linesList.filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length === 0) return s;

  const minIndent = Math.min(
    ...nonEmptyLines.map((line) => {
      const match = line.match(/^(\s*)/);
      return match ? match[1].length : 0;
    })
  );

  return linesList.map((line) => line.slice(minIndent)).join('\n');
}

/**
 * Word wrap text to a maximum width
 */
export function wordWrap(s: string, maxWidth: number): string {
  const wordsList = words(s);
  const linesList: string[] = [];
  let currentLine = '';

  for (const word of wordsList) {
    if (currentLine.length === 0) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= maxWidth) {
      currentLine += ' ' + word;
    } else {
      linesList.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine.length > 0) {
    linesList.push(currentLine);
  }

  return linesList.join('\n');
}

/**
 * Levenshtein distance between two strings
 */
export function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
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

function lcsLength(a: string, b: string): number {
  const n = b.length;
  const dp: number[] = new Array(n + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    let prev = 0;
    for (let j = 0; j < n; j++) {
      const tmp = dp[j + 1];
      dp[j + 1] = a[i] === b[j] ? prev + 1 : Math.max(dp[j + 1], dp[j]);
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Check similarity between two strings (0-1) using Sorensen-Dice over LCS
 */
export function similarity(a: string, b: string): number {
  const total = a.length + b.length;
  if (total === 0) return 1;
  return (2 * lcsLength(a, b)) / total;
}

/**
 * Extract HoloScript trait annotations (@name) and JSX component names from code
 */
export function extractTraits(code: string): string[] {
  const traits = new Set<string>();
  let m: RegExpExecArray | null;
  const atRe = /@([a-zA-Z_]\w*)/g;
  while ((m = atRe.exec(code)) !== null) traits.add(`@${m[1]}`);
  const tagRe = /<([A-Z][a-zA-Z0-9]*)\b/g;
  while ((m = tagRe.exec(code)) !== null) traits.add(m[1]);
  return [...traits];
}
