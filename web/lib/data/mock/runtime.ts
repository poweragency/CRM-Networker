import type { TreeNode } from '@/lib/types/db';

/**
 * Demo-only RUNTIME store of marketers added while the server is running (e.g.
 * from the Binary Viewer's "add member"). Shared across the genealogy,
 * admin/registry and team data layers so the tree, Statistiche and Presenze stay
 * in sync within a running server. In-memory only — resets on restart (no DB
 * yet), like the other mock override stores. Server-side use only.
 */

const runtimeNodes: TreeNode[] = [];
let seq = 0;

/** A process-unique id for a runtime-added marketer. */
export function nextRuntimeId(): string {
  seq += 1;
  return `rt-${seq}`;
}

/** Append a runtime-added marketer to the shared store. */
export function addRuntimeNode(node: TreeNode): void {
  runtimeNodes.push(node);
}

/** Every runtime-added marketer (read-only view). */
export function getRuntimeNodes(): readonly TreeNode[] {
  return runtimeNodes;
}

/** Runtime children of a parent (by placement edge). */
export function runtimeChildren(parentId: string): TreeNode[] {
  return runtimeNodes.filter((n) => n.parent_id === parentId);
}

/** A runtime-added marketer by id, if any. */
export function runtimeNode(id: string): TreeNode | undefined {
  return runtimeNodes.find((n) => n.id === id);
}

/* ─── CRM access credentials (demo runtime store) ──────────────────────────── */
// Per-marketer CRM login granted from the tree's "Attiva accesso CRM". Demo-only,
// in-memory. SECURITY: the password is NEVER persisted here; in production this
// becomes a Supabase Auth call (the password is hashed by Supabase and never
// stored in our own tables). We keep only the login email for display.
const crmAccess = new Map<string, { email: string }>();

/** Record CRM access (email) for a marketer (demo runtime). */
export function setCrmAccess(marketerId: string, email: string): void {
  crmAccess.set(marketerId, { email });
}

/** The CRM access record for a marketer, if granted. */
export function getCrmAccess(marketerId: string): { email: string } | undefined {
  return crmAccess.get(marketerId);
}
