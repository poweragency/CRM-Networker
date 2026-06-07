import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('error');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold text-foreground">
        {t('notFoundTitle')}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {t('notFoundBody')}
      </p>
      <Link
        href="/impostazioni"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        {t('backHome')}
      </Link>
    </main>
  );
}
