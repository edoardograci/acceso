import type { APIRoute } from 'astro';
import { saveDesigner, getCollectionsCounts } from '../../../../lib/db';
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
        const rateLimitResult = checkRateLimit(clientId, RateLimits.COLLECTIONS);
        if (!rateLimitResult.success && rateLimitResult.retryAfter) {
            return createRateLimitResponse(rateLimitResult.retryAfter);
        }

        const body = await request.json().catch(() => null);
        if (!body?.studio_id) {
            return Response.json({ error: 'Bad Request', detail: 'studio_id required' }, { status: 400 });
        }

        const counts = await getCollectionsCounts(locals.user.id, env);
        if (counts.designers >= 100) {
            return Response.json({ error: 'LIMIT_REACHED' }, { status: 403 });
        }

        await saveDesigner(locals.user.id, body.studio_id, env);
        return Response.json({ success: true, saved: true });

    } catch (err: any) {
        console.error('[API] Save Designer Error:', err);
        return Response.json({ error: 'Server Error', message: err.message }, { status: 500 });
    }
};
