import type { APIRoute } from 'astro';
import { removeMuseum } from '../../../../lib/db';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RateLimits } from '../../../../lib/rate-limiter';
import type { Env } from '../../../../env.d';

export const DELETE: APIRoute = async ({ params, request, locals }) => {
    if (!locals.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { id } = params;

    if (!id) {
        return new Response(JSON.stringify({ error: 'Missing museum ID' }), { status: 400 });
    }

    try {
        const env = (locals.runtime?.env || import.meta.env) as unknown as Env;

        // Same budget as the matching POST — without it a client can hammer the
        // database with unlimited deletes.
        const clientId = getClientIdentifier(request, locals.user.id);
        const rateLimitResult = await checkRateLimit(clientId, RateLimits.COLLECTIONS, env);
        if (!rateLimitResult.success) {
            return createRateLimitResponse(Math.max(1, rateLimitResult.retryAfter ?? 1), rateLimitResult.limit);
        }

        await removeMuseum(locals.user.id, id, env);

        return new Response(JSON.stringify({ success: true, removed: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        // Never echo the driver message back: it carries the failing statement.
        console.error('Error in remove museum API:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
};
