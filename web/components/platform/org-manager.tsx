'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Plus, Search, Loader2, PauseCircle, PlayCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/crm/toaster';
import { cn } from '@/lib/utils';
import type { PlatformOrg } from '@/lib/data/platform';
import { createOrgAction, setOrgStatusAction } from '@/app/(platform)/organizzazioni/actions';

/** Client-side slug preview (server re-normalizes + enforces uniqueness). */
function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

const CREATE_ERRORS: Record<string, string> = {
  forbidden: 'Non autorizzato.',
  service_missing: 'Servizio non configurato (manca la service-role key).',
  invalid: 'Controlla i campi: nome, slug ed email owner sono obbligatori.',
  slug_taken: 'Slug già in uso: scegline un altro.',
  email_taken: "Email owner già registrata su un altro account.",
  weak_password: 'Password troppo debole o compromessa: scegline una più robusta.',
  failed: 'Creazione non riuscita. Riprova.',
};

export function OrgManager({ initial }: { initial: PlatformOrg[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<PlatformOrg | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initial;
    return initial.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.slug.toLowerCase().includes(q) ||
        (o.ownerName ?? '').toLowerCase().includes(q) ||
        (o.ownerEmail ?? '').toLowerCase().includes(q),
    );
  }, [initial, query]);

  async function applyStatus(org: PlatformOrg, suspend: boolean) {
    setBusyId(org.id);
    const res = await setOrgStatusAction(org.id, suspend);
    setBusyId(null);
    setConfirm(null);
    if (res.ok) {
      toast({
        title: suspend ? 'Organizzazione sospesa' : 'Organizzazione riattivata',
        description: suspend
          ? 'I membri vedranno il messaggio di servizio non attivo. I dati restano intatti.'
          : "L'accesso dei membri è di nuovo attivo.",
        variant: 'success',
      });
      router.refresh();
    } else {
      toast({ title: 'Operazione non riuscita', variant: 'error' });
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per nome, slug o owner…"
            className="pl-9"
          />
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" aria-hidden />
          Crea organizzazione
        </Button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/40 px-6 py-12 text-center">
          <Building2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium text-foreground">
            {initial.length === 0 ? 'Nessuna organizzazione' : 'Nessun risultato'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {initial.length === 0
              ? 'Crea la prima organizzazione con il tasto qui sopra.'
              : 'Prova a cambiare i termini di ricerca.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Organizzazione</th>
                <th className="px-4 py-2.5 font-semibold">Owner</th>
                <th className="px-4 py-2.5 text-center font-semibold">Membri</th>
                <th className="px-4 py-2.5 font-semibold">Stato</th>
                <th className="px-4 py-2.5 text-right font-semibold">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((o) => (
                <tr key={o.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{o.name}</div>
                    <div className="text-xs text-muted-foreground">
                      /{o.slug} · dal {fmtDate(o.createdAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-foreground">{o.ownerName ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{o.ownerEmail ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 tabular-nums text-foreground">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      {o.memberCount}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                        o.status === 'suspended'
                          ? 'bg-danger/12 text-danger'
                          : 'bg-success/12 text-success',
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          o.status === 'suspended' ? 'bg-danger' : 'bg-success',
                        )}
                        aria-hidden
                      />
                      {o.status === 'suspended' ? 'Sospesa' : 'Attiva'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === o.id}
                      onClick={() => setConfirm(o)}
                      className={cn(
                        'gap-1.5',
                        o.status === 'suspended'
                          ? 'text-success hover:text-success'
                          : 'text-danger hover:text-danger',
                      )}
                    >
                      {busyId === o.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : o.status === 'suspended' ? (
                        <PlayCircle className="h-4 w-4" aria-hidden />
                      ) : (
                        <PauseCircle className="h-4 w-4" aria-hidden />
                      )}
                      {o.status === 'suspended' ? 'Riattiva' : 'Sospendi'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      <CreateOrgModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          router.refresh();
        }}
      />

      {/* Suspend / reactivate confirm */}
      <Modal
        open={confirm !== null}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={confirm?.status === 'suspended' ? 'Riattivare il servizio?' : 'Sospendere il servizio?'}
        description={
          confirm?.status === 'suspended'
            ? `I membri di "${confirm?.name}" potranno di nuovo accedere.`
            : `I membri di "${confirm?.name}" verranno bloccati con il messaggio di servizio non attivo. I dati NON vengono toccati.`
        }
        size="md"
        footer={
          confirm ? (
            <>
              <Button variant="outline" onClick={() => setConfirm(null)}>
                Annulla
              </Button>
              <Button
                onClick={() => applyStatus(confirm, confirm.status !== 'suspended')}
                disabled={busyId === confirm.id}
                className={confirm.status === 'suspended' ? '' : 'bg-danger text-white hover:bg-danger/90'}
              >
                {busyId === confirm.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {confirm.status === 'suspended' ? 'Riattiva' : 'Sospendi'}
              </Button>
            </>
          ) : null
        }
      >
        <p className="text-sm text-muted-foreground">
          {confirm?.status === 'suspended'
            ? 'La sospensione viene rimossa immediatamente.'
            : 'Usa questa azione in caso di mancato rinnovo del servizio.'}
        </p>
      </Modal>
    </div>
  );
}

/* ─────────────────────────────── create form ───────────────────────────── */

function CreateOrgModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [first, setFirst] = React.useState('');
  const [last, setLast] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setName('');
    setSlug('');
    setSlugTouched(false);
    setFirst('');
    setLast('');
    setEmail('');
    setPassword('');
  }

  function onName(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  async function submit() {
    setSaving(true);
    const res = await createOrgAction({
      name,
      slug,
      ownerFirstName: first,
      ownerLastName: last,
      ownerEmail: email,
      ownerPassword: password,
    });
    setSaving(false);
    if (res.ok) {
      toast({
        title: 'Organizzazione creata',
        description: `${name} è pronta. Comunica all'owner email e password temporanea (da cambiare al primo accesso).`,
        variant: 'success',
      });
      reset();
      onCreated();
    } else {
      toast({
        title: 'Creazione non riuscita',
        description: CREATE_ERRORS[res.error ?? 'failed'] ?? CREATE_ERRORS.failed,
        variant: 'error',
      });
    }
  }

  const canSubmit =
    name.trim().length > 1 &&
    slug.trim().length > 1 &&
    first.trim() &&
    last.trim() &&
    email.trim() &&
    password.length >= 8;

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title="Crea organizzazione"
      description="Crea l'org + l'account owner (radice). L'owner accede subito con la password temporanea."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={submit} disabled={!canSubmit || saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Crea
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Organizzazione
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nome">
              <Input value={name} onChange={(e) => onName(e.target.value)} placeholder="Es. Gen X Italia" />
            </Field>
            <Field label="Slug (URL)">
              <Input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                placeholder="gen-x-italia"
              />
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Owner (radice dell'albero)
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nome">
              <Input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Nome" />
            </Field>
            <Field label="Cognome">
              <Input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Cognome" />
            </Field>
            <Field label="Email login">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@email.com" />
            </Field>
            <Field label="Password temporanea">
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min. 8 caratteri"
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            L&apos;owner cambierà la password al primo accesso. Verrà creato come Vice President (rango più alto).
          </p>
        </section>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
