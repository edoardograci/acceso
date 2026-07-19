// src/lib/notify-new-user.ts
// Sends a notification email to the team whenever a new user registers.
import { Resend } from 'resend';
import type { Env } from '../env.d';

function resolveEnv(env: Env): { RESEND_API_KEY?: string } {
  const resolve = (key: 'RESEND_API_KEY'): string | undefined =>
    (import.meta.env[key] as string | undefined) ||
    env[key] ||
    (process.env[key] as string | undefined) ||
    undefined;

  return { RESEND_API_KEY: resolve('RESEND_API_KEY') };
}

export async function notifyNewUser(email: string, method: string, env: Env): Promise<void> {
  const { RESEND_API_KEY } = resolveEnv(env);
  if (!RESEND_API_KEY) {
    console.warn('[Notify] RESEND_API_KEY is not configured; new-user email skipped.');
    return;
  }

  try {
    const resend = new Resend(RESEND_API_KEY);
    const safeEmail = email || 'unknown';
    await resend.emails.send({
      from: 'Acceso <login@acceso.design>',
      to: 'hello@acceso.design',
      subject: `New user registered on Acceso`,
      text: `A new user just registered on acceso.design.\n\nEmail: ${safeEmail}\nMethod: ${method}\nTime: ${new Date().toISOString()}`,
    });
  } catch (err) {
    console.error('[Notify] Failed to send new-user notification email:', err);
  }
}
