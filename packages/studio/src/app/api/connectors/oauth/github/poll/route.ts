import { NextRequest, NextResponse } from 'next/server';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';

export async function POST(req: NextRequest) {
  if (!GITHUB_CLIENT_ID) {
    return NextResponse.json(
      { error: 'GitHub Client ID not configured.' },
      { status: 500 }
    );
  }

  try {
    const { device_code } = await req.json();

    if (!device_code) {
      return NextResponse.json({ error: 'Missing device_code parameter' }, { status: 400 });
    }

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = await response.json();

    // The response can either be an access token OR an error like 'authorization_pending'
    if (data.error) {
      // Return 200 with error info so the client can keep polling
      return NextResponse.json({ status: 'pending', error: data.error });
    }

    return NextResponse.json({
      status: 'success',
      access_token: data.access_token,
      token_type: data.token_type,
      scope: data.scope,
    });
  } catch (error) {
    console.error('Error polling GitHub OAuth:', error);
    return NextResponse.json(
      { error: 'Failed to poll GitHub OAuth.' },
      { status: 500 }
    );
  }
}
