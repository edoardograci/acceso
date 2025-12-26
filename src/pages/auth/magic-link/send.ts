// src/pages/auth/magic-link/send.ts
import type { APIRoute } from 'astro';
import { generateMagicLink } from '../../../lib/auth/magic-link';
import { Resend } from 'resend';

import type { Env } from '../../../env.d';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtimeEnv = locals.runtime?.env || {};
  const metaEnv = import.meta.env || {};
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

    const normalizedEmail = email.toLowerCase().trim();
    const magicLink = await generateMagicLink(normalizedEmail, env, request.url);

    if (env.RESEND_API_KEY) {
      const resend = new Resend(env.RESEND_API_KEY);

      const { data, error: resendError } = await resend.emails.send({
        from: 'Acceso <login@acceso.design>',
        to: normalizedEmail,
        subject: 'Acceso Log in',
        headers: {
          'X-Entity-Ref-ID': crypto.randomUUID(),
        },
        // Plain text version for better deliverability
        text: `Log in to Acceso\n\nClick the link below to log in to your account:\n\n${magicLink}\n\nThis link will expire in 15 minutes.\n\nIf you didn't request this link, you can safely ignore this email.\n\n© 2025 Acceso. All rights reserved.`,
        html: `
          <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
          <html xmlns="http://www.w3.org/1999/xhtml" lang="en">
            <head>
              <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
              <meta name="x-apple-disable-message-reformatting" />
              <title>Log in to Acceso</title>
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
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap');
                
                /* Custom font - PP Fraktion Sans Variable */
                @font-face {
                  font-family: 'PP Fraktion Sans';
                  src: url('https://acceso.design/fonts/PPFraktionSans-Variable.ttf') format('truetype');
                  font-weight: 100 900;
                  font-style: normal;
                  font-display: swap;
                }
                
                /* Reset styles */
                body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
                table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
                img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
                table { border-collapse: collapse !important; }
                body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
                
                /* Prevent Outlook from adding extra spacing */
                .ExternalClass { width: 100%; }
                .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div { line-height: 100%; }
                
                /* iOS Blue Links */
                a[x-apple-data-detectors] {
                  color: inherit !important;
                  text-decoration: none !important;
                  font-size: inherit !important;
                  font-family: inherit !important;
                  font-weight: inherit !important;
                  line-height: inherit !important;
                }
                
                /* Media Queries */
                @media screen and (max-width: 600px) {
                  .email-container { width: 100% !important; margin: auto !important; }
                  .fluid { width: 100% !important; max-width: 100% !important; height: auto !important; margin-left: auto !important; margin-right: auto !important; }
                  .stack-column, .stack-column-center { display: block !important; width: 100% !important; max-width: 100% !important; direction: ltr !important; }
                  .center-on-narrow { text-align: center !important; display: block !important; margin-left: auto !important; margin-right: auto !important; float: none !important; }
                  table.center-on-narrow { display: inline-block !important; }
                }
              </style>
            </head>
            <body style="margin: 0; padding: 0; background-color: #111111; font-family: 'PP Fraktion Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
              <center style="width: 100%; background-color: #111111;">
                <!--[if mso | IE]>
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #111111;">
                <tr>
                <td>
                <![endif]-->
                
                <!-- Visually Hidden Preheader Text -->
                <div style="display: none; font-size: 1px; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all; font-family: sans-serif;">
                  Your secure login link for Acceso is ready. Click to log in.
                </div>
                
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0; padding: 0;">
                  <!-- Logo -->
                  <tr>
                    <td align="center" style="padding: 40px 0 30px 0;">
                      <img src="https://acceso.design/icons/logo.svg" alt="Acceso Logo" width="60" height="60" style="display: block; border-radius: 12px; max-width: 60px;" />
                    </td>
                  </tr>
                  
                  <!-- Email Body -->
                  <tr>
                    <td align="center" style="padding: 0 20px 40px 20px;">
                      <!--[if mso | IE]>
                      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="500" class="email-container">
                      <tr>
                      <td>
                      <![endif]-->
                      
                      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="max-width: 500px; background-color: #1A1A1A; border: 1px solid #333333; border-radius: 16px;">
                        <!-- Heading -->
                        <tr>
                          <td align="center" style="padding: 40px 40px 20px 40px;">
                            <h1 style="color: #ffffff; font-family: 'PP Fraktion Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 24px; font-weight: 600; line-height: 32px; margin: 0;">Your login link</h1>
                          </td>
                        </tr>
                        
                        <!-- Description -->
                        <tr>
                          <td align="center" style="padding: 0 40px 30px 40px;">
                            <p style="margin: 0; color: #999999; font-family: 'PP Fraktion Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; line-height: 24px;">Click the button below to log in to your account. This link will expire in 15 minutes.</p>
                          </td>
                        </tr>
                        
                        <!-- Button -->
                        <tr>
                          <td align="center" style="padding: 0 40px 40px 40px;">
                            <!--[if mso]>
                            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${magicLink}" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="17%" fillcolor="#EDFE44">
                              <w:anchorlock/>
                              <center style="color:#000000;font-family:sans-serif;font-size:16px;font-weight:600;">Log in to Acceso</center>
                            </v:roundrect>
                            <![endif]-->
                            <!--[if !mso]><!-->
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                              <tr>
                                <td align="center" style="background-color: #EDFE44; border-radius: 8px; mso-padding-alt: 14px 32px;">
                                  <a href="${magicLink}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: 'PP Fraktion Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 600; color: #000000; text-decoration: none; border-radius: 8px;">Log in to Acceso</a>
                                </td>
                              </tr>
                            </table>
                            <!--<![endif]-->
                          </td>
                        </tr>
                        
                        <!-- Alternative Link -->
                        <tr>
                          <td align="center" style="padding: 0 40px 30px 40px;">
                            <p style="margin: 0; color: #666666; font-family: 'PP Fraktion Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 20px;">Or copy and paste this link:</p>
                            <p style="margin: 10px 0 0 0; word-break: break-all;">
                              <a href="${magicLink}" style="color: #EDFE44; text-decoration: underline; font-family: 'PP Fraktion Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px;">${magicLink}</a>
                            </p>
                          </td>
                        </tr>
                        
                        <!-- Footer Note -->
                        <tr>
                          <td align="center" style="padding: 0 40px 40px 40px; border-top: 1px solid #333333;">
                            <p style="margin: 20px 0 0 0; color: #666666; font-family: 'PP Fraktion Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 20px;">If you didn't request this link, you can safely ignore this email.</p>
                          </td>
                        </tr>
                      </table>
                      
                      <!--[if mso | IE]>
                      </td>
                      </tr>
                      </table>
                      <![endif]-->
                    </td>
                  </tr>
                  
                  <!-- Copyright -->
                  <tr>
                    <td align="center" style="padding: 0 20px 40px 20px;">
                      <p style="margin: 0; color: #444444; font-family: 'PP Fraktion Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 18px;">&copy; 2025 Acceso. All rights reserved.</p>
                    </td>
                  </tr>
                </table>
                
                <!--[if mso | IE]>
                </td>
                </tr>
                </table>
                <![endif]-->
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

      if (import.meta.env.DEV) {
        console.log('--- DEVELOPMENT MAGIC LINK ---');
        console.log(magicLink);
        console.log('------------------------------');
      }

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