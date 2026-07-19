// src/pages/auth/google/callback.ts
import type { APIRoute } from 'astro';
import { createGoogleOAuth } from '../../../lib/auth/oauth';
import { createLucia } from '../../../lib/auth/lucia';
import { TursoHttpClient } from '../../../lib/turso';
import { notifyNewUser } from '../../../lib/notify-new-user';
import type { Env } from '../../../env.d';
import { OAuth2RequestError } from 'arctic';

export const GET: APIRoute = async ({ request, locals, redirect, cookies }) => {
  const runtimeEnv = locals.runtime?.env || {};
  const metaEnv = import.meta.env || {};
  const env = { ...metaEnv, ...runtimeEnv } as unknown as Env;
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
    const accessToken = tokens.accessToken();

    if (!accessToken) {
      throw new Error('No access token returned from Google');
    }



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
    // Only trust email-based identity when provider asserts verification
    if (!googleUser.email_verified) {
      return redirect('/login?error=email_not_verified', 302);
    }

    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);

    // Optimized: Check for BOTH OAuth account AND User Email in a single query
    let userId: string | null = null;
    let isNewUser = false;
    let needsLink = false;

    try {
      // Keep DB reads minimal (single query), but avoid caching auth-critical identity resolution.
      const combinedResult = await turso.execute({
        sql: `
          SELECT 'oauth' as source, user_id FROM oauth_accounts WHERE provider = 'google' AND provider_user_id = ?
          UNION ALL
          SELECT 'user' as source, id as user_id FROM users WHERE email = ?
          LIMIT 2
        `,
        args: [googleUser.sub, googleUser.email],
      });

      const rows = combinedResult.rows as Array<{ source: string; user_id: string }>;
      const oauthMatch = rows.find(r => r.source === 'oauth');
      const emailMatch = rows.find(r => r.source === 'user');

      if (oauthMatch) {
        userId = oauthMatch.user_id;
      } else if (emailMatch) {
        userId = emailMatch.user_id;
        needsLink = true;
      } else {
        isNewUser = true;
        userId = crypto.randomUUID();
      }
    } catch (e) {
      console.error('[OAuth] Turso combined check failed:', e);
      throw new Error(`Turso check failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!userId) {
      throw new Error('Failed to resolve user ID');
    }

    const now = Math.floor(Date.now() / 1000);

    if (isNewUser) {
      // Create new user AND OAuth account in separate queries but logically one flow
      // We could even pipeline these!
      await turso.execute({
        sql: 'INSERT INTO users (id, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        args: [userId, googleUser.email, googleUser.email_verified ? 1 : 0, now, now],
      });
      await turso.execute({
        sql: 'INSERT INTO oauth_accounts (provider, provider_user_id, user_id, created_at) VALUES (?, ?, ?, ?)',
        args: ['google', googleUser.sub, userId, now],
      });
    } else {
      // Update email verification status
      await turso.execute({
        sql: 'UPDATE users SET email_verified = ?, updated_at = ? WHERE id = ?',
        args: [googleUser.email_verified ? 1 : 0, now, userId],
      });

      if (needsLink) {
        // Link existing email user to Google account
        await turso.execute({
          sql: 'INSERT INTO oauth_accounts (provider, provider_user_id, user_id, created_at) VALUES (?, ?, ?, ?)',
          args: ['google', googleUser.sub, userId, now],
        });
      }
    }

    // Create session
    const lucia = createLucia(env);
    const session = await lucia.createSession(userId, {});
    const sessionCookie = lucia.createSessionCookie(session.id);

    // Notify team of a new registration
    if (isNewUser) {
      await notifyNewUser(googleUser.email, 'google', env);
    }

    // Set session cookie
    cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

    // Clear OAuth cookies
    cookies.delete('oauth_state', { path: '/' });
    cookies.delete('oauth_code_verifier', { path: '/' });

    return redirect('/profile', 302);
  } catch (error) {
    console.error('[OAuth] Error in callback:', error);

    if (error instanceof OAuth2RequestError) {
      return redirect(`/login?error=oauth_error&message=${encodeURIComponent(error.message)}`, 302);
    }

    return redirect(`/login?error=oauth_failed&message=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`, 302);
  }
};

