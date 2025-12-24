// src/pages/auth/google/index.ts
import type { APIRoute } from 'astro';
import type { Env } from '../../../env.d';
import { createGoogleOAuth } from '../../../lib/auth/oauth';
import { generateState, generateCodeVerifier } from 'arctic';

export const GET: APIRoute = async ({ request, locals, redirect, cookies }) => {
  const env = (locals.runtime?.env || import.meta.env) as unknown as Env;

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    console.error('[OAuth] Missing Google OAuth credentials');
    console.error('[OAuth] GOOGLE_CLIENT_ID:', env.GOOGLE_CLIENT_ID ? 'Set' : 'Missing');
    console.error('[OAuth] GOOGLE_CLIENT_SECRET:', env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Missing');
    return new Response('Google OAuth not configured', { status: 500 });
  }

  try {
    const google = createGoogleOAuth(env, request.url);
    const state = generateState();
    const codeVerifier = generateCodeVerifier();

    const url = await google.createAuthorizationURL(state, codeVerifier, ['email', 'profile']);

    // Store state and code verifier in cookies (10 min expiry)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    cookies.set('oauth_state', state, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    cookies.set('oauth_code_verifier', codeVerifier, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    return redirect(url.toString(), 302);
  } catch (error) {
    console.error('[OAuth] Error creating authorization URL:', error);
    return redirect('/login?error=oauth_init_failed', 302);
  }
};

