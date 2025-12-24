// src/lib/auth/oauth.ts
import { Google } from 'arctic';
import type { Env } from '../../env.d';

export function createGoogleOAuth(env: Env, requestUrl?: string) {
  let siteUrl = env.PUBLIC_SITE_URL || 'http://localhost:4321';
  if (requestUrl) {
    const url = new URL(requestUrl);
    siteUrl = `${url.protocol}//${url.host}`;
  }
  return new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${siteUrl}/auth/google/callback`
  );
}

