import type { APIRoute } from 'astro';
import { removeDesigner } from '../../../../lib/db';
import type { Env } from '../../../../env.d';

export const DELETE: APIRoute = async ({ params, locals }) => {
    if (!locals.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { id } = params;

    if (!id) {
        return new Response(JSON.stringify({ error: 'Missing studio ID' }), { status: 400 });
    }

    try {
        const env = (locals.runtime?.env || import.meta.env) as unknown as Env;
        await removeDesigner(locals.user.id, id, env);

        return new Response(JSON.stringify({ success: true, removed: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        console.error('Error in remove designer API:', error);
        return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
    }
};
