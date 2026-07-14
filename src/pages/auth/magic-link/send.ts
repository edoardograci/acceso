// src/pages/auth/magic-link/send.ts
import type { APIRoute } from 'astro';
import { generateMagicLink } from '../../../lib/auth/magic-link';
import { Resend } from 'resend';

import type { Env } from '../../../env.d';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RateLimits } from '../../../lib/rate-limiter';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtimeEnv = locals.runtime?.env || {};
  const metaEnv = import.meta.env || {};
  const env = { ...metaEnv, ...runtimeEnv } as unknown as Env;

  // Abuse protection: throttle magic-link requests per client/IP
  const clientId = getClientIdentifier(request);
  const rateLimitResult = await checkRateLimit(clientId, RateLimits.EMAIL, env);
  if (!rateLimitResult.success && rateLimitResult.retryAfter) {
    return createRateLimitResponse(rateLimitResult.retryAfter, rateLimitResult.limit);
  }

  try {
    const body = await request.json() as { email?: string };
    const { email } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Valid email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const result = await generateMagicLink(normalizedEmail, env, request.url);

    if (result.error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: result.error,
          retryAfter: result.retryAfter
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const magicLink = result.link!;

    if (env.RESEND_API_KEY) {
      const resend = new Resend(env.RESEND_API_KEY);

      const { error: resendError } = await resend.emails.send({
        from: 'Acceso <login@acceso.design>',
        to: normalizedEmail,
        subject: 'Your Acceso login link',
        headers: {
          'X-Entity-Ref-ID': crypto.randomUUID(),
        },
        text: `Login to Acceso

Use the link below to securely log in to your account:

${magicLink}

This link will expire in 15 minutes.

If you did not request this email, you can safely ignore it.

© 2026 Acceso`,
        html: `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="x-apple-disable-message-reformatting" />
  <title>Your Acceso login link</title>

  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->

  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }

    .ExternalClass { width: 100%; }
    .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div { line-height: 100%; }

    a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }

    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
    }
  </style>
</head>

<body style="margin:0;padding:0;background-color:#F4F4F5;font-family:'Geist Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<center style="width:100%;background-color:#F4F4F5;">

  <!-- Preheader -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    Use this secure link to log in to your Acceso account.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
          <td align="center" style="padding:40px 20px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-container" style="max-width:500px;background-color:#FFFFFF;border:1px solid #E4E4E7;border-radius:12px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:40px 40px 20px;">
              <h1 style="margin:0;font-size:24px;line-height:32px;font-weight:600;color:#0F1113;">
                Login to Acceso
              </h1>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:0 40px 30px;">
              <p style="margin:0;font-size:16px;line-height:24px;color:#52525B;">
                Click the button below to securely log in. This link expires in 15 minutes.
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:0 40px 40px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${magicLink}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="50%" fillcolor="#EDFF77">
                <w:anchorlock/>
                <center style="color:#0F1113;font-size:16px;font-weight:700;">
                  Login to Acceso
                </center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-->
              <a
                href="${magicLink}"
                target="_blank"
                rel="noopener noreferrer"
                style="display:inline-block;padding:14px 32px;background-color:#EDFF77;color:#0F1113;font-size:16px;font-weight:700;text-decoration:none;border-radius:9999px;font-family:'Geist Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"
              >
                Login to Acceso
              </a>
              <!--<![endif]-->
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:0 40px 30px;">
              <p style="margin:0;font-size:13px;line-height:20px;color:#71717A;">
                Or copy and paste this link:
              </p>
              <p style="margin:10px 0 0;word-break:break-all;">
                <a href="${magicLink}" style="font-size:12px;color:#52525B;text-decoration:underline;word-break:break-all;">
                  ${magicLink}
                </a>
              </p>
            </td>
          </tr>

          <tr>
              <td align="center" style="padding:20px 40px 40px;border-top:1px solid #E4E4E7;">
              <p style="margin:0;font-size:13px;line-height:20px;color:#71717A;">
                If you did not request this email, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td align="center" style="padding:0 20px 40px;">
        <p style="margin:0;font-size:12px;line-height:18px;color:#71717A;font-family:'Geist Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          © 2026 Acceso
        </p>
      </td>
    </tr>
  </table>

</center>
</body>
</html>
        `,
      });

      if (resendError) {
        console.error('[Magic Link] Resend error:', resendError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to send email. Please try again later.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Magic link sent' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.warn('[Magic Link] RESEND_API_KEY missing');
    return new Response(
      JSON.stringify({ success: false, error: 'Email service not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Magic Link] Error:', error);
    const detail = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to send magic link', detail }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
