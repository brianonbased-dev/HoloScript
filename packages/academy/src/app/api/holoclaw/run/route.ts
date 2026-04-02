import { NextResponse } from 'next/server';

function academyLiteDisabledResponse() {
  return NextResponse.json(
    {
      error: 'HoloClaw Academy Lite does not manage skill daemons.',
      mode: 'academy-lite',
      use_instead: {
        studio: '/holoclaw in Studio for full lifecycle controls',
        cli: 'holoscript daemon compositions/holoclaw.hsplus --always-on --debug',
      },
    },
    { status: 405 }
  );
}

// ---------------------------------------------------------------------------
// POST /api/holoclaw/run — disabled in Academy Lite
// ---------------------------------------------------------------------------

export async function POST() {
  return academyLiteDisabledResponse();
}

// ---------------------------------------------------------------------------
// GET /api/holoclaw/run — disabled in Academy Lite
// ---------------------------------------------------------------------------

export async function GET() {
  return academyLiteDisabledResponse();
}

// ---------------------------------------------------------------------------
// DELETE /api/holoclaw/run — disabled in Academy Lite
// ---------------------------------------------------------------------------

export async function DELETE() {
  return academyLiteDisabledResponse();
}
