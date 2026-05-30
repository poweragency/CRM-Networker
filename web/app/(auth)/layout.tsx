/**
 * (auth) route group layout — centered card shell, NO sidebar (doc 08 §2).
 * Used by /accedi and future recovery/activation pages (ADR-008).
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
