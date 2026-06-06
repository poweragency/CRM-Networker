'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Building2, Check, Loader2, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/crm/toaster';
import { createClient } from '@/lib/supabase/client';
import { updateOrgIdentityAction } from '@/app/(app)/org/actions';

/**
 * OrgIdentitySettings — admin-only card to edit the organization's name and logo
 * (shown in the shell brand, top-left). The logo is uploaded client-side to the
 * public `org-assets` bucket; the name + logo url are persisted via the action
 * (admin-only via RLS). A placeholder is shown until a logo is set.
 */
export function OrgIdentitySettings({
  initialName,
  initialLogoUrl,
  orgId,
}: {
  initialName: string;
  initialLogoUrl: string | null;
  orgId: string;
}) {
  const t = useTranslations('impostazioni');
  const { toast } = useToast();
  const router = useRouter();

  const [name, setName] = React.useState(initialName);
  const [logoUrl, setLogoUrl] = React.useState<string | null>(initialLogoUrl);
  const [savingName, setSavingName] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const nameDirty = name.trim().length > 0 && name.trim() !== initialName;

  async function saveName() {
    const v = name.trim();
    if (!v) return;
    setSavingName(true);
    const res = await updateOrgIdentityAction({ name: v });
    setSavingName(false);
    if (!res.ok) {
      toast({ title: t('org_error'), variant: 'error' });
      return;
    }
    toast({
      title: t('org_saved'),
      description: res.demo ? t('calls_saved_demo') : undefined,
      variant: 'success',
    });
    if (!res.demo) router.refresh();
  }

  async function onPickLogo(file: File) {
    setUploading(true);
    const supabase = createClient();
    if (!supabase) {
      // Demo: just preview locally + simulate success.
      setLogoUrl(URL.createObjectURL(file));
      await updateOrgIdentityAction({ logo_url: '#' });
      setUploading(false);
      toast({ title: t('org_saved'), description: t('calls_saved_demo'), variant: 'success' });
      return;
    }
    try {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'png';
      const path = `${orgId}/logo/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('org-assets')
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
      if (upErr) {
        setUploading(false);
        toast({ title: t('org_error'), variant: 'error' });
        return;
      }
      const { data: pub } = supabase.storage.from('org-assets').getPublicUrl(path);
      const res = await updateOrgIdentityAction({ logo_url: pub.publicUrl });
      setUploading(false);
      if (!res.ok) {
        await supabase.storage.from('org-assets').remove([path]);
        toast({ title: t('org_error'), variant: 'error' });
        return;
      }
      setLogoUrl(pub.publicUrl);
      toast({ title: t('org_saved'), variant: 'success' });
      router.refresh();
    } catch {
      setUploading(false);
      toast({ title: t('org_error'), variant: 'error' });
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2.5 space-y-0">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="h-4 w-4" aria-hidden />
        </span>
        <div className="space-y-0.5">
          <CardTitle>{t('org_identity_title')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('org_identity_subtitle')}</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          {/* Logo preview / placeholder */}
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted text-muted-foreground">
            {logoUrl && logoUrl !== '#' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-contain" />
            ) : (
              <Building2 className="h-7 w-7" aria-hidden />
            )}
          </span>

          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{t('org_logo')}</p>
            <p className="text-xs text-muted-foreground">{t('org_logo_hint')}</p>
            <input
              ref={fileRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.svg"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPickLogo(f);
              }}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1.5"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
              {t('org_logo_upload')}
            </Button>
          </div>
        </div>

        {/* Name */}
        <label className="flex max-w-md flex-col gap-1 text-xs font-medium text-muted-foreground">
          {t('org_name')}
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('org_name_ph')}
            />
            <Button onClick={saveName} disabled={savingName || !nameDirty}>
              {savingName ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
              {t('org_save')}
            </Button>
          </div>
        </label>
      </CardContent>
    </Card>
  );
}
