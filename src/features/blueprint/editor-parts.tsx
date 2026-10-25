"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PROGRAM_YEAR_CODES, type BlueprintDepartment, type BlueprintDoc, type BlueprintSubject, type ProgramYearCode } from "@/shared/blueprint";
import { Input, Select } from "@/components/ui/forms";
import { Badge, buttonClass, DeptChip } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

// Shared editing UI for the setup wizard and the blueprint editor (§7.6).
// Everything is structure only: branches, divisions/batches, subjects, day.

type Update = (fn: (doc: BlueprintDoc) => BlueprintDoc) => void;

const num = (v: string, min = 0, max = 999) => Math.max(min, Math.min(max, Number(v) || 0));

export function BranchesEditor({ doc, update }: { doc: BlueprintDoc; update: Update }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const setDept = (i: number, patch: Partial<BlueprintDepartment>) =>
    update((d) => ({ ...d, departments: d.departments.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {doc.departments.map((d, i) => (
          <label key={d.code} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2", d.active ? "border-line bg-surface" : "border-line-soft bg-subtle opacity-70")}>
            <input type="checkbox" checked={d.active} onChange={(e) => setDept(i, { active: e.target.checked })} className="size-4 accent-[var(--navy)]" />
            <DeptChip code={d.code} />
            <Input value={d.name} onChange={(e) => setDept(i, { name: e.target.value })} className="h-8" aria-label={`${d.code} name`} />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-line p-3">
        <label className="flex flex-col">
          <span className="mb-1 text-[11px] font-semibold text-muted uppercase">Code</span>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} placeholder="e.g. MECHA" maxLength={8} className="w-28" />
        </label>
        <label className="flex min-w-60 flex-1 flex-col">
          <span className="mb-1 text-[11px] font-semibold text-muted uppercase">Branch name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mechatronics Engineering" />
        </label>
        <button
          type="button"
          className={buttonClass("secondary")}
          disabled={code.length < 2 || name.trim().length < 3 || doc.departments.some((d) => d.code === code)}
          onClick={() => {
            update((d) => ({
              ...d,
              departments: [
                ...d.departments,
                { code, name: name.trim(), established: null, active: true, divisions: Object.fromEntries(PROGRAM_YEAR_CODES.map((py) => [py, { count: 1, batches: 3, capacity: 60 }])) },
              ],
            }));
            setCode("");
            setName("");
          }}
        >
          <Plus className="size-4" /> Add branch
        </button>
      </div>
    </div>
  );
}

export function DivisionsEditor({ doc, update }: { doc: BlueprintDoc; update: Update }) {
  const set = (i: number, py: ProgramYearCode, key: "count" | "batches" | "capacity", value: number) =>
    update((d) => ({
      ...d,
      departments: d.departments.map((x, j) =>
        j === i ? { ...x, divisions: { ...x.divisions, [py]: { count: 1, batches: 3, capacity: 60, ...x.divisions[py], [key]: value } } } : x,
      ),
    }));
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-xs">
        <thead className="bg-sunken text-heading">
          <tr>
            <th className="px-3 py-2 text-left">Branch</th>
            {PROGRAM_YEAR_CODES.map((py) => (
              <th key={py} className="border-l border-line px-2 py-2 text-center" colSpan={3}>
                {py}
              </th>
            ))}
          </tr>
          <tr className="text-[10px] text-muted">
            <th />
            {PROGRAM_YEAR_CODES.map((py) => (
              <FragmentHeads key={py} />
            ))}
          </tr>
        </thead>
        <tbody>
          {doc.departments.map((d, i) =>
            d.active ? (
              <tr key={d.code} className="border-t border-line-soft">
                <td className="px-3 py-1.5">
                  <DeptChip code={d.code} soft />
                </td>
                {PROGRAM_YEAR_CODES.map((py) => {
                  const t = d.divisions[py] ?? { count: 0, batches: 3, capacity: 60 };
                  return (["count", "batches", "capacity"] as const).map((k, ki) => (
                    <td key={`${py}-${k}`} className={cn("px-1 py-1.5", ki === 0 && "border-l border-line-soft")}>
                      <Input
                        type="number"
                        value={t[k]}
                        min={k === "capacity" ? 10 : 0}
                        max={k === "count" ? 10 : k === "batches" ? 6 : 240}
                        onChange={(e) => set(i, py, k, num(e.target.value, 0, k === "count" ? 10 : k === "batches" ? 6 : 240))}
                        className="h-7 w-14 px-1.5 text-center text-xs"
                        aria-label={`${d.code} ${py} ${k}`}
                      />
                    </td>
                  ));
                })}
              </tr>
            ) : null,
          )}
        </tbody>
      </table>
    </div>
  );
}

function FragmentHeads() {
  return (
    <>
      <th className="border-l border-line-soft px-1 pb-1.5 font-medium">Div.</th>
      <th className="px-1 pb-1.5 font-medium">Batches</th>
      <th className="px-1 pb-1.5 font-medium">Seats</th>
    </>
  );
}

export function SubjectsEditor({ doc, update }: { doc: BlueprintDoc; update: Update }) {
  const active = doc.departments.filter((d) => d.active);
  const [dept, setDept] = useState<string>("FE");
  const [sem, setSem] = useState<number>(dept === "FE" ? 1 : 3);
  const semesters = dept === "FE" ? [1, 2] : [3, 4, 5, 6, 7, 8];
  const effectiveSem = semesters.includes(sem) ? sem : semesters[0];
  const list = useMemo(
    () => doc.subjects.map((s, index) => ({ s, index })).filter(({ s }) => (dept === "FE" ? s.department === null : s.department === dept) && s.semester === effectiveSem),
    [doc.subjects, dept, effectiveSem],
  );
  const setSubject = (index: number, patch: Partial<BlueprintSubject>) => update((d) => ({ ...d, subjects: d.subjects.map((x, i) => (i === index ? { ...x, ...patch } : x)) }));
  const toggleComponent = (index: number, kind: "TH" | "PR" | "TUT", hours: number) =>
    update((d) => ({
      ...d,
      subjects: d.subjects.map((x, i) => {
        if (i !== index) return x;
        const has = x.components.some((c) => c.kind === kind);
        const components = has ? x.components.filter((c) => c.kind !== kind) : [...x.components, { kind, hours }];
        return { ...x, components };
      }),
    }));
  const setHours = (index: number, kind: string, hours: number) =>
    update((d) => ({ ...d, subjects: d.subjects.map((x, i) => (i === index ? { ...x, components: x.components.map((c) => (c.kind === kind ? { ...c, hours } : c)) } : x)) }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col">
          <span className="mb-1 text-[11px] font-semibold text-muted uppercase">Branch</span>
          <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-56">
            <option value="FE">FE common (Sem 1–2)</option>
            {active.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code} — {d.name}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex flex-col">
          <span className="mb-1 text-[11px] font-semibold text-muted uppercase">Semester</span>
          <div className="flex gap-1">
            {semesters.map((n) => (
              <button key={n} type="button" onClick={() => setSem(n)} className={cn("h-9 w-9 rounded-lg border text-sm font-semibold", n === effectiveSem ? "border-navy bg-navy text-white" : "border-line bg-surface hover:bg-navy-50")}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-sunken text-left text-xs text-heading">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Credits</th>
              <th className="px-3 py-2">Theory h/wk</th>
              <th className="px-3 py-2">Practical h/wk</th>
              <th className="px-3 py-2">Elective</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map(({ s, index }) => {
              const th = s.components.find((c) => c.kind === "TH");
              const pr = s.components.find((c) => c.kind === "PR");
              return (
                <tr key={`${s.code}-${index}`} className="border-t border-line-soft">
                  <td className="px-2 py-1.5">
                    <Input value={s.code} onChange={(e) => setSubject(index, { code: e.target.value.toUpperCase() })} className="h-8 w-28 font-mono text-xs" aria-label="Subject code" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input value={s.name} onChange={(e) => setSubject(index, { name: e.target.value })} className="h-8 min-w-64" aria-label="Subject name" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input type="number" value={s.credits} onChange={(e) => setSubject(index, { credits: num(e.target.value, 0, 10) })} className="h-8 w-16" aria-label="Credits" />
                  </td>
                  {(["TH", "PR"] as const).map((k) => {
                    const c = k === "TH" ? th : pr;
                    return (
                      <td key={k} className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <input type="checkbox" checked={!!c} onChange={() => toggleComponent(index, k, k === "TH" ? 3 : 2)} className="size-4 accent-[var(--navy)]" aria-label={`${k} component`} />
                          {c && <Input type="number" step="0.5" value={c.hours} onChange={(e) => setHours(index, k, Math.max(0.5, Number(e.target.value) || 0.5))} className="h-8 w-16" aria-label={`${k} hours`} />}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5">
                    <input type="checkbox" checked={s.elective} onChange={(e) => setSubject(index, { elective: e.target.checked })} className="size-4 accent-[var(--navy)]" aria-label="Elective" />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button type="button" onClick={() => update((d) => ({ ...d, subjects: d.subjects.filter((_, i) => i !== index) }))} className="rounded-md p-1.5 text-muted hover:bg-bad-soft hover:text-bad" aria-label={`Remove ${s.code}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted">
                  No subjects for this semester yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className={buttonClass("secondary", "sm")}
        onClick={() =>
          update((d) => ({
            ...d,
            subjects: [
              ...d.subjects,
              {
                code: `${dept === "FE" ? "FEC" : dept}${effectiveSem}${String(list.length + 1).padStart(2, "0")}`,
                name: "New subject",
                department: dept === "FE" ? null : dept,
                semester: effectiveSem,
                credits: 3,
                elective: false,
                components: [{ kind: "TH", hours: 3 }],
              },
            ],
          }))
        }
      >
        <Plus className="size-4" /> Add subject
      </button>
      <p className="text-xs text-muted">
        Weekly load this semester: <b className="text-ink">{list.reduce((a, { s }) => a + s.components.reduce((x, c) => x + c.hours, 0), 0)} h</b> ·{" "}
        {list.filter(({ s }) => s.components.some((c) => c.kind === "PR")).length} subjects with practicals
      </p>
    </div>
  );
}

export function DayPatternEditor({ doc, update }: { doc: BlueprintDoc; update: Update }) {
  const setPeriod = (i: number, patch: Partial<BlueprintDoc["periods"][number]>) => update((d) => ({ ...d, periods: d.periods.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-sunken text-left text-xs text-heading">
            <tr>
              <th className="px-3 py-2">Label</th>
              <th className="px-3 py-2">Start</th>
              <th className="px-3 py-2">End</th>
              <th className="px-3 py-2">Kind</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {doc.periods.map((p, i) => (
              <tr key={i} className="border-t border-line-soft">
                <td className="px-2 py-1.5">
                  <Input value={p.label} onChange={(e) => setPeriod(i, { label: e.target.value })} className="h-8 w-32" />
                </td>
                <td className="px-2 py-1.5">
                  <Input type="time" value={p.start} onChange={(e) => setPeriod(i, { start: e.target.value })} className="h-8 w-28" />
                </td>
                <td className="px-2 py-1.5">
                  <Input type="time" value={p.end} onChange={(e) => setPeriod(i, { end: e.target.value })} className="h-8 w-28" />
                </td>
                <td className="px-2 py-1.5">
                  <Select value={p.kind} onChange={(e) => setPeriod(i, { kind: e.target.value as typeof p.kind })} className="h-8 w-32">
                    <option value="lecture">Lecture</option>
                    <option value="practical">Practical</option>
                    <option value="break">Break</option>
                  </Select>
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button type="button" onClick={() => update((d) => ({ ...d, periods: d.periods.filter((_, j) => j !== i) }))} className="rounded-md p-1.5 text-muted hover:bg-bad-soft hover:text-bad" aria-label="Remove period">
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className={buttonClass("secondary", "sm")} onClick={() => update((d) => ({ ...d, periods: [...d.periods, { label: "New", start: "16:00", end: "17:00", kind: "lecture" }] }))}>
        <Plus className="size-4" /> Add period
      </button>
      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold">Working Saturdays</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={doc.workingSaturdays.includes(n)}
                onChange={(e) =>
                  update((d) => ({ ...d, workingSaturdays: e.target.checked ? [...d.workingSaturdays, n].sort() : d.workingSaturdays.filter((x) => x !== n) }))
                }
                className="size-4 accent-[var(--navy)]"
              />
              {["", "1st", "2nd", "3rd", "4th", "5th"][n]}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function ValidationPanel({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  if (!errors.length && !warnings.length) return <p className="text-sm font-medium text-ok">No problems found.</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {errors.map((e) => (
        <li key={e} className="flex items-start gap-2 text-bad">
          <Badge tone="bad">Error</Badge> {e}
        </li>
      ))}
      {warnings.map((w) => (
        <li key={w} className="flex items-start gap-2 text-warn-ink">
          <Badge tone="warn">Warning</Badge> {w}
        </li>
      ))}
    </ul>
  );
}
