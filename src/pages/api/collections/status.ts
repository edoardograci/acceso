import type { APIRoute } from 'astro';
import { getFullCollectionStatus } from '../../../lib/db';
import type { Env } from '../../../env.d';

export const GET: APIRoute = async ({ locals }) => {
    if (!locals.user) {
        return Response.json({ designers: [], objects: [] });
    }

    try {
        const env = (locals.runtime?.env || import.meta.env) as unknown as Env;
        const { designers, objects } = await getFullCollectionStatus(locals.user.id, env) as any;

        return Response.json({ designers, objects }, {
            headers: {
                // Return fast, check in background
                'Cache-Control': 'private, max-age=5, stale-while-revalidate=15',
            }
        });
    } catch (error: any) {
        console.error('[Status API] Error:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
