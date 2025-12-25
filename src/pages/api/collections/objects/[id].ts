import type { APIRoute } from 'astro';
import { removeObject } from '../../../../lib/db';
import type { Env } from '../../../../env.d';

export const DELETE: APIRoute = async ({ params, locals }) => {
    if (!locals.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { id } = params;

    if (!id) {
        return new Response(JSON.stringify({ error: 'Missing product ID' }), { status: 400 });
    }

    try {
        const env = (locals.runtime?.env || import.meta.env) as unknown as Env;
        await removeObject(locals.user.id, id, env);

        return new Response(JSON.stringify({ success: true, removed: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error in remove object API:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
};
