import type { APIRoute } from 'astro';
import { saveMuseum } from '../../../../lib/db';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RateLimits } from '../../../../lib/rate-limiter';
import type { Env } from '../../../../env.d';

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        if (!locals.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const env = (locals.runtime?.env || import.meta.env) as unknown as Env;
        if (!env?.TURSO_DATABASE_URL || !env?.TURSO_AUTH_TOKEN) {
            console.error('[API] Database credentials missing in production');
            return Response.json({ error: 'Configuration Error' }, { status: 500 });
        }

        const clientId = getClientIdentifier(request, locals.user.id);
        const rateLimitResult = await checkRateLimit(clientId, RateLimits.COLLECTIONS, env);
        if (!rateLimitResult.success && rateLimitResult.retryAfter) {
            return createRateLimitResponse(rateLimitResult.retryAfter, rateLimitResult.limit);
        }

        const body = await request.json().catch(() => null);
        if (!body?.museum_id) {
            return Response.json({ error: 'Bad Request', detail: 'museum_id required' }, { status: 400 });
        }

        // Limit is enforced atomically inside saveMuseum (no extra read needed).
        await saveMuseum(locals.user.id, body.museum_id, env);
        return Response.json({ success: true, saved: true });

    } catch (err: any) {
        if (err?.message === 'LIMIT_REACHED') {
            return Response.json({ error: 'LIMIT_REACHED' }, { status: 403 });
        }
        console.error('[API] Save Museum Error:', err);
        return Response.json({ error: 'Server Error', message: err.message }, { status: 500 });
    }
};
