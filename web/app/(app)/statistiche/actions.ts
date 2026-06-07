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
  const { data } = await listTeamMembersPage(query);
  return data;
}
