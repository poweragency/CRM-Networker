import 'server-only';
import { logError } from '@/lib/log';

/**
 * Transactional "welcome" email, sent when a new member's account is created.
 * Uses the Resend HTTP API directly (no extra dependency). Best-effort: never
 * throws and never blocks account creation — if Resend isn't configured or the
 * send fails, it logs and returns.
 *
 * Required env (set in Vercel):
 *   RESEND_API_KEY  — your Resend API key (secret)
 *   RESEND_FROM     — verified sender, e.g. "PowerNetwork <noreply@tuodominio.it>"
 * Optional:
 *   NEXT_PUBLIC_SITE_URL — app base URL (defaults to the prod domain)
 */

const APP_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://crm-networker.vercel.app'
).replace(/\/$/, '');

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendWelcomeEmail(to: string, fullName: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) return; // not configured → skip silently

  const name = escapeHtml((fullName || '').trim()) || 'e benvenuta a bordo';
  const loginUrl = `${APP_URL}/accedi`;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111;line-height:1.5;">
    <h1 style="font-size:20px;margin:0 0 12px;">Benvenuto in PowerNetwork, ${name}! 🎉</h1>
    <p>Il tuo account è stato creato. Da oggi hai accesso al gestionale per seguire la tua rete, i percorsi dei prospect e le presenze alle call.</p>
    <p style="margin:24px 0;">
      <a href="${loginUrl}" style="background:#7c5cff;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;">Accedi ora</a>
    </p>
    <p style="font-size:14px;color:#555;">Accedi con la tua email (<b>${escapeHtml(to)}</b>) e la password che ti ha comunicato il tuo sponsor. Se non la ricordi, usa <b>“Password dimenticata”</b> nella pagina di accesso.</p>
    <p style="font-size:12px;color:#999;margin-top:32px;">PowerNetwork · Power Agency</p>
  </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject: 'Benvenuto in PowerNetwork 🎉',
        html,
      }),
    });
    if (!res.ok) {
      logError('sendWelcomeEmail', new Error(`Resend ${res.status}: ${await res.text()}`), { to });
    }
  } catch (e) {
    logError('sendWelcomeEmail', e, { to });
  }
}
