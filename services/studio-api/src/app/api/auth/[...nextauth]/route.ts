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
