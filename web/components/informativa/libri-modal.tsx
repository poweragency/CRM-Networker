'use client';

import * as React from 'react';
import { BookOpen, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { OrgDocument } from '@/lib/data/org-documents';

/**
 * LibriModal — a "Libri" button that opens a modal with the admin-managed PDF
 * book library (instead of an always-visible section). Each book is a clickable
 * card linking to its file. Used in /informativa.
 */
export function LibriModal({ books }: { books: OrgDocument[] }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <BookOpen className="h-4 w-4" aria-hidden />
        Libri
        {books.length > 0 && (
          <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-semibold tabular-nums text-primary">
            {books.length}
          </span>
        )}
      </Button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Libri"
        description="Libreria di libri in PDF gestita dall'admin."
        size="lg"
      >
        {books.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card/40 px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">Nessun libro disponibile</p>
            <p className="mt-1 text-sm text-muted-foreground">
              I libri in PDF aggiunti dall&apos;admin compariranno qui.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {books.map((d) => (
              <a
                key={d.id}
                href={d.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="h-5 w-5" aria-hidden />
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                  title={d.title}
                >
                  {d.title}
                </span>
                <Download
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                  aria-hidden
                />
              </a>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
