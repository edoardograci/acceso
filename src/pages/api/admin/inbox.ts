import type { APIRoute } from 'astro';
import { adminNotFound, isAdmin } from '../../../lib/admin';
import { getAdminInbox } from '../../../lib/db';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RateLimits } from '../../../lib/rate-limiter';
import type { Env } from '../../../env.d';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const runtimeEnv = locals.runtime?.env || {};
  const metaEnv = import.meta.env || {};
  const env = { ...metaEnv, ...runtimeEnv } as unknown as Env;

  if (!isAdmin(locals.user, env)) {
    return adminNotFound();
  }

  try {
    const identifier = getClientIdentifier(request, locals.user!.id);
    const rateLimit = await checkRateLimit(identifier, RateLimits.ADMIN, env);
    if (!rateLimit.success) {
      return createRateLimitResponse(rateLimit.retryAfter || 60, rateLimit.limit);
    }

    const inbox = await getAdminInbox(env);
    return Response.json(inbox, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error: any) {
    console.error('[Admin Inbox API] Error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
};
