// Single-use invitation token helpers (doc 07 §4). The RAW token travels only in
// the invite link / request body and is NEVER stored; the database stores its
// SHA-256 hash (account_invitations.token_hash). Hashing here matches the
// create_invitation / accept_invitation RPC contract.

/** Mint a 256-bit URL-safe single-use token. */
export function mintToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** Lowercase hex SHA-256 of a string (Web Crypto, available in the Deno runtime). */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
