// src/lib/rate-limiter.ts
// Persistent rate limiter backed by Turso.
// This replaces the old in-memory Map, which did not survive Cloudflare
// Workers cold starts / isolation, so limits now apply across all instances.

import { TursoHttpClient } from './turso';
import type { Env } from '../env.d';

interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    keyPrefix?: string;
}

/**
 * Check if a request should be rate limited.
 * Uses a Turso-backed `rate_limits` table so the counter persists across
 * serverless instances. The window is reset automatically once it expires.
 *
 * @param identifier - Unique identifier (user ID, IP address, etc.)
 * @param config - Rate limit configuration
 * @param env - Runtime environment providing Turso credentials
 * @returns Object with success boolean and retry info
 */
export async function checkRateLimit(
    identifier: string,
    config: RateLimitConfig,
    env: Env
): Promise<{
    success: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
    limit: number;
}> {
    const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
    const now = Date.now();
    const key = `${config.keyPrefix || 'rl'}:${identifier}`;
    const resetTime = now + config.windowMs;

    // Atomic upsert: reset the window if it has expired, otherwise increment.
    await turso.execute({
        sql: `
            INSERT INTO rate_limits (key, count, reset_time) VALUES (?, 1, ?)
            ON CONFLICT(key) DO UPDATE SET
                count = CASE WHEN rate_limits.reset_time <= ? THEN 1 ELSE rate_limits.count + 1 END,
                reset_time = CASE WHEN rate_limits.reset_time <= ? THEN ? ELSE rate_limits.reset_time END
        `,
        args: [key, resetTime, now, now, resetTime],
    });

    // Best-effort pruning of expired entries (sampled) to keep the table lean.
    if (Math.random() < 0.01) {
        await turso.execute({
            sql: 'DELETE FROM rate_limits WHERE reset_time <= ?',
            args: [now],
        }).catch(() => {});
    }

    const result = await turso.execute({
        sql: 'SELECT count, reset_time FROM rate_limits WHERE key = ?',
        args: [key],
    });

    const row = result.rows[0];
    const count = (row?.count as number) ?? 1;
    const rowReset = (row?.reset_time as number) ?? resetTime;

    if (count > config.maxRequests) {
        return {
            success: false,
            remaining: 0,
            resetTime: rowReset,
            retryAfter: Math.ceil((rowReset - now) / 1000),
            limit: config.maxRequests,
        };
    }

    return {
        success: true,
        remaining: Math.max(0, config.maxRequests - count),
        resetTime: rowReset,
        limit: config.maxRequests,
    };
}

/**
 * Create rate limit error response
 */
export function createRateLimitResponse(retryAfter: number, limit?: number): Response {
    return new Response(
        JSON.stringify({
            error: 'Too many requests',
            message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
            retryAfter
        }),
        {
            status: 429,
            headers: {
                'Content-Type': 'application/json',
                'Retry-After': retryAfter.toString(),
                'X-RateLimit-Limit': (limit ?? 100).toString(),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': new Date(Date.now() + retryAfter * 1000).toISOString()
            }
        }
    );
}

/**
 * Get client identifier for rate limiting
 * Prefers user ID, falls back to IP address
 */
export function getClientIdentifier(request: Request, userId?: string): string {
    if (userId) {
        return `user:${userId}`;
    }

    // Get IP from Cloudflare headers
    const cfConnectingIp = request.headers.get('CF-Connecting-IP');
    if (cfConnectingIp) {
        return `ip:${cfConnectingIp}`;
    }

    // Fallback to X-Forwarded-For
    const xForwardedFor = request.headers.get('X-Forwarded-For');
    if (xForwardedFor) {
        const ip = xForwardedFor.split(',')[0].trim();
        return `ip:${ip}`;
    }

    // Last resort - use a constant (allows one request per window for all unidentified users)
    return 'ip:unknown';
}

/**
 * Common rate limit configs
 */
export const RateLimits = {
    // Collections: 100 requests per minute per user
    COLLECTIONS: {
        maxRequests: 100,
        windowMs: 60 * 1000,
        keyPrefix: 'collections'
    },

    // Search: 30 requests per minute per user
    SEARCH: {
        maxRequests: 30,
        windowMs: 60 * 1000,
        keyPrefix: 'search'
    },

    // Email (magic link): 3 requests per 15 minutes per email
    EMAIL: {
        maxRequests: 3,
        windowMs: 15 * 60 * 1000,
        keyPrefix: 'email'
    },

    // Auth (general): 10 requests per minute per IP
    AUTH: {
        maxRequests: 10,
        windowMs: 60 * 1000,
        keyPrefix: 'auth'
    },

    // Account deletion: 1 request per hour per user
    ACCOUNT_DELETE: {
        maxRequests: 1,
        windowMs: 60 * 60 * 1000,
        keyPrefix: 'delete'
    },

    // Studio submissions: 5 per hour per user. Each one writes an image to R2,
    // inserts a row and sends an email, so this is the most expensive authenticated
    // endpoint on the site.
    SUBMISSIONS: {
        maxRequests: 5,
        windowMs: 60 * 60 * 1000,
        keyPrefix: 'submissions'
    },

    // Admin dashboard JSON feeds: 60 per minute per admin.
    ADMIN: {
        maxRequests: 60,
        windowMs: 60 * 1000,
        keyPrefix: 'admin'
    }
} as const;
