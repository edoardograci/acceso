// src/lib/auth/oauth.ts
import { Google } from 'arctic';
import type { Env } from '../../env.d';

export function createGoogleOAuth(env: Env) {
  return new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.PUBLIC_SITE_URL}/auth/google/callback`
  );
}

