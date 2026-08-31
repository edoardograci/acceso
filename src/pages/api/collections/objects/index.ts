import type { APIRoute } from 'astro';
import { saveObject } from '../../../../lib/db';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RateLimits } from '../../../../lib/rate-limiter';
import type { Env } from '../../../../env.d';

// CMS ids are UUID/Notion-shaped; anything longer is not a real id and has no
// business being written to the database.
const MAX_ID_LENGTH = 128;

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
        // Test only `success`: retryAfter can round down to 0, which used to make
        // this guard falsy and let the request through.
        if (!rateLimitResult.success) {
            return createRateLimitResponse(Math.max(1, rateLimitResult.retryAfter ?? 1), rateLimitResult.limit);
        }

        const body = await request.json().catch(() => null);
        const productId = body?.product_id;
        if (typeof productId !== 'string' || productId.length === 0 || productId.length > MAX_ID_LENGTH) {
            return Response.json({ error: 'Bad Request', detail: 'product_id must be a non-empty string' }, { status: 400 });
        }

        // Limit is enforced atomically inside saveObject (no extra read needed).
        await saveObject(locals.user.id, productId, env);
        return Response.json({ success: true, saved: true });

    } catch (err: any) {
        if (err?.message === 'LIMIT_REACHED') {
            return Response.json({ error: 'LIMIT_REACHED' }, { status: 403 });
        }
        // The driver message carries the failing SQL — log it, don't return it.
        console.error('[API] Save Object Error:', err);
        return Response.json({ error: 'Server Error' }, { status: 500 });
    }
};
