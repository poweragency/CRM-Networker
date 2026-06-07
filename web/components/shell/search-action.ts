'use server';

import { searchPeople, type SearchHit } from '@/lib/data/search';

/** Server Action for the sidebar global search (team members + prospects). */
export async function globalSearchAction(query: string): Promise<SearchHit[]> {
  return searchPeople(query);
}
