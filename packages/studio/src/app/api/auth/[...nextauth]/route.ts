export const maxDuration = 300;

/**
 * NextAuth.js API route handler.
 *
 * Handles /api/auth/signin, /api/auth/signout, /api/auth/callback/*,
 * /api/auth/session, /api/auth/csrf, /api/auth/providers
 */

import NextAuth from 'next-auth';
import { authOptions } from '../../../../lib/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };


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
