/**
 * MCP Protocol Tools for HoloScript Publishing Protocol
 *
 * 4 tools for AI agent protocol operations:
 * - holo_protocol_publish: Publish composition to protocol
 * - holo_protocol_collect: Collect a published composition
 * - holo_protocol_revenue: Preview revenue distribution
 * - holo_protocol_lookup: Look up published composition
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

// =============================================================================
// Tool Definitions
// =============================================================================

export const protocolTools: Tool[] = [
  {
    name: 'holo_protocol_publish',
    description: 'Publish a HoloScript composition to the HoloScript Protocol. ' +
      'Registers the composition on-chain (content hash, author, imports, license) ' +
      'and deploys to CDN. Returns protocol ID, collect URL, and revenue preview.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The HoloScript source code to publish',
        },
        author: {
          type: 'string',
          description: 'Author name or wallet address',
        },
        license: {
          type: 'string',
          enum: ['free', 'cc_by', 'cc_by_sa', 'cc_by_nc', 'commercial', 'exclusive'],
          description: 'License type for the composition (default: free)',
        },
        price: {
          type: 'string',
          description: 'Collect price in ETH (default: "0" for free collect)',
        },
        mintAsNFT: {
          type: 'boolean',
          description: 'Also mint as Zora NFT on Base L2 (default: false)',
        },
      },
      required: ['code', 'author'],
    },
  },
  {
    name: 'holo_protocol_collect',
    description: 'Collect (mint an edition of) a published HoloScript composition. ' +
      'Revenue is automatically distributed to creator, platform, and upstream import authors.',
    inputSchema: {
      type: 'object',
      properties: {
        contentHash: {
          type: 'string',
          description: 'SHA-256 content hash of the composition to collect',
        },
        referrer: {
          type: 'string',
          description: 'Referrer address (earns 2% referral reward)',
        },
        quantity: {
          type: 'number',
          description: 'Number of editions to collect (default: 1)',
        },
      },
      required: ['contentHash'],
    },
  },
  {
    name: 'holo_protocol_revenue',
    description: 'Preview the revenue distribution for a composition. ' +
      'Shows how collect revenue would flow to creator, platform (2.5%), ' +
      'import authors (5% per level, max 3 levels), and referrer (2%).',
    inputSchema: {
      type: 'object',
      properties: {
        price: {
          type: 'string',
          description: 'Collect price in ETH to simulate',
        },
        author: {
          type: 'string',
          description: 'Creator/author identifier',
        },
        imports: {
          type: 'array',
          description: 'Import chain nodes for upstream royalty calculation',
          items: {
            type: 'object',
            properties: {
              contentHash: { type: 'string' },
              author: { type: 'string' },
              depth: { type: 'number' },
            },
          },
        },
        referrer: {
          type: 'string',
          description: 'Referrer address (optional)',
        },
      },
      required: ['price', 'author'],
    },
  },
  {
    name: 'holo_protocol_lookup',
    description: 'Look up a published composition by content hash or author. ' +
      'Returns the protocol record with on-chain metadata, collect URL, and edition count.',
    inputSchema: {
      type: 'object',
      properties: {
        contentHash: {
          type: 'string',
          description: 'SHA-256 content hash to look up',
        },
        author: {
          type: 'string',
          description: 'Author address to list all publications',
        },
      },
    },
  },
];

// =============================================================================
// Tool Handler
// =============================================================================

export async function handleProtocolTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  switch (name) {
    case 'holo_protocol_publish':
      return handlePublish(args);
    case 'holo_protocol_collect':
      return handleCollect(args);
    case 'holo_protocol_revenue':
      return handleRevenue(args);
    case 'holo_protocol_lookup':
      return handleLookup(args);
    default:
      return null;
  }
}

// =============================================================================
// Individual Handlers
// =============================================================================

async function handlePublish(args: Record<string, unknown>) {
  const code = args.code as string;
  const author = args.author as string;
  const license = (args.license as string) || 'free';
  const price = (args.price as string) || '0';
  const mintAsNFT = (args.mintAsNFT as boolean) || false;

  // Dynamic imports to avoid circular deps
  const {
    generateProvenance,
    calculateRevenueDistribution,
    formatRevenueDistribution,
    ethToWei,
    PROTOCOL_CONSTANTS,
    parse,
  } = await import('@holoscript/core');

  // Parse and generate provenance
  const ast = parse(code);
  if (ast.errors && ast.errors.length > 0) {
    return {
      status: 'error',
      error: 'PARSE_ERROR',
      message: `Parse errors: ${ast.errors.map((e: { message?: string }) => e.message || String(e)).join(', ')}`,
    };
  }

  const provenance = generateProvenance(code, ast, { author, license: license as 'free' });

  // Calculate revenue preview
  const priceWei = ethToWei(price);
  const importChain = provenance.imports.map(
    (imp: { hash?: string; path: string; author?: string }, i: number) => ({
      contentHash: imp.hash || `import-${i}`,
      author: imp.author || imp.path,
      depth: 1,
      children: [],
    })
  );
  const revenuePreview = calculateRevenueDistribution(priceWei, author, importChain);

  // Try to register via server
  const serverUrl = process.env.HOLOSCRIPT_SERVER_URL || 'https://mcp.holoscript.net';
  try {
    // Store metadata
    await fetch(`${serverUrl}/api/protocol/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentHash: provenance.hash,
        provenance: {
          hash: provenance.hash,
          author: provenance.author,
          license: provenance.license,
          publishMode: provenance.publishMode,
          imports: provenance.imports,
          created: provenance.created,
        },
      }),
    });

    // Register protocol record
    const res = await fetch(`${serverUrl}/api/protocol`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentHash: provenance.hash,
        author,
        importHashes: provenance.imports.map((imp: { hash?: string }) => imp.hash).filter(Boolean),
        license,
        publishMode: provenance.publishMode,
        price,
        referralBps: PROTOCOL_CONSTANTS.DEFAULT_REFERRAL_BPS,
        metadataURI: `${serverUrl}/metadata/${provenance.hash}`,
        mintAsNFT,
        code,
        title: `MCP Published: ${author}`,
        description: 'Published via MCP protocol tool',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { status: 'error', error: 'PUBLISH_FAILED', message: text };
    }

    const result = await res.json();
    return {
      status: 'success',
      ...result,
      revenuePreview: formatRevenueDistribution(revenuePreview),
      provenance: {
        hash: provenance.hash,
        publishMode: provenance.publishMode,
        license: provenance.license,
        importCount: provenance.imports.length,
      },
    };
  } catch (err) {
    return {
      status: 'error',
      error: 'SERVER_UNAVAILABLE',
      message: err instanceof Error ? err.message : String(err),
      provenance: {
        hash: provenance.hash,
        publishMode: provenance.publishMode,
        license: provenance.license,
      },
    };
  }
}

async function handleCollect(args: Record<string, unknown>) {
  const contentHash = args.contentHash as string;
  const referrer = args.referrer as string | undefined;
  const quantity = (args.quantity as number) || 1;

  const serverUrl = process.env.HOLOSCRIPT_SERVER_URL || 'https://mcp.holoscript.net';

  try {
    const res = await fetch(`${serverUrl}/api/collect/${contentHash}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referrer, quantity }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { status: 'error', error: 'COLLECT_FAILED', message: text };
    }

    return { status: 'success', ...(await res.json()) };
  } catch (err) {
    return {
      status: 'error',
      error: 'SERVER_UNAVAILABLE',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function handleRevenue(args: Record<string, unknown>) {
  const { calculateRevenueDistribution, formatRevenueDistribution, ethToWei } =
    await import('@holoscript/core');

  const price = args.price as string;
  const author = args.author as string;
  const referrer = args.referrer as string | undefined;
  const imports =
    (args.imports as Array<{ contentHash: string; author: string; depth: number }>) || [];

  const priceWei = ethToWei(price);
  const importChain = imports.map((imp) => ({
    contentHash: imp.contentHash,
    author: imp.author,
    depth: imp.depth || 1,
    children: [] as Array<{
      contentHash: string;
      author: string;
      depth: number;
      children: unknown[];
    }>,
  }));

  const dist = calculateRevenueDistribution(priceWei, author, importChain, { referrer });

  return {
    status: 'success',
    totalPrice: price,
    flows: dist.flows.map((f: any) => ({
      recipient: f.recipient,
      amount: f.amount.toString(),
      reason: f.reason,
      depth: f.depth,
      percentage: `${(f.bps / 100).toFixed(1)}%`,
    })),
    formatted: formatRevenueDistribution(dist),
  };
}

async function handleLookup(args: Record<string, unknown>) {
  const contentHash = args.contentHash as string | undefined;
  const author = args.author as string | undefined;

  if (!contentHash && !author) {
    return {
      status: 'error',
      error: 'MISSING_PARAMS',
      message: 'Provide either contentHash or author',
    };
  }

  const serverUrl = process.env.HOLOSCRIPT_SERVER_URL || 'https://mcp.holoscript.net';

  try {
    const endpoint = contentHash
      ? `${serverUrl}/api/protocol/${contentHash}`
      : `${serverUrl}/api/protocol/author/${author}`;

    const res = await fetch(endpoint);
    if (!res.ok) {
      if (res.status === 404) {
        return {
          status: 'not_found',
          message: contentHash
            ? `No record for hash ${contentHash}`
            : `No publications by ${author}`,
        };
      }
      const text = await res.text();
      return { status: 'error', error: 'LOOKUP_FAILED', message: text };
    }

    return { status: 'success', ...(await res.json()) };
  } catch (err) {
    return {
      status: 'error',
      error: 'SERVER_UNAVAILABLE',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
