# @holoscript/auth

> Shared JWT authentication library for HoloScript APIs (GraphQL + Marketplace).

## Overview

Provides JWT-based authentication middleware and utilities shared across HoloScript API services including the GraphQL API and Marketplace.

## Usage

```typescript
import { verifyToken, createToken, authMiddleware } from '@holoscript/auth';

// Create a JWT
const token = createToken({ userId: 'user-123', role: 'developer' });

// Verify a JWT
const payload = verifyToken(token);

// Express middleware
app.use('/api', authMiddleware());
```

## Configuration

Set via environment variables:

```bash
SECURITY_JWT_SECRET=your-secret-key
SECURITY_JWT_EXPIRES_IN=24h
SECURITY_BCRYPT_ROUNDS=10
```

## Related

- [`@holoscript/graphql-api`](../graphql-api/) — GraphQL API using this auth
- [`@holoscript/marketplace-api`](../marketplace-api/) — Marketplace API

## License

MIT
