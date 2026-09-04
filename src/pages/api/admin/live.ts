import type { APIRoute } from 'astro';
import { adminNotFound, isAdmin } from '../../../lib/admin';
import { getLiveAnalytics } from '../../../lib/admin-metrics';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RateLimits } from '../../../lib/rate-limiter';
import type { Env } from '../../../env.d';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals, url }) => {
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

    const refresh = url.searchParams.get('refresh') === '1';
    const payload = await getLiveAnalytics(env, { refresh });

    return Response.json(payload, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error: any) {
    console.error('[Admin Live API] Error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
};
