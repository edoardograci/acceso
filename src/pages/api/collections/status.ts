import type { APIRoute } from 'astro';
import { getSavedDesigners, getSavedObjects } from '../../../lib/db';
import type { Env } from '../../../env.d';

export const GET: APIRoute = async ({ locals }) => {
    if (!locals.user) {
        return new Response(JSON.stringify({
            designers: [],
            objects: []
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const env = (locals.runtime?.env || import.meta.env) as unknown as Env;
        const { getFullCollectionStatus } = await import('../../../lib/db');

        // Single query optimized fetch
        const { designers, objects } = await getFullCollectionStatus(locals.user.id, env);

        return new Response(JSON.stringify({
            designers,
            objects
        }), {
            headers: {
                'Content-Type': 'application/json',
                // Keep smart caching
                'Cache-Control': 'private, max-age=3, stale-while-revalidate=10'
            }
        });
    } catch (error) {
        console.error('Error fetching collection status:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500
        });
    }
};
