// src/lib/auth/oauth.ts
import { Google } from 'arctic';
import type { Env } from '../../env.d';

export function createGoogleOAuth(env: Env) {
  const siteUrl = env.PUBLIC_SITE_URL || 'http://localhost:4321';
  return new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${siteUrl}/auth/google/callback`
  );
}

