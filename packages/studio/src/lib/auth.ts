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

function buildProviders() {
  const providers: NextAuthOptions['providers'] = [];

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        authorization: { params: { scope: 'repo read:user user:email read:org' } },
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
      strategy: db ? 'database' : 'jwt',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    callbacks: {
      async session({ session, user, token }) {
        if (session.user) {
          // Database sessions have user object, JWT sessions have token
          session.user.id = user?.id ?? token?.sub ?? '';
        }
        return session;
      },
    },
    pages: {
      signIn: '/auth/signin',
    },
  };

  // Only use Drizzle adapter when database is available
  if (db) {
    options.adapter = DrizzleAdapter(db) as NextAuthOptions['adapter'];
  }

  return options;
}

export const authOptions = buildAuthOptions();
