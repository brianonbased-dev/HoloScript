/**
 * Append-only journal of computed embeddings, so an interrupted index build
 * resumes instead of starting over.
 *
 * Why (2026-10-04): a HoloEmbed warm of the HoloScript workspace (12,615
 * batches) was cancelled by the host memory floor at batch 11,127 and every
 * computed vector was discarded; the restart began at batch 1. A build now
 * appends each batch's new vectors here as it goes. The next attempt reads
 * them back and EmbeddingIndex.refreshIndex reuses them by exact text.
 *
 * A vector is a pure function of (provider, text), so the journal is valid for
 * any graph built with the same provider. Callers still verify a sample with
 * EmbeddingIndex.verifyReusableEmbeddings before trusting it.
 *
 * Format: "HEJ1", u32 dimension, then records of
 * [u32 text byte length][utf-8 text][dimension x f32], little-endian.
 * A record cut short by a crash is ignored on read.
 */
import fs from 'node:fs';
import type { ReusableEmbedding } from './EmbeddingIndex';

const MAGIC = Buffer.from('HEJ1', 'ascii');
const HEADER_BYTES = 8;

/**
 * Append `source` onto `target` one element at a time. `target.push(...source)`
 * passes every element as an argument and throws RangeError on Node 24 above
 * roughly 125k elements (review of #492, 2026-10-05: 120k worked, 130k threw);
 * HoloScript's index is 136k entries.
 */
export function appendAll<T>(target: T[], source: Iterable<T>): T[] {
  for (const item of source) target.push(item);
  return target;
}

/** Journals already checked for a torn tail in this process. */
const repairedJournals = new Set<string>();

/**
 * Cut a journal back to its last whole record. Appending after a record torn
 * by a crash used to splice new bytes onto the torn one, so the next read
 * decoded garbage vectors and lost every record after it (review of #492:
 * gamma read back as [3, 3, 4.6e-40, 6.7e22], delta and epsilon lost).
 * Walks record headers with positioned reads; vectors are skipped, not read.
 */
function repairJournalTail(file: string, dimension: number): void {
  const key = file.toLowerCase();
  if (repairedJournals.has(key)) return;
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, 'r+');
    const size = fs.fstatSync(fd).size;
    const vectorBytes = dimension * 4;
    const length = Buffer.alloc(4);
    let offset = HEADER_BYTES;
    while (offset + 4 <= size) {
      if (fs.readSync(fd, length, 0, 4, offset) !== 4) break;
      const end = offset + 4 + length.readUInt32LE(0) + vectorBytes;
      if (end > size) break;
      offset = end;
    }
    if (offset < size) fs.ftruncateSync(fd, offset);
    repairedJournals.add(key);
  } catch {
    /* unreadable: the next append rewrites the header */
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function appendEmbeddingJournal(file: string, entries: readonly ReusableEmbedding[]): void {
  if (entries.length === 0) return;
  const dimension = entries[0].embedding.length;
  let existingDimension: number | null = null;
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const header = Buffer.alloc(HEADER_BYTES);
      if (fs.readSync(fd, header, 0, HEADER_BYTES, 0) === HEADER_BYTES && header.subarray(0, 4).equals(MAGIC)) {
        existingDimension = header.readUInt32LE(4);
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    existingDimension = null;
  }
  const chunks: Buffer[] = [];
  if (existingDimension === dimension) repairJournalTail(file, dimension);
  if (existingDimension !== dimension) {
    // Absent, unreadable, or another dimension: start a fresh journal.
    const header = Buffer.alloc(HEADER_BYTES);
    MAGIC.copy(header, 0);
    header.writeUInt32LE(dimension, 4);
    fs.writeFileSync(file, header);
  }
  for (const entry of entries) {
    if (entry.embedding.length !== dimension) continue;
    const text = Buffer.from(entry.text, 'utf-8');
    const length = Buffer.alloc(4);
    length.writeUInt32LE(text.length, 0);
    chunks.push(
      length,
      text,
      Buffer.from(entry.embedding.buffer, entry.embedding.byteOffset, dimension * 4)
    );
  }
  fs.appendFileSync(file, Buffer.concat(chunks));
}

export function readEmbeddingJournal(file: string): ReusableEmbedding[] {
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(file);
  } catch {
    return [];
  }
  if (buffer.length < HEADER_BYTES || !buffer.subarray(0, 4).equals(MAGIC)) return [];
  const dimension = buffer.readUInt32LE(4);
  const vectorBytes = dimension * 4;
  const entries: ReusableEmbedding[] = [];
  let offset = HEADER_BYTES;
  while (offset + 4 <= buffer.length) {
    const textBytes = buffer.readUInt32LE(offset);
    const end = offset + 4 + textBytes + vectorBytes;
    if (end > buffer.length) break; // torn tail from an interrupted append
    const text = buffer.toString('utf-8', offset + 4, offset + 4 + textBytes);
    const vectorStart = offset + 4 + textBytes;
    const embedding = new Float32Array(dimension);
    for (let d = 0; d < dimension; d++) {
      embedding[d] = buffer.readFloatLE(vectorStart + d * 4);
    }
    entries.push({ text, embedding });
    offset = end;
  }
  return entries;
}

export function removeEmbeddingJournal(file: string): void {
  repairedJournals.delete(file.toLowerCase());
  try {
    fs.rmSync(file, { force: true });
  } catch {
    /* best effort: a stale journal is only ever offered for verified reuse */
  }
}
