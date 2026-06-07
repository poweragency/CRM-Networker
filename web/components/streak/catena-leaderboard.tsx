import { Flame } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { LeaderboardCard } from '@/components/dashboard/dashboard-leaders';
import type { TopMarketerEntry } from '@/lib/data/mock/dashboard';
import { getDmoLeaderboard } from '@/lib/data/streak';

/**
 * CatenaLeaderboard — the dashboard "Daily Task — Top del mese" widget (RSC).
 * Ranks the caller's visible team by the number of all-done Daily Task days this
 * month (via `dmo_month_leaderboard`). Renders through the SAME {@link LeaderboardCard}
 * as the other dashboard leaderboards, so it gets the identical treatment: champion
 * spotlight with a crown + "Campione del mese", silver/bronze medal podium, and
 * value bars. Gold (warning) accent to match the flame/Daily Task identity.
 */
export async function CatenaLeaderboard() {
  const t = await getTranslations('catena');
  const { rows } = await getDmoLeaderboard();

  // Map the DMO rows onto the shared leaderboard entry shape (top 5 only).
  const entries: TopMarketerEntry[] = rows.slice(0, 5).map((r, i) => ({
    marketer_id: r.marketer_id,
    display_name: r.display_name,
    rank: r.rank,
    value: r.days_done,
    position: i + 1,
    is_self: r.is_self,
    cam_rate: null,
  }));

  return (
    <LeaderboardCard
      label={t('leaderboard_title')}
      description={t('leaderboard_subtitle')}
      icon={Flame}
      accent="warning"
      entries={entries}
      formatValue={(n) => t('leaderboard_days', { n })}
      youLabel={t('leaderboard_you')}
      emptyLabel={t('leaderboard_empty')}
    />
  );
}
