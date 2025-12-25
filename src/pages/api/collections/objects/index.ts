import type { APIRoute } from 'astro';
import { saveObject } from '../../../../lib/db';
import type { Env } from '../../../../env.d';

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    try {
        const body = await request.json();
        const { product_id } = body;

        if (!product_id) {
            return new Response(JSON.stringify({ error: 'Missing product_id' }), { status: 400 });
        }

        const env = (locals.runtime?.env || import.meta.env) as unknown as Env;
        await saveObject(locals.user.id, product_id, env);

        return new Response(JSON.stringify({ success: true, saved: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error in save object API:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
};
