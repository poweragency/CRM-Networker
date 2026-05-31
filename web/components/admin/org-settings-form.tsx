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
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('name_required'));
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
