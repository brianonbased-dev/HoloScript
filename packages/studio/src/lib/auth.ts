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
      /** The OAuth provider this session signed in through. */
      provider?: string;
      /** The provider's own immutable account id: GitHub's numeric id, Google's `sub`. */
      providerAccountId?: string;
      /** True only when the provider asserted that this email address is verified. */
      emailVerified?: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    provider?: string;
    providerAccountId?: string;
    emailVerified?: boolean;
    githubUsername?: string;
  }
}

/**
 * True only when the provider itself said this email address is verified.
 * Google sends the `email_verified` claim. GitHub sends no such claim — a
 * GitHub profile email can be an unverified public address — so a GitHub
 * session is recognised by its numeric account id instead.
 */
function providerAssertsVerifiedEmail(profile: unknown): boolean {
  if (!profile || typeof profile !== 'object') return false;
  const claim = (profile as Record<string, unknown>)['email_verified'];
  return claim === true || claim === 'true';
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
          // The provider's own account id — GitHub's numeric id, Google's `sub`.
          // Immutable and never reissued, so founder recognition can rely on it
          // where a display name or an unverified email proves nothing.
          token.providerAccountId = account.providerAccountId;
        }
        // Persist GitHub username in JWT for admin bypass
        if (profile && 'login' in profile) {
          token.githubUsername = (profile as { login: string }).login;
        }
        if (profile) {
          token.emailVerified = providerAssertsVerifiedEmail(profile);
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
          // The identity fields founder recognition is allowed to read. The
          // display NAME is deliberately not one of them: whoever signs in
          // chooses it freely, so it is presentation, never authority.
          session.user.provider = token?.provider ?? '';
          session.user.providerAccountId = token?.providerAccountId ?? '';
          session.user.emailVerified = token?.emailVerified === true;
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
  if (db) {
    options.adapter = DrizzleAdapter(db, {
      usersTable,
      accountsTable,
      sessionsTable,
      verificationTokensTable,
    }) as NextAuthOptions['adapter'];
  }

  return options;
}

export const authOptions = buildAuthOptions();
