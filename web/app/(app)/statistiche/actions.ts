'use server';

import { listTeamMembersPage, type TeamPage } from '@/lib/data/team';

/**
 * Server Action for the /statistiche roster: returns one search-filtered page of
 * members (and the totals) so the screen never ships the whole org to the browser.
 */
export async function teamRosterPageAction(query: {
  search?: string;
  offset?: number;
  limit?: number;
}): Promise<TeamPage> {
  // Search / load-more never need the org-wide summary totals (the client keeps the
  // ones from the first render), so skip them → one fewer round-trip per keystroke.
  const { data } = await listTeamMembersPage({ ...query, withTotals: false });
  return data;
}
