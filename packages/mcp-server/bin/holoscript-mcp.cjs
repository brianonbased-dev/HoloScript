#!/usr/bin/env node
'use strict';
// The built dist/index.js only auto-starts the Stdio MCP server when it is the
// process entry (argv ends in index.js) OR when START_MCP_STDIO=true. Launched
// through this bin, argv[1] is the bin path, so opt in explicitly via the env
// escape hatch the module already honors. Without this, `pnpm start` loads the
// module cleanly but never connects the stdio transport (no serverInfo).
if (process.env.START_MCP_STDIO === undefined) {
  process.env.START_MCP_STDIO = 'true';
}
require('../dist/index.js');
