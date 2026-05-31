import type { AppNotification } from '@/lib/types/db';
import { daysAgo } from '@/lib/data/mock/_shared';

/**
 * Deterministic demo notification inbox so /notifiche renders fully with no env
 * (RESILIENCE). One row per addressee (the demo viewer, Marco). Mix of types and
 * read/unread states; payloads carry deep-link refs the UI routes on click.
 * Pure data — safe to import from the server-only data layer.
 */
export function mockNotifications(): AppNotification[] {
  return [
    {
      id: 'ntf-1',
      type: 'bottleneck_alert',
      title_it: 'Collo di bottiglia rilevato nel ramo di Luca',
      body_it:
        'La conversione in fase Closing è scesa al 31% (soglia 45%). Apri Analytics per i dettagli.',
      payload: { marketer_id: 'nR' },
      read_at: null,
      created_at: daysAgo(0, 2),
      deleted_at: null,
    },
    {
      id: 'ntf-2',
      type: 'follow_up_due',
      title_it: '3 follow-up in scadenza oggi',
      body_it: 'Hai 3 prospect da ricontattare entro fine giornata.',
      payload: { prospect_id: 'p-002' },
      read_at: null,
      created_at: daysAgo(0, 5),
      deleted_at: null,
    },
    {
      id: 'ntf-3',
      type: 'monthly_report_ready',
      title_it: 'Report mensile di maggio pronto',
      body_it: 'Il tuo report di performance per maggio 2026 è disponibile.',
      payload: { report_id: 'rep-2026-05-nroot' },
      read_at: null,
      created_at: daysAgo(1, 3),
      deleted_at: null,
    },
    {
      id: 'ntf-4',
      type: 'rank_changed',
      title_it: 'Sara Conti è salita a Team Leader',
      body_it: 'Un membro del tuo team ha raggiunto un nuovo grado. Complimenti!',
      payload: { marketer_id: 'nLL' },
      read_at: daysAgo(2),
      created_at: daysAgo(2, 4),
      deleted_at: null,
    },
    {
      id: 'ntf-5',
      type: 'invitation',
      title_it: 'Invito CRM accettato da Anna Costa',
      body_it: 'Anna ha attivato il suo accesso CRM.',
      payload: { marketer_id: 'nLLL' },
      read_at: daysAgo(3),
      created_at: daysAgo(3, 1),
      deleted_at: null,
    },
    {
      id: 'ntf-6',
      type: 'system',
      title_it: 'Manutenzione programmata',
      body_it:
        'Domenica dalle 02:00 alle 03:00 la piattaforma potrebbe essere rallentata per aggiornamenti.',
      payload: {},
      read_at: daysAgo(4),
      created_at: daysAgo(5),
      deleted_at: null,
    },
    {
      id: 'ntf-7',
      type: 'follow_up_due',
      title_it: 'Follow-up di Giulia Bianchi da ripianificare',
      body_it: 'Un follow-up collegato a un tuo prospect è in ritardo di 2 giorni.',
      payload: { prospect_id: 'p-007' },
      read_at: daysAgo(6),
      created_at: daysAgo(6, 2),
      deleted_at: null,
    },
  ];
}
