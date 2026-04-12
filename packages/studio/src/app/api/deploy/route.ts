export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '../../../lib/api-auth';
import { getDb } from '../../../db/client';
import { deployments } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { isStorageConfigured, uploadFile } from '../../../lib/storage-s3';

/**
 * /api/deploy — One-click deploy pipeline.
 *
 * POST /api/deploy   → Compile HoloScript → upload to CDN → return live URL
 * GET  /api/deploy   → List user's deployments
 *
 * Pipeline: HoloScript code → parse scene → generate self-contained HTML
 *           → upload to S3/R2 → return public URL
 *
 * Starts with web (R3F/static HTML) target. Future: mobile, VR.
 */

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  let body: {
    code?: string;
    projectId?: string;
    name?: string;
    target?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { code, projectId, name = 'Untitled', target = 'r3f' } = body;
  if (!code) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }

  const db = getDb();

  // Create deployment record
  let deploymentId = `deploy_${Date.now().toString(36)}`;
  if (db) {
    const [row] = await db
      .insert(deployments)
      .values({
        ownerId: userId,
        projectId: projectId ?? null,
        status: 'building',
        target,
        metadata: { name },
      })
      .returning();
    deploymentId = row.id;
  }

  // Generate self-contained HTML with embedded R3F scene
  const html = generateDeployableHTML(name, code);

  // Upload to S3 if configured
  if (isStorageConfigured()) {
    try {
      const key = `deploys/${userId}/${deploymentId}/index.html`;
      const url = await uploadFile(key, html, 'text/html');

      if (db) {
        await db
          .update(deployments)
          .set({ url, status: 'live', updatedAt: new Date() })
          .where(eq(deployments.id, deploymentId));
      }

      return NextResponse.json(
        {
          deploymentId,
          url,
          status: 'live',
        },
        { status: 201 }
      );
    } catch (err) {
      if (db) {
        await db
          .update(deployments)
          .set({
            status: 'failed',
            metadata: { name, error: String(err) },
            updatedAt: new Date(),
          })
          .where(eq(deployments.id, deploymentId));
      }
      return NextResponse.json({ error: 'Deploy upload failed' }, { status: 500 });
    }
  }

  // Fallback: no S3, return the HTML directly as a downloadable file
  if (db) {
    await db
      .update(deployments)
      .set({ status: 'local', updatedAt: new Date() })
      .where(eq(deployments.id, deploymentId));
  }

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
      'Content-Disposition': `attachment; filename="${name.replace(/[^a-zA-Z0-9._-]/g, '_')}.html"`,
    },
  });
}

export async function GET(_req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ deployments: [] });
  }

  const rows = await db
    .select()
    .from(deployments)
    .where(eq(deployments.ownerId, userId))
    .orderBy(desc(deployments.createdAt))
    .limit(50);

  return NextResponse.json({
    deployments: rows.map((r) => ({
      id: r.id,
      url: r.url,
      status: r.status,
      target: r.target,
      name: (r.metadata as Record<string, string>)?.name ?? 'Untitled',
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

/**
 * Generate a self-contained HTML file that renders the HoloScript scene
 * using React Three Fiber via CDN imports (esm.sh).
 */
function generateDeployableHTML(title: string, holoCode: string): string {
  const _escapedCode = holoCode
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — HoloScript</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; overflow: hidden; }
    body { background: #111; font-family: system-ui, sans-serif; }
    #root { display: flex; }
    canvas { width: 100% !important; height: 100% !important; }
    .holo-badge {
      position: fixed; bottom: 8px; right: 8px; padding: 4px 10px;
      background: rgba(0,0,0,0.6); color: #888; font-size: 11px;
      border-radius: 4px; z-index: 999; pointer-events: none;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <div class="holo-badge">Built with HoloScript</div>

  <script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18",
      "react-dom": "https://esm.sh/react-dom@18",
      "react-dom/client": "https://esm.sh/react-dom@18/client",
      "react/jsx-runtime": "https://esm.sh/react@18/jsx-runtime",
      "@react-three/fiber": "https://esm.sh/@react-three/fiber@8",
      "@react-three/drei": "https://esm.sh/@react-three/drei@9",
      "three": "https://esm.sh/three@0.160"
    }
  }
  </script>
  <script type="module">
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { Canvas } from '@react-three/fiber';
    import { OrbitControls, Environment } from '@react-three/drei';

    // Parse embedded HoloScript scene
    const holoCode = \`${holoCode.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;

    // Simple scene parser — extracts objects from HoloScript code
    function parseObjects(code) {
      const objects = [];
      const re = /object\\s+"([^"]+)"\\s*\\{([\\s\\S]*?)\\}/g;
      let m;
      while ((m = re.exec(code)) !== null) {
        const name = m[1];
        const body = m[2];
        const posM = body.match(/@transform\\s*\\([^)]*position:\\s*\\[([^\\]]+)\\]/);
        const pos = posM ? posM[1].split(',').map(Number) : [0, 0, 0];
        const meshM = body.match(/mesh:\\s*"([^"]+)"/);
        const mesh = meshM ? meshM[1] : 'box';
        const colorM = body.match(/color:\\s*"([^"]+)"/);
        const color = colorM ? colorM[1] : '#888888';
        objects.push({ name, pos, mesh, color });
      }
      return objects;
    }

    function HoloObject({ obj }) {
      const geo = {
        box: React.createElement('boxGeometry'),
        sphere: React.createElement('sphereGeometry', { args: [0.5, 32, 32] }),
        cylinder: React.createElement('cylinderGeometry', { args: [0.5, 0.5, 1, 32] }),
        plane: React.createElement('planeGeometry', { args: [1, 1] }),
        cone: React.createElement('coneGeometry', { args: [0.5, 1, 32] }),
      }[obj.mesh] || React.createElement('boxGeometry');

      return React.createElement('mesh', { position: obj.pos },
        geo,
        React.createElement('meshStandardMaterial', { color: obj.color })
      );
    }

    function Scene() {
      const objects = parseObjects(holoCode);
      return React.createElement(React.Fragment, null,
        React.createElement('ambientLight', { intensity: 0.4 }),
        React.createElement('directionalLight', { position: [5, 5, 5], intensity: 0.8 }),
        React.createElement(OrbitControls),
        React.createElement(Environment, { preset: 'apartment' }),
        React.createElement('gridHelper', { args: [20, 20, '#333', '#222'] }),
        ...objects.map((obj, i) =>
          React.createElement(HoloObject, { key: i, obj })
        )
      );
    }

    function App() {
      return React.createElement(Canvas, {
        camera: { position: [5, 3, 5], fov: 50 },
        shadows: true,
      },
        React.createElement(Scene)
      );
    }

    createRoot(document.getElementById('root')).render(
      React.createElement(App)
    );
  </script>
</body>
</html>`;
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
