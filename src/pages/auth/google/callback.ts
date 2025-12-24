// src/pages/auth/google/callback.ts
import type { APIRoute } from 'astro';
import { createGoogleOAuth } from '../../../lib/auth/oauth';
import { createLucia } from '../../../lib/auth/lucia';
import { TursoHttpClient } from '../../../lib/auth/lucia';
import type { Env } from '../../../env.d';
import { OAuth2RequestError } from 'arctic';

export const GET: APIRoute = async ({ request, locals, redirect, cookies }) => {
  const env = (locals.runtime?.env || import.meta.env) as unknown as Env;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const storedState = cookies.get('oauth_state')?.value;
  const codeVerifier = cookies.get('oauth_code_verifier')?.value;

  if (!code || !state || !storedState || state !== storedState || !codeVerifier) {
    return redirect('/login?error=invalid_state', 302);
  }

  try {
    const google = createGoogleOAuth(env, request.url);
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    const accessToken = tokens.accessToken;

    console.log('[OAuth] Access Token length:', accessToken?.length);
    console.log('[OAuth] Turso Token length:', env.TURSO_AUTH_TOKEN?.length);

    // Fetch user info from Google
    let userResponse;
    try {
      userResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (e) {
      console.error('[OAuth] Failed to fetch user info:', e);
      throw new Error(`Google UserInfo fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!userResponse.ok) {
      const text = await userResponse.text();
      console.error('[OAuth] Google UserInfo error:', userResponse.status, text);
      throw new Error(`Failed to fetch user info from Google: ${userResponse.status}`);
    }

    const googleUser: { email: string; email_verified: boolean; sub: string; name?: string } = await userResponse.json();

    if (!googleUser.email) {
      return redirect('/login?error=no_email', 302);
    }

    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);

    // Check if OAuth account exists
    let oauthResult;
    try {
      oauthResult = await turso.execute({
        sql: 'SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ? LIMIT 1',
        args: ['google', googleUser.sub],
      });
    } catch (e) {
      console.error('[OAuth] Turso check failed:', e);
      throw new Error(`Turso check failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    let userId: string;

    if (oauthResult.rows.length > 0) {
      // Existing user
      userId = oauthResult.rows[0].user_id;

      // Update email verification status if needed
      await turso.execute({
        sql: 'UPDATE users SET email_verified = ?, updated_at = ? WHERE id = ?',
        args: [googleUser.email_verified ? 1 : 0, Math.floor(Date.now() / 1000), userId],
      });
    } else {
      // Check if user with email exists
      const userResult = await turso.execute({
        sql: 'SELECT id FROM users WHERE email = ? LIMIT 1',
        args: [googleUser.email],
      });

      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id;
      } else {
        // Create new user
        userId = crypto.randomUUID();
        const now = Math.floor(Date.now() / 1000);
        await turso.execute({
          sql: 'INSERT INTO users (id, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          args: [userId, googleUser.email, googleUser.email_verified ? 1 : 0, now, now],
        });
      }

      // Create OAuth account
      await turso.execute({
        sql: 'INSERT INTO oauth_accounts (provider, provider_user_id, user_id, created_at) VALUES (?, ?, ?, ?)',
        args: ['google', googleUser.sub, userId, Math.floor(Date.now() / 1000)],
      });
    }

    // Create session
    const lucia = createLucia(env);
    const session = await lucia.createSession(userId, {});
    const sessionCookie = lucia.createSessionCookie(session.id);

    // Set session cookie
    cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

    // Clear OAuth cookies
    cookies.delete('oauth_state', { path: '/' });
    cookies.delete('oauth_code_verifier', { path: '/' });

    return redirect('/dashboard', 302);
  } catch (error) {
    console.error('[OAuth] Error in callback:', error);

    if (error instanceof OAuth2RequestError) {
      return redirect(`/login?error=oauth_error&message=${encodeURIComponent(error.message)}`, 302);
    }

    return redirect(`/login?error=oauth_failed&message=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`, 302);
  }
};

