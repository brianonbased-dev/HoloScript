'use client';

import Link from 'next/link';
import { ReconstructionPanel } from '@/components/reconstruction/ReconstructionPanel';

export default function ScanRoomPage() {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-studio-text">Mobile Room Scan</h1>
          <p className="text-sm text-studio-muted">Desktop orchestrates · phone captures · HoloMap reconstructs.</p>
        </div>
        <Link href="/start" className="text-sm text-studio-muted hover:text-studio-text">
          Back to Studio
        </Link>
      </div>
      <ReconstructionPanel />
    </main>
  );
}
