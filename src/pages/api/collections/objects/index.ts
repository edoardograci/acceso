import type { APIRoute } from 'astro';
import { saveObject, getCollectionsCounts } from '../../../../lib/db';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RateLimits } from '../../../../lib/rate-limiter';
import type { Env } from '../../../../env.d';

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        if (!locals.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const env = (locals.runtime?.env || import.meta.env) as unknown as Env;
        if (!env?.TURSO_DATABASE_URL || !env?.TURSO_AUTH_TOKEN) {
            return Response.json({ error: 'Configuration Error' }, { status: 500 });
        }

        const clientId = getClientIdentifier(request, locals.user.id);
        const rateLimitResult = checkRateLimit(clientId, RateLimits.COLLECTIONS);
        if (!rateLimitResult.success && rateLimitResult.retryAfter) {
            return createRateLimitResponse(rateLimitResult.retryAfter);
        }

        const body = await request.json().catch(() => null);
        if (!body?.product_id) {
            return Response.json({ error: 'Bad Request' }, { status: 400 });
        }

        const counts = await getCollectionsCounts(locals.user.id, env);
        if (counts.objects >= 100) {
            return Response.json({ error: 'LIMIT_REACHED' }, { status: 403 });
        }

        await saveObject(locals.user.id, body.product_id, env);
        return Response.json({ success: true, saved: true });

    } catch (err: any) {
        console.error('[API] Save Object Error:', err);
        return Response.json({ error: 'Server Error' }, { status: 500 });
    }
};
