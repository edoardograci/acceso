import type { MiddlewareHandler } from 'astro';
import { createLucia } from './lib/auth/lucia';
import { verifySessionJWT, createSessionJWT } from './lib/auth/jwt';
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
    const jwtToken = cookies.get('auth_token')?.value;

    // Step 1: Quick JWT check for session ID hint
    let sessionId: string | null = null;

    if (jwtToken) {
      const payload = await verifySessionJWT(jwtToken, env);
      if (payload) {
        sessionId = payload.sessionId;
      }
    }

    // If no JWT or invalid, try regular cookie
    if (!sessionId) {
      sessionId = cookies.get(lucia.sessionCookieName)?.value || null;
    }

    // Step 2: ALWAYS validate with database (but with cache hints)
    if (sessionId) {
      const { session, user } = await lucia.validateSession(sessionId);

      if (session && session.fresh) {
        const sessionCookie = lucia.createSessionCookie(session.id);
        cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
      }

      if (!session) {
        // Session invalid - clear everything
        const blankCookie = lucia.createBlankSessionCookie();
        cookies.set(blankCookie.name, blankCookie.value, blankCookie.attributes);
        cookies.delete('auth_token', { path: '/' });
        locals.user = null;
        locals.session = null;
      } else if (user) {
        locals.user = {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
        };
        locals.session = {
          id: session.id,
          expiresAt: session.expiresAt,
        };

        // Issue/refresh JWT only if we don't have one or it was invalid
        const validJwt = jwtToken ? await verifySessionJWT(jwtToken, env) : null;
        if (!validJwt) {
          const token = await createSessionJWT({
            userId: user.id,
            sessionId: session.id
          }, env);
          cookies.set('auth_token', token, {
            path: '/',
            secure: import.meta.env.PROD,
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 60 * 15 // 15 minutes
          });
        }
      }
    }
  } catch (error) {
    console.error('[Middleware] Error validating session:', error);
    locals.user = null;
    locals.session = null;
  }

  // Protect /collections routes
  if (context.url.pathname.startsWith('/collections') && !locals.user) {
    return context.redirect('/login');
  }

  return next();
};