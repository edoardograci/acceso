// src/lib/auth/oauth.ts
import { Google } from 'arctic';
import type { Env } from '../../env.d';

export function createGoogleOAuth(env: Env, requestUrl?: string) {
  let siteUrl = env.PUBLIC_SITE_URL || 'http://localhost:4321';
  if (requestUrl) {
    const url = new URL(requestUrl);
    // Force HTTPS if not localhost/127.0.0.1 to handle proxy/SSL termination
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const protocol = isLocalhost ? url.protocol : 'https:';
    siteUrl = `${protocol}//${url.host}`;
  }
  return new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${siteUrl}/auth/google/callback`
  );
}

