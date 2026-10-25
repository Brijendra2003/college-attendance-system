/**
 * LOCAL DEVELOPMENT ONLY — a minimal Supabase-compatible gateway for machines
 * without Docker (where `supabase start` is unavailable).
 *
 *   /rest/v1/*  → PostgREST (spawned from POSTGREST_BIN) against DATABASE_URL
 *   /auth/v1/*  → password sign-in, refresh, user, logout, TOTP MFA
 *                 (enroll / challenge / verify / unenroll) and admin user
 *                 creation, issuing HS256 JWTs through the real
 *                 public.custom_access_token_hook.
 *
 * It refuses to start unless the database has the local auth stub (no
 * auth.identities table), so it can never front a real Supabase project.
 *
 *   DATABASE_URL=postgres://postgres@localhost:54329/cas_test POSTGREST_BIN=…/postgrest.exe npx tsx scripts/dev/local-supabase.ts
 */
import { spawn } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import http from "node:http";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres@localhost:54329/cas_test";
const POSTGREST_BIN = process.env.POSTGREST_BIN;
const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const PGRST_PORT = Number(process.env.POSTGREST_PORT ?? 54331);
const JWT_SECRET = process.env.LOCAL_JWT_SECRET ?? "local-dev-jwt-secret-at-least-32-characters-long";
const ACCESS_TTL = 3600;

const sql = postgres(DATABASE_URL, { max: 4, onnotice: () => {} });

// ── JWT (HS256) ──────────────────────────────────────────────────────────
const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
function signJwt(payload: Record<string, unknown>) {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  return `${head}.${body}.${createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url")}`;
}
function verifyJwt(token: string | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const [h, b, s] = token.split(".");
  if (!h || !b || !s) return null;
  if (createHmac("sha256", JWT_SECRET).update(`${h}.${b}`).digest("base64url") !== s) return null;
  const p = JSON.parse(Buffer.from(b, "base64url").toString());
  if (typeof p.exp === "number" && p.exp < Date.now() / 1000) return null;
  return p;
}
export const ANON_KEY = signJwt({ role: "anon", iss: "supabase-local", iat: 1700000000, exp: 4102444800 });
export const SERVICE_KEY = signJwt({ role: "service_role", iss: "supabase-local", iat: 1700000000, exp: 4102444800 });

// ── TOTP (RFC 6238) ──────────────────────────────────────────────────────
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(buf: Buffer) {
  let bits = "";
  for (const byte of buf) bits += byte.toString(2).padStart(8, "0");
  return bits.match(/.{1,5}/g)!.map((c) => B32[parseInt(c.padEnd(5, "0"), 2)]).join("");
}
function unbase32(s: string) {
  const bits = s.replace(/=+$/, "").split("").map((c) => B32.indexOf(c).toString(2).padStart(5, "0")).join("");
  return Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
}
function totp(secret: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", unbase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
const totpOk = (secret: string, code: string) => {
  const step = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((d) => totp(secret, step + d) === code);
};

// ── Users, sessions, factors ─────────────────────────────────────────────
const refreshTokens = new Map<string, { userId: string; aal: "aal1" | "aal2"; sessionId: string }>();

async function ensureLocalAuth() {
  const [{ hosted }] = await sql`select to_regclass('auth.identities') is not null as hosted`;
  if (hosted) throw new Error("Refusing to run: this looks like a real Supabase database (auth.identities exists).");
  await sql`create table if not exists auth.mfa_factors (
    id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
    friendly_name text, secret text not null, status text not null default 'unverified', created_at timestamptz default now())`;
}

async function factorsOf(userId: string) {
  const rows = await sql`select id, friendly_name, status, created_at from auth.mfa_factors where user_id = ${userId} order by created_at`;
  return rows.map((f) => ({ id: f.id, friendly_name: f.friendly_name, factor_type: "totp", status: f.status, created_at: f.created_at, updated_at: f.created_at }));
}

async function userJson(userId: string) {
  const [u] = await sql`select id, email, phone, created_at, raw_user_meta_data from auth.users where id = ${userId}`;
  if (!u) return null;
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email, phone: u.phone ?? "",
    email_confirmed_at: u.created_at, confirmed_at: u.created_at, last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: u.raw_user_meta_data ?? {},
    identities: [], created_at: u.created_at, updated_at: u.created_at, factors: await factorsOf(userId),
  };
}

async function issueSession(userId: string, aal: "aal1" | "aal2", sessionId: string = randomUUID()) {
  const user = await userJson(userId);
  if (!user) throw new Error("user vanished");
  const now = Math.floor(Date.now() / 1000);
  const amr = [{ method: "password", timestamp: now }, ...(aal === "aal2" ? [{ method: "totp", timestamp: now }] : [])];
  const claims = { aud: "authenticated", exp: now + ACCESS_TTL, iat: now, iss: `http://localhost:${PORT}/auth/v1`, sub: userId,
    email: user.email, phone: user.phone, role: "authenticated", aal, amr, session_id: sessionId, is_anonymous: false,
    app_metadata: user.app_metadata, user_metadata: user.user_metadata };
  // Same hook Supabase Auth calls on every issue/refresh (§5.5).
  const [{ event }] = await sql`select public.custom_access_token_hook(${sql.json({ user_id: userId, claims, authentication_method: "password" } as never)}) as event`;
  const refresh = randomBytes(24).toString("base64url");
  refreshTokens.set(refresh, { userId, aal, sessionId });
  return { access_token: signJwt(event.claims), token_type: "bearer", expires_in: ACCESS_TTL, expires_at: now + ACCESS_TTL, refresh_token: refresh, user };
}

// ── HTTP ─────────────────────────────────────────────────────────────────
const send = (res: http.ServerResponse, status: number, body?: unknown) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const fail = (res: http.ServerResponse, status: number, code: string, msg: string) => send(res, status, { code: status, error_code: code, msg });
const readBody = (req: http.IncomingMessage) =>
  new Promise<Record<string, unknown>>((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data ? JSON.parse(data) : {}));
  });
const bearer = (req: http.IncomingMessage) => verifyJwt(req.headers.authorization?.replace(/^Bearer /i, ""));

async function auth(req: http.IncomingMessage, res: http.ServerResponse, path: string, query: URLSearchParams) {
  const method = req.method ?? "GET";
  if (method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" });
    return res.end();
  }
  if (path === "/token" && method === "POST") {
    const body = await readBody(req);
    if (query.get("grant_type") === "password") {
      const [u] = await sql`select id from auth.users where lower(email) = lower(${String(body.email ?? "")})
                            and encrypted_password = crypt(${String(body.password ?? "")}, encrypted_password)
                            and (banned_until is null or banned_until < now())`;
      if (!u) return fail(res, 400, "invalid_credentials", "Invalid login credentials");
      return send(res, 200, await issueSession(u.id, "aal1"));
    }
    if (query.get("grant_type") === "refresh_token") {
      const r = refreshTokens.get(String(body.refresh_token ?? ""));
      if (!r) return fail(res, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
      refreshTokens.delete(String(body.refresh_token));
      return send(res, 200, await issueSession(r.userId, r.aal, r.sessionId));
    }
    return fail(res, 400, "unsupported_grant_type", "unsupported grant_type");
  }

  const claims = bearer(req);
  if (path.startsWith("/admin/")) {
    if (claims?.role !== "service_role") return fail(res, 403, "not_admin", "User not allowed");
    if (path === "/admin/users" && method === "POST") {
      const body = await readBody(req);
      try {
        const [u] = await sql`insert into auth.users (email, phone, encrypted_password, raw_user_meta_data)
          values (${(body.email as string) ?? null}, ${(body.phone as string) ?? null},
                  ${body.password ? sql`crypt(${String(body.password)}, gen_salt('bf'))` : null}, ${sql.json((body.user_metadata ?? {}) as never)})
          returning id`;
        return send(res, 200, await userJson(u.id));
      } catch {
        return fail(res, 422, "email_exists", "A user with this email address has already been registered");
      }
    }
    const m = path.match(/^\/admin\/users\/([0-9a-f-]{36})$/);
    if (m && method === "PUT") {
      const body = await readBody(req);
      if (body.password) await sql`update auth.users set encrypted_password = crypt(${String(body.password)}, gen_salt('bf')) where id = ${m[1]}`;
      if ("ban_duration" in body) {
        await sql`update auth.users set banned_until = ${body.ban_duration === "none" ? null : sql`now() + interval '100 years'`} where id = ${m[1]}`;
      }
      return send(res, 200, await userJson(m[1]));
    }
    return fail(res, 404, "not_found", "Not found");
  }

  if (!claims?.sub) return fail(res, 401, "bad_jwt", "invalid JWT");
  const userId = String(claims.sub);
  if (path === "/user" && method === "GET") return send(res, 200, await userJson(userId));
  if (path === "/logout" && method === "POST") return send(res, 204);
  if (path === "/factors" && method === "POST") {
    const body = await readBody(req);
    const secret = base32(randomBytes(20));
    await sql`delete from auth.mfa_factors where user_id = ${userId} and status = 'unverified'`;
    const [f] = await sql`insert into auth.mfa_factors (user_id, friendly_name, secret) values (${userId}, ${(body.friendly_name as string) ?? "Authenticator"}, ${secret}) returning id`;
    const [u] = await sql`select email from auth.users where id = ${userId}`;
    const issuer = encodeURIComponent(String(body.issuer ?? "SJCEM Attendance"));
    return send(res, 200, { id: f.id, type: "totp", friendly_name: body.friendly_name ?? "Authenticator",
      totp: { qr_code: "", secret, uri: `otpauth://totp/${issuer}:${encodeURIComponent(u.email)}?secret=${secret}&issuer=${issuer}` } });
  }
  const challenge = path.match(/^\/factors\/([0-9a-f-]{36})\/challenge$/);
  if (challenge && method === "POST") {
    return send(res, 200, { id: randomUUID(), type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 });
  }
  const verify = path.match(/^\/factors\/([0-9a-f-]{36})\/verify$/);
  if (verify && method === "POST") {
    const body = await readBody(req);
    const [f] = await sql`select secret from auth.mfa_factors where id = ${verify[1]} and user_id = ${userId}`;
    if (!f || !totpOk(f.secret, String(body.code ?? ""))) return fail(res, 422, "mfa_verification_failed", "Invalid TOTP code entered");
    await sql`update auth.mfa_factors set status = 'verified' where id = ${verify[1]}`;
    return send(res, 200, await issueSession(userId, "aal2", String(claims.session_id ?? randomUUID())));
  }
  const factor = path.match(/^\/factors\/([0-9a-f-]{36})$/);
  if (factor && method === "DELETE") {
    await sql`delete from auth.mfa_factors where id = ${factor[1]} and user_id = ${userId}`;
    return send(res, 200, { id: factor[1] });
  }
  return fail(res, 404, "not_found", `No local handler for ${method} /auth/v1${path}`);
}

function proxyRest(req: http.IncomingMessage, res: http.ServerResponse, path: string) {
  const upstream = http.request(
    { host: "127.0.0.1", port: PGRST_PORT, path, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${PGRST_PORT}` } },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", (e) => fail(res, 502, "upstream", e.message));
  req.pipe(upstream);
}

async function main() {
  await ensureLocalAuth();
  if (POSTGREST_BIN) {
    const u = new URL(DATABASE_URL);
    // On Windows PostgREST loads libpq.dll from the PostgreSQL install.
    const pgBin = process.env.PG_BIN_DIR ?? (process.platform === "win32" ? "C:\\Program Files\\PostgreSQL\\18\\bin" : "");
    const child = spawn(POSTGREST_BIN, [], {
      env: {
        ...process.env,
        PATH: pgBin ? `${pgBin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}` : process.env.PATH,
        PGRST_DB_URI: `postgres://authenticator:authenticator@${u.hostname}:${u.port}${u.pathname}`,
        PGRST_DB_SCHEMAS: "public",
        PGRST_DB_ANON_ROLE: "anon",
        PGRST_JWT_SECRET: JWT_SECRET,
        PGRST_SERVER_PORT: String(PGRST_PORT),
        PGRST_DB_MAX_ROWS: "10000",
      },
      stdio: "inherit",
    });
    child.on("error", (e) => console.error("PostgREST failed to start:", e.message));
    child.on("exit", (code) => code && console.error(`PostgREST exited with code ${code}`));
    process.on("exit", () => child.kill());
  }
  const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
      if (url.pathname.startsWith("/rest/v1")) return proxyRest(req, res, url.pathname.slice(8) + url.search);
      if (url.pathname.startsWith("/auth/v1")) {
        return auth(req, res, url.pathname.slice(8), url.searchParams).catch((e) => fail(res, 500, "unexpected_failure", String(e?.message ?? e)));
      }
      fail(res, 404, "not_found", "Only /rest/v1 and /auth/v1 are served locally");
    });
  // Outlive clients' pooled keep-alive sockets, or reused sockets get reset mid-request.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.listen(PORT, () => {
      console.log(`Local Supabase gateway on http://localhost:${PORT}`);
      console.log(`NEXT_PUBLIC_SUPABASE_URL=http://localhost:${PORT}`);
      console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}`);
      console.log(`SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}`);
    });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
