'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { navSections, navFooterItems } from '@/lib/nav';
import { cn } from '@/lib/utils';

/**
 * Primary sidebar (links only, scaffold). Rank/role/flag filtering is added in a
 * later phase — here every member item from the ADR-008 route map is shown.
 */
export function Sidebar() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-card md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-5">
        <span className="text-sm font-semibold text-card-foreground">
          CRM Networker
        </span>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {navSections.map((section) => (
          <div key={section.titleKey}>
            <p className="px-2 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`section.${section.titleKey}`)}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                        isActive(item.href)
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      {t(item.labelKey)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t px-3 py-3">
        <ul className="space-y-0.5">
          {navFooterItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                    isActive(item.href)
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {t(item.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
