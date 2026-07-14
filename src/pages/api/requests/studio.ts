import type { APIRoute } from 'astro';
import { TursoHttpClient } from '../../../lib/turso';
import type { Env } from '../../../env.d';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RateLimits } from '../../../lib/rate-limiter';

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const runtimeEnv = locals.runtime?.env as Env | undefined;
        const dbUrl =
          import.meta.env.TURSO_DATABASE_URL ||
          runtimeEnv?.TURSO_DATABASE_URL ||
          process.env.TURSO_DATABASE_URL ||
          '';
        const dbToken =
          import.meta.env.TURSO_AUTH_TOKEN ||
          runtimeEnv?.TURSO_AUTH_TOKEN ||
          process.env.TURSO_AUTH_TOKEN ||
          '';
        const turnstileSecret =
          import.meta.env.TURNSTILE_SECRET_KEY ||
          runtimeEnv?.TURNSTILE_SECRET_KEY ||
          process.env.TURNSTILE_SECRET_KEY ||
          '';

        // Check DB credentials
        if (!dbUrl || !dbToken) {
            console.error('Missing DB credentials');
            return new Response(JSON.stringify({ error: 'Server configuration error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Abuse protection: throttle studio requests per client/IP
        const clientId = getClientIdentifier(request);
        const env = { TURSO_DATABASE_URL: dbUrl, TURSO_AUTH_TOKEN: dbToken } as unknown as Env;
        const rateLimitResult = await checkRateLimit(clientId, RateLimits.AUTH, env);
        if (!rateLimitResult.success && rateLimitResult.retryAfter) {
            return createRateLimitResponse(rateLimitResult.retryAfter, rateLimitResult.limit);
        }

        const data = await request.json();
        const { type, name, website, city, captcha_token } = data;

        // Captcha first (anti-spam) to avoid charging DB costs for bots.
        if (!turnstileSecret) {
            return new Response(JSON.stringify({ error: 'Captcha not configured' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        if (!captcha_token || typeof captcha_token !== 'string') {
            return new Response(JSON.stringify({ error: 'Captcha required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        let captchaResult: any;
        try {
            const remoteIp =
                request.headers.get('cf-connecting-ip') ||
                request.headers.get('x-forwarded-for') ||
                '';

            const verifyBody = new URLSearchParams({
                secret: turnstileSecret,
                response: captcha_token,
                ...(remoteIp ? { remoteip: remoteIp } : {}),
            });

            const verifyRes = await fetch(
                'https://challenges.cloudflare.com/turnstile/v0/siteverify',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: verifyBody,
                    signal: controller.signal,
                }
            );

            captchaResult = await verifyRes.json();
        } finally {
            clearTimeout(timeout);
        }

        if (!captchaResult?.success) {
            return new Response(JSON.stringify({ error: 'Captcha verification failed' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // validation
        if (!type || !name || !website || !city) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const turso = new TursoHttpClient(dbUrl, dbToken);
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
