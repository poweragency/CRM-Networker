'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, Pencil, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RankBadge } from '@/components/ui/rank-badge';
import { useToast } from '@/components/crm/toaster';
import { WhatsAppButton } from '@/components/crm/whatsapp-button';
import { cn, formatDate } from '@/lib/utils';
import {
  OCCUPATION_LABELS,
  OCCUPATION_ORDER,
  RANK_LABELS,
  RANK_ORDER,
  STARTING_PACKAGE_LABELS,
  STARTING_PACKAGE_ORDER,
  type MarketerRank,
  type MarketerExtra,
  type MarketerStatus,
  type Occupation,
  type StartingPackage,
  type TeamMemberProfile,
} from '@/lib/types/db';
import {
  saveMarketerAnagrafica,
  saveMarketerIdentityAction,
} from '@/app/(app)/team/[id]/actions';

/**
 * MarketerAnagrafica — the per-member details card on /team/[id]. The identity
 * block (nome, cognome, sponsor, data iscrizione, rank) is read-only; the
 * anagrafica extras (pacchetto di partenza, addon, click piattaforma, città,
 * regione, data di nascita, studia/lavora, note) are editable in place by the
 * viewer themselves or a manager. Persistence is mock-backed for now (frontend +
 * mock only) — a save reflects locally and raises a "simulato in modalità demo"
 * toast.
 */

const fieldCx =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

function extraOf(p: TeamMemberProfile): MarketerExtra {
  return {
    starting_package: p.starting_package,
    addon: p.addon,
    platform_click: p.platform_click,
    phone: p.phone,
    city: p.city,
    region: p.region,
    birth_date: p.birth_date,
    occupation: p.occupation,
    notes: p.notes,
  };
}

export function MarketerAnagrafica({
  profile,
  canEdit,
  /** Whether rank + renewal status can be changed (manager editing a downline,
   *  never the own profile). Server re-checks the self-guard regardless. */
  canEditIdentity = false,
}: {
  profile: TeamMemberProfile;
  canEdit: boolean;
  canEditIdentity?: boolean;
}) {
  const t = useTranslations('team');
  const { toast } = useToast();

  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<MarketerExtra>(() => extraOf(profile));
  const [form, setForm] = React.useState<MarketerExtra>(saved);

  // Identity (rank + renewal status) — only when canEditIdentity.
  const [rank, setRank] = React.useState<MarketerRank>(profile.rank);
  const [status, setStatus] = React.useState<MarketerStatus>(profile.status);
  const [savedRank, setSavedRank] = React.useState<MarketerRank>(profile.rank);
  const [savedStatus, setSavedStatus] = React.useState<MarketerStatus>(profile.status);

  function set<K extends keyof MarketerExtra>(key: K, value: MarketerExtra[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startEdit() {
    setForm(saved);
    setRank(savedRank);
    setStatus(savedStatus);
    setEditing(true);
  }

  function cancel() {
    setForm(saved);
    setRank(savedRank);
    setStatus(savedStatus);
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    const res = await saveMarketerAnagrafica(profile.id, form);
    // Persist rank/status only if editable and actually changed.
    let identityOk = true;
    if (canEditIdentity && (rank !== savedRank || status !== savedStatus)) {
      const idRes = await saveMarketerIdentityAction(profile.id, { rank, status });
      identityOk = idRes.ok;
    }
    setSaving(false);
    if (!res.ok || !identityOk) {
      toast({ title: t('error'), variant: 'error' });
      return;
    }
    setSaved(form);
    setSavedRank(rank);
    setSavedStatus(status);
    setEditing(false);
    toast({
      title: t('saved'),
      description: res.demo ? t('saved_demo') : undefined,
      variant: 'success',
    });
  }

  const v = saved;
  const RENEWAL_STATES: MarketerStatus[] = ['active', 'inactive'];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 p-5 pb-3">
        <div className="space-y-1">
          <CardTitle>{t('anagrafica_title')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('anagrafica_subtitle')}</p>
        </div>
        {canEdit && !editing && (
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil aria-hidden />
            {t('edit')}
          </Button>
        )}
        {editing && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={cancel} disabled={saving}>
              <X aria-hidden />
              {t('cancel')}
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              <Check aria-hidden />
              {saving ? t('saving') : t('save')}
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-5 pt-0">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Read-only identity */}
          <ReadField label={t('f_first_name')} value={profile.first_name} />
          <ReadField label={t('f_last_name')} value={profile.last_name} />
          <ReadField label={t('f_sponsor')} value={profile.sponsor_name} />
          <ReadField
            label={t('f_registration')}
            value={profile.registration_date ? formatDate(profile.registration_date) : null}
          />
          {/* Rank — editable only for a downline (canEditIdentity). */}
          <div className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('f_rank')}
            </dt>
            <dd>
              {editing && canEditIdentity ? (
                <select
                  className={fieldCx}
                  value={rank}
                  onChange={(e) => setRank(e.target.value as MarketerRank)}
                >
                  {RANK_ORDER.map((r) => (
                    <option key={r} value={r}>
                      {RANK_LABELS[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <RankBadge rank={savedRank} />
              )}
            </dd>
          </div>

          {/* Renewal (status) — editable only for a downline (canEditIdentity). */}
          <div className="space-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('f_renewal')}
            </dt>
            <dd>
              {editing && canEditIdentity ? (
                <select
                  className={fieldCx}
                  value={status === 'active' ? 'active' : 'inactive'}
                  onChange={(e) => setStatus(e.target.value as MarketerStatus)}
                >
                  {RENEWAL_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s === 'active' ? t('renewal_active') : t('renewal_inactive')}
                    </option>
                  ))}
                </select>
              ) : (
                <Badge variant={savedStatus === 'active' ? 'success' : 'secondary'}>
                  {savedStatus === 'active' ? t('renewal_active') : t('renewal_inactive')}
                </Badge>
              )}
            </dd>
          </div>

          {/* Editable extras */}
          <EditableField label={t('f_package')} editing={editing}
            display={v.starting_package ? STARTING_PACKAGE_LABELS[v.starting_package] : null}>
            <select
              className={fieldCx}
              value={form.starting_package ?? ''}
              onChange={(e) =>
                set('starting_package', (e.target.value || null) as StartingPackage | null)
              }
            >
              <option value="">{t('package_none')}</option>
              {STARTING_PACKAGE_ORDER.map((p) => (
                <option key={p} value={p}>
                  {STARTING_PACKAGE_LABELS[p]}
                </option>
              ))}
            </select>
          </EditableField>

          <EditableField label={t('f_addon')} editing={editing} display={v.addon}>
            <Input
              value={form.addon ?? ''}
              placeholder={t('f_addon_placeholder')}
              onChange={(e) => set('addon', e.target.value || null)}
            />
          </EditableField>

          <EditableField
            label={t('f_platform_click')}
            editing={editing}
            display={v.platform_click ? t('yes') : t('no')}
            displayNode={
              <Badge variant={v.platform_click ? 'success' : 'secondary'}>
                {v.platform_click ? t('yes') : t('no')}
              </Badge>
            }
          >
            <label className="inline-flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={form.platform_click}
                onChange={(e) => set('platform_click', e.target.checked)}
              />
              {form.platform_click ? t('yes') : t('no')}
            </label>
          </EditableField>

          <EditableField
            label={t('f_phone')}
            editing={editing}
            display={v.phone}
            displayNode={
              v.phone ? (
                <span className="flex items-center gap-1.5">
                  <span className="text-sm text-foreground">{v.phone}</span>
                  <WhatsAppButton phone={v.phone} name={profile.display_name} />
                </span>
              ) : undefined
            }
          >
            <Input
              type="tel"
              value={form.phone ?? ''}
              placeholder="+39 ___ ___ ____"
              onChange={(e) => set('phone', e.target.value || null)}
            />
          </EditableField>

          <EditableField label={t('f_city')} editing={editing} display={v.city}>
            <Input
              value={form.city ?? ''}
              onChange={(e) => set('city', e.target.value || null)}
            />
          </EditableField>

          <EditableField label={t('f_region')} editing={editing} display={v.region}>
            <Input
              value={form.region ?? ''}
              onChange={(e) => set('region', e.target.value || null)}
            />
          </EditableField>

          <EditableField
            label={t('f_birth_date')}
            editing={editing}
            display={v.birth_date ? formatDate(v.birth_date) : null}
          >
            <input
              type="date"
              className={fieldCx}
              value={form.birth_date ?? ''}
              onChange={(e) => set('birth_date', e.target.value || null)}
            />
          </EditableField>

          <EditableField
            label={t('f_occupation')}
            editing={editing}
            display={v.occupation ? OCCUPATION_LABELS[v.occupation] : null}
          >
            <select
              className={fieldCx}
              value={form.occupation ?? ''}
              onChange={(e) =>
                set('occupation', (e.target.value || null) as Occupation | null)
              }
            >
              <option value="">{t('occupation_none')}</option>
              {OCCUPATION_ORDER.map((o) => (
                <option key={o} value={o}>
                  {OCCUPATION_LABELS[o]}
                </option>
              ))}
            </select>
          </EditableField>
        </dl>

        {/* Notes spans full width */}
        <div className="mt-4 space-y-1">
          <Label htmlFor="anagrafica-notes" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('f_notes')}
          </Label>
          {editing ? (
            <textarea
              id="anagrafica-notes"
              rows={3}
              className={cn(fieldCx, 'h-auto py-2')}
              placeholder={t('f_notes_placeholder')}
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value || null)}
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {v.notes || <span className="text-muted-foreground">{t('not_set')}</span>}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ReadField({ label, value }: { label: string; value: string | null }) {
  const t = useTranslations('team');
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm text-foreground">
        {value || <span className="text-muted-foreground">{t('not_set')}</span>}
      </dd>
    </div>
  );
}

function EditableField({
  label,
  editing,
  display,
  displayNode,
  children,
}: {
  label: string;
  editing: boolean;
  display: string | null;
  displayNode?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations('team');
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm text-foreground">
        {editing ? (
          children
        ) : displayNode ? (
          displayNode
        ) : (
          display || <span className="text-muted-foreground">{t('not_set')}</span>
        )}
      </dd>
    </div>
  );
}
