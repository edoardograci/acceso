// src/lib/emails/submission-decision.ts
//
// The acceptance / rejection emails sent when a studio submission is reviewed.
// Single source of truth: the admin dashboard route (`/api/admin/submissions/
// [id]/email`) and the two root-level CLI scripts both render from here, so the
// copy can never drift between the manual and the dashboard path.
//
// Rendering is pure — `renderAcceptanceEmail` / `renderRejectionEmail` return
// `{ subject, text, html }` and touch no network. `sendDecisionEmail` is the
// only part that needs a Resend key, which keeps the templates testable and
// previewable from the dashboard without sending anything.

import { Resend } from 'resend';

export type DecisionKind = 'acceptance' | 'rejection';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** From-address for review decisions. `hello@` so replies reach the team. */
export const DECISION_FROM = 'Acceso <hello@acceso.design>';

/** Always copied on decisions so the team keeps a thread of what was sent. */
export const DECISION_CC = ['accesomilano@gmail.com'];

const SITE_URL = 'https://acceso.design';

/** Escape a value interpolated into the HTML template. */
function esc(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Shared table-based shell. Email clients need inline styles and table layout,
 * so both templates render through here rather than duplicating the boilerplate.
 *
 * @param preheader Hidden text shown in the inbox preview line.
 * @param bodyHtml  Pre-escaped markup for the message body.
 */
function layout({
  subject,
  preheader,
  heading,
  bodyHtml,
}: {
  subject: string;
  preheader: string;
  heading: string;
  bodyHtml: string;
}): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="x-apple-disable-message-reformatting" />
  <title>${esc(subject)}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
    .ExternalClass { width: 100%; }
    .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div { line-height: 100%; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#F4F4F5;font-family:'Geist Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<center style="width:100%;background-color:#F4F4F5;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${esc(preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-container" style="max-width:500px;background-color:#FFFFFF;border:1px solid #E4E4E7;border-radius:12px;overflow:hidden;">
          <tr>
            <td align="left" style="padding:40px 40px 20px;">
              <h1 style="margin:0;font-size:24px;line-height:32px;font-weight:600;color:#0F1113;">
                ${esc(heading)}
              </h1>
            </td>
          </tr>
          <tr>
            <td align="left" style="padding:0 40px 30px;">
${bodyHtml}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 40px 40px;border-top:1px solid #E4E4E7;">
              <p style="margin:0;font-size:13px;line-height:20px;color:#71717A;font-weight:600;">
                The Acceso Team
              </p>
              <p style="margin:12px 0 0;font-size:16px;line-height:24px;color:#0F1113;font-weight:600;">
                Acceso
              </p>
              <p style="margin:0;font-size:13px;line-height:20px;color:#71717A;">
                Your local design infopoint.
              </p>
              <p style="margin:8px 0 0;font-size:12px;line-height:18px;color:#71717A;">
                <a href="${SITE_URL}" style="color:#71717A;text-decoration:underline;">acceso.design</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:0 20px 40px;">
        <p style="margin:0;font-size:12px;line-height:18px;color:#71717A;font-family:'Geist Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          © ${new Date().getFullYear()} Acceso
        </p>
      </td>
    </tr>
  </table>
</center>
</body>
</html>`;
}

const P = 'margin:16px 0 0;font-size:16px;line-height:24px;color:#52525B;';
const P_FIRST = 'margin:0;font-size:16px;line-height:24px;color:#52525B;';

export function renderAcceptanceEmail({ profileUrl }: { profileUrl: string }): RenderedEmail {
  const subject = 'Your designer profile is now live on Acceso';

  const text = `Thank you for submitting your profile to Acceso.

We're happy to let you know that your submission has been reviewed and accepted. Your designer profile is now live and can be found here:

${profileUrl}

We're building Acceso as a curated directory of independent industrial and furniture designers, and we're glad to include your work.

If you notice any inaccuracies or would like to update your profile in the future, simply reply to this email or submit an updated version through our website.

Thank you for being part of Acceso.

Best regards,

The Acceso Team

${SITE_URL}`;

  const bodyHtml = `              <p style="${P_FIRST}">
                Thank you for submitting your profile to Acceso.
              </p>
              <p style="${P}">
                We're happy to let you know that your submission has been reviewed and accepted. Your designer profile is now live and can be found here:
              </p>
              <p style="margin:16px 0 0;text-align:center;">
                <a href="${esc(profileUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;background-color:#EDFF77;color:#0F1113;font-size:16px;font-weight:700;text-decoration:none;border-radius:9999px;font-family:'Geist Sans',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                  View your profile
                </a>
              </p>
              <p style="${P}">
                If you notice any inaccuracies or would like to update your profile in the future, simply reply to this email or submit an updated version through our website.
              </p>`;

  return {
    subject,
    text,
    html: layout({
      subject,
      preheader: 'Your designer profile is now live on Acceso.',
      heading: subject,
      bodyHtml,
    }),
  };
}

export function renderRejectionEmail(): RenderedEmail {
  const subject = 'Update on your Acceso submission';

  const text = `Hello,

Thank you for submitting your profile to Acceso.

We've carefully reviewed your submission. While we won't be publishing your profile immediately, we'd like to keep it under consideration as Acceso continues to grow.

Acceso is a curated directory, and new profiles are added gradually as we expand into new cities, categories, and collections. Because of this, some submissions may not be published right away but can still be featured at a later stage if they become a good fit for the platform's ongoing development.

If we decide to publish your profile in the future, we'll get in touch to let you know.

Thank you again for your interest in Acceso and for taking the time to share your work with us. We truly appreciate it and hope to have the opportunity to feature you in the future.

Best regards,

The Acceso Team

${SITE_URL}`;

  const bodyHtml = `              <p style="${P_FIRST}">
                Hello,
              </p>
              <p style="${P}">
                Thank you for submitting your profile to Acceso.
              </p>
              <p style="${P}">
                We've carefully reviewed your submission. While we won't be publishing your profile immediately, we'd like to keep it under consideration as Acceso continues to grow.
              </p>
              <p style="${P}">
                Acceso is a curated directory, and new profiles are added gradually as we expand into new cities, categories, and collections. Because of this, some submissions may not be published right away but can still be featured at a later stage if they become a good fit for the platform's ongoing development.
              </p>
              <p style="${P}">
                If we decide to publish your profile in the future, we'll get in touch to let you know.
              </p>
              <p style="${P}">
                Thank you again for your interest in Acceso and for taking the time to share your work with us. We truly appreciate it and hope to have the opportunity to feature you in the future.
              </p>`;

  return {
    subject,
    text,
    html: layout({
      subject,
      preheader: 'Update on your Acceso submission.',
      heading: subject,
      bodyHtml,
    }),
  };
}

/**
 * Render the email for a decision without sending it. Used by the dashboard's
 * preview panel so an admin sees the exact copy before committing to a send.
 */
export function renderDecisionEmail(kind: DecisionKind, profileUrl?: string): RenderedEmail {
  if (kind === 'acceptance') {
    if (!profileUrl) throw new Error('profileUrl is required for an acceptance email');
    return renderAcceptanceEmail({ profileUrl });
  }
  return renderRejectionEmail();
}

export interface SendDecisionEmailOptions {
  to: string;
  kind: DecisionKind;
  profileUrl?: string;
  /** Override the CC list; defaults to DECISION_CC. Pass [] to send without CC. */
  cc?: string[];
}

/**
 * Send a decision email through Resend. Throws on a Resend-reported error so
 * the caller can avoid recording a "sent" timestamp for a message that failed.
 */
export async function sendDecisionEmail(
  apiKey: string,
  { to, kind, profileUrl, cc = DECISION_CC }: SendDecisionEmailOptions
): Promise<{ id?: string }> {
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  if (!to) throw new Error('A recipient address is required');

  const { subject, text, html } = renderDecisionEmail(kind, profileUrl);
  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from: DECISION_FROM,
    to,
    ...(cc.length ? { cc } : {}),
    subject,
    headers: { 'X-Entity-Ref-ID': crypto.randomUUID() },
    text,
    html,
  });

  if (error) {
    throw new Error(error.message || 'Resend rejected the message');
  }

  return { id: data?.id };
}
