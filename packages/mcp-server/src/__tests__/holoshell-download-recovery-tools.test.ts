import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  holoshellDownloadRecoveryList,
  holoshellDownloadRecoveryQuarantine,
} from '../holoshell-download-recovery-tools';

const tmp = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `holoshell-${label}-`));

function shelfWith(receipts: Array<Record<string, unknown>>): string {
  const dir = tmp('shelf');
  for (const r of receipts) fs.writeFileSync(path.join(dir, `${r.id}.json`), JSON.stringify(r));
  return dir;
}

describe('holoshell download recovery shelf', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('lists a missing shelf as empty without creating ~/.ai-ecosystem', async () => {
    // dispatch-health calls every local tool with {}. Creating the shelf on that read
    // left ~/.ai-ecosystem behind, which the doctrine-slot gate reads as a HoloCI lane.
    const home = tmp('home');
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    vi.stubEnv('HOLOSHELL_DOWNLOAD_SHELF', undefined);

    const out = await holoshellDownloadRecoveryList.handler({});

    expect(out).toMatchObject({ success: true, count: 0, receipts: [] });
    expect(out.shelfPath).toBe(path.join(home, '.ai-ecosystem', 'holoshell', 'downloads'));
    expect(fs.existsSync(path.join(home, '.ai-ecosystem'))).toBe(false);
  });

  it('reads HOLOSHELL_DOWNLOAD_SHELF when a tool runs, not when the module loads', async () => {
    const first = shelfWith([{ id: 'dl-1', status: 'interrupted' }]);
    const second = shelfWith([]);

    vi.stubEnv('HOLOSHELL_DOWNLOAD_SHELF', first);
    const a = await holoshellDownloadRecoveryList.handler({});
    vi.stubEnv('HOLOSHELL_DOWNLOAD_SHELF', second);
    const b = await holoshellDownloadRecoveryList.handler({});

    expect(a).toMatchObject({ count: 1, shelfPath: first });
    expect(b).toMatchObject({ count: 0, shelfPath: second });
  });

  it('still writes a receipt update to an existing shelf', async () => {
    const shelf = shelfWith([{ id: 'dl-2', status: 'interrupted' }]);
    vi.stubEnv('HOLOSHELL_DOWNLOAD_SHELF', shelf);

    await holoshellDownloadRecoveryQuarantine.handler({
      id: 'dl-2',
      freshUserGesture: true,
      reason: 'manual',
    });

    const saved = JSON.parse(fs.readFileSync(path.join(shelf, 'dl-2.json'), 'utf8'));
    expect(saved).toMatchObject({ id: 'dl-2', status: 'quarantined', quarantineReason: 'manual' });
  });
});
