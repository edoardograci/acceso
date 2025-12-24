// src/pages/auth/magic-link/send.ts
import type { APIRoute } from 'astro';
import { generateMagicLink } from '../../../lib/auth/magic-link';
import { Resend } from 'resend';

import type { Env } from '../../../env.d';

export const POST: APIRoute = async ({ request, locals }) => {
  // Try to get env from Cloudflare runtime locals or import.meta.env
  // We merge them to ensure we don't miss keys if one source is partial
  const runtimeEnv = locals.runtime?.env || {};
  const metaEnv = import.meta.env || {};

  // Create a combined env object. runtimeEnv takes precedence for overrides.
  const env = { ...metaEnv, ...runtimeEnv } as unknown as Env;

  try {
    const body = await request.json() as { email?: string };
    const { email } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Valid email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const magicLink = await generateMagicLink(email.toLowerCase().trim(), env, request.url);

    // Send email via Resend
    if (env.RESEND_API_KEY) {
      const resend = new Resend(env.RESEND_API_KEY);

      const { data, error: resendError } = await resend.emails.send({
        from: 'Acceso <login@acceso.design>',
        to: email,
        subject: 'Your login link for Acceso',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #171717; color: #ffffff;">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <tr>
                  <td style="text-align: center; padding-bottom: 32px;">
                    <img src="https://acceso.pages.dev/icon.svg" alt="Acceso" width="48" height="48" style="display: inline-block;">
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #242424; border: 1px solid #575757; border-radius: 8px; padding: 32px;">
                    <h1 style="margin: 0 0 16px 0; font-size: 24px; font-weight: 400; color: #ffffff;">Your login link</h1>
                    <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.5; color: #8B8B8B;">Click the button below to log in to Acceso. This link will expire in 15 minutes.</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="text-align: center; padding: 24px 0;">
                          <a href="${magicLink}" style="display: inline-block; padding: 14px 32px; background-color: #EDFE44; color: #000000; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 500;">Log in to Acceso</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 24px 0 0 0; font-size: 14px; line-height: 1.5; color: #8B8B8B;">If you didn't request this email, you can safely ignore it.</p>
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center; padding-top: 32px;">
                    <p style="margin: 0; font-size: 12px; color: #575757;">© 2025 Acceso. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </body>
          </html>
        `,
      });

      if (resendError) {
        console.error('[Magic Link] Resend error:', resendError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to send email. please try again later.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      console.log('[Magic Link] Link sent successfully via Resend:', data?.id);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Magic link sent to your email',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      console.warn('[Magic Link] RESEND_API_KEY is missing. Code: NO_KEY');

      // In development, log the link to console but DO NOT return it to client to simulate production behavior
      if (import.meta.env.DEV) {
        console.log('--- DEVELOPMENT MAGIC LINK ---');
        console.log(magicLink);
        console.log('------------------------------');
      }

      // Check specifically if we have any environment variables loaded to help debug
      const keyCount = Object.keys(env).length;
      console.log(`[Magic Link] Environment check: found ${keyCount} keys.`);

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Email service not configured (server-side). Check console logs if you are the developer.'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('[Magic Link] Error sending magic link:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to send magic link' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};