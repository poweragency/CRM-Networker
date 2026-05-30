import { AuthShell } from './_components/auth-shell';

/**
 * (auth) route group layout — branded split shell (brand rail + form pane), NO
 * sidebar (doc 08 §2). Shared by /accedi, /recupera-password,
 * /reimposta-password and /invito/[token] (ADR-008). Dark/light + responsive.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthShell>{children}</AuthShell>;
}
