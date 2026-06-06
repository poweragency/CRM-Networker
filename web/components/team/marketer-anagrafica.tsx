'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Award,
  Briefcase,
  Cake,
  CalendarPlus,
  Check,
  Map,
  MapPin,
  MousePointerClick,
  Package,
  Pencil,
  Phone,
  Puzzle,
  RefreshCw,
  StickyNote,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RankBadge } from '@/components/ui/rank-badge';
import { PackageBadge } from '@/components/ui/package-badge';
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
 * MarketerAnagrafica — the per-member details card on /team/[id]. Grouped into
 * three visual sections (Identità, Dati personali, Business), each a grid of
 * labelled "tiles" with an icon. The identity block (nome, cognome, sponsor,
 * data iscrizione) is read-only; rank + renewal are editable only for a downline
 * (canEditIdentity); the anagrafica extras (pacchetto, addon, click, telefono,
 * città, regione, data di nascita, studia/lavora, note) are editable in place by
 * the viewer themselves or a manager. The same tiles flip to inputs in edit mode.
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
  /** Bare mode: drop the Card chrome + title (the host modal provides them). */
  bare = false,
}: {
  profile: TeamMemberProfile;
  canEdit: boolean;
  canEditIdentity?: boolean;
  bare?: boolean;
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
    // A promotion (rank moved UP) is a milestone → achievement (confetti).
    const rankUp =
      canEditIdentity && RANK_ORDER.indexOf(rank) > RANK_ORDER.indexOf(savedRank);
    setSaved(form);
    setSavedRank(rank);
    setSavedStatus(status);
    setEditing(false);
    if (rankUp) {
      toast({
        title: t('rank_up_title'),
        description: t('rank_up_body', { rank: RANK_LABELS[rank] }),
        variant: 'achievement',
      });
    } else {
      toast({
        title: t('saved'),
        description: res.demo ? t('saved_demo') : undefined,
        variant: 'success',
      });
    }
  }

  const v = saved;
  const RENEWAL_STATES: MarketerStatus[] = ['active', 'inactive'];

  return (
    <Card className={cn(bare && 'border-0 bg-transparent shadow-none')}>
      <CardHeader
        className={cn(
          'flex-row items-center justify-between space-y-0 p-5 pb-3',
          bare && 'px-0 pt-0',
        )}
      >
        {!bare && (
          <div className="space-y-1">
            <CardTitle>{t('anagrafica_title')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('anagrafica_subtitle')}</p>
          </div>
        )}
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

      <CardContent className={cn('space-y-6 p-5 pt-2', bare && 'px-0 pb-0')}>
        {/* Identità — read-only, except rank/renewal for a downline. */}
        <Section icon={User} title={t('sec_identity')} chip="bg-primary/10 text-primary">
          <Field icon={User} label={t('f_first_name')} value={profile.first_name} />
          <Field icon={User} label={t('f_last_name')} value={profile.last_name} />
          <Field
            icon={CalendarPlus}
            label={t('f_registration')}
            value={profile.registration_date ? formatDate(profile.registration_date) : null}
          />
          <Field
            icon={Award}
            label={t('f_rank')}
            editing={editing}
            valueNode={<RankBadge rank={savedRank} />}
            editor={
              canEditIdentity ? (
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
              ) : undefined
            }
          />
          <Field
            icon={RefreshCw}
            label={t('f_renewal')}
            editing={editing}
            valueNode={
              <Badge variant={savedStatus === 'active' ? 'success' : 'secondary'}>
                {savedStatus === 'active' ? t('renewal_active') : t('renewal_inactive')}
              </Badge>
            }
            editor={
              canEditIdentity ? (
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
              ) : undefined
            }
          />
        </Section>

        {/* Dati personali */}
        <Section icon={MapPin} title={t('sec_personal')} chip="bg-info/10 text-info">
          <Field
            icon={Cake}
            label={t('f_birth_date')}
            editing={editing}
            value={v.birth_date ? formatDate(v.birth_date) : null}
            editor={
              <input
                type="date"
                className={fieldCx}
                value={form.birth_date ?? ''}
                onChange={(e) => set('birth_date', e.target.value || null)}
              />
            }
          />
          <Field
            icon={MapPin}
            label={t('f_city')}
            editing={editing}
            value={v.city}
            editor={
              <Input
                value={form.city ?? ''}
                onChange={(e) => set('city', e.target.value || null)}
              />
            }
          />
          <Field
            icon={Map}
            label={t('f_region')}
            editing={editing}
            value={v.region}
            editor={
              <Input
                value={form.region ?? ''}
                onChange={(e) => set('region', e.target.value || null)}
              />
            }
          />
          <Field
            icon={Briefcase}
            label={t('f_occupation')}
            editing={editing}
            value={v.occupation ? OCCUPATION_LABELS[v.occupation] : null}
            editor={
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
            }
          />
          <Field
            icon={Phone}
            label={t('f_phone')}
            editing={editing}
            value={v.phone}
            valueNode={
              v.phone ? (
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground">{v.phone}</span>
                  <WhatsAppButton phone={v.phone} name={profile.display_name} />
                </span>
              ) : undefined
            }
            editor={
              <Input
                type="tel"
                value={form.phone ?? ''}
                placeholder="+39 ___ ___ ____"
                onChange={(e) => set('phone', e.target.value || null)}
              />
            }
          />
        </Section>

        {/* Business */}
        <Section icon={Package} title={t('sec_business')} chip="bg-warning/10 text-warning">
          <Field
            icon={Package}
            label={t('f_package')}
            editing={editing}
            valueNode={
              v.starting_package ? <PackageBadge pkg={v.starting_package} /> : undefined
            }
            editor={
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
            }
          />
          <Field
            icon={Puzzle}
            label={t('f_addon')}
            editing={editing}
            value={v.addon}
            editor={
              <Input
                value={form.addon ?? ''}
                placeholder={t('f_addon_placeholder')}
                onChange={(e) => set('addon', e.target.value || null)}
              />
            }
          />
          <Field
            icon={MousePointerClick}
            label={t('f_platform_click')}
            editing={editing}
            valueNode={
              <Badge variant={v.platform_click ? 'success' : 'secondary'}>
                {v.platform_click ? t('yes') : t('no')}
              </Badge>
            }
            editor={
              <label className="inline-flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={form.platform_click}
                  onChange={(e) => set('platform_click', e.target.checked)}
                />
                {form.platform_click ? t('yes') : t('no')}
              </label>
            }
          />
        </Section>

        {/* Note — full width */}
        <section>
          <SectionTitle icon={StickyNote} title={t('f_notes')} chip="bg-muted text-muted-foreground" />
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
            <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {v.notes || <span className="text-muted-foreground">{t('not_set')}</span>}
              </p>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function Section({
  icon,
  title,
  chip,
  children,
}: {
  icon: LucideIcon;
  title: string;
  /** Tone classes for the section icon chip (bg + text). */
  chip?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <SectionTitle icon={icon} title={title} chip={chip} />
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </dl>
    </section>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  chip = 'bg-muted text-muted-foreground',
}: {
  icon: LucideIcon;
  title: string;
  chip?: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', chip)}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
    </div>
  );
}

/**
 * A single labelled tile. Read mode shows `valueNode` (rich, e.g. a badge) or
 * `value` (plain text) or the not-set dash; edit mode shows `editor` when the
 * card is editing and an editor was provided (read-only fields pass none).
 */
function Field({
  icon: Icon,
  label,
  editing = false,
  value = null,
  valueNode,
  editor,
}: {
  icon: LucideIcon;
  label: string;
  editing?: boolean;
  value?: string | null;
  valueNode?: React.ReactNode;
  editor?: React.ReactNode;
}) {
  const t = useTranslations('team');
  const showEditor = Boolean(editing && editor);
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5 transition-colors hover:border-ring/40 hover:bg-muted/50">
      <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </dt>
      <dd className="mt-1.5">
        {showEditor ? (
          editor
        ) : valueNode ? (
          valueNode
        ) : value ? (
          <span className="text-sm font-medium text-foreground">{value}</span>
        ) : (
          <span className="text-sm text-muted-foreground">{t('not_set')}</span>
        )}
      </dd>
    </div>
  );
}
