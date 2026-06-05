'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, Palette, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/crm/toaster';
import { contrastText, navPreviewColor, type OrgTheme } from '@/lib/theme';
import { saveOrgThemeAction } from '@/app/(app)/impostazioni/actions';

/**
 * ThemeSettings — admin-only "Tema" card (under the profile settings). The admin
 * picks just two colors (page background + navbar/buttons); text contrast is
 * derived automatically. A live preview shows the result before applying; saving
 * persists org-wide. "Ripristina" clears the custom theme (back to default).
 */

const PRESETS: ReadonlyArray<{ name: string; background: string; navbar: string }> = [
  { name: 'Blu notte', background: '#0b1220', navbar: '#3b82f6' },
  { name: 'Chiaro', background: '#f5f7fb', navbar: '#2f6df6' },
  { name: 'Viola', background: '#0e0a1a', navbar: '#7c3aed' },
  { name: 'Verde', background: '#07140f', navbar: '#15a36a' },
  { name: 'Oro', background: '#15120a', navbar: '#e0a92e' },
  { name: 'Rosa', background: '#1a0b12', navbar: '#ec4899' },
];

const DEFAULT_THEME: OrgTheme = { background: '#ffffff', navbar: '#2f6df6' };

export function ThemeSettings({ initial }: { initial: OrgTheme | null }) {
  const t = useTranslations('impostazioni');
  const { toast } = useToast();
  const [theme, setTheme] = React.useState<OrgTheme>(initial ?? DEFAULT_THEME);
  const [saving, setSaving] = React.useState(false);

  async function save(next: OrgTheme | null) {
    setSaving(true);
    const res = await saveOrgThemeAction(next);
    setSaving(false);
    if (!res.ok) {
      toast({ title: t('theme_error'), variant: 'error' });
      return;
    }
    toast({
      title: t('theme_saved'),
      description: res.demo ? t('theme_saved_demo') : t('theme_saved_body'),
      variant: 'success',
    });
  }

  const navText = contrastText(theme.navbar);
  const bgText = contrastText(theme.background);
  const navSurface = navPreviewColor(theme.navbar);

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2.5 space-y-0">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Palette className="h-4 w-4" aria-hidden />
        </span>
        <div className="space-y-0.5">
          <CardTitle>{t('theme_title')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('theme_subtitle')}</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Live preview */}
        <div
          className="overflow-hidden rounded-xl border shadow-sm"
          style={{ background: theme.background, color: bgText }}
        >
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ background: navSurface, color: '#ffffff' }}
          >
            <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <span
                className="h-5 w-5 rounded-md"
                style={{ background: theme.navbar }}
                aria-hidden
              />
              {t('theme_preview_nav')}
            </span>
            <span
              className="rounded-md px-2.5 py-1 text-xs font-semibold"
              style={{ background: theme.navbar, color: navText }}
            >
              {t('theme_preview_button')}
            </span>
          </div>
          <div className="px-4 py-6">
            <p className="text-sm font-medium">{t('theme_preview_title')}</p>
            <p className="mt-1 text-sm opacity-70">{t('theme_preview_body')}</p>
          </div>
        </div>

        {/* Color pickers */}
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            label={t('theme_background')}
            value={theme.background}
            onChange={(v) => setTheme((s) => ({ ...s, background: v }))}
          />
          <ColorField
            label={t('theme_navbar')}
            value={theme.navbar}
            onChange={(v) => setTheme((s) => ({ ...s, navbar: v }))}
          />
        </div>

        {/* Presets */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('theme_presets')}
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setTheme({ background: p.background, navbar: p.navbar })}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
              >
                <span className="flex">
                  <span className="h-3.5 w-3.5 rounded-full border" style={{ background: p.background }} />
                  <span className="-ml-1.5 h-3.5 w-3.5 rounded-full border" style={{ background: p.navbar }} />
                </span>
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-contrast note */}
        <p className="text-xs text-muted-foreground">{t('theme_contrast_note')}</p>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => save(theme)} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            {t('theme_apply')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setTheme(DEFAULT_THEME);
              void save(null);
            }}
            disabled={saving}
          >
            <RotateCcw aria-hidden />
            {t('theme_reset')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm tabular-nums shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
