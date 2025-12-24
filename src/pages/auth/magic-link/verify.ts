// src/pages/auth/magic-link/verify.ts
import type { APIRoute } from 'astro';
import { validateMagicLinkToken, deleteMagicLinkToken } from '../../../lib/auth/magic-link';
import { createLucia } from '../../../lib/auth/lucia';
import { TursoHttpClient } from '../../../lib/auth/lucia';

import type { Env } from '../../../env.d';

export const GET: APIRoute = async ({ request, locals, redirect, cookies }) => {
  const env = (locals.runtime?.env || import.meta.env) as unknown as Env;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return redirect('/login?error=no_token', 302);
  }

  try {
    const tokenData = await validateMagicLinkToken(token, env);

    if (!tokenData) {
      return redirect('/login?error=invalid_token', 302);
    }

    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);

    // Mark email as verified
    await turso.execute({
      sql: 'UPDATE users SET email_verified = ?, updated_at = ? WHERE id = ?',
      args: [1, Math.floor(Date.now() / 1000), tokenData.userId],
    });

    // Delete token
    await deleteMagicLinkToken(token, env);

    // Create session
    const lucia = createLucia(env);
    const session = await lucia.createSession(tokenData.userId, {});
    const sessionCookie = lucia.createSessionCookie(session.id);

    cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

    return redirect('/dashboard', 302);
  } catch (error) {
    console.error('[Magic Link] Error verifying token:', error);
    return redirect('/login?error=verification_failed', 302);
  }
};

