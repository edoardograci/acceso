import type { APIRoute } from 'astro';
import { saveUniversity } from '../../../../lib/db';
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
        if (!body?.university_id) {
            return Response.json({ error: 'Bad Request', detail: 'university_id required' }, { status: 400 });
        }

        // Limit is enforced atomically inside saveUniversity (no extra read needed).
        await saveUniversity(locals.user.id, body.university_id, env);
        return Response.json({ success: true, saved: true });

    } catch (err: any) {
        if (err?.message === 'LIMIT_REACHED') {
            return Response.json({ error: 'LIMIT_REACHED' }, { status: 403 });
        }
        console.error('[API] Save University Error:', err);
        return Response.json({ error: 'Server Error', message: err.message }, { status: 500 });
    }
};
