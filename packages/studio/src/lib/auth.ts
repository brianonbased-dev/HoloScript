/**
 * NextAuth.js configuration for HoloScript Studio.
 *
 * Provides GitHub + Google OAuth with Drizzle adapter for PostgreSQL persistence.
 * Falls back to JWT-only sessions when DATABASE_URL is not configured (local dev).
 */

import type { NextAuthOptions } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { getDb } from '../db/client';
import {
  users as usersTable,
  accounts as accountsTable,
  sessions as sessionsTable,
  verificationTokens as verificationTokensTable,
} from '../db/schema';
import { GITHUB_OAUTH_SCOPES, resolveGitHubOAuthConfig } from './github-oauth-config';

/* ------------------------------------------------------------------ */
/* Type augmentations — extend NextAuth Session & JWT with our fields  */
/* ------------------------------------------------------------------ */
declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    githubConnected?: boolean;
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      githubUsername?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    provider?: string;
    githubUsername?: string;
  }
}

function buildProviders() {
  const providers: NextAuthOptions['providers'] = [];
  const githubOAuth = resolveGitHubOAuthConfig();

  if (githubOAuth.clientId && githubOAuth.clientSecret) {
    providers.push(
      GitHubProvider({
        clientId: githubOAuth.clientId,
        clientSecret: githubOAuth.clientSecret,
        authorization: { params: { scope: GITHUB_OAUTH_SCOPES } },
      })
    );
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    );
  }

  // Dev-only credentials provider when no OAuth is configured
  if (providers.length === 0 && process.env.NODE_ENV === 'development') {
    providers.push(
      CredentialsProvider({
        name: 'Dev Login',
        credentials: {
          email: { label: 'Email', type: 'email', placeholder: 'dev@holoscript.dev' },
        },
        async authorize(credentials) {
          if (!credentials?.email) return null;
          return {
            id: 'dev-user-1',
            email: credentials.email,
            name: 'Dev User',
            image: null,
          };
        },
      })
    );
  }

  return providers;
}

type DrizzleDb = NonNullable<ReturnType<typeof getDb>>;

/**
 * A stand-in for the Drizzle adapter that builds the real one the first time a
 * property is read. See the comment at the call site for why this is not eager.
 */
function createLazyDrizzleAdapter(db: DrizzleDb): NextAuthOptions['adapter'] {
  let real: ReturnType<typeof DrizzleAdapter> | null = null;
  const resolve = () => {
    if (!real) {
      real = DrizzleAdapter(db, {
        usersTable,
        accountsTable,
        sessionsTable,
        verificationTokensTable,
      });
    }
    return real;
  };

  return new Proxy(
    {},
    {
      get(_target, property, receiver) {
        return Reflect.get(resolve() as object, property, receiver);
      },
      has(_target, property) {
        return Reflect.has(resolve() as object, property);
      },
      ownKeys() {
        return Reflect.ownKeys(resolve() as object);
      },
      getOwnPropertyDescriptor(_target, property) {
        const descriptor = Reflect.getOwnPropertyDescriptor(resolve() as object, property);
        if (descriptor) descriptor.configurable = true;
        return descriptor;
      },
    }
  ) as NextAuthOptions['adapter'];
}

export function buildAuthOptions(): NextAuthOptions {
  const db = getDb();

  const options: NextAuthOptions = {
    providers: buildProviders(),
    session: {
      strategy: 'jwt',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    callbacks: {
      async jwt({ token, account, profile }) {
        // On initial sign-in, account contains the OAuth tokens
        if (account) {
          token.accessToken = account.access_token;
          token.provider = account.provider;
        }
        // Persist GitHub username in JWT for admin bypass
        if (profile && 'login' in profile) {
          token.githubUsername = (profile as { login: string }).login;
        }
        return token;
      },
      async session({ session, user, token }) {
        if (session.user) {
          // Database sessions have user object, JWT sessions have token
          session.user.id = user?.id ?? token?.sub ?? '';
          // Expose GitHub username for admin checks
          session.user.githubUsername =
            token?.githubUsername ??
            ((user as unknown as Record<string, unknown>)?.githubUsername as string | undefined) ??
            '';
        }
        session.accessToken = token?.accessToken;
        session.githubConnected = token?.provider === 'github';
        return session;
      },
    },
    pages: {
      signIn: '/auth/signin',
    },
  };

  // Only use Drizzle adapter when database is available.
  // Pass our explicit Drizzle tables — without this the adapter generates SQL
  // against its DEFAULT singular table names (`user`/`account`/`session`) with
  // camelCase columns, but our schema/migration use plural snake_case tables
  // (`users`/`accounts`/`sessions`/`verification_tokens`). The mismatch made
  // every OAuth sign-in fail with `adapter_error_getUserByAccount` →
  // `OAUTH_CALLBACK_HANDLER_ERROR` (NextAuth `error=Callback`).
  // Built on FIRST USE, not at import. `authOptions` is module-scope, so an
  // eager DrizzleAdapter(db) ran the moment ANYTHING imported this file —
  // including a route importing `requireAuth`, including a test that had
  // substituted its own `getDb`. The adapter then threw while the module was
  // still being evaluated, so the whole importing suite collected ZERO tests
  // and reported as a file that simply had nothing in it. Measured 2026-09-15:
  // src/lib/__tests__/premium-exits.test.ts is 9/9 on origin/main and collects
  // 0 the moment a gated route enters its import graph.
  //
  // NextAuth only touches `adapter` when it actually serves a request, so
  // deferring construction to first property access changes nothing at runtime
  // and stops import-time explosions.
  if (db) {
    options.adapter = createLazyDrizzleAdapter(db);
  }

  return options;
}

export const authOptions = buildAuthOptions();
