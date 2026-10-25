import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Megaphone, Plus } from "lucide-react";
import { formatDateTime } from "@/shared/dates";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { db, unwrap } from "@/lib/db";
import { Badge, Card, DeptChip, EmptyState, PageHeader, PageSkeleton } from "@/components/ui/primitives";
import { ActionForm, Dialog, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/forms";
import { publishAnnouncement } from "@/features/announcements/actions";
import { departmentOptions, getDepartments } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Announcements" };

export default function AnnouncementsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="table" />}>
      <Announcements />
    </Suspense>
  );
}

const PRIORITY = { normal: "neutral", important: "info", urgent: "bad" } as const;
const AUDIENCE = { college: "Whole college", students: "All students", staff: "All staff", parents: "Parents", department: "Department" } as const;
const CHANNEL = { inapp: "In-app", push: "Push", email: "Email", sms: "SMS" } as const;

interface Row {
  id: string;
  title: string;
  body: string;
  priority: keyof typeof PRIORITY;
  audience: keyof typeof AUDIENCE;
  department_id: string | null;
  channels: (keyof typeof CHANNEL)[];
  publish_at: string;
  published: boolean;
  recipient_count: number;
}

async function Announcements() {
  const user = await requireUser();
  const college = can(user, "announcements.college");
  if (!college && !can(user, "announcements.class")) redirect("/denied?p=announcements.college");
  const s = await db();
  const [rows, departments, options] = await Promise.all([
    s.from("announcements").select("id, title, body, priority, audience, department_id, channels, publish_at, published, recipient_count").order("publish_at", { ascending: false }).limit(100),
    getDepartments(),
    departmentOptions(),
  ]);
  const items = unwrap(rows) as Row[];
  const code = (id: string | null) => departments.find((d) => d.id === id)?.code;

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
              <Field name="body" label="Message" className="sm:col-span-2">
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
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field name="publishAt" label="Schedule (optional, IST)" hint="Leave empty to send now">
                <Input name="publishAt" type="datetime-local" />
              </Field>
              <fieldset className="sm:col-span-2">
                <legend className="mb-1.5 text-xs font-semibold">Channels</legend>
                <div className="flex flex-wrap gap-4 text-sm">
                  <input type="hidden" name="channels" value="inapp" />
                  {Object.entries(CHANNEL).map(([k, v]) => (
                    <label key={k} className="inline-flex items-center gap-2">
                      <input type="checkbox" name={k === "inapp" ? undefined : "channels"} value={k} defaultChecked={k === "inapp" || k === "push"} disabled={k === "inapp"} className="size-4 accent-[var(--navy)]" />
                      {v}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex justify-end sm:col-span-2">
                <SubmitButton pendingLabel="Publishing">Publish</SubmitButton>
              </div>
            </ActionForm>
          </Dialog>
        }
      />
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={<Megaphone className="size-6" />} title="No announcements yet" />
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex flex-wrap items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy-50 text-heading">
                  <Megaphone className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-ink">{a.title}</h2>
                    <Badge tone={PRIORITY[a.priority]}>{a.priority}</Badge>
                    {!a.published && <Badge tone="violet">scheduled</Badge>}
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-line text-muted">{a.body}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {code(a.department_id) && <DeptChip code={code(a.department_id)!} soft />}
                    <span>{AUDIENCE[a.audience]}</span>·<span>{a.channels.map((c) => CHANNEL[c]).join(", ")}</span>·<span>{formatDateTime(a.publish_at)}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-muted">
                  <div className="text-lg font-bold text-heading tabular-nums">{a.recipient_count.toLocaleString("en-IN")}</div>
                  app recipients
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
