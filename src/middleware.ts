import type { MiddlewareHandler } from 'astro';
import { createLucia } from './lib/auth/lucia';
import type { Env } from './env.d';

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { locals, cookies } = context;

  // Initialize user and session as null
  locals.user = null;
  locals.session = null;

  const env = (locals.runtime?.env || import.meta.env) as unknown as Env;

  // Check if we have minimal configuration
  if (!env?.TURSO_DATABASE_URL || !env?.TURSO_AUTH_TOKEN) {
    console.warn('[Middleware] Auth environment variables missing');
    return next();
  }

  try {
    const lucia = createLucia(env);
    const sessionId = cookies.get(lucia.sessionCookieName)?.value;

    if (!sessionId) {
      locals.user = null;
      locals.session = null;
      return next();
    }

    const { session, user } = await lucia.validateSession(sessionId);

    if (session && session.fresh) {
      // Refresh session cookie
      const sessionCookie = lucia.createSessionCookie(session.id);
      cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
    }

    if (!session) {
      // Invalid session - clear cookie
      const blankCookie = lucia.createBlankSessionCookie();
      cookies.set(blankCookie.name, blankCookie.value, blankCookie.attributes);
      locals.user = null;
      locals.session = null;
    } else if (user) {
      // Set user and session in locals only if user exists
      locals.user = {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
      };
      locals.session = {
        id: session.id,
        expiresAt: session.expiresAt,
      };
    }
  } catch (error) {
    console.error('[Middleware] Error validating session:', error);
    locals.user = null;
    locals.session = null;
  }

  return next();
};