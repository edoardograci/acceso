import type { APIRoute } from 'astro';
import { saveDesigner } from '../../../../lib/db';
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
        const studioId = body?.studio_id;
        if (typeof studioId !== 'string' || studioId.length === 0 || studioId.length > MAX_ID_LENGTH) {
            return Response.json({ error: 'Bad Request', detail: 'studio_id must be a non-empty string' }, { status: 400 });
        }

        // Limit is enforced atomically inside saveDesigner (no extra read needed).
        await saveDesigner(locals.user.id, studioId, env);
        return Response.json({ success: true, saved: true });

    } catch (err: any) {
        if (err?.message === 'LIMIT_REACHED') {
            return Response.json({ error: 'LIMIT_REACHED' }, { status: 403 });
        }
        // The driver message carries the failing SQL — log it, don't return it.
        console.error('[API] Save Designer Error:', err);
        return Response.json({ error: 'Server Error' }, { status: 500 });
    }
};
