import type { Metadata } from "next";
import { Suspense } from "react";
import { PERMISSIONS, ROLE_LABELS, ROLES } from "@/shared/permissions";
import { formatDate } from "@/shared/dates";
import { can, requirePermission } from "@/lib/auth/permissions";
import { db, unwrap } from "@/lib/db";
import { param } from "@/lib/utils";
import { Badge, Card, CardBody, CardHeader, PageHeader, PageSkeleton, Table, Tabs, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ActionForm, Field, Input, Select, SubmitButton } from "@/components/ui/forms";
import { setAppConfig, updateCollege, updatePolicy } from "@/features/settings/actions";
import { ScopeCell } from "@/features/settings/role-matrix";
import { getCollege, getPolicy } from "@/features/common/lookups";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage(props: PageProps<"/settings">) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Settings searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Settings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermission("settings.manage");
  const sp = await searchParams;
  const tab = param(sp, "tab") ?? "college";
  const canPolicy = can(user, "attendance.policy.manage");
  const canRoles = can(user, "roles.manage");

  return (
    <>
      <PageHeader eyebrow="Administration" title="Settings" description="College profile, attendance rules, who can do what and app configuration. Every change is audited and needs two-factor verification." />
      <Tabs
        active={tab}
        items={[
          { key: "college", label: "College profile", href: "/settings?tab=college" },
          { key: "policy", label: "Attendance policy", href: "/settings?tab=policy" },
          { key: "codes", label: "Status codes", href: "/settings?tab=codes" },
          ...(canRoles ? [{ key: "roles", label: "Roles & permissions", href: "/settings?tab=roles" }] : []),
          { key: "app", label: "App & security", href: "/settings?tab=app" },
        ]}
      />
      {tab === "college" && <CollegeTab />}
      {tab === "policy" && <PolicyTab canEdit={canPolicy} />}
      {tab === "codes" && <CodesTab />}
      {tab === "roles" && canRoles && <RolesTab />}
      {tab === "app" && <AppTab />}
    </>
  );
}

async function CollegeTab() {
  const c = await getCollege();
  return (
    <Card className="max-w-3xl">
      <CardHeader title="College profile" description={`Single-tenant: one college row. Affiliated to ${c.university}; timezone ${c.timezone}.`} />
      <CardBody>
        <ActionForm action={updateCollege} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field name="name" label="College name" className="sm:col-span-2">
            <Input name="name" defaultValue={c.name} />
          </Field>
          <Field name="shortName" label="Short name">
            <Input name="shortName" defaultValue={c.short_name} />
          </Field>
          <Field name="principalName" label="Principal">
            <Input name="principalName" defaultValue={c.principal_name ?? ""} />
          </Field>
          <Field name="address" label="Address" className="sm:col-span-2">
            <Input name="address" defaultValue={c.address ?? ""} />
          </Field>
          <Field name="phone" label="Phone">
            <Input name="phone" defaultValue={c.phone ?? ""} />
          </Field>
          <Field name="email" label="Email">
            <Input name="email" type="email" defaultValue={c.email ?? ""} />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <SubmitButton>Save profile</SubmitButton>
          </div>
        </ActionForm>
      </CardBody>
    </Card>
  );
}

async function PolicyTab({ canEdit }: { canEdit: boolean }) {
  const p = await getPolicy();
  return (
    <Card className="max-w-3xl">
      <CardHeader
        title="College attendance policy"
        description={`Default for every branch, effective ${formatDate(p.effective_from, { year: true })}. Department, program-year and subject overrides inherit from it.`}
      />
      <CardBody>
        <ActionForm action={updatePolicy} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <fieldset disabled={!canEdit} className="contents">
            <Field name="minPercent" label="Minimum % (eligibility)" hint="MU colleges commonly use 75%">
              <Input name="minPercent" type="number" step="0.5" defaultValue={p.min_percent} />
            </Field>
            <Field name="warnPercent" label="Warning %" hint="Between minimum and warning is “at risk”">
              <Input name="warnPercent" type="number" step="0.5" defaultValue={p.warn_percent} />
            </Field>
            <Field name="countMode" label="Counting mode">
              <Select name="countMode" defaultValue={p.count_mode}>
                <option value="session">Per session (2-hour practical = 1)</option>
                <option value="hours">Per hour (2-hour practical = 2)</option>
              </Select>
            </Field>
            <Field name="eligibilityBasis" label="Eligibility basis">
              <Select name="eligibilityBasis" defaultValue={p.eligibility_basis}>
                <option value="per_subject_component">Per subject × component</option>
                <option value="per_subject">Per subject</option>
                <option value="aggregate">Aggregate</option>
              </Select>
            </Field>
            <Field name="editWindowHours" label="Professor edit window (hours)">
              <Input name="editWindowHours" type="number" defaultValue={p.edit_window_hours} />
            </Field>
            <Field name="lockAfterHours" label="Lock registers after (hours)">
              <Input name="lockAfterHours" type="number" defaultValue={p.lock_after_hours} />
            </Field>
            <Field name="defaultUnmarkedStatus" label="Unmarked students become">
              <Select name="defaultUnmarkedStatus" defaultValue={p.default_unmarked_status}>
                <option value="A">Absent (A)</option>
                <option value="P">Present (P)</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="leaveAppliesRetroactively" value="true" defaultChecked={p.leave_applies_retroactively} className="size-4 accent-[var(--navy)]" />
              Approved leave converts past A to L
            </label>
            <div className="flex justify-end sm:col-span-2">{canEdit ? <SubmitButton>Save policy</SubmitButton> : <span className="text-xs text-muted">Read only for your role</span>}</div>
          </fieldset>
        </ActionForm>
      </CardBody>
    </Card>
  );
}

async function CodesTab() {
  const s = await db();
  const codes = unwrap(await s.from("attendance_status_codes").select("*").order("sort_order")) as {
    code: string;
    label: string;
    color: string;
    counts_as_attended: boolean;
    counts_in_held: boolean;
    professor_can_set: boolean;
    requires_reason: boolean;
  }[];
  return (
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
          {codes.map((c) => (
            <TR key={c.code}>
              <TD>
                <span className="inline-grid h-7 min-w-9 place-items-center rounded-md px-2 font-mono text-xs font-bold text-white" style={{ background: c.color }}>
                  {c.code}
                </span>
              </TD>
              <TD className="font-medium">{c.label}</TD>
              {[c.counts_as_attended, c.counts_in_held, c.professor_can_set, c.requires_reason].map((v, i) => (
                <TD key={i}>{v ? <Badge tone="ok">Yes</Badge> : <Badge>No</Badge>}</TD>
              ))}
            </TR>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

async function RolesTab() {
  const s = await db();
  const grants = unwrap(await s.from("role_permissions").select("role, permission, scope")) as { role: string; permission: string; scope: string }[];
  const scopeOf = (role: string, perm: string) => grants.find((g) => g.role === role && g.permission === perm)?.scope ?? "none";
  return (
    <Card>
      <CardHeader
        title="Role permissions"
        description="Scopes: all = whole college, department = the HOD's own branch, assigned = sessions a professor teaches, self / linked = a student's own or a parent's linked children. Changes apply on the next request."
      />
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-sunken">
            <tr>
              <th className="border-b border-line px-4 py-2.5 text-left font-semibold text-heading">Permission</th>
              {ROLES.map((r) => (
                <th key={r} className="border-b border-line px-2 py-2.5 text-center font-semibold whitespace-nowrap text-heading">
                  {ROLE_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p} className="hover:bg-subtle">
                <td className="border-b border-line-soft px-4 py-1.5 font-mono whitespace-nowrap text-ink">{p}</td>
                {ROLES.map((r) => (
                  <td key={r} className="min-w-28 border-b border-line-soft px-1.5 py-1">
                    <ScopeCell role={r} permission={p} value={scopeOf(r, p)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

async function AppTab() {
  const s = await db();
  const rows = unwrap(await s.from("app_config").select("key, value")) as { key: string; value: unknown }[];
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader title="Two-factor authentication" description="Principal and Admin accounts must verify with an authenticator app (TOTP). Turning this off is not recommended." />
        <CardBody>
          <ActionForm action={setAppConfig} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="key" value="require_mfa_for_admins" />
            <Field name="value" label="Require MFA for Principal and Admin" className="w-64">
              <Select name="value" defaultValue={String(get("require_mfa_for_admins") ?? true)}>
                <option value="true">Required (recommended)</option>
                <option value="false">Not required</option>
              </Select>
            </Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Mobile app" description="Older app builds below the minimum version are asked to update." />
        <CardBody className="space-y-5">
          <ActionForm action={setAppConfig} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="key" value="min_mobile_version" />
            <Field name="value" label="Minimum app version" hint="major.minor.patch" className="w-64">
              <Input name="value" defaultValue={String(get("min_mobile_version") ?? "1.0.0")} />
            </Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
          <ActionForm action={setAppConfig} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="key" value="maintenance_banner" />
            <Field name="value" label="Maintenance banner" hint="Shown in the app; leave empty to hide" className="min-w-80 flex-1">
              <Input name="value" defaultValue={typeof get("maintenance_banner") === "string" ? String(get("maintenance_banner")) : ""} />
            </Field>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
