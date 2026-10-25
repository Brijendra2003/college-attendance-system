import "server-only";
import { createStore, type Store } from "./seed";
import type { AuditEntry, Profile } from "./types";

// Demo backend: one in-memory store per server process, kept on globalThis so
// dev hot-reloads don't reseed it. Replace with Supabase (lib/supabase/server.ts)
// by reimplementing features/*/queries.ts and actions.ts against the RPCs.
const g = globalThis as unknown as { __casStore?: Store; __casStoreVersion?: number };
/** Bump when the Store shape changes so a running dev server reseeds. */
const STORE_VERSION = 4;

export function db(): Store {
  if (!g.__casStore || g.__casStoreVersion !== STORE_VERSION) {
    g.__casStore = createStore();
    g.__casStoreVersion = STORE_VERSION;
  }
  return g.__casStore;
}

export function nextId(prefix: string): string {
  const s = db();
  return `${prefix}-${Date.now().toString(36)}${(s.seq++).toString(36)}`;
}

export function audit(
  actor: Pick<Profile, "id" | "name">,
  entry: Omit<AuditEntry, "id" | "at" | "actorId" | "actorName">,
) {
  db().audit.unshift({
    id: nextId("au"),
    at: new Date().toISOString(),
    actorId: actor.id,
    actorName: actor.name,
    ...entry,
  });
}

export const ACTIVE_YEAR_ID = "ay-2026";
export const ACTIVE_TERM_ID = "term-2026-odd";
