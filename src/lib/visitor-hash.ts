// src/lib/visitor-hash.ts
// Daily-rotating visitor identifier for cookieless analytics.
//
// Computes a SHA-256 hash from IP + user-agent + salt + UTC date. Raw IPs are
// never stored — the hash is one-way and rotates at midnight UTC so the same
// person on the same device counts as one visitor per day without cross-day
// tracking or persistent cookies.

import type { Env } from '../env.d';

/** UTC calendar day as YYYY-MM-DD. */
export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function getSalt(env: Env): string {
  const salt = String((env as any)?.VISITOR_HASH_SALT || '').trim();
  if (salt) return salt;
  const jwt = String((env as any)?.JWT_SECRET || '').trim();
  if (jwt) return jwt;
  return 'acceso-dev-visitor-salt';
}

/** SHA-256 hex digest, truncated to 32 chars for PostHog distinct_id length. */
export async function computeVisitorHash(
  ip: string,
  userAgent: string,
  salt: string,
  day: string
): Promise<string> {
  const input = `${salt}:${day}:${ip}:${userAgent}`;
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 32);
}

export interface VisitorIdentity {
  visitorId: string;
  day: string;
}

/** Resolve visitor identity from a request's IP and User-Agent headers. */
export async function resolveVisitorIdentity(
  request: Request,
  env: Env,
  day = utcDay()
): Promise<VisitorIdentity> {
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    '0.0.0.0';
  const userAgent = request.headers.get('User-Agent') || 'unknown';
  const salt = getSalt(env);
  const visitorId = await computeVisitorHash(ip, userAgent, salt, day);
  return { visitorId, day };
}
