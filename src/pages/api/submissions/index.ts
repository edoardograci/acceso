import type { APIRoute } from 'astro';
import { TursoHttpClient } from '../../../lib/turso';
import { Resend } from 'resend';
import type { Env } from '../../../env.d';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RateLimits } from '../../../lib/rate-limiter';

const MAX_IMAGE_SIZE = 1024 * 1024; // 1MB
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const MAX_DESCRIPTION_LENGTH = 1200;
const R2_TIMEOUT_MS = 90000;
const TURSO_TIMEOUT_MS = 45000;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
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
    // Prefer local .env / import.meta.env when present (dev), but fall back to runtime env (Cloudflare) in prod.
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
    const user = locals.user;
    if (!user) return json(401, { error: 'Unauthorized' });

    if (!dbUrl || !dbToken) {
      return json(500, { error: 'Server configuration error (DB)' });
    }
    if (!turnstileSecret) {
      return json(500, { error: 'Captcha not configured' });
    }
    const indexBucket = runtimeEnv?.INDEX_BUCKET;
    if (!indexBucket) {
      return json(500, { error: 'Server configuration error (R2)' });
    }

    // Captcha raises the cost of an abusive submission but does not bound it:
    // this route writes an image to R2, inserts a row and sends an email every
    // time. Gate it before any of that work happens.
    const rateLimitEnv = { TURSO_DATABASE_URL: dbUrl, TURSO_AUTH_TOKEN: dbToken } as unknown as Env;
    const clientId = getClientIdentifier(request, user.id);
    const rateLimitResult = await checkRateLimit(clientId, RateLimits.SUBMISSIONS, rateLimitEnv);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(Math.max(1, rateLimitResult.retryAfter ?? 1), rateLimitResult.limit);
    }

    const form = await request.formData();
    const name = String(form.get('name') || '').trim();
    const website = String(form.get('website') || '').trim();
    const city = String(form.get('city') || '').trim();
    const country = String(form.get('country') || '').trim();
    const address = String(form.get('address') || '').trim();
    const instagram = String(form.get('instagram') || '').trim();
    const description = String(form.get('description') || '').trim();
    const contactEmail = String(form.get('contact_email') || '').trim() || (user.email ?? '');
    const captchaToken = String(form.get('captcha_token') || '').trim();
    const coverFile = form.get('cover_file');

    if (!name || !website || !city || !country) {
      return json(400, { error: 'Missing required fields' });
    }
    if (!description) {
      return json(400, { error: 'Description is required' });
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return json(400, { error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer` });
    }
    if (!captchaToken) {
      return json(400, { error: 'Captcha required' });
    }
    if (!(coverFile instanceof File)) {
      return json(400, { error: 'Cover image is required' });
    }
    if (coverFile.size <= 0 || coverFile.size > MAX_IMAGE_SIZE || !ALLOWED_IMAGE_TYPES.has(coverFile.type)) {
      return json(400, { error: 'Invalid image (PNG/JPG/WEBP, max 1MB)' });
    }

    let verifyJson: any = null;
    // In local dev, Miniflare/Undici can stall against Turnstile verify endpoint.
    // We still require a captcha token from the widget, but skip remote verification in dev.
    if (import.meta.env.DEV) {
      verifyJson = { success: true, dev_bypass: true };
    } else {
      const verifyBody = new URLSearchParams({
        secret: turnstileSecret,
        response: captchaToken,
        ...(request.headers.get('cf-connecting-ip')
          ? { remoteip: String(request.headers.get('cf-connecting-ip')) }
          : {}),
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

    const submissionId = crypto.randomUUID();
    const ext = coverFile.type === 'image/png' ? 'png' : coverFile.type === 'image/webp' ? 'webp' : 'jpg';
    const safeName = slugify(name) || 'studio';
    const imageKey = `submissions/${Date.now()}-${safeName}-${submissionId}.${ext}`;

    // Keep upload options minimal for max compatibility in local dev + remote buckets.
    await withTimeout(
      indexBucket.put(imageKey, await coverFile.arrayBuffer(), {
        httpMetadata: { contentType: coverFile.type },
      }),
      R2_TIMEOUT_MS,
      'R2_PUT'
    );

    const requestOrigin = new URL(request.url).origin;
    const publicBase = import.meta.env.DEV
      ? requestOrigin
      : (import.meta.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || requestOrigin);
    const imageUrl = `${publicBase.replace(/\/$/, '')}/cdn/${imageKey}`;

    const turso = new TursoHttpClient(dbUrl, dbToken);
    const now = Math.floor(Date.now() / 1000);

    await withTimeout(turso.execute({
      sql: `
        INSERT INTO submissions
          (id, user_id, name, website, city, country, address, instagram, description, contact_email, image_url, image_key, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        submissionId,
        user.id,
        name,
        website,
        city,
        country,
        address || null,
        instagram || null,
        description,
        contactEmail,
        imageUrl,
        imageKey,
        'pending',
        now,
        now,
      ],
    }), TURSO_TIMEOUT_MS, 'TURSO_INSERT');

    // Notify the Acceso team of the new submission.
    const resendApiKey =
      import.meta.env.RESEND_API_KEY ||
      runtimeEnv?.RESEND_API_KEY ||
      process.env.RESEND_API_KEY ||
      '';
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        const notifyBody = [
          `New submission on acceso.design`,
          ``,
          `Studio:        ${name}`,
          `Website:       ${website || '-'}`,
          `City:          ${city || '-'}`,
          `Country:       ${country || '-'}`,
          `Address:       ${address || '-'}`,
          `Instagram:     ${instagram || '-'}`,
          `Description:   ${description}`,
          ``,
          `Submitted by:   ${(user.email ?? 'unknown')}`,
          `User ID:       ${user.id}`,
          `Submission ID: ${submissionId}`,
          `Cover image:   ${imageUrl}`,
        ].join('\n');
        await resend.emails.send({
          from: 'Acceso <login@acceso.design>',
          to: 'hello@acceso.design',
          replyTo: user.email || undefined,
          subject: 'New submission on acceso.design',
          text: notifyBody,
        });
      } catch (emailErr) {
        console.error('[Submissions] Failed to send notification email:', emailErr);
      }
    }

    return json(200, { success: true, id: submissionId, imageUrl });
  } catch (error: any) {
    const msg = String(error?.message || '');
    if (msg.includes('R2_PUT_TIMEOUT')) {
      return json(504, { error: 'Upload to image storage timed out. Please retry.' });
    }
    if (msg.includes('TURSO_INSERT_TIMEOUT')) {
      return json(504, { error: 'Database write timed out. Please retry.' });
    }
    return json(500, { error: 'Internal Server Error' });
  }
};
