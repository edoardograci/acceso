import type { APIRoute } from 'astro';
import { saveDesigner } from '../../../../lib/db';
import type { Env } from '../../../../env.d';

export const POST: APIRoute = async ({ request, locals }) => {
    if (!locals.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    try {
        const body = await request.json();
        const { studio_id } = body;

        if (!studio_id) {
            return new Response(JSON.stringify({ error: 'Missing studio_id' }), { status: 400 });
        }

        const env = (locals.runtime?.env || import.meta.env) as unknown as Env;

        // Check limit
        const { getCollectionsCounts } = await import('../../../../lib/db');
        const counts = await getCollectionsCounts(locals.user.id, env);
        
        if (counts.designers >= 100) {
            return new Response(JSON.stringify({ error: 'Collection limit reached (100)' }), { status: 403 });
        }

        await saveDesigner(locals.user.id, studio_id, env);

        return new Response(JSON.stringify({ success: true, saved: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error in save designer API:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
};
