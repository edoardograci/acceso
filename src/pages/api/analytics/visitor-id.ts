import type { APIRoute } from 'astro';
import { resolveVisitorIdentity } from '../../../lib/visitor-hash';
import type { Env } from '../../../env.d';

export const prerender = false;

/**
 * Returns a daily-rotating visitor hash for cookieless PostHog tracking.
 * No raw IP is stored or returned — only the one-way hash.
 */
export const GET: APIRoute = async ({ request, locals }) => {
  const env = (locals.runtime?.env || import.meta.env) as unknown as Env;

  try {
    const identity = await resolveVisitorIdentity(request, env);

    return Response.json(identity, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    console.error('[Visitor ID] Error:', error);
    return Response.json({ error: 'Failed to compute visitor ID' }, { status: 500 });
  }
};
