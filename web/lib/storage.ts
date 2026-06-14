import 'server-only';

/**
 * Helpers per il bucket privato `org-assets` (loghi org, documenti, libri).
 * Il bucket NON è pubblico: i file si leggono solo via signed URL generati lato
 * server con il client RLS, quindi la firma stessa è limitata alla propria org
 * (policy storage `org_assets_auth_select`: foldername[1] = current_org_id()).
 */
export const ORG_ASSETS_BUCKET = 'org-assets';

/**
 * Ricava il path dentro `org-assets` da un valore salvato, che può essere già un
 * path (nuovo: `<org_id>/...`) o un vecchio URL pubblico
 * (`.../object/public/org-assets/<path>`). Toglie eventuale query string.
 */
export function orgAssetPath(stored: string): string {
  const marker = '/org-assets/';
  const i = stored.indexOf(marker);
  const raw = i >= 0 ? stored.slice(i + marker.length) : stored;
  return raw.replace(/^\/+/, '').split('?')[0];
}
