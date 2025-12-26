// src/lib/auth/magic-link.ts
import { TursoHttpClient } from '../turso';
import type { Env } from '../../env.d';

export async function generateMagicLink(email: string, env: Env, requestUrl?: string): Promise<{ link?: string; error?: string; retryAfter?: number }> {
  const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);

  try {
    // 1. Rate limiting check - prevent spamming the same email
    const COOLDOWN_SECONDS = 60;
    const now = Math.floor(Date.now() / 1000);

    const recentToken = await turso.execute({
      sql: 'SELECT created_at FROM magic_link_tokens WHERE email = ? AND created_at > ? LIMIT 1',
      args: [email, now - COOLDOWN_SECONDS],
    });

    if (recentToken.rows.length > 0) {
      const waitTime = COOLDOWN_SECONDS - (now - recentToken.rows[0].created_at);
      return {
        error: `Please wait ${waitTime} seconds before requesting a new login link.`,
        retryAfter: waitTime
      };
    }

    // Find or create user - optimized with a single flow
    let userId: string;
    const userResult = await turso.execute({
      sql: 'SELECT id FROM users WHERE email = ? LIMIT 1',
      args: [email],
    }, { useCache: true });

    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id;
    } else {
      userId = crypto.randomUUID();
      const insertNow = Math.floor(Date.now() / 1000);
      await turso.execute({
        sql: 'INSERT INTO users (id, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        args: [userId, email, 0, insertNow, insertNow],
      });
    }

    // Generate token
    const tokenId = crypto.randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60; // 15 minutes
    const nowTimestamp = Math.floor(Date.now() / 1000);

    // 2. Optimization: Delete any existing tokens for this email AND clean up all expired tokens
    // This keeps the database lean and ensures only the latest link works
    await turso.execute({
      sql: 'DELETE FROM magic_link_tokens WHERE email = ? OR expires_at < ?',
      args: [email, nowTimestamp],
    });

    // Store token
    await turso.execute({
      sql: 'INSERT INTO magic_link_tokens (id, user_id, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [tokenId, userId, email, expiresAt, nowTimestamp],
    });

    // Determine site URL
    let siteUrl = env.PUBLIC_SITE_URL || 'http://localhost:4321';
    if (requestUrl) {
      const url = new URL(requestUrl);
      const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      const protocol = isLocalhost ? url.protocol : 'https:';
      siteUrl = `${protocol}//${url.host}`;
    }

    return { link: `${siteUrl}/auth/magic-link/verify?token=${tokenId}` };
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
