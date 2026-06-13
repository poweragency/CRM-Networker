'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/crm/empty-state';
import { useToast } from '@/components/crm/toaster';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { OrgDocument } from '@/lib/data/org-documents';
import {
  createOrgDocumentAction,
  deleteOrgDocumentAction,
} from '@/app/(app)/org/actions';

/**
 * DocumentsSettings — admin/co-admin "Documenti scaricabili" card. Admins publish
 * org-wide files; co-admins publish team files (branch-filtered to their downline).
 * The file is uploaded client-side to the public `org-assets` bucket, then the
 * metadata (path + public url + title + scope/branch) is saved via the action.
 * Mirrors {@link CallsSettings}.
 */

const selectCx =
  'h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.png,.jpg,.jpeg';

export function DocumentsSettings({
  initial,
  isAdmin,
  orgId,
  selfMarketerId,
}: {
  initial: OrgDocument[];
  isAdmin: boolean;
  orgId: string;
  selfMarketerId: string;
}) {
  const t = useTranslations('impostazioni');
  const { toast } = useToast();
  const router = useRouter();

  const [title, setTitle] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [teamBranch, setTeamBranch] = React.useState<'all' | 'left' | 'right'>('all');
  const [isBook, setIsBook] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  function resetForm() {
    setTitle('');
    setFile(null);
    setIsBook(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function add() {
    if (!file) {
      toast({ title: t('docs_file_required'), variant: 'error' });
      return;
    }
    const name = title.trim() || file.name.replace(/\.[^.]+$/, '');
    const scope: 'org' | 'team' = isAdmin ? 'org' : 'team';
    const branch = isAdmin ? null : teamBranch;
    setSaving(true);

    const supabase = createClient();
    // Demo (no env): simulate a successful publish.
    if (!supabase) {
      const res = await createOrgDocumentAction({
        title: name,
        file_path: 'demo',
        file_url: '#',
        scope,
        team_branch: branch,
        is_book: isAdmin && isBook,
      });
      setSaving(false);
      if (res.ok) {
        toast({ title: t('docs_added'), description: t('calls_saved_demo'), variant: 'success' });
        resetForm();
      } else {
        toast({ title: t('docs_error'), variant: 'error' });
      }
      return;
    }

    try {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
      const path = `${orgId}/documents/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('org-assets')
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
      if (upErr) {
        setSaving(false);
        toast({ title: t('docs_error'), variant: 'error' });
        return;
      }
      const { data: pub } = supabase.storage.from('org-assets').getPublicUrl(path);
      const res = await createOrgDocumentAction({
        title: name,
        file_path: path,
        file_url: pub.publicUrl,
        scope,
        team_branch: branch,
        is_book: isAdmin && isBook,
      });
      setSaving(false);
      if (!res.ok) {
        // Roll back the orphaned upload.
        await supabase.storage.from('org-assets').remove([path]);
        toast({ title: t('docs_error'), variant: 'error' });
        return;
      }
      toast({ title: t('docs_added'), variant: 'success' });
      resetForm();
      router.refresh();
    } catch {
      setSaving(false);
      toast({ title: t('docs_error'), variant: 'error' });
    }
  }

  async function remove(d: OrgDocument) {
    setDeleting(d.id);
    const res = await deleteOrgDocumentAction(d.id, d.file_path);
    setDeleting(null);
    if (!res.ok) {
      toast({ title: t('docs_error'), variant: 'error' });
      return;
    }
    toast({ title: t('docs_deleted'), variant: 'success' });
    if (!res.demo) router.refresh();
  }

  const canManage = (d: OrgDocument) => isAdmin || d.created_by === selfMarketerId;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2.5 space-y-0">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FileText className="h-4 w-4" aria-hidden />
        </span>
        <div className="space-y-0.5">
          <CardTitle>{t('docs_title')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('docs_subtitle')}</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Add form */}
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border/70 bg-muted/30 p-3">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t('docs_name')}
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('docs_name_ph')}
            />
          </label>

          <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t('docs_choose')}
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              className="max-w-[16rem] justify-start font-normal"
            >
              <Upload aria-hidden />
              <span className="truncate">
                {file ? file.name : t('docs_choose')}
              </span>
            </Button>
          </div>

          {!isAdmin && (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t('calls_branch')}
              <select
                className={selectCx}
                value={teamBranch}
                onChange={(e) => setTeamBranch(e.target.value as 'all' | 'left' | 'right')}
              >
                <option value="all">{t('calls_branch_all')}</option>
                <option value="left">{t('calls_branch_left')}</option>
                <option value="right">{t('calls_branch_right')}</option>
              </select>
            </label>
          )}

          {isAdmin && (
            <label className="flex items-center gap-2 self-center pt-4 text-xs font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={isBook}
                onChange={(e) => setIsBook(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              È un libro (sezione Libri)
            </label>
          )}

          <Button onClick={add} disabled={saving || !file}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
            {t('docs_add')}
          </Button>
        </div>

        {/* List */}
        {initial.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title={t('docs_empty')}
            description={t('docs_empty_body')}
          />
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {initial.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <FileText className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={d.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium text-foreground transition-colors hover:text-primary"
                  >
                    {d.title}
                  </a>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.scope === 'team' && d.team_branch && d.team_branch !== 'all'
                      ? `${d.team_branch === 'left' ? t('calls_branch_left') : t('calls_branch_right')}`
                      : ''}
                    {d.scope === 'team' && d.created_by_name
                      ? `${d.team_branch && d.team_branch !== 'all' ? ' · ' : ''}${t('call_by_short', { name: d.created_by_name })}`
                      : ''}
                  </p>
                </div>
                <Badge variant={d.scope === 'org' ? 'info' : 'secondary'}>
                  {d.scope === 'org' ? t('calls_scope_org') : t('calls_scope_team')}
                </Badge>
                {canManage(d) && (
                  <button
                    type="button"
                    onClick={() => remove(d)}
                    disabled={deleting === d.id}
                    aria-label={t('docs_delete')}
                    className={cn(
                      'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                    )}
                  >
                    {deleting === d.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
