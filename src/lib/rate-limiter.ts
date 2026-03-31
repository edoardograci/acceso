// src/lib/rate-limiter.ts
// Simple in-memory rate limiter for Cloudflare Workers
// For production, consider using Cloudflare Workers KV or Durable Objects for distributed rate limiting

interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    keyPrefix?: string;
}

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

// In-memory store (resets on worker restart, but good enough for basic protection)
const store = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically (inline to avoid setInterval crash on Edge)
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute

function cleanup() {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
        if (now > entry.resetTime) {
            store.delete(key);
        }
    }
    lastCleanup = now;
}

/**
 * Check if request should be rate limited
 * @param identifier - Unique identifier (user ID, IP address, etc.)
 * @param config - Rate limit configuration
 * @returns Object with success boolean and retry info
 */
export function checkRateLimit(
    identifier: string,
    config: RateLimitConfig
): {
    success: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
} {
    const now = Date.now();

    // Passive cleanup
    if (now - lastCleanup > CLEANUP_INTERVAL) {
        cleanup();
    }

    const key = `${config.keyPrefix || 'rl'}:${identifier}`;
    const entry = store.get(key);

    if (!entry || now > entry.resetTime) {
        // First request or window expired, create new entry
        const resetTime = now + config.windowMs;
        store.set(key, { count: 1, resetTime });

        return {
            success: true,
            remaining: config.maxRequests - 1,
            resetTime
        };
    }

    // Within rate limit window
    if (entry.count < config.maxRequests) {
        // Increment count
        entry.count++;
        store.set(key, entry);

        return {
            success: true,
            remaining: config.maxRequests - entry.count,
            resetTime: entry.resetTime
        };
    }

    // Rate limit exceeded
    return {
        success: false,
        remaining: 0,
        resetTime: entry.resetTime,
        retryAfter: Math.ceil((entry.resetTime - now) / 1000)
    };
}

/**
 * Create rate limit error response
 */
export function createRateLimitResponse(retryAfter: number): Response {
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
                'X-RateLimit-Limit': '100',
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
    }
} as const;
