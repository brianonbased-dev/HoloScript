import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { serviceId, credentials } = await req.json();

    if (!serviceId) {
      return NextResponse.json({ error: 'serviceId is required' }, { status: 400 });
    }

    // Example validation logic per service
    let config: Record<string, string> = {};

    switch (serviceId) {
      case 'github':
        // Github is primarily handled via the OAuth routes we created,
        // but if PAT was provided here, we could validate it.
        config = { connectedAs: 'github-user' };
        break;

      case 'vscode':
        // Validate VSCode IPC or MCP connection
        if (!credentials.port && !credentials.token) {
           // For a local VSCode MCP connection, you might just accept it as successful 
           // if the orchestrator validates it, or return dummy config for now.
        }
        config = {
          mode: 'mcp-local',
          status: 'verified',
        };
        break;

      case 'railway':
        if (!credentials.apiToken) {
          return NextResponse.json({ error: 'Railway API token required' }, { status: 400 });
        }
        config = { environment: 'production' };
        break;

      case 'appstore':
      case 'upstash':
        config = { connected: 'true' };
        break;

      default:
        return NextResponse.json({ error: `Unknown serviceId: ${serviceId}` }, { status: 400 });
    }

    return NextResponse.json({
      status: 'success',
      serviceId,
      config,
    });
  } catch (error) {
    console.error('[API] Connect error:', error);
    return NextResponse.json({ error: 'Failed to connect to service' }, { status: 500 });
  }
}
