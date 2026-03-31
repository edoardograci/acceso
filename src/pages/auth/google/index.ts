// src/pages/auth/google/index.ts
import type { APIRoute } from 'astro';
import type { Env } from '../../../env.d';
import { createGoogleOAuth } from '../../../lib/auth/oauth';
import { generateState, generateCodeVerifier } from 'arctic';

export const GET: APIRoute = async ({ request, locals, redirect, cookies }) => {
  const runtimeEnv = locals.runtime?.env || {};
  const metaEnv = import.meta.env || {};
  const env = { ...metaEnv, ...runtimeEnv } as unknown as Env;

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

    // Set state cookie
    cookies.set('oauth_state', state, {
      path: '/',
      maxAge: 600, // 10 minutes - prevents state reuse
      secure: request.url.startsWith('https'),
      httpOnly: true,
      sameSite: 'lax',
    });

    // Set code verifier cookie
    cookies.set('oauth_code_verifier', codeVerifier, {
      path: '/',
      maxAge: 600, // 10 minutes
      secure: request.url.startsWith('https'),
      httpOnly: true,
      sameSite: 'lax',
    });

    return redirect(url.toString(), 302);
  } catch (error) {
    console.error('[OAuth] Error creating authorization URL:', error);
    return redirect('/login?error=oauth_init_failed', 302);
  }
};

