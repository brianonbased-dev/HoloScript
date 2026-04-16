import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken, createGitHubHeaders, githubFetchWithRetry, GITHUB_API_BASE_URL } from '../_shared';

export async function POST(req: NextRequest) {
  const token = await getGitHubToken(req);
  
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized: GitHub token missing' }, { status: 401 });
  }

  try {
    const { code, description, isPublic = true } = await req.json();

    if (!code) {
      return NextResponse.json({ error: 'Missing code payload' }, { status: 400 });
    }

    const payload = {
      description: description || 'Generated via HoloScript AI Copilot',
      public: isPublic,
      files: {
        'scene.holo': {
          content: code,
        },
      },
    };

    const url = `${GITHUB_API_BASE_URL}/gists`;
    
    const res = await githubFetchWithRetry(url, {
      method: 'POST',
      headers: createGitHubHeaders(token, { contentTypeJson: true }),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: `GitHub API error: ${res.statusText}`, details: errorData },
        { status: res.status }
      );
    }

    const data = await res.json();
    
    return NextResponse.json({ 
      success: true, 
      url: data.html_url,
      id: data.id 
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
