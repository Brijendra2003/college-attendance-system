import type { Metadata } from "next";
import { Suspense } from "react";
import { ScrollText } from "lucide-react";
import { formatDateTime } from "@/shared/dates";
import { can, requirePermission } from "@/lib/auth/permissions";
import { db, unwrap } from "@/lib/db";
import { param } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader, PageSkeleton, Pagination, Skeleton } from "@/components/ui/primitives";
import { FilterSelect, SearchBox } from "@/components/ui/forms";
import { ExportMenu } from "@/features/reports/export-menu";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage(props: PageProps<"/audit">) {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <Audit searchParams={props.searchParams} />
    </Suspense>
  );
}

const ENTITIES = [
  "attendance_records", "attendance_registers", "attendance_policies", "announcements", "blueprint_versions", "class_sessions", "college",
  "department_staff", "divisions", "guardian_links", "import_jobs", "leave_requests", "reports", "role_permissions", "session_staff",
  "staff_leave_requests", "student_enrollments", "students", "timetable_versions",
];
const PAGE = 50;

/** Request-time cutoff for the period filter (this page renders per request). */
function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

async function Audit({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("audit.view");
  const sp = await searchParams;
  const filters = Object.fromEntries(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "page" ? [[k, v]] : [])));
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="Append-only: who changed what, when, before and after values, and the reason. Entries can't be updated or deleted."
        actions={can(user, "reports.export") && <ExportMenu reportKey="audit" filters={filters} formats={["csv", "xlsx"]} />}
      />
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SearchBox placeholder="Search summaries" />
          <FilterSelect name="entity" label="Entity" options={ENTITIES.map((e) => ({ value: e, label: e }))} allLabel="All entities" />
          <FilterSelect
            name="days"
            label="Period"
            allLabel="All time"
            options={[
              { value: "1", label: "Last 24 hours" },
              { value: "7", label: "Last 7 days" },
              { value: "30", label: "Last 30 days" },
            ]}
          />
        </div>
      </Card>
      <Suspense key={JSON.stringify(sp)} fallback={<Skeleton className="h-96" />}>
        <Entries sp={sp} filters={filters} />
      </Suspense>
    </>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-48 overflow-auto rounded-lg bg-subtle p-3 font-mono text-[11px] leading-relaxed text-ink">
      {value === null || value === undefined ? "—" : JSON.stringify(value, null, 2)}
    </pre>
  );
}

async function Entries({ sp, filters }: { sp: Record<string, string | string[] | undefined>; filters: Record<string, string> }) {
  const s = await db();
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  let q = s.from("audit_log").select("id, at, actor_name, action, entity, entity_id, summary, before, after, reason", { count: "exact" });
  const entity = param(sp, "entity");
  const term = param(sp, "q")?.trim().replace(/[%,()]/g, " ");
  const days = Number(param(sp, "days"));
  if (entity) q = q.eq("entity", entity);
  if (term) q = q.or(`summary.ilike.%${term}%,action.ilike.%${term}%,actor_name.ilike.%${term}%`);
  if (days) q = q.gte("at", daysAgoIso(days));
  const res = await q.order("at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const entries = unwrap(res) as { id: number; at: string; actor_name: string; action: string; entity: string; entity_id: string; summary: string; before: unknown; after: unknown; reason: string | null }[];
  if (!entries.length) return <Card><EmptyState icon={<ScrollText className="size-6" />} title="No matching entries" /></Card>;
  return (
    <Card>
      <ul className="divide-y divide-line-soft">
        {entries.map((a) => (
          <li key={a.id}>
            <details className="group px-5 py-3.5">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                <span className="w-44 shrink-0 text-xs text-muted tabular-nums">{formatDateTime(a.at)}</span>
                <Badge tone="info" className="font-mono">
                  {a.action}
                </Badge>
                <span className="min-w-0 flex-1 text-sm text-ink">{a.summary}</span>
                <span className="text-xs text-muted">{a.actor_name}</span>
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-[11px] font-semibold text-muted uppercase">Before</div>
                  <Json value={a.before} />
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-semibold text-muted uppercase">After</div>
                  <Json value={a.after} />
                </div>
                <div className="text-xs text-muted md:col-span-2">
                  Entity <code>{a.entity}</code> · id <code>{a.entity_id}</code>
                  {a.reason && <> · Reason: “{a.reason}”</>}
                </div>
              </div>
            </details>
          </li>
        ))}
      </ul>
      <Pagination page={page} pageSize={PAGE} total={res.count ?? 0} hrefFor={(p) => `/audit?${new URLSearchParams({ ...filters, page: String(p) })}`} />
    </Card>
  );
}
