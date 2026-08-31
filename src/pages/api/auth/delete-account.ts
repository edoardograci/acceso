import type { APIRoute } from 'astro';
import { TursoHttpClient } from '../../../lib/turso';
import type { Env } from '../../../env.d';
import { createLucia } from '../../../lib/auth/lucia';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RateLimits } from '../../../lib/rate-limiter';

export const POST: APIRoute = async ({ request, locals, cookies }) => {
    if (!locals.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    try {
        const env = (locals.runtime?.env || import.meta.env) as unknown as Env;

        // RateLimits.ACCOUNT_DELETE existed but was never wired up: this route
        // runs nine sequential DELETEs, so a loop against it is free DB load.
        const clientId = getClientIdentifier(request, locals.user.id);
        const rateLimitResult = await checkRateLimit(clientId, RateLimits.ACCOUNT_DELETE, env);
        if (!rateLimitResult.success) {
            return createRateLimitResponse(Math.max(1, rateLimitResult.retryAfter ?? 1), rateLimitResult.limit);
        }

        const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
        const userId = locals.user.id;

        // 1. Delete user's collections
        await turso.execute({
            sql: 'DELETE FROM user_saved_designers WHERE user_id = ?',
            args: [userId],
        });

        await turso.execute({
            sql: 'DELETE FROM user_saved_objects WHERE user_id = ?',
            args: [userId],
        });

        // 2. Delete user's sessions
        await turso.execute({
            sql: 'DELETE FROM sessions WHERE user_id = ?',
            args: [userId],
        });

        // 2b. Delete remaining owned data (museums, universities, oauth links, magic links, submissions)
        await turso.execute({
            sql: 'DELETE FROM user_saved_museums WHERE user_id = ?',
            args: [userId],
        });
        await turso.execute({
            sql: 'DELETE FROM user_saved_universities WHERE user_id = ?',
            args: [userId],
        });
        await turso.execute({
            sql: 'DELETE FROM oauth_accounts WHERE user_id = ?',
            args: [userId],
        });
        await turso.execute({
            sql: 'DELETE FROM magic_link_tokens WHERE user_id = ?',
            args: [userId],
        });
        await turso.execute({
            sql: 'DELETE FROM submissions WHERE user_id = ?',
            args: [userId],
        });

        // 3. Delete the user record
        await turso.execute({
            sql: 'DELETE FROM users WHERE id = ?',
            args: [userId],
        });

        // 4. Invalidate session cookies
        const lucia = createLucia(env);
        const blankCookie = lucia.createBlankSessionCookie();
        cookies.set(blankCookie.name, blankCookie.value, blankCookie.attributes);
        cookies.delete('auth_token', { path: '/' });
        cookies.delete('collections_state', { path: '/' });

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error deleting account:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
};
