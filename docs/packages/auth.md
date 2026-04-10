# Authentication & Authorization

**Role-based access control (RBAC) and security policies for HoloScript environments.** Integrates with OAuth2, WebAuthn, and custom auth providers.

## Overview

The Auth package provides enterprise-grade authentication for HoloScript applications, supporting both client-side (browser) and server-side authentication flows.

## Installation

```bash
npm install @holoscript/auth
```

## Quick Start

### Browser Authentication

```typescript
import { HoloAuth } from '@holoscript/auth';

const auth = new HoloAuth({
  provider: 'oauth2',
  clientId: process.env.HOLOSCRIPT_CLIENT_ID,
  redirectUri: window.location.origin,
});

// Login
const user = await auth.login();
console.log(user.id); // User UUID
console.log(user.roles); // ['designer', 'viewer']
console.log(user.token); // JWT access token

// Check permission
const canEdit = auth.hasRole('designer');
const canPublish = auth.hasPermission('publish:scene');
```

### Server-Side Authentication

```typescript
import { HoloAuthServer } from '@holoscript/auth';

const auth = new HoloAuthServer({
  provider: 'oauth2',
  clientSecret: process.env.HOLOSCRIPT_CLIENT_SECRET,
  tokenExpiry: 3600, // 1 hour
  refreshTokenExpiry: 604800, // 7 days
});

// Verify token
const decoded = await auth.verify(token);
console.log(decoded.userId);
console.log(decoded.scopes);

// Check authorization
const authorized = auth.authorize('publish:marketplace', decoded);
```

## Role-Based Access Control (RBAC)

### Define Roles

```typescript
const roles = {
  viewer: {
    permissions: ['read:scene', 'preview:scene'],
  },
  designer: {
    permissions: ['read:scene', 'write:scene', 'delete:scene', 'preview:scene', 'export:scene'],
  },
  admin: {
    permissions: ['*'], // All permissions
  },
};

auth.defineRoles(roles);
```

### Assign Roles to Users

```typescript
await auth.assignRole(userId, 'designer');
await auth.removeRole(userId, 'designer');
await auth.setRoles(userId, ['designer', 'viewer']);

// Check roles
const userRoles = await auth.getRoles(userId);
console.log(userRoles); // ['designer']
```

## OAuth2 Integration

### Configure Provider

```typescript
const auth = new HoloAuth({
  provider: 'oauth2',
  endpoints: {
    authorize: 'https://auth.example.com/oauth/authorize',
    token: 'https://auth.example.com/oauth/token',
    userinfo: 'https://auth.example.com/oauth/userinfo',
  },
  clientId: 'holo-app-client',
  clientSecret: process.env.OAUTH_CLIENT_SECRET,
  scopes: ['profile', 'email', 'holoscript:read', 'holoscript:write'],
});
```

### Handle OAuth Flow

```typescript
// Start login
const authUrl = auth.getAuthorizationUrl();
window.location.href = authUrl;

// Handle callback
const params = new URLSearchParams(window.location.search);
const code = params.get('code');
const user = await auth.handleCallback(code);
```

## WebAuthn (Passwordless)

### Register Credential

```typescript
const credential = await auth.registerWebAuthn({
  userId: user.id,
  challenge: auth.generateChallenge(),
  userDisplayName: user.email,
});

// Store credential
await auth.storeCredential(user.id, credential);
```

### Authenticate with WebAuthn

```typescript
const assertion = await auth.authenticateWebAuthn({
  challenge: auth.generateChallenge(),
});

const user = await auth.verifyAssertion(assertion);
console.log(user.authenticated); // true
```

## JWT Tokens

### Create Token

```typescript
const token = auth.createToken({
  userId: user.id,
  roles: user.roles,
  permissions: user.permissions,
  expiresIn: 3600, // 1 hour
});
```

### Verify Token

```typescript
const decoded = auth.verifyToken(token);
console.log(decoded.userId);
console.log(decoded.iat); // Issued at
console.log(decoded.exp); // Expiration
```

## Authorization Middleware

```typescript
// Express example
import { authMiddleware } from '@holoscript/auth';

app.use(
  authMiddleware({
    tokenLocation: 'header', // 'header', 'cookie', or 'query'
    tokenName: 'Authorization',
    secret: process.env.JWT_SECRET,
  })
);

// Require specific role
app.post('/api/scenes', requireRole('designer'), (req, res) => {
  // Handle scene creation
  res.json({ created: true });
});

// Require specific permission
app.delete('/api/scenes/:id', requirePermission('delete:scene'), (req, res) => {
  // Handle scene deletion
});
```

## Permission Strings

### Format

```
resource:action
environment:resource:action
```

### Examples

```
read:scene              // Read scenes
write:scene             // Modify scenes
export:marketplace      // Export to marketplace
publish:scene           // Publish scene
manage:users            // User management
```

## Custom Claims

```typescript
const token = auth.createToken({
  userId: user.id,
  customClaims: {
    department: 'design',
    team: 'vr-games',
    license: 'professional',
  },
});

// Access custom claims
const decoded = auth.verifyToken(token);
console.log(decoded.department); // 'design'
```

## Environment Variables

```bash
# OAuth2
HOLOSCRIPT_CLIENT_ID=***
HOLOSCRIPT_CLIENT_SECRET=***
HOLOSCRIPT_REDIRECT_URI=http://localhost:3000/callback

# JWT
JWT_SECRET=***
JWT_EXPIRY=3600

# WebAuthn
WEBAUTHN_RP_ID=example.com
WEBAUTHN_ORIGIN=https://example.com

# Providers
AUTH_PROVIDER=oauth2  # or 'custom'
```

## Error Handling

```typescript
try {
  const user = await auth.login();
} catch (error) {
  if (error.code === 'AUTH_UNAUTHORIZED') {
    console.error('Invalid credentials');
  } else if (error.code === 'AUTH_EXPIRED') {
    // Refresh token
    const newToken = await auth.refresh();
  } else if (error.code === 'AUTH_FORBIDDEN') {
    console.error('Insufficient permissions');
  }
}
```

## Security Best Practices

1. **Always use HTTPS** — Never transmit tokens over HTTP
2. **Store tokens securely** — Use httpOnly cookies or secure storage
3. **Validate tokens server-side** — Don't rely on client-side checks
4. **Use short expiry times** — 1 hour access, 7 day refresh
5. **Rotate secrets regularly** — Especially JWT_SECRET
6. **Implement rate limiting** — Prevent brute-force attacks
7. **Audit access logs** — Track who accessed what, when

## See Also

- [Partner SDK](../packages/partner-sdk.md) — Webhooks and API key management
- [Security Sandbox](../packages/security-sandbox.md) — Isolated execution environment
- [MCP Server](../packages/mcp-server.md) — Authenticated MCP server setup
