import { PauseCircle } from 'lucide-react';
import { LogoutButton } from '@/components/platform/logout-button';

/**
 * Full-screen block shown to members of a SUSPENDED org (non-renewal). The org's
 * data is untouched; access is just gated with this message. Rendered by the
 * (app) layout in place of the shell when the current org is suspended.
 */
export function ServiceSuspended() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warning/15 text-warning">
          <PauseCircle className="h-7 w-7" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Servizio momentaneamente non attivo
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Contatta il tuo Leader di riferimento.
        </p>
        <div className="mt-6 flex justify-center">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
