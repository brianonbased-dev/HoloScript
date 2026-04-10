# @holoscript/adapter-postgres

PostgreSQL database adapter for HoloScript Runtime. Provides seamless integration with PostgreSQL databases for execution logging, state persistence, and custom queries.

## Installation

```bash
npm install @holoscript/adapter-postgres
# or
pnpm add @holoscript/adapter-postgres
```

## Requirements

- Node.js 18.0.0+
- PostgreSQL 12+
- `@holoscript/core` (peer dependency)

## Quick Start

```typescript
import { PostgresHoloAdapter } from '@holoscript/adapter-postgres';

// Using connection string
const adapter = new PostgresHoloAdapter('postgresql://user:pass@localhost:5432/holoscript');

// Or using environment variable (DATABASE_URL)
const adapter = new PostgresHoloAdapter();

// Execute raw SQL
const results = await adapter.query('SELECT * FROM users WHERE active = $1', [true]);

// Log script execution
await adapter.saveExecution(
  'script-123', // scriptId
  'object Cube { ... }', // code
  'success', // status
  42, // execution time (ms)
  '{"rendered": true}', // output (optional)
  undefined, // error (optional)
  'rendering-agent' // agentId (optional)
);
```

## Configuration

### Connection String

```typescript
const adapter = new PostgresHoloAdapter('postgresql://user:password@host:5432/database');
```

### Pool Configuration

```typescript
import { PoolConfig } from 'pg';

const config: PoolConfig = {
  host: 'localhost',
  port: 5432,
  database: 'holoscript',
  user: 'postgres',
  password: 'secret',
  max: 20, // max pool size
  idleTimeoutMillis: 30000, // close idle connections after 30s
  connectionTimeoutMillis: 2000, // connection timeout
};

const adapter = new PostgresHoloAdapter(config);
```

### Environment Variable

If no config is provided, the adapter uses `DATABASE_URL`:

```bash
export DATABASE_URL=postgresql://user:pass@localhost:5432/holoscript
```

## API Reference

### `PostgresHoloAdapter`

#### Constructor

```typescript
new PostgresHoloAdapter(config?: PoolConfig | string)
```

- `config` - PostgreSQL connection string or pg `PoolConfig` object
- Falls back to `DATABASE_URL` environment variable if not provided

#### `query(sql: string, params?: any[]): Promise<any>`

Execute a raw SQL query with optional parameterized values.

```typescript
// Simple query
const users = await adapter.query('SELECT * FROM users');

// Parameterized query (prevents SQL injection)
const user = await adapter.query('SELECT * FROM users WHERE id = $1', ['user-123']);
```

#### `saveExecution(...): Promise<void>`

Log a HoloScript execution to the database.

```typescript
await adapter.saveExecution(
  scriptId,       // unique script identifier
  code,           // HoloScript source code
  status,         // 'success' | 'error' | 'timeout'
  executionTimeMs, // execution duration in milliseconds
  output?,        // optional output/result string
  error?,         // optional error message
  agentId?        // optional agent identifier (default: 'system')
);
```

### `IDatabaseProvider` Interface

The adapter implements `IDatabaseProvider` for compatibility with HoloScript Runtime:

```typescript
interface IDatabaseProvider {
  query(sql: string, params?: any[]): Promise<any>;
  saveExecution(
    scriptId: string,
    code: string,
    status: string,
    executionTimeMs: number,
    output?: string,
    error?: string,
    agentId?: string
  ): Promise<void>;
}
```

## Database Schema

The adapter expects this table for execution logging:

```sql
CREATE TABLE "HoloScriptExecution" (
  id TEXT PRIMARY KEY,
  "scriptId" TEXT NOT NULL,
  script TEXT NOT NULL,
  status TEXT NOT NULL,
  "executionTimeMs" INTEGER NOT NULL,
  output TEXT,
  errors TEXT,
  "createdByAgent" TEXT NOT NULL DEFAULT 'system',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recommended indexes
CREATE INDEX idx_holoscript_execution_script_id ON "HoloScriptExecution"("scriptId");
CREATE INDEX idx_holoscript_execution_created_at ON "HoloScriptExecution"("createdAt");
CREATE INDEX idx_holoscript_execution_agent ON "HoloScriptExecution"("createdByAgent");
```

## Connection Pooling

The adapter uses a singleton connection pool via `PostgresPool`:

- Connections are automatically managed and reused
- Pool size defaults to PostgreSQL driver defaults (10 connections)
- Idle connections are cleaned up automatically

## Error Handling

Execution logging errors are caught and logged but don't throw:

```typescript
// This won't crash your runtime even if database is down
await adapter.saveExecution(...); // Logs error to console, continues
```

For critical queries, wrap in try/catch:

```typescript
try {
  const results = await adapter.query('SELECT ...');
} catch (error) {
  console.error('Query failed:', error);
}
```

## Testing

```bash
pnpm test
```

Tests use mocked PostgreSQL connections (no database required).

## License

MIT - see [LICENSE](../../LICENSE)

## Related Packages

- [`@holoscript/core`](../core) - Core parser and AST
- [`@holoscript/runtime`](../runtime) - HoloScript execution runtime
- [`@holoscript/runtime-web`](../runtime-web) - Browser runtime
