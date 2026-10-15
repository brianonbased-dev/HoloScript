import { NextResponse } from 'next/server';

// setup.ps1 (HoloMesh setup) was pulled from the store on 2026-10-14 pending a
// security fix. Any registry download path under /download answers 410 Gone.
function gone() {
  return NextResponse.json(
    { error: 'This download has been withdrawn. The installer is coming back soon.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  );
}

export const GET = gone;
export const HEAD = gone;
