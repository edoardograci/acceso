import type { APIRoute } from 'astro';
import { adminNotFound, isAdmin } from '../../../lib/admin';
import { getAdminMetrics, parseRange } from '../../../lib/admin-metrics';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RateLimits } from '../../../lib/rate-limiter';
import type { Env } from '../../../env.d';

export const prerender = false;

/**
 * JSON feed behind /admin. Anyone who is not on the ADMIN_EMAILS allowlist —
 * logged out or not — gets a 404, so the route is not discoverable by probing.
 */
export const GET: APIRoute = async ({ request, locals, url }) => {
  const env = (locals.runtime?.env || import.meta.env) as unknown as Env;

  if (!isAdmin(locals.user, env)) {
    return adminNotFound();
  }

  try {
    const identifier = getClientIdentifier(request, locals.user!.id);
    const rateLimit = await checkRateLimit(identifier, RateLimits.ADMIN, env);
    if (!rateLimit.success) {
      return createRateLimitResponse(rateLimit.retryAfter || 60, rateLimit.limit);
    }

    const range = parseRange(url.searchParams.get('range'));
    const refresh = url.searchParams.get('refresh') === '1';
    const metrics = await getAdminMetrics(env, range, { refresh });

    return Response.json(metrics, {
      headers: {
        // Never store admin analytics in a shared or browser cache; the
        // server-side Cloudflare cache in admin-metrics.ts handles reuse.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error: any) {
    console.error('[Admin Metrics API] Error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
};
