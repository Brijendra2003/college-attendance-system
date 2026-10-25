import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CircleCheck, CircleX, Download, FileSpreadsheet } from "lucide-react";
import { formatDateTime } from "@/shared/dates";
import { requirePermission } from "@/lib/auth/permissions";
import { db, unwrap } from "@/lib/db";
import { param } from "@/lib/utils";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, PageSkeleton, Skeleton, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { UploadForm } from "@/features/imports/upload-form";
import { commitStudentImport } from "@/features/imports/actions";

export const metadata: Metadata = { title: "Imports" };

export default function ImportsPage(props: PageProps<"/people/imports">) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Imports searchParams={props.searchParams} />
    </Suspense>
  );
}

const STATUS_TONE = { validated: "info", committed: "ok", failed: "bad" } as const;

interface Job {
  id: string;
  kind: string;
  file_name: string;
  created_at: string;
  status: keyof typeof STATUS_TONE;
  total_rows: number;
  ok_rows: number;
  error_rows: number;
}

async function Imports({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("students.import");
  const sp = await searchParams;
  const jobId = param(sp, "job");

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Imports"
        description="Upload, validate every row, fix and re-upload, then commit in one transaction. Re-running a commit skips rows that already exist."
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader number={1} title="Student admissions" description="Students with enrollment and primary guardian" />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <ButtonLink href="/api/imports/template?format=xlsx" prefetch={false} download>
                <Download className="size-4" /> Excel template
              </ButtonLink>
              <ButtonLink href="/api/imports/template?format=csv" prefetch={false} download>
                <Download className="size-4" /> CSV template
              </ButtonLink>
            </div>
            <UploadForm />
            <p className="text-xs text-muted">The Excel template has dropdowns for branch, program year, division and batch matching the active year.</p>
          </CardBody>
        </Card>
        <div className="xl:col-span-2">
          <Suspense key={jobId ?? "history"} fallback={<Skeleton className="h-96" />}>{jobId ? <Preview jobId={jobId} /> : <History />}</Suspense>
        </div>
      </div>
    </>
  );
}

async function Preview({ jobId }: { jobId: string }) {
  const s = await db();
  const [job, rows] = await Promise.all([
    s.from("import_jobs").select("id, kind, file_name, created_at, status, total_rows, ok_rows, error_rows").eq("id", jobId).maybeSingle(),
    s.from("import_rows").select("line, raw, errors, committed").eq("job_id", jobId).order("line").limit(5000),
  ]);
  const j = unwrap(job) as Job | null;
  if (!j) return <Card><EmptyState title="Import not found" /></Card>;
  const list = unwrap(rows) as { line: number; raw: Record<string, string>; errors: string[]; committed: boolean }[];
  return (
    <Card>
      <CardHeader
        number={2}
        title={`Preview · ${j.file_name}`}
        description={`${j.ok_rows} valid · ${j.error_rows} with errors · ${j.total_rows} rows`}
        action={
          j.status === "validated" && j.ok_rows > 0 ? (
            <ActionForm action={commitStudentImport} compact>
              <input type="hidden" name="jobId" value={j.id} />
              <SubmitButton variant="success" pendingLabel="Committing">
                Commit {j.ok_rows} valid rows
              </SubmitButton>
            </ActionForm>
          ) : (
            <Badge tone={STATUS_TONE[j.status]}>{j.status}</Badge>
          )
        }
      />
      <Table>
        <THead>
          <tr>
            <TH>Line</TH>
            <TH>Student</TH>
            <TH>Placement</TH>
            <TH>Result</TH>
          </tr>
        </THead>
        <tbody>
          {list.map((r) => (
            <TR key={r.line}>
              <TD className="text-muted tabular-nums">{r.line}</TD>
              <TD>
                <div className="font-medium">{r.raw.name || "—"}</div>
                <div className="font-mono text-[11px] text-muted">{r.raw.enrollmentNo}</div>
              </TD>
              <TD className="text-xs">
                {r.raw.programYear} {r.raw.department}-{r.raw.division} · B{r.raw.batch}
              </TD>
              <TD>
                {r.errors.length === 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok">
                    <CircleCheck className="size-3.5" /> {r.committed ? "Created" : "Ready"}
                  </span>
                ) : (
                  <ul className="space-y-0.5">
                    {r.errors.map((e) => (
                      <li key={e} className="flex items-start gap-1 text-xs text-bad">
                        <CircleX className="mt-0.5 size-3.5 shrink-0" /> {e}
                      </li>
                    ))}
                  </ul>
                )}
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <div className="border-t border-line-soft px-5 py-3">
        <ButtonLink href="/people/imports" size="sm" variant="ghost">
          Back to import history
        </ButtonLink>
      </div>
    </Card>
  );
}

async function History() {
  const s = await db();
  const jobs = unwrap(await s.from("import_jobs").select("id, kind, file_name, created_at, status, total_rows, ok_rows, error_rows").order("created_at", { ascending: false }).limit(50)) as Job[];
  return (
    <Card>
      <CardHeader icon={<FileSpreadsheet className="size-5" />} title="Import history" />
      {jobs.length === 0 ? (
        <EmptyState title="No imports yet" />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>File</TH>
              <TH>Type</TH>
              <TH>When</TH>
              <TH className="text-right">Rows</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <tbody>
            {jobs.map((j) => (
              <TR key={j.id}>
                <TD className="font-medium">
                  <Link href={`/people/imports?job=${j.id}`} className="hover:text-primary">
                    {j.file_name}
                  </Link>
                </TD>
                <TD className="capitalize">{j.kind.replace("_", " ")}</TD>
                <TD className="text-muted">{formatDateTime(j.created_at)}</TD>
                <TD className="text-right tabular-nums">
                  {j.ok_rows}/{j.total_rows}
                  {j.error_rows > 0 && <span className="ml-1 text-bad">({j.error_rows} errors)</span>}
                </TD>
                <TD>
                  <Badge tone={STATUS_TONE[j.status]}>{j.status}</Badge>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
