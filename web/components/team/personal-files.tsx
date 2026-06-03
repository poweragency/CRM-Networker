'use client';

import * as React from 'react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { HelpCircle, ListChecks } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { WishlistManager } from '@/components/team/wishlist-manager';
import type { WishlistItem } from '@/lib/types/db';

/**
 * PersonalFiles — the secondary "file personali" area on the marketer profile.
 * Two clickable file cards that open a window (modal): the 7 Perché (hosting the
 * server-rendered detail/editor passed in) and the 100's list (bucket list). Kept
 * deliberately understated, below the primary tabs.
 */
export function PersonalFiles({
  sevenWhys,
  wishlistItems,
  marketerId,
  canEdit,
}: {
  sevenWhys: ReactNode;
  wishlistItems: WishlistItem[];
  marketerId: string;
  canEdit: boolean;
}) {
  const t = useTranslations('team');
  const [whysOpen, setWhysOpen] = React.useState(false);
  const [wishOpen, setWishOpen] = React.useState(false);

  return (
    <div className="-mt-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FileCard
          icon={<HelpCircle className="h-[18px] w-[18px]" aria-hidden />}
          title={t('file_seven_whys')}
          description={t('file_seven_whys_desc')}
          onClick={() => setWhysOpen(true)}
        />
        <FileCard
          icon={<ListChecks className="h-[18px] w-[18px]" aria-hidden />}
          title={t('file_wishlist')}
          description={t('file_wishlist_desc')}
          onClick={() => setWishOpen(true)}
        />
      </div>

      <Modal
        open={whysOpen}
        onOpenChange={setWhysOpen}
        title={t('file_seven_whys')}
        description={t('file_seven_whys_desc')}
        size="lg"
      >
        {sevenWhys}
      </Modal>

      <Modal
        open={wishOpen}
        onOpenChange={setWishOpen}
        title={t('file_wishlist')}
        description={t('file_wishlist_desc')}
        size="lg"
      >
        <WishlistManager
          marketerId={marketerId}
          initialItems={wishlistItems}
          readOnly={!canEdit}
        />
      </Modal>
    </div>
  );
}

function FileCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="flex cursor-pointer items-center gap-3 p-4 outline-none transition-colors hover:border-ring/60 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>
    </Card>
  );
}
