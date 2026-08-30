// src/lib/admin.ts
// Access control for the owner-only monitoring dashboard.
//
// Admins are declared through the ADMIN_EMAILS environment variable
// (comma-separated) rather than a `role` column, so access can be granted or
// revoked without a Turso migration. The check runs against the already
// authenticated `locals.user`, so it inherits the normal session validation.

import type { Env } from '../env.d';

type MaybeUser = App.Locals['user'];

/** Parse ADMIN_EMAILS into a normalised list. Empty when unset. */
export function getAdminEmails(env: Env): string[] {
  const raw = (env as any)?.ADMIN_EMAILS ?? '';
  return String(raw)
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * True only for a logged-in user whose email is in the allowlist.
 * Fails closed: with ADMIN_EMAILS unset nobody is an admin, so a misconfigured
 * deploy locks the dashboard instead of opening it to every logged-in user.
 */
export function isAdmin(user: MaybeUser, env: Env): boolean {
  if (!user?.email) return false;
  const allowed = getAdminEmails(env);
  if (allowed.length === 0) return false;
  return allowed.includes(user.email.trim().toLowerCase());
}

/**
 * Response for non-admins. Deliberately a 404, not a 403: a 403 would confirm
 * the route exists to anyone probing for it.
 */
export function adminNotFound(): Response {
  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}
