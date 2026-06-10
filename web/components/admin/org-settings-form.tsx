'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Save } from 'lucide-react';
import type { OrgSettings } from '@/lib/types/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/crm/toaster';
import { updateOrgSettingsAction } from '@/app/(app)/admin/impostazioni-org/actions';

/**
 * Org settings form (doc 01 §1.1). Edits the org name + timezone and the
 * bottleneck-engine thresholds; slug/locale are shown read-only. Demo-safe:
 * saves through `updateOrgSettingsAction` and toasts real-vs-simulated.
 */

/** ISO timestamp → `datetime-local` input value (browser local time). */
function isoToLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function OrgSettingsForm({
  initial,
  initialDemo,
}: {
  initial: OrgSettings;
  initialDemo: boolean;
}) {
  const t = useTranslations('admin_org');
  const { toast } = useToast();

  const [name, setName] = React.useState(initial.name);
  const [timezone, setTimezone] = React.useState(initial.timezone);
  const [inactivity, setInactivity] = React.useState(initial.bottleneck.inactivity_days);
  const [followup, setFollowup] = React.useState(initial.bottleneck.followup_overdue_count);
  const [minVolume, setMinVolume] = React.useState(initial.bottleneck.min_volume_conoscitiva);
  const [cycleNumber, setCycleNumber] = React.useState<number | ''>(
    initial.cycle?.anchor_number ?? '',
  );
  const [cycleEnd, setCycleEnd] = React.useState(isoToLocalInput(initial.cycle?.anchor_end));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('name_required'));
      return;
    }
    // Company cycle: both fields together, or both empty (= calendar months).
    let cycle: OrgSettings['cycle'] | undefined;
    if (cycleEnd && cycleNumber !== '') {
      cycle = { anchor_end: new Date(cycleEnd).toISOString(), anchor_number: Number(cycleNumber) };
    } else if (!cycleEnd && cycleNumber === '') {
      cycle = null;
    } else {
      setError('Per il ciclo aziendale imposta sia il numero che la data di fine (o lascia entrambi vuoti).');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await updateOrgSettingsAction({
        name: name.trim(),
        timezone: timezone.trim(),
        bottleneck: {
          inactivity_days: inactivity,
          followup_overdue_count: followup,
          min_volume_conoscitiva: minVolume,
        },
        cycle,
      });
      toast({
        title: t('saved'),
        description: res.demo || initialDemo ? t('saved_demo') : undefined,
        variant: 'success',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-6">
      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle>{t('section_general')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 p-5 pt-0 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="org-name">{t('org_name')}</Label>
            <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-slug">{t('slug')}</Label>
            <Input id="org-slug" value={initial.slug} disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-locale">{t('locale')}</Label>
            <Input id="org-locale" value={initial.locale} disabled />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="org-tz">{t('timezone')}</Label>
            <Input id="org-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle>{t('section_bottleneck')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('section_bottleneck_desc')}</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 p-5 pt-0 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="bn-inact">{t('inactivity_days')}</Label>
            <Input
              id="bn-inact"
              type="number"
              min={1}
              value={inactivity}
              onChange={(e) => setInactivity(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">{t('inactivity_help')}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bn-fu">{t('followup_overdue_count')}</Label>
            <Input
              id="bn-fu"
              type="number"
              min={1}
              value={followup}
              onChange={(e) => setFollowup(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">{t('followup_help')}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bn-vol">{t('min_volume_conoscitiva')}</Label>
            <Input
              id="bn-vol"
              type="number"
              min={0}
              value={minVolume}
              onChange={(e) => setMinVolume(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">{t('min_volume_help')}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle>Ciclo aziendale</CardTitle>
          <p className="text-sm text-muted-foreground">
            I cicli durano 28 giorni (non i mesi solari). Imposta il numero e la data/ora
            di fine del ciclo ATTUALE: da lì le statistiche &laquo;del ciclo&raquo; si
            azzerano e ripartono i 28 giorni. Lascia vuoto per usare i mesi solari.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 p-5 pt-0 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cy-num">Numero ciclo attuale</Label>
            <Input
              id="cy-num"
              type="number"
              min={1}
              value={cycleNumber}
              onChange={(e) =>
                setCycleNumber(e.target.value === '' ? '' : Number(e.target.value))
              }
              placeholder="es. 78"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cy-end">Fine ciclo attuale (azzeramento)</Label>
            <Input
              id="cy-end"
              type="datetime-local"
              value={cycleEnd}
              onChange={(e) => setCycleEnd(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Da qui ripartono i 28 giorni.</p>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {pending ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  );
}
