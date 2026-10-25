import "server-only";
import { AppError, isKnownError } from "@/shared/errors";
import { createClient } from "@/lib/supabase/server";

interface Result<T> {
  data: T | null;
  error: { message: string; code?: string; details?: string | null } | null;
}

/** Unwraps a Supabase response, turning stable RPC error codes into AppError. */
export function unwrap<T>(res: Result<T>): T {
  if (res.error) {
    const code = res.error.message;
    if (isKnownError(code)) throw new AppError(code);
    if (res.error.code === "P0001") throw new AppError(code, code);
    if (res.error.code === "42501") throw new AppError("FORBIDDEN");
    throw new Error(`Database error: ${res.error.message}${res.error.details ? ` (${res.error.details})` : ""}`);
  }
  return res.data as T;
}

/** Calls an RPC as the signed-in user (RLS + the RPC's own permission checks). */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = await createClient();
  return unwrap<T>(await supabase.rpc(fn, args));
}

export async function db() {
  return createClient();
}
