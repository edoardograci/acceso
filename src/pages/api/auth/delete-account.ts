import type { APIRoute } from 'astro';
import { TursoHttpClient } from '../../../lib/turso';
import type { Env } from '../../../env.d';
import { createLucia } from '../../../lib/auth/lucia';

export const POST: APIRoute = async ({ locals, cookies, redirect }) => {
    if (!locals.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    try {
        const env = (locals.runtime?.env || import.meta.env) as unknown as Env;
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

        // 3. Delete the user record
        await turso.execute({
            sql: 'DELETE FROM users WHERE id = ?',
            args: [userId],
        });

        // 4. Invalidate session cookie
        const lucia = createLucia(env);
        const blankCookie = lucia.createBlankSessionCookie();
        cookies.set(blankCookie.name, blankCookie.value, blankCookie.attributes);

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error deleting account:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
};
