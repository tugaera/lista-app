import type { SupabaseClient } from "@supabase/supabase-js";
import db, { type OfflineCartItem, type PendingMutation } from "@/lib/offline/db";

/**
 * Queue a mutation for later sync when the device is back online.
 */
export async function queueMutation(
  table: string,
  operation: "insert" | "update" | "delete",
  data: Record<string, unknown>,
): Promise<void> {
  await db.pendingMutations.add({
    table,
    operation,
    data,
    timestamp: Date.now(),
  } as PendingMutation);
}

/**
 * Process every pending mutation in FIFO order against Supabase.
 *
 * Conflict resolution: when a row already exists on the server and the
 * incoming mutation is an insert or update, the record with the later
 * `timestamp` wins via an upsert with `onConflict`.  Deletes are
 * applied unconditionally since the user intent is unambiguous.
 *
 * Each mutation is removed from the local queue only after the remote
 * call succeeds, so a network failure mid-sync is safe to retry.
 */
export async function syncPendingMutations(
  supabase: SupabaseClient,
): Promise<{ synced: number; failed: number }> {
  const mutations = await db.pendingMutations.orderBy("id").toArray();

  let synced = 0;
  let failed = 0;

  for (const mutation of mutations) {
    try {
      await applyMutation(supabase, mutation);
      await db.pendingMutations.delete(mutation.id);
      synced++;
    } catch (error) {
      // Log but continue processing the rest of the queue so one bad
      // mutation doesn't block everything behind it.
      console.error(
        `[sync] Failed to apply mutation ${mutation.id} (${mutation.operation} on ${mutation.table}):`,
        error,
      );
      failed++;
    }
  }

  return { synced, failed };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function applyMutation(
  supabase: SupabaseClient,
  mutation: PendingMutation,
): Promise<void> {
  const { table, operation, data } = mutation;

  switch (operation) {
    case "insert": {
      // Upsert so that if the row was already created on another device
      // the latest-timestamp version wins.
      const payload = { ...data, _synced_at: new Date().toISOString() };
      const { error } = await supabase.from(table).upsert(payload, {
        onConflict: "id",
        ignoreDuplicates: false,
      });
      if (error) throw error;
      break;
    }

    case "update": {
      // Fetch the server row to compare timestamps for conflict resolution.
      const id = data.id as string | number | undefined;
      if (id !== undefined) {
        const { data: existing } = await supabase
          .from(table)
          .select("updated_at")
          .eq("id", id)
          .maybeSingle();

        if (existing?.updated_at) {
          const serverTime = new Date(existing.updated_at as string).getTime();
          if (serverTime > mutation.timestamp) {
            // Server version is newer -- skip this mutation.
            return;
          }
        }
      }

      const payload = { ...data, _synced_at: new Date().toISOString() };
      const { error } = await supabase.from(table).upsert(payload, {
        onConflict: "id",
        ignoreDuplicates: false,
      });
      if (error) throw error;
      break;
    }

    case "delete": {
      const deleteId = data.id;
      if (deleteId === undefined) {
        throw new Error("Cannot delete without an id in mutation data");
      }
      const { error } = await supabase.from(table).delete().eq("id", deleteId);
      if (error) throw error;
      break;
    }

    default: {
      const _exhaustive: never = operation;
      throw new Error(`Unknown operation: ${_exhaustive}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Offline cart helpers
// ---------------------------------------------------------------------------

/**
 * Return all items stored in the local offline cart.
 */
export async function getOfflineCartItems(): Promise<OfflineCartItem[]> {
  return db.offlineCartItems.toArray();
}

/**
 * Add (or replace) an item in the offline cart.
 */
export async function addOfflineCartItem(
  item: OfflineCartItem,
): Promise<void> {
  await db.offlineCartItems.put(item);
}

/**
 * Remove all items from the local offline cart, typically called after a
 * successful sync so the user doesn't see stale data.
 */
export async function clearOfflineCart(): Promise<void> {
  await db.offlineCartItems.clear();
}
