'use server';

import {
  searchPeople,
  teamIndex,
  type SearchHit,
  type TeamIndexEntry,
} from '@/lib/data/search';

/** Server Action for the sidebar global search (team members + prospects). */
export async function globalSearchAction(query: string): Promise<SearchHit[]> {
  return searchPeople(query);
}

/** Prospects only — the team side is filtered client-side from the preloaded index. */
export async function searchProspectsAction(query: string): Promise<SearchHit[]> {
  return searchPeople(query, { prospectsOnly: true });
}

/** The lightweight team name index, loaded once for instant client-side filtering. */
export async function teamIndexAction(): Promise<TeamIndexEntry[]> {
  return teamIndex();
}
