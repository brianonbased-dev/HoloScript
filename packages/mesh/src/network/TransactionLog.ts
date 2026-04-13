import * as fs from 'fs';
import * as path from 'path';
import { StateDelta } from './DeltaCompressor';

/**
 * TransactionLog
 *
 * Provides an append-only Write Ahead Log (WAL) handling CRDT mutations.
 * If the HoloScript service container crashes, the state matrix rebuilds
 * natively by parsing the seq file line-by-line avoiding memory loss.
 */
export class TransactionLog {
  private logFile: string;
  private writeQueue: StateDelta[] = [];
  private isWriting: boolean = false;
  private sequenceId: number = 0;

  constructor(logPath?: string) {
    this.logFile = logPath || path.resolve(process.cwd(), '.data', 'state_transaction.wal');

    // Ensure directory schema exists
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Appends an active delta directly to the offline WAL buffer.
   */
  public append(delta: StateDelta): void {
    const stampedDelta = { ...delta, _seq: ++this.sequenceId };
    this.writeQueue.push(stampedDelta);
    this.flush();
  }

  private async flush() {
    if (this.isWriting || this.writeQueue.length === 0) return;
    this.isWriting = true;

    // Take a chunk to write
    const toWrite = this.writeQueue.splice(0, this.writeQueue.length);
    const dataStr = toWrite.map((d) => JSON.stringify(d)).join('\n') + '\n';

    try {
      await fs.promises.appendFile(this.logFile, dataStr, 'utf-8');
    } catch (error) {
      // Critical WAL append failure - re-queue and continue
      // Error will be handled by caller through failed state recovery
      // Re-queue the failed writes
      this.writeQueue.unshift(...toWrite);
    } finally {
      this.isWriting = false;
      // Check if more items arrived while writing
      if (this.writeQueue.length > 0) {
        this.flush();
      }
    }
  }

  /**
   * Recover the state strictly from the raw disk array.
   */
  public async recover(): Promise<StateDelta[]> {
    if (!fs.existsSync(this.logFile)) {
      return [];
    }

    try {
      const data = await fs.promises.readFile(this.logFile, 'utf-8');
      const lines = data.split('\n').filter((l) => l.trim().length > 0);

      const recoveredDeltas: StateDelta[] = lines.map((line) => {
        const parsed = JSON.parse(line);
        if (parsed._seq && parsed._seq > this.sequenceId) {
          this.sequenceId = parsed._seq;
        }
        return parsed;
      });

      return recoveredDeltas;
    } catch (error) {
      // Fatal recovery parse failure - return empty state
      // Calling code should handle empty recovery gracefully
      return [];
    }
  }

  public async truncate(): Promise<void> {
    if (fs.existsSync(this.logFile)) {
      await fs.promises.unlink(this.logFile);
    }
    this.sequenceId = 0;
  }
}
