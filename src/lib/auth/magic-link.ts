// src/lib/auth/magic-link.ts
import { TursoHttpClient } from './lucia';
import type { Env } from '../../env.d';

export async function generateMagicLink(email: string, env: Env, requestUrl?: string): Promise<string> {
  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);

  try {
    // Find or create user
    let userId: string;
    const userResult = await turso.execute({
      sql: 'SELECT id FROM users WHERE email = ? LIMIT 1',
      args: [email],
    });

    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id;
    } else {
      // Create new user
      userId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      await turso.execute({
        sql: 'INSERT INTO users (id, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        args: [userId, email, 0, now, now],
      });
    }

    // Generate token
    const tokenId = crypto.randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60; // 15 minutes

    // Store token
    await turso.execute({
      sql: 'INSERT INTO magic_link_tokens (id, user_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [tokenId, userId, email, expiresAt, Math.floor(Date.now() / 1000)],
    });

    // Determine site URL
    let siteUrl = env.PUBLIC_SITE_URL || 'http://localhost:4321';
    if (requestUrl) {
      const url = new URL(requestUrl);
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      const protocol = isLocalhost ? url.protocol : 'https:';
      siteUrl = `${protocol}//${url.host}`;
    }

    return `${siteUrl}/auth/magic-link/verify?token=${tokenId}`;
  } catch (error) {
    console.error('[Magic Link] Error generating magic link:', error);
    throw error;
  }
}

export async function validateMagicLinkToken(tokenId: string, env: Env): Promise<{ userId: string; email: string } | null> {
  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);

  try {
    const result = await turso.execute({
      sql: 'SELECT user_id, email, expires_at FROM magic_link_tokens WHERE id = ? LIMIT 1',
      args: [tokenId],
    });

    if (result.rows.length === 0) {
      return null;
    }

    const token = result.rows[0];
    const now = Math.floor(Date.now() / 1000);

    if (token.expires_at < now) {
      // Token expired
      return null;
    }

    return {
      userId: token.user_id,
      email: token.email,
    };
  } catch (error) {
    console.error('[Magic Link] Error validating token:', error);
    return null;
  }
}

export async function deleteMagicLinkToken(tokenId: string, env: Env): Promise<void> {
  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);

  try {
    await turso.execute({
      sql: 'DELETE FROM magic_link_tokens WHERE id = ?',
      args: [tokenId],
    });
  } catch (error) {
    console.error('[Magic Link] Error deleting token:', error);
    throw error;
  }
}

