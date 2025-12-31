import type { APIRoute } from 'astro';
import { TursoHttpClient } from '../../../lib/turso';
import type { Env } from '../../../env.d';

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const env = (locals.runtime?.env || import.meta.env) as unknown as Env;

        // Check DB credentials
        if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
            console.error('Missing DB credentials');
            return new Response(JSON.stringify({ error: 'Server configuration error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const data = await request.json();
        const { type, name, website, city } = data;

        // validation
        if (!type || !name || !website || !city) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
        const now = Math.floor(Date.now() / 1000);
        const COOLDOWN_SECONDS = 15 * 60; // 15 minutes cooldown

        // Rate Limiting: Check if this website was submitted recently
        const recent = await turso.execute({
            sql: 'SELECT created_at FROM studio_requests WHERE website = ? AND created_at > ? LIMIT 1',
            args: [website, now - COOLDOWN_SECONDS]
        });

        if (recent.rows.length > 0) {
            const waitTime = Math.ceil((recent.rows[0].created_at as number + COOLDOWN_SECONDS - now) / 60);
            return new Response(JSON.stringify({
                error: `This studio was recently submitted. Please wait ${waitTime} minutes before trying again.`
            }), {
                status: 429,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Save to Database
        const id = crypto.randomUUID();

        await turso.execute({
            sql: 'INSERT INTO studio_requests (id, type, name, website, city, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            args: [id, type, name, website, city, 'pending', now]
        });



        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('[Request Studio] Error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
