import type { APIRoute } from 'astro';
import { checkSavedStatus } from '../../../lib/db';
import type { Env } from '../../../env.d';

export const GET: APIRoute = async ({ request, locals }) => {
    // If not logged in, clearly not saved
    if (!locals.user) {
        return new Response(JSON.stringify({ saved: false }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const id = url.searchParams.get('id');

    if (!type || !id || (type !== 'designers' && type !== 'objects')) {
        return new Response(JSON.stringify({ error: 'Invalid params' }), { status: 400 });
    }

    try {
        const env = (locals.runtime?.env || import.meta.env) as unknown as Env;
        const saved = await checkSavedStatus(locals.user.id, type as 'designers' | 'objects', id, env);

        return new Response(JSON.stringify({ saved }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error in check status API:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
};
