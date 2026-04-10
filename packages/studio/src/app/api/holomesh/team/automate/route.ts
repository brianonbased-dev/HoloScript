import { NextRequest, NextResponse } from 'next/server';

interface TeamAutomateBody {
  teamId?: string;
  entryId?: string;
  content?: string;
  type?: string;
  domain?: string;
  authorName?: string;
  price?: number;
  budgetUsd?: number;
  autoRun?: boolean;
  cycles?: number;
}

const BASE =
  process.env.HOLOMESH_API_URL || process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TeamAutomateBody;
    const teamId = (body.teamId || '').trim();

    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
    }

    const auth = req.headers.get('authorization') || '';

    const delegateRes = await fetch(`${req.nextUrl.origin}/api/holomesh/delegate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...body,
        teamId,
        source: 'team-automation',
        allowPaid: body.price ? true : false,
        autoRun: body.autoRun !== false,
      }),
    });

    const delegatePayload = await delegateRes.json().catch(() => ({}));
    if (!delegateRes.ok) {
      return NextResponse.json(
        {
          error: 'Failed to delegate team action',
          details: delegatePayload,
        },
        { status: delegateRes.status }
      );
    }

    let teamNotified = false;
    let teamNotifyError: string | null = null;

    if (auth) {
      const notifyRes = await fetch(
        `${BASE}/api/holomesh/team/${encodeURIComponent(teamId)}/message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: auth,
          },
          body: JSON.stringify({
            type: 'task',
            content: `Team automation delegated ${body.entryId || 'entry'} to HoloClaw skill ${delegatePayload?.delegated?.skillName || 'unknown'}`,
            metadata: {
              teamId,
              entryId: body.entryId || null,
              delegatedSkill: delegatePayload?.delegated?.skillName || null,
              provenanceHash: delegatePayload?.delegated?.provenanceHash || null,
            },
          }),
        }
      );

      teamNotified = notifyRes.ok;
      if (!notifyRes.ok) {
        const notifyBody = await notifyRes.text().catch(() => 'team notification failed');
        teamNotifyError = notifyBody.slice(0, 300);
      }
    } else {
      teamNotifyError = 'No Authorization header provided; skipped team message notification.';
    }

    return NextResponse.json({
      success: true,
      delegated: delegatePayload.delegated,
      run: delegatePayload.run || null,
      team: {
        id: teamId,
        notified: teamNotified,
        notifyError: teamNotifyError,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Team automation failed' },
      { status: 500 }
    );
  }
}
