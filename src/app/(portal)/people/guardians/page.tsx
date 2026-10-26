import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Ban, Check, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";
import { requirePermission } from "@/lib/auth/permissions";
import { db, unwrap } from "@/lib/db";
import { param } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader, PageSkeleton, Pagination, Skeleton, StatCard, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { FilterSelect, RowAction, SearchBox } from "@/components/ui/forms";
import { setGuardianLink } from "@/features/guardians/actions";
import { GuardianLoginDialog } from "@/features/guardians/login-dialog";

export const metadata: Metadata = { title: "Guardians" };

export default function GuardiansPage(props: PageProps<"/people/guardians">) {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <Guardians searchParams={props.searchParams} />
    </Suspense>
  );
}

const PAGE = 25;

interface LinkRow {
  id: string;
  status: "pending" | "verified" | "revoked";
  is_primary: boolean;
  student: { id: string; full_name: string; enrollment_no: string } | null;
  guardian: { id: string; full_name: string; relation: string; phone: string; email: string | null; user_id: string | null } | null;
}

async function Guardians({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("guardians.manage");
  const sp = await searchParams;
  const s = await db();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [pending, verified, activated] = await Promise.all([
    count(s.from("guardian_links").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(s.from("guardian_links").select("id", { count: "exact", head: true }).eq("status", "verified")),
    count(s.from("guardians").select("id", { count: "exact", head: true }).not("user_id", "is", null)),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Guardians"
        description="Verify each guardian link against admission records, then create the parent's app login (their email and a password you give them). Knowing an enrollment number never grants access."
      />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting verification" value={pending} icon={<TriangleAlert className="size-5" />} tone="warn" href="/people/guardians?status=pending" />
        <StatCard label="Verified links" value={verified.toLocaleString("en-IN")} icon={<ShieldCheck className="size-5" />} tone="ok" />
        <StatCard label="Parents using the app" value={activated.toLocaleString("en-IN")} icon={<Smartphone className="size-5" />} />
      </div>
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SearchBox placeholder="Student name or enrollment no." />
          <FilterSelect
            name="status"
            label="Link status"
            allLabel={null}
            fallback="pending"
            options={[
              { value: "pending", label: "Pending" },
              { value: "verified", label: "Verified" },
              { value: "revoked", label: "Revoked" },
              { value: "all", label: "All" },
            ]}
          />
        </div>
      </Card>
      <Suspense key={JSON.stringify(sp)} fallback={<Skeleton className="h-96" />}>
        <LinkTable sp={sp} />
      </Suspense>
    </>
  );
}

async function LinkTable({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const s = await db();
  const status = param(sp, "status") ?? "pending";
  const term = param(sp, "q")?.trim().replace(/[%,()]/g, " ");
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  let q = s
    .from("guardian_links")
    .select("id, status, is_primary, student:students!inner(id, full_name, enrollment_no), guardian:guardians(id, full_name, relation, phone, email, user_id)", { count: "exact" });
  if (status !== "all") q = q.eq("status", status);
  if (term) q = q.or(`full_name.ilike.%${term}%,enrollment_no.ilike.%${term}%`, { referencedTable: "student" });
  const res = await q.order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const rows = unwrap(res) as unknown as LinkRow[];
  const filters = Object.fromEntries(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "page" ? [[k, v]] : [])));
  const hrefFor = (p: number) => `/people/guardians?${new URLSearchParams({ ...filters, page: String(p) })}`;

  if (!rows.length) return <Card><EmptyState icon={<ShieldCheck className="size-6" />} title="No guardian links match" /></Card>;
  return (
    <Card>
      <Table>
        <THead>
          <tr>
            <TH>Guardian</TH>
            <TH>Mobile</TH>
            <TH>Student</TH>
            <TH>Status</TH>
            <TH className="text-right">Actions</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map((l) => (
            <TR key={l.id}>
              <TD>
                <div className="font-medium">{l.guardian?.full_name}</div>
                <div className="text-xs text-muted">
                  {l.guardian?.relation}
                  {l.is_primary && " · primary"}
                  {l.guardian?.user_id && " · app active"}
                </div>
                {l.guardian?.user_id && l.guardian.email && <div className="font-mono text-[11px] text-muted">{l.guardian.email}</div>}
              </TD>
              <TD className="font-mono text-xs">{l.guardian?.phone}</TD>
              <TD>
                <Link href={`/people/students/${l.student?.id}`} className="font-medium hover:text-primary">
                  {l.student?.full_name}
                </Link>
                <div className="font-mono text-[11px] text-muted">{l.student?.enrollment_no}</div>
              </TD>
              <TD>
                <Badge tone={l.status === "verified" ? "ok" : l.status === "pending" ? "warn" : "bad"}>{l.status}</Badge>
              </TD>
              <TD>
                <div className="flex justify-end gap-1.5">
                  {l.guardian && l.status === "verified" && (
                    <GuardianLoginDialog
                      mode={l.guardian.user_id ? "reset" : "create"}
                      guardianId={l.guardian.id}
                      name={l.guardian.full_name}
                      email={l.guardian.email}
                    />
                  )}
                  {l.status !== "verified" && <RowAction action={setGuardianLink} fields={{ linkId: l.id, status: "verified" }} label="Verify" variant="success" icon={<Check className="size-3.5" />} />}
                  {l.status !== "revoked" && (
                    <RowAction
                      action={setGuardianLink}
                      fields={{ linkId: l.id, status: "revoked" }}
                      label="Revoke"
                      icon={<Ban className="size-3.5" />}
                      confirm={`Revoke ${l.guardian?.full_name}'s access to ${l.student?.full_name}?`}
                    />
                  )}
                </div>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <Pagination page={page} pageSize={PAGE} total={res.count ?? 0} hrefFor={hrefFor} />
    </Card>
  );
}
