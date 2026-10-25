import type { Metadata } from "next";
import { Suspense } from "react";
import { PERMISSIONS, ROLE_LABELS, ROLES } from "@/shared/permissions";
import { formatDate } from "@/shared/dates";
import { can, requirePermission } from "@/lib/auth/permissions";
import { db } from "@/lib/data/store";
import { param } from "@/lib/utils";
import { Badge, Card, CardBody, CardHeader, PageHeader, PageSkeleton, Table, Tabs, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ActionForm, Field, Input, Select, SubmitButton } from "@/components/ui/forms";
import { updateCollege, updatePolicy } from "@/features/settings/actions";
import { ScopeCell } from "@/features/settings/role-matrix";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage(props: PageProps<"/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("settings.manage");
  const sp = await searchParams;
  const tab = param(sp, "tab") ?? "college";
  const store = db();
  const canPolicy = can(user, "attendance.policy.manage");
  const canRoles = can(user, "roles.manage");

  return (
    <>
      <PageHeader eyebrow="Administration" title="Settings" description="College profile, attendance rules and who can do what. Every change is audited." />
      <Tabs
        active={tab}
        items={[
          { key: "college", label: "College profile", href: "/settings?tab=college" },
          { key: "policy", label: "Attendance policy", href: "/settings?tab=policy" },
          { key: "codes", label: "Status codes", href: "/settings?tab=codes" },
          ...(canRoles ? [{ key: "roles", label: "Roles & permissions", href: "/settings?tab=roles" }] : []),
        ]}
      />

      {tab === "college" && (
        <Card className="max-w-3xl">
          <CardHeader title="College profile" description={`Single-tenant: one college row. Affiliated to ${store.college.university}; timezone ${store.college.timezone}.`} />
          <CardBody>
            <ActionForm action={updateCollege} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field name="name" label="College name" className="sm:col-span-2">
                <Input name="name" defaultValue={store.college.name} />
              </Field>
              <Field name="shortName" label="Short name">
                <Input name="shortName" defaultValue={store.college.shortName} />
              </Field>
              <Field name="principalName" label="Principal">
                <Input name="principalName" defaultValue={store.college.principalName} />
              </Field>
              <Field name="address" label="Address" className="sm:col-span-2">
                <Input name="address" defaultValue={store.college.address} />
              </Field>
              <Field name="phone" label="Phone">
                <Input name="phone" defaultValue={store.college.phone} />
              </Field>
              <Field name="email" label="Email">
                <Input name="email" type="email" defaultValue={store.college.email} />
              </Field>
              <div className="flex justify-end sm:col-span-2">
                <SubmitButton>Save profile</SubmitButton>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      )}

      {tab === "policy" && (
        <Card className="max-w-3xl">
          <CardHeader
            title="College attendance policy"
            description={`Default for every branch, effective ${formatDate(store.policy.effectiveFrom, { year: true })}. Department, program-year and subject overrides inherit from it.`}
          />
          <CardBody>
            <ActionForm action={updatePolicy} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <fieldset disabled={!canPolicy} className="contents">
                <Field name="minPercent" label="Minimum % (eligibility)" hint="MU colleges commonly use 75%">
                  <Input name="minPercent" type="number" step="0.5" defaultValue={store.policy.minPercent} />
                </Field>
                <Field name="warnPercent" label="Warning %" hint="Students between minimum and warning are “at risk”">
                  <Input name="warnPercent" type="number" step="0.5" defaultValue={store.policy.warnPercent} />
                </Field>
                <Field name="countMode" label="Counting mode">
                  <Select name="countMode" defaultValue={store.policy.countMode}>
                    <option value="session">Per session (2-hour practical = 1)</option>
                    <option value="hours">Per hour (2-hour practical = 2)</option>
                  </Select>
                </Field>
                <Field name="eligibilityBasis" label="Eligibility basis">
                  <Select name="eligibilityBasis" defaultValue={store.policy.eligibilityBasis}>
                    <option value="per_subject_component">Per subject × component</option>
                    <option value="per_subject">Per subject</option>
                    <option value="aggregate">Aggregate</option>
                  </Select>
                </Field>
                <Field name="editWindowHours" label="Professor edit window (hours)">
                  <Input name="editWindowHours" type="number" defaultValue={store.policy.editWindowHours} />
                </Field>
                <Field name="lockAfterHours" label="Lock registers after (hours)">
                  <Input name="lockAfterHours" type="number" defaultValue={store.policy.lockAfterHours} />
                </Field>
                <Field name="defaultUnmarkedStatus" label="Unmarked students become">
                  <Select name="defaultUnmarkedStatus" defaultValue={store.policy.defaultUnmarkedStatus}>
                    <option value="A">Absent (A)</option>
                    <option value="P">Present (P)</option>
                  </Select>
                </Field>
                <label className="flex items-center gap-2 self-end pb-2 text-sm">
                  <input type="checkbox" name="leaveAppliesRetroactively" value="true" defaultChecked={store.policy.leaveAppliesRetroactively} className="size-4 accent-navy" />
                  Approved leave converts past A to L
                </label>
                <div className="flex justify-end sm:col-span-2">
                  {canPolicy ? <SubmitButton>Save policy</SubmitButton> : <span className="text-xs text-muted">Read only for your role</span>}
                </div>
              </fieldset>
            </ActionForm>
          </CardBody>
        </Card>
      )}

      {tab === "codes" && (
        <Card>
          <CardHeader title="Attendance status codes" description="Colours are shared by web, mobile and PDF exports" />
          <Table>
            <THead>
              <tr>
                <TH>Code</TH>
                <TH>Meaning</TH>
                <TH>Counts as attended</TH>
                <TH>Counts in held</TH>
                <TH>Professor can set</TH>
                <TH>Requires reason</TH>
              </tr>
            </THead>
            <tbody>
              {store.statusCodes.map((c) => (
                <TR key={c.code}>
                  <TD>
                    <span className="inline-grid h-7 min-w-9 place-items-center rounded-md px-2 font-mono text-xs font-bold text-white" style={{ background: c.color }}>
                      {c.code}
                    </span>
                  </TD>
                  <TD className="font-medium">{c.label}</TD>
                  {[c.countsAsAttended, c.countsInHeld, c.professorCanSet, c.requiresReason].map((v, i) => (
                    <TD key={i}>{v ? <Badge tone="ok">Yes</Badge> : <Badge>No</Badge>}</TD>
                  ))}
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "roles" && canRoles && (
        <Card>
          <CardHeader
            title="Role permissions"
            description="Scopes: all = whole college, department = the HOD's own branch, assigned = sessions a professor teaches, self / linked = a student's own or a parent's linked children."
          />
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-[#f3f7fd]">
                <tr>
                  <th className="border-b border-line px-4 py-2.5 text-left font-semibold text-navy">Permission</th>
                  {ROLES.map((r) => (
                    <th key={r} className="border-b border-line px-2 py-2.5 text-center font-semibold whitespace-nowrap text-navy">
                      {ROLE_LABELS[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((p) => (
                  <tr key={p} className="hover:bg-[#f8fafd]">
                    <td className="border-b border-line-soft px-4 py-1.5 font-mono whitespace-nowrap text-ink">{p}</td>
                    {ROLES.map((r) => (
                      <td key={r} className="min-w-28 border-b border-line-soft px-1.5 py-1">
                        <ScopeCell role={r} permission={p} value={store.rolePermissions[r][p] ?? "none"} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
