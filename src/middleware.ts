// src/middleware.ts
import type { MiddlewareHandler } from 'astro';
import { createLucia } from './lib/auth/lucia';

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { locals, cookies } = context;
  const env = locals.runtime.env;

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
    } else {
      locals.user = {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified, // Fixed: use camelCase from Lucia adapter
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