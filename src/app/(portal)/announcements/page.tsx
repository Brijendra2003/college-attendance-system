import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Megaphone, Plus } from "lucide-react";
import { formatDateTime } from "@/shared/dates";
import { can, departmentScope } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/data/store";
import { Badge, Card, DeptChip, PageHeader, PageSkeleton, Progress } from "@/components/ui/primitives";
import { ActionForm, Dialog, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/forms";
import { publishAnnouncement } from "@/features/announcements/actions";
import { actorName, departmentOptions, deptCode } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Announcements" };

export default function AnnouncementsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Announcements />
    </Suspense>
  );
}

const PRIORITY = { normal: "neutral", important: "info", urgent: "bad" } as const;
const AUDIENCE = { college: "Whole college", students: "All students", staff: "All staff", parents: "Parents", department: "Department" } as const;
const CHANNEL = { inapp: "In-app", push: "Push", email: "Email", sms: "SMS" } as const;

async function Announcements() {
  const user = await requireUser();
  const college = can(user, "announcements.college");
  const cls = can(user, "announcements.class");
  if (!college && !cls) redirect("/denied?p=announcements.college");
  const scope = college ? null : departmentScope(user, "announcements.class");
  const items = db()
    .announcements.filter((a) => !scope || a.departmentId === scope || a.audience !== "department")
    .sort((a, b) => b.publishAt.localeCompare(a.publishAt));
  const now = new Date().toISOString();

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Announcements"
        description="In-app and push are always on. Email and SMS are optional and cost money per message (SMS needs DLT-registered templates)."
        actions={
          <Dialog trigger={<><Plus className="size-4" /> New announcement</>} title="New announcement" description={college ? "Choose the audience and channels." : "Sent to your department's students, parents and staff."} wide>
            <ActionForm action={publishAnnouncement} resetOnSuccess className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field name="title" label="Title" className="sm:col-span-2">
                <Input name="title" placeholder="e.g. Practical exam schedule published" />
              </Field>
              <Field name="body" label="Message" className="sm:col-span-2" hint="Markdown supported">
                <Textarea name="body" rows={5} />
              </Field>
              <Field name="priority" label="Priority">
                <Select name="priority" defaultValue="normal">
                  <option value="normal">Normal</option>
                  <option value="important">Important</option>
                  <option value="urgent">Urgent (bypasses quiet hours)</option>
                </Select>
              </Field>
              {college ? (
                <Field name="audience" label="Audience">
                  <Select name="audience" defaultValue="college">
                    {Object.entries(AUDIENCE).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <input type="hidden" name="audience" value="department" />
              )}
              {college && (
                <Field name="departmentId" label="Department" hint="Only for the Department audience">
                  <Select name="departmentId" defaultValue="">
                    <option value="">—</option>
                    {departmentOptions().map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field name="publishAt" label="Schedule (optional)" hint="Leave empty to send now">
                <Input name="publishAt" type="datetime-local" />
              </Field>
              <fieldset className="sm:col-span-2">
                <legend className="mb-1.5 text-xs font-semibold">Channels</legend>
                <div className="flex flex-wrap gap-4 text-sm">
                  {Object.entries(CHANNEL).map(([k, v]) => (
                    <label key={k} className="inline-flex items-center gap-2">
                      <input type="checkbox" name="channels" value={k} defaultChecked={k === "inapp" || k === "push"} disabled={k === "inapp"} className="size-4 accent-navy" />
                      {k === "inapp" && <input type="hidden" name="channels" value="inapp" />}
                      {v}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex justify-end sm:col-span-2">
                <SubmitButton>Publish</SubmitButton>
              </div>
            </ActionForm>
          </Dialog>
        }
      />
      <div className="space-y-4">
        {items.map((a) => {
          const scheduled = a.publishAt > now;
          const readPct = a.recipients ? (a.readCount / a.recipients) * 100 : 0;
          return (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy">
                  <Megaphone className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-ink">{a.title}</h2>
                    <Badge tone={PRIORITY[a.priority]}>{a.priority}</Badge>
                    {scheduled && <Badge tone="violet">scheduled</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted">{a.body}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {a.departmentId ? <DeptChip code={deptCode(a.departmentId)} soft /> : null}
                    <span>{AUDIENCE[a.audience]}</span>·<span>{a.channels.map((c) => CHANNEL[c]).join(", ")}</span>·
                    <span>
                      {actorName(a.createdBy)} · {formatDateTime(a.publishAt)}
                    </span>
                  </div>
                </div>
                <div className="w-48 shrink-0">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted">Read</span>
                    <span className="font-semibold tabular-nums">
                      {a.readCount.toLocaleString("en-IN")} / {a.recipients.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <Progress value={readPct} tone="var(--color-primary)" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
