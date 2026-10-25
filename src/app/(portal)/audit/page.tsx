import type { Metadata } from "next";
import { Suspense } from "react";
import { ScrollText } from "lucide-react";
import { formatDateTime } from "@/shared/dates";
import { requirePermission } from "@/lib/auth/permissions";
import { db } from "@/lib/data/store";
import { param } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader, PageSkeleton } from "@/components/ui/primitives";
import { FilterSelect, SearchBox } from "@/components/ui/forms";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage(props: PageProps<"/audit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Audit searchParams={props.searchParams} />
    </Suspense>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-48 overflow-auto rounded-lg bg-[#f8fafd] p-3 font-mono text-[11px] leading-relaxed text-ink">
      {value === null || value === undefined ? "—" : JSON.stringify(value, null, 2)}
    </pre>
  );
}

async function Audit({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("audit.view");
  const sp = await searchParams;
  const store = db();
  const entity = param(sp, "entity");
  const actor = param(sp, "actor");
  const q = param(sp, "q")?.toLowerCase();
  const entries = store.audit.filter(
    (a) => (!entity || a.entity === entity) && (!actor || a.actorId === actor) && (!q || a.summary.toLowerCase().includes(q) || a.action.includes(q)),
  );
  const entities = [...new Set(store.audit.map((a) => a.entity))].sort();
  const actors = [...new Map(store.audit.map((a) => [a.actorId, a.actorName])).entries()];

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Audit log"
        description="Append-only: who changed what, when, before and after values, and the reason. Rows can't be updated or deleted."
      />
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SearchBox placeholder="Search summaries" />
          <FilterSelect name="entity" label="Entity" options={entities.map((e) => ({ value: e, label: e }))} allLabel="All entities" />
          <FilterSelect name="actor" label="Actor" options={actors.map(([value, label]) => ({ value, label }))} allLabel="Everyone" />
        </div>
      </Card>
      <Card>
        {entries.length === 0 ? (
          <EmptyState icon={<ScrollText className="size-6" />} title="No matching entries" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {entries.map((a) => (
              <li key={a.id}>
                <details className="group px-5 py-3.5">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                    <span className="w-40 shrink-0 text-xs text-muted tabular-nums">{formatDateTime(a.at)}</span>
                    <Badge tone="info" className="font-mono">
                      {a.action}
                    </Badge>
                    <span className="min-w-0 flex-1 text-sm text-ink">{a.summary}</span>
                    <span className="text-xs text-muted">{a.actorName}</span>
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
                      Entity <code>{a.entity}</code> · id <code>{a.entityId}</code>
                      {a.reason && <> · Reason: “{a.reason}”</>}
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
