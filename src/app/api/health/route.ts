import { connection } from "next/server";
import { env } from "@/lib/env";

// Liveness for uptime monitors: the app is up and can reach Supabase.
export async function GET() {
  await connection();
  const started = Date.now();
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    return Response.json({ ok: res.status < 500, supabase: res.status, ms: Date.now() - started }, { status: res.status < 500 ? 200 : 503 });
  } catch {
    return Response.json({ ok: false, supabase: "unreachable", ms: Date.now() - started }, { status: 503 });
  }
}
