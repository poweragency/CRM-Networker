'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/crm/toaster';
import type { ListaContattiEntry } from '@/lib/types/db';
import type { ListaContattiInput } from '@/lib/data/lista-contatti';
import { updateListaContattiAction } from '@/app/(app)/lista-contatti/actions';

/**
 * ListaContattiStore — a shared client store that holds the Lista contatti
 * entries so the Lista contatti list AND the Percorsi informativi kanban can read
 * the same source of truth (they live in two sibling tabs that mount/unmount, so
 * the state lives ABOVE them, here). An invited contact's `percorso` (0..5) is the
 * funnel stage index, so the kanban shows it at the matching column. Demo-safe:
 * mutations go through the optimistic, never-throwing Server Action.
 */

function sortByPosition(rows: ListaContattiEntry[]): ListaContattiEntry[] {
  return [...rows].sort((a, b) => a.position - b.position);
}

export interface ListaContattiStore {
  entries: ListaContattiEntry[];
  setEntries: React.Dispatch<React.SetStateAction<ListaContattiEntry[]>>;
  demo: boolean;
  setDemo: React.Dispatch<React.SetStateAction<boolean>>;
  /** Invite order for the Percorsi pane (newest invited last). */
  invitedOrder: string[];
  setInvitedOrder: React.Dispatch<React.SetStateAction<string[]>>;
  /** Optimistic inline patch (rapporto / stato / percorso), reverts on failure. */
  setField: (
    entry: ListaContattiEntry,
    patch: Partial<ListaContattiInput>,
  ) => Promise<void>;
}

const Ctx = React.createContext<ListaContattiStore | null>(null);

export function ListaContattiStoreProvider({
  initialEntries,
  initialDemo,
  children,
}: {
  initialEntries: ListaContattiEntry[];
  initialDemo: boolean;
  children: React.ReactNode;
}) {
  const { toast } = useToast();
  const tc = useTranslations('crm');

  const [entries, setEntries] = React.useState<ListaContattiEntry[]>(() =>
    sortByPosition(initialEntries),
  );
  const [demo, setDemo] = React.useState(initialDemo);
  const [invitedOrder, setInvitedOrder] = React.useState<string[]>(() =>
    sortByPosition(initialEntries)
      .filter((e) => e.stato !== 'non_invitato')
      .map((e) => e.id),
  );

  const setField = React.useCallback(
    async (entry: ListaContattiEntry, patch: Partial<ListaContattiInput>) => {
      // Newly invited → push to the bottom of the Percorsi pane.
      if (
        patch.stato &&
        patch.stato !== 'non_invitato' &&
        entry.stato === 'non_invitato'
      ) {
        setInvitedOrder((order) => [
          ...order.filter((id) => id !== entry.id),
          entry.id,
        ]);
      }
      const prev = entry;
      setEntries((list) =>
        list.map((e) => (e.id === entry.id ? { ...e, ...patch } : e)),
      );
      const res = await updateListaContattiAction(entry.id, patch);
      if (!res.ok) {
        setEntries((list) => list.map((e) => (e.id === prev.id ? prev : e)));
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      const updated: ListaContattiEntry =
        res.entry ?? ({ ...entry, ...patch } as ListaContattiEntry);
      setEntries((list) => list.map((e) => (e.id === entry.id ? updated : e)));
      setDemo((d) => d || res.demo);
    },
    [toast, tc],
  );

  const value = React.useMemo<ListaContattiStore>(
    () => ({
      entries,
      setEntries,
      demo,
      setDemo,
      invitedOrder,
      setInvitedOrder,
      setField,
    }),
    [entries, demo, invitedOrder, setField],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useListaContattiStore(): ListaContattiStore {
  const ctx = React.useContext(Ctx);
  if (!ctx) {
    throw new Error(
      'useListaContattiStore must be used within <ListaContattiStoreProvider>',
    );
  }
  return ctx;
}

/** Optional access — the kanban may render outside a provider (standalone route). */
export function useListaContattiStoreOptional(): ListaContattiStore | null {
  return React.useContext(Ctx);
}
