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

        // Single batch read - only 2 DB queries total!
        const [designers, objects] = await Promise.all([
            getSavedDesigners(locals.user.id, env),
            getSavedObjects(locals.user.id, env)
        ]);

        return new Response(JSON.stringify({
            designers,  // Array of studio IDs
            objects     // Array of product IDs
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'private, no-cache' // Don't cache user-specific data
            }
        });
    } catch (error) {
        console.error('Error fetching collection status:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500
        });
    }
};
