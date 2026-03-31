import { defineMiddleware } from 'astro:middleware';
import { verifyRequestOrigin } from 'lucia';
import { createLucia } from './lib/auth/lucia';
import type { Env } from './env.d';

// Session cache TTL (for Cache API)
const SESSION_CACHE_TTL = 300; // 5 minutes in seconds

// Paths that NEVER need auth checks
const STATIC_PATHS = [
  '/favicon.ico',
  '/robots.txt',
  '/sitemap',
  '/manifest.webmanifest',
  '/_image',
  '/fonts/',
  '/images/',
  '/icons/',
  '/js/',
  '/css/',
  '/_astro/',
  '/sw.js',
  '/test-studios.json',
  '/metadata.json',
  '/test-cities.json',
  '/test-countries.json',
  '/moodboard.json',
  '/spotlight.json',
  '/studios-metadata.json',
  '/moodboard-metadata.json',
  '/spotlight-metadata.json',
  '/moodboard-enrichment.json',
  '/enrichment-metadata.json'
];


function shouldSkipAuth(pathname: string): boolean {
  // Skip all static resources
  if (STATIC_PATHS.some(path => pathname.startsWith(path))) {
    return true;
  }
  return false;
}

export const onRequest = defineMiddleware(async ({ locals, cookies, request, url }, next) => {
  const pathname = url.pathname;

  // Early return for static resources and public pages
  if (shouldSkipAuth(pathname)) {
    locals.user = null;
    locals.session = null;
    const res = await next();
    res.headers.set(
      'Permissions-Policy',
      'browsing-topics=(), interest-cohort=()'
    );
    return res;
  }

  // CSRF protection for non-GET requests
  if (request.method !== 'GET') {
    const originHeader = request.headers.get('Origin');
    const hostHeader = request.headers.get('Host');
    
    // In production, ensure origin matches host
    if (import.meta.env.PROD && (!originHeader || !hostHeader || !verifyRequestOrigin(originHeader, [hostHeader]))) {
      return new Response('Invalid origin: CSRF protection triggered.', { status: 403 });
    }
  }

  const runtimeEnv = locals.runtime?.env || {};
  const metaEnv = import.meta.env || {};
  const env = { ...metaEnv, ...runtimeEnv } as unknown as Env;


  let lucia;

  try {
    lucia = createLucia(env);
  } catch (e) {
    console.error('[Auth] Failed to create Lucia instance:', e);
    locals.user = null;
    locals.session = null;
    return next();
  }

  const sessionId = cookies.get(lucia.sessionCookieName)?.value ?? null;

  if (!sessionId) {
    locals.user = null;
    locals.session = null;
    return next();
  }

  // Standard Cache API implementation
  const cache = (locals.runtime as any)?.caches?.default;
  const cacheKey = new URL(`http://session.cache/${sessionId}`); // Internal-only cache key
  let cachedResponse = null;

  if (cache) {
    cachedResponse = await cache.match(cacheKey);
  }

  if (cachedResponse) {
    const data = await cachedResponse.json() as { user: any, session: any };
    locals.session = data.session;
    locals.user = data.user;
    return next();
  }

  // Validate session from database (Turso)
  try {
    const { session, user } = await lucia.validateSession(sessionId);

    if (session) {
      // Store in Cache API if available
      if (cache) {
        const cacheData = JSON.stringify({ user, session });
        const response = new Response(cacheData, {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': `private, max-age=${SESSION_CACHE_TTL}`
            }
        });
        await cache.put(cacheKey, response);
      }

      // Only update cookie if session is fresh (extends lifetime)
      if (session.fresh) {
        try {
          const sessionCookie = lucia.createSessionCookie(session.id);
          cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
        } catch (error) {
          console.error('[Auth] Failed to set session cookie:', error);
        }
      }
    } else {
      // Invalid session - clear cookie
      try {
        const blankCookie = lucia.createBlankSessionCookie();
        cookies.set(blankCookie.name, blankCookie.value, blankCookie.attributes);
        cookies.delete('auth_token', { path: '/' });
      } catch (error) {
        console.error('[Auth] Failed to clear session cookie:', error);
      }
    }

    locals.session = session;
    locals.user = user;
  } catch (error) {
    console.error('[Auth] Session validation error:', error);
    locals.session = null;
    locals.user = null;
  }

  const res = await next();
  res.headers.set(
    'Permissions-Policy',
    'browsing-topics=(), interest-cohort=()'
  );
  return res;
});
