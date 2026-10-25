import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Ban, Check } from "lucide-react";
import { requirePermission } from "@/lib/auth/permissions";
import { db } from "@/lib/data/store";
import { currentEnrollments } from "@/lib/data/engine";
import { param } from "@/lib/utils";
import { Badge, Card, PageHeader, PageSkeleton, Pagination, StatCard, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { FilterSelect, RowAction, SearchBox } from "@/components/ui/forms";
import { setGuardianLink } from "@/features/guardians/actions";
import { divisionById, divisionLabel } from "@/features/common/lookups";
import { ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";

export const metadata: Metadata = { title: "Guardians" };

export default function GuardiansPage(props: PageProps<"/people/guardians">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guardians searchParams={props.searchParams} />
    </Suspense>
  );
}

const PAGE = 25;

async function Guardians({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("guardians.manage");
  const sp = await searchParams;
  const store = db();
  const status = param(sp, "status") ?? "pending";
  const q = param(sp, "q")?.toLowerCase();
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  const students = new Map(store.students.map((s) => [s.id, s]));
  const guardians = new Map(store.guardians.map((g) => [g.id, g]));
  const enr = currentEnrollments();

  const all = store.guardianLinks
    .filter((l) => status === "all" || l.status === status)
    .map((l) => ({ link: l, student: students.get(l.studentId)!, guardian: guardians.get(l.guardianId)! }))
    .filter(({ student, guardian }) => !q || student.name.toLowerCase().includes(q) || student.enrollmentNo.toLowerCase().includes(q) || guardian.name.toLowerCase().includes(q) || guardian.phone.includes(q));
  const rows = all.slice((page - 1) * PAGE, page * PAGE);
  const counts = {
    pending: store.guardianLinks.filter((l) => l.status === "pending").length,
    verified: store.guardianLinks.filter((l) => l.status === "verified").length,
    activated: store.guardians.filter((g) => g.activated).length,
  };
  const hrefFor = (p: number) => {
    const next = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
    next.set("page", String(p));
    return `/people/guardians?${next}`;
  };

  return (
    <>
      <PageHeader eyebrow="People" title="Guardians" description="Verify each guardian link against admission records. Knowing an enrollment number never grants access." />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting verification" value={counts.pending} icon={<TriangleAlert className="size-5" />} tone="#d97706" toneBg="#fff4e0" />
        <StatCard label="Verified links" value={counts.verified.toLocaleString("en-IN")} icon={<ShieldCheck className="size-5" />} tone="#16a34a" toneBg="#e8f7ee" />
        <StatCard label="Parents using the app" value={counts.activated.toLocaleString("en-IN")} icon={<Smartphone className="size-5" />} />
      </div>
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SearchBox placeholder="Student, guardian or phone" />
          <FilterSelect
            name="status"
            label="Link status"
            allLabel={null}
            options={[
              { value: "pending", label: "Pending" },
              { value: "verified", label: "Verified" },
              { value: "revoked", label: "Revoked" },
              { value: "all", label: "All" },
            ]}
          />
        </div>
      </Card>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Guardian</TH>
              <TH>Mobile</TH>
              <TH>Student</TH>
              <TH>Division</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map(({ link, student, guardian }) => {
              const e = enr.get(student.id);
              return (
                <TR key={link.id}>
                  <TD>
                    <div className="font-medium">{guardian.name}</div>
                    <div className="text-xs text-muted">
                      {guardian.relation}
                      {link.isPrimary && " · primary"}
                    </div>
                  </TD>
                  <TD className="font-mono text-xs">{guardian.phone}</TD>
                  <TD>
                    <Link href={`/people/students/${student.id}`} className="font-medium hover:text-primary">
                      {student.name}
                    </Link>
                    <div className="font-mono text-[11px] text-muted">{student.enrollmentNo}</div>
                  </TD>
                  <TD>{e ? divisionLabel(divisionById(e.divisionId)!) : "—"}</TD>
                  <TD>
                    <Badge tone={link.status === "verified" ? "ok" : link.status === "pending" ? "warn" : "bad"}>{link.status}</Badge>
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1.5">
                      {link.status !== "verified" && <RowAction action={setGuardianLink} fields={{ linkId: link.id, status: "verified" }} label="Verify" variant="success" icon={<Check className="size-3.5" />} />}
                      {link.status !== "revoked" && (
                        <RowAction action={setGuardianLink} fields={{ linkId: link.id, status: "revoked" }} label="Revoke" variant="secondary" icon={<Ban className="size-3.5" />} confirm={`Revoke ${guardian.name}'s access to ${student.name}?`} />
                      )}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={PAGE} total={all.length} hrefFor={hrefFor} />
      </Card>
    </>
  );
}
