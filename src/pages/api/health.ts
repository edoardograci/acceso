// src/pages/api/health.ts
import type { APIRoute } from 'astro';
import type { Env } from '../../env.d';
import { TursoHttpClient } from '../../lib/turso';

export const GET: APIRoute = async ({ locals }) => {
    const env = (locals.runtime?.env || import.meta.env) as unknown as Env;

    const checks = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {} as Record<string, { status: string; latency?: number; error?: string }>
    };

    // Check Turso database connectivity
    try {
        const start = Date.now();
        const turso = new TursoHttpClient(env.TURSO_DATABASE_URL, env.TURSO_AUTH_TOKEN);
        await turso.execute({ sql: 'SELECT 1', args: [] });
        checks.services.database = {
            status: 'connected',
            latency: Date.now() - start
        };
    } catch (error) {
        // This route is anonymous: report the state, keep the driver detail in
        // the logs.
        console.error('[Health] Turso check failed:', error);
        checks.status = 'degraded';
        checks.services.database = { status: 'disconnected' };
    }

    // Check if environment variables are set
    checks.services.environment = {
        status: 'ok',
        ...(!env.TURSO_DATABASE_URL && { error: 'TURSO_DATABASE_URL missing' }),
        ...(!env.TURSO_AUTH_TOKEN && { error: 'TURSO_AUTH_TOKEN missing' }),
    };

    const httpStatus = checks.status === 'ok' ? 200 : 503;

    return new Response(JSON.stringify(checks, null, 2), {
        status: httpStatus,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
    });
};
