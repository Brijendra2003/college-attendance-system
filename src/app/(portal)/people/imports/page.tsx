import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CircleCheck, CircleX, Download, FileSpreadsheet } from "lucide-react";
import { formatDateTime } from "@/shared/dates";
import { requirePermission } from "@/lib/auth/permissions";
import { db } from "@/lib/data/store";
import { param } from "@/lib/utils";
import { Badge, ButtonLink, Card, CardBody, CardHeader, PageHeader, PageSkeleton, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ActionForm, SubmitButton } from "@/components/ui/forms";
import { UploadForm } from "@/features/imports/upload-form";
import { commitStudentImport } from "@/features/imports/actions";
import { actorName } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Imports" };

export default function ImportsPage(props: PageProps<"/people/imports">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Imports searchParams={props.searchParams} />
    </Suspense>
  );
}

const STATUS_TONE = { validated: "info", committed: "ok", failed: "bad" } as const;

async function Imports({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("students.import");
  const sp = await searchParams;
  const store = db();
  const jobId = param(sp, "job");
  const job = jobId ? store.imports.find((j) => j.id === jobId) : undefined;
  const staged = jobId ? store.stagedImports.get(jobId) : undefined;

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
            <ButtonLink href="/api/imports/template" prefetch={false} className="w-full">
              <Download className="size-4" /> Download CSV template
            </ButtonLink>
            <UploadForm />
            <p className="text-xs text-muted">
              Branch codes (COMP, IT …), program year (FE–BE), division letter and batch number must match the active 2026-27 structure.
            </p>
          </CardBody>
        </Card>

        <div className="xl:col-span-2">
          {job && staged ? (
            <Card>
              <CardHeader
                number={2}
                title={`Preview · ${job.fileName}`}
                description={`${job.okRows} valid · ${job.errorRows} with errors · ${job.totalRows} rows`}
                action={
                  job.status === "validated" ? (
                    <ActionForm action={commitStudentImport} compact>
                      <input type="hidden" name="jobId" value={job.id} />
                      <SubmitButton variant="success" pendingLabel="Committing…">
                        Commit {job.okRows} valid rows
                      </SubmitButton>
                    </ActionForm>
                  ) : (
                    <Badge tone={STATUS_TONE[job.status]}>{job.status}</Badge>
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
                  {staged.map((r) => (
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
            </Card>
          ) : (
            <Card>
              <CardHeader icon={<FileSpreadsheet className="size-5" />} title="Import history" />
              <Table>
                <THead>
                  <tr>
                    <TH>File</TH>
                    <TH>Type</TH>
                    <TH>By</TH>
                    <TH>When</TH>
                    <TH className="text-right">Rows</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <tbody>
                  {store.imports.map((j) => (
                    <TR key={j.id}>
                      <TD className="font-medium">{store.stagedImports.has(j.id) ? <Link href={`/people/imports?job=${j.id}`} className="hover:text-primary">{j.fileName}</Link> : j.fileName}</TD>
                      <TD className="capitalize">{j.kind}</TD>
                      <TD>{actorName(j.createdBy)}</TD>
                      <TD className="text-muted">{formatDateTime(j.createdAt)}</TD>
                      <TD className="text-right tabular-nums">
                        {j.okRows}/{j.totalRows}
                        {j.errorRows > 0 && <span className="ml-1 text-bad">({j.errorRows} errors)</span>}
                      </TD>
                      <TD>
                        <Badge tone={STATUS_TONE[j.status]}>{j.status}</Badge>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
