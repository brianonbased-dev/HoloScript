import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { randomUUID } from 'crypto';
import { join, resolve } from 'path';

interface LeaseRecord {
  version: 1;
  leaseId: string;
  owner: 'service' | 'operator';
  pid: number;
  createdAt: string;
}

const LEASE_FILE = '.llm-runtime.lease';

export class RuntimeStateLease {
  private released = false;

  constructor(
    private readonly fd: number,
    private readonly leasePath: string,
    private readonly leaseId: string
  ) {}

  release(): void {
    if (this.released) return;
    this.released = true;
    try {
      closeSync(this.fd);
    } catch {
      // The lease file remains fail-closed if the descriptor cannot be closed.
      return;
    }

    try {
      const current = JSON.parse(readFileSync(this.leasePath, 'utf8')) as Partial<LeaseRecord>;
      if (current.leaseId === this.leaseId) unlinkSync(this.leasePath);
    } catch {
      // Never unlink an unreadable or replaced lease; leaving it behind is safer.
    }
  }
}

interface RuntimeLeaseSignalOptions {
  lease: RuntimeStateLease;
  closeService: () => Promise<void>;
  signalSource?: Pick<NodeJS.Process, 'on' | 'removeListener'>;
  exit?: (code: number) => void;
}

export function installRuntimeLeaseSignalHandlers({
  lease,
  closeService,
  signalSource = process,
  exit = (code) => process.exit(code),
}: RuntimeLeaseSignalOptions): () => void {
  let shuttingDown = false;

  const remove = () => {
    signalSource.removeListener('SIGINT', onSigint);
    signalSource.removeListener('SIGTERM', onSigterm);
  };
  const shutdown = async (exitCode: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await closeService();
    } finally {
      remove();
      lease.release();
      exit(exitCode);
    }
  };
  const onSigint = () => void shutdown(130);
  const onSigterm = () => void shutdown(143);

  signalSource.on('SIGINT', onSigint);
  signalSource.on('SIGTERM', onSigterm);
  return remove;
}

export function acquireRuntimeStateLease(
  runtimeRoot: string,
  owner: LeaseRecord['owner']
): RuntimeStateLease {
  const root = resolve(runtimeRoot);
  const leasePath = join(root, LEASE_FILE);
  mkdirSync(root, { recursive: true });
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error('Runtime-state root is not a direct directory.');
  }

  const leaseId = randomUUID();
  let fd: number | undefined;
  try {
    fd = openSync(leasePath, 'wx', 0o600);
    const record: LeaseRecord = {
      version: 1,
      leaseId,
      owner,
      pid: process.pid,
      createdAt: new Date().toISOString(),
    };
    try {
      writeFileSync(fd, `${JSON.stringify(record)}\n`, 'utf8');
    } catch (error) {
      closeSync(fd);
      fd = undefined;
      try {
        unlinkSync(leasePath);
      } catch {
        // A failed cleanup remains fail-closed on the next acquisition.
      }
      throw error;
    }
    return new RuntimeStateLease(fd, leasePath, leaseId);
  } catch (error: any) {
    if (error?.code === 'EEXIST') {
      throw new Error('Runtime state is leased by a live or unverified service/operator process.');
    }
    throw error;
  }
}
