import type { APIRoute } from 'astro';
import { TursoHttpClient } from '../../../lib/turso';
import { Resend } from 'resend';
import type { Env } from '../../../env.d';
import { checkRateLimit } from '../../../lib/rate-limiter';

type SuggestionEnv = {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
};

function getEnv(runtimeEnv: Env | undefined): SuggestionEnv {
  const resolve = (key: keyof SuggestionEnv): string | undefined =>
    (import.meta.env[key as keyof ImportMetaEnv] as string | undefined) ||
    runtimeEnv?.[key] ||
    (process.env[key] as string | undefined) ||
    undefined;

  return {
    TURSO_DATABASE_URL: resolve('TURSO_DATABASE_URL'),
    TURSO_AUTH_TOKEN: resolve('TURSO_AUTH_TOKEN'),
    TURNSTILE_SECRET_KEY: resolve('TURNSTILE_SECRET_KEY'),
    RESEND_API_KEY: resolve('RESEND_API_KEY'),
  };
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const runtimeEnv = locals.runtime?.env as Env | undefined;
    const env = getEnv(runtimeEnv);

    // Check honeypot
    const form = await request.formData();
    const honeypot = form.get('a_password_field') || form.get('website_url_hp');
    if (honeypot) {
      // If honeypot is filled, silently return success to bot
      return json(200, { success: true });
    }

    const dbUrl = env.TURSO_DATABASE_URL || '';
    const dbToken = env.TURSO_AUTH_TOKEN || '';
    const turnstileSecret = env.TURNSTILE_SECRET_KEY || '';

    if (!dbUrl || !dbToken) {
      return json(500, { error: 'Server configuration error (DB)' });
    }
    if (!turnstileSecret) {
      return json(500, { error: 'Captcha not configured' });
    }

    const captchaToken = String(form.get('captcha_token') || '').trim();
    if (!captchaToken) {
      return json(400, { error: 'Captcha required' });
    }

    // Rate limiting: allow a small burst so shared NAT / offices aren't blocked,
    // but still cap abuse. Always count (even when the IP is unknown) so the
    // limit can't be bypassed by stripping the header.
    const clientIp = request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      'unknown-ip';
    const rlEnv = (runtimeEnv || (process.env as any)) as Env;
    const isAllowed = await checkRateLimit(clientIp, {
      maxRequests: 12,
      windowMs: 60 * 60 * 1000, // 1 hour
      keyPrefix: 'suggest',
    }, rlEnv);
    if (!isAllowed.success) {
      const retryAfter = isAllowed.retryAfter || 300;
      return json(429, {
        error: `Too many submissions. Please wait ${Math.ceil(retryAfter / 60)} minute(s).`,
        retryAfter,
      });
    }

    // Verify captcha
    let verifyJson: any = null;
    if (import.meta.env.DEV) {
      verifyJson = { success: true, dev_bypass: true };
    } else {
      const verifyBody = new URLSearchParams({
        secret: turnstileSecret,
        response: captchaToken,
        ...(clientIp !== 'unknown-ip' ? { remoteip: clientIp } : {}),
      });
      try {
        const verifyController = new AbortController();
        const verifyTimeout = setTimeout(() => verifyController.abort(), 10000);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TURNSTILE_TIMEOUT')), 10000)
        );
        const verifyRes = (await Promise.race([
          fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: verifyBody,
            signal: verifyController.signal,
          }),
          timeoutPromise,
        ])) as Response;
        clearTimeout(verifyTimeout);
        verifyJson = await verifyRes.json();
      } catch (e) {
        return json(502, { error: 'Captcha verification timed out. Please try again.' });
      }
    }

    if (!verifyJson?.success) {
      return json(403, { error: 'Captcha verification failed' });
    }

    // Extract suggestions payload
    const suggestionsRaw = String(form.get('suggestions') || '[]');
    let suggestions = [];
    try {
      suggestions = JSON.parse(suggestionsRaw);
    } catch (e) {
      return json(400, { error: 'Invalid suggestions format' });
    }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return json(400, { error: 'No suggestions provided' });
    }

    if (suggestions.length > 20) {
      return json(400, { error: 'Maximum of 20 suggestions per submission allowed' });
    }

    // Validate each suggestion
    const validTypes = new Set(['Designer', 'School', 'Museum', 'Award', 'Fair']);
    const sanitizedSuggestions = [];
    
    for (const item of suggestions) {
      const type = String(item.type || '').trim();
      const name = String(item.name || '').trim();
      const city = String(item.city || '').trim();
      const website = String(item.website || '').trim();

      if (!type || !validTypes.has(type)) {
        return json(400, { error: `Invalid or missing type for suggestion: ${name || 'Unknown'}` });
      }
      if (!name) {
        return json(400, { error: 'Name is required for all suggestions' });
      }
      if (!city) {
        return json(400, { error: `City is required for suggestion: ${name}` });
      }
      
      sanitizedSuggestions.push({ type, name, city, website });
    }

    const turso = new TursoHttpClient(dbUrl, dbToken);
    const now = Math.floor(Date.now() / 1000);

    // Drop any suggestion that already exists (same type + name + city, case-insensitive)
    // to avoid duplicate rows from repeated submissions.
    const uniqueSuggestions = [];
    for (const s of sanitizedSuggestions) {
      const existing = await withTimeout(
        turso.execute({
          sql: 'SELECT 1 FROM suggestions WHERE lower(type) = lower(?) AND lower(name) = lower(?) AND lower(city) = lower(?) LIMIT 1',
          args: [s.type, s.name, s.city],
        }),
        15000,
        'TURSO_DUP_CHECK'
      );
      if (!existing.rows || existing.rows.length === 0) {
        uniqueSuggestions.push(s);
      }
    }

    if (uniqueSuggestions.length === 0) {
      return json(200, { success: true, count: 0, duplicate: true });
    }

    // Build batch insert query
    let sql = 'INSERT INTO suggestions (id, type, name, city, website, created_at) VALUES ';
    const placeholders = uniqueSuggestions.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    sql += placeholders;

    const args: any[] = [];
    uniqueSuggestions.forEach(s => {
      args.push(crypto.randomUUID(), s.type, s.name, s.city, s.website || null, now);
    });

    await withTimeout(turso.execute({ sql, args }), 15000, 'TURSO_INSERT');

    // Notify team via email
    const resendApiKey = env.RESEND_API_KEY || '';

    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);

        let textList = uniqueSuggestions.map((s, i) =>
          `${i + 1}. ${s.name} (${s.type}) - ${s.city} ${s.website ? `[${s.website}]` : ''}`
        ).join('\n');

        const notifyBody = [
          `New place suggestions received on acceso.design:\n`,
          textList,
          `\nSubmitted from IP: ${clientIp}`
        ].join('\n');

        await resend.emails.send({
          from: 'Acceso <login@acceso.design>',
          to: 'hello@acceso.design',
          subject: `${uniqueSuggestions.length} new place suggestion(s) on Acceso`,
          text: notifyBody,
        });
      } catch (emailErr) {
        console.error('[Suggestions] Failed to send notification email:', emailErr);
      }
    } else {
      console.warn('[Suggestions] RESEND_API_KEY is not configured; notification email skipped.');
    }

    return json(200, { success: true, count: uniqueSuggestions.length });
  } catch (error: any) {
    console.error('Suggestions API error:', error);
    const msg = String(error?.message || '');
    if (msg.includes('TURSO_INSERT_TIMEOUT')) {
      return json(504, { error: 'Database write timed out. Please retry.' });
    }
    return json(500, { error: 'Internal Server Error' });
  }
};
