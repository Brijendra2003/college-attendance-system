"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronLeft, ChevronRight, CircleAlert, Rocket } from "lucide-react";
import { validateBlueprint, type BlueprintDoc } from "@/shared/blueprint";
import { Input, Select } from "@/components/ui/forms";
import { Badge, buttonClass, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { BranchesEditor, DayPatternEditor, DivisionsEditor, SubjectsEditor, ValidationPanel } from "@/features/blueprint/editor-parts";
import { cn } from "@/lib/utils";
import { completeSetup, saveSetupDraft } from "./actions";
import type { SetupState } from "./schema";

const STEPS = ["College profile", "Template", "Branches", "Year & terms", "Divisions & batches", "Subjects", "Attendance rules", "Review & activate"];

function L({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function SetupWizard({ initial }: { initial: SetupState }) {
  const [state, setState] = useState<SetupState>(initial);
  const [saving, startSave] = useTransition();
  const [activating, startActivate] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const first = useRef(true);

  // Autosave to the draft blueprint (resumable) a moment after edits stop.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      startSave(async () => {
        const r = await saveSetupDraft(state);
        setSaved(r.ok ? new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : null);
        if (!r.ok) setError(r.error);
      });
    }, 1200);
    return () => clearTimeout(t);
  }, [state]);

  const validation = useMemo(() => validateBlueprint(state.blueprint), [state.blueprint]);
  const set = <K extends keyof SetupState>(key: K, value: SetupState[K]) => setState((s) => ({ ...s, [key]: value }));
  const updateDoc = (fn: (d: BlueprintDoc) => BlueprintDoc) => setState((s) => ({ ...s, blueprint: fn(s.blueprint) }));
  const go = (step: number) => setState((s) => ({ ...s, step: Math.max(0, Math.min(STEPS.length - 1, step)) }));
  const c = state.college;
  const y = state.year;
  const p = state.policy;
  const counts = {
    branches: state.blueprint.departments.filter((d) => d.active).length,
    divisions: state.blueprint.departments.filter((d) => d.active).reduce((a, d) => a + Object.values(d.divisions).reduce((x, t) => x + (t?.count ?? 0), 0), 0),
    batches: state.blueprint.departments.filter((d) => d.active).reduce((a, d) => a + Object.values(d.divisions).reduce((x, t) => x + (t?.count ?? 0) * (t?.batches ?? 0), 0), 0),
    subjects: state.blueprint.subjects.length,
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <nav aria-label="Setup steps" className="space-y-1">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => go(i)}
            className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", i === state.step ? "bg-navy text-white" : "text-muted hover:bg-navy-50 hover:text-ink")}
          >
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold", i < state.step ? "bg-ok text-white" : i === state.step ? "bg-white text-[#163a70]" : "bg-line-soft")}>
              {i < state.step ? <Check className="size-3.5" /> : i + 1}
            </span>
            {label}
          </button>
        ))}
        <div className="px-3 pt-3 text-[11px] text-muted">{saving ? <Spinner label="Saving draft" /> : saved ? `Draft saved at ${saved}` : "Progress is saved as you go."}</div>
      </nav>

      <Card>
        <CardHeader number={state.step + 1} title={STEPS[state.step]} description={`Step ${state.step + 1} of ${STEPS.length}`} />
        <CardBody className="space-y-5">
          {state.step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <L label="College name">
                  <Input value={c.name} onChange={(e) => set("college", { ...c, name: e.target.value })} />
                </L>
              </div>
              <L label="Short name">
                <Input value={c.shortName} onChange={(e) => set("college", { ...c, shortName: e.target.value })} />
              </L>
              <L label="Principal">
                <Input value={c.principalName} onChange={(e) => set("college", { ...c, principalName: e.target.value })} placeholder="Dr. …" />
              </L>
              <div className="sm:col-span-2">
                <L label="Address">
                  <Input value={c.address} onChange={(e) => set("college", { ...c, address: e.target.value })} />
                </L>
              </div>
              <L label="Office email">
                <Input type="email" value={c.email} onChange={(e) => set("college", { ...c, email: e.target.value })} placeholder="office@college.edu.in" />
              </L>
              <L label="Phone">
                <Input value={c.phone ?? ""} onChange={(e) => set("college", { ...c, phone: e.target.value })} />
              </L>
            </div>
          )}

          {state.step === 1 && (
            <div className="space-y-3">
              <div className="rounded-xl border-2 border-navy bg-navy-50 p-4">
                <div className="flex items-center gap-2 font-semibold text-heading">
                  Mumbai University – Engineering <Badge tone="ok">selected</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">
                  12 branches, FE–BE, Sem 1–8, divisions and batches per branch, the Rev-2019 C-Scheme subject catalogue (theory + practical components), the
                  standard period template and 1st/3rd Saturdays working. Everything is editable in the next steps and later in the blueprint editor.
                </p>
              </div>
              <p className="text-xs text-muted">Engineering programmes only; management programmes are out of scope.</p>
            </div>
          )}

          {state.step === 2 && <BranchesEditor doc={state.blueprint} update={updateDoc} />}

          {state.step === 3 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <L label="Academic year" hint="Format 2026-27">
                <Input value={y.label} onChange={(e) => set("year", { ...y, label: e.target.value })} />
              </L>
              <div />
              <L label="Year starts">
                <Input type="date" value={y.start} onChange={(e) => set("year", { ...y, start: e.target.value })} />
              </L>
              <L label="Year ends">
                <Input type="date" value={y.end} onChange={(e) => set("year", { ...y, end: e.target.value })} />
              </L>
              <L label="Odd term (Sem 1, 3, 5, 7) starts">
                <Input type="date" value={y.oddStart} onChange={(e) => set("year", { ...y, oddStart: e.target.value })} />
              </L>
              <L label="Odd term ends">
                <Input type="date" value={y.oddEnd} onChange={(e) => set("year", { ...y, oddEnd: e.target.value })} />
              </L>
              <L label="Even term (Sem 2, 4, 6, 8) starts">
                <Input type="date" value={y.evenStart} onChange={(e) => set("year", { ...y, evenStart: e.target.value })} />
              </L>
              <L label="Even term ends">
                <Input type="date" value={y.evenEnd} onChange={(e) => set("year", { ...y, evenEnd: e.target.value })} />
              </L>
            </div>
          )}

          {state.step === 4 && (
            <>
              <p className="text-sm text-muted">Divisions per branch and year, practical batches per division, and seats per division.</p>
              <DivisionsEditor doc={state.blueprint} update={updateDoc} />
            </>
          )}

          {state.step === 5 && <SubjectsEditor doc={state.blueprint} update={updateDoc} />}

          {state.step === 6 && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <L label="Minimum attendance %" hint="Eligibility threshold; MU colleges commonly use 75%">
                  <Input type="number" value={p.minPercent} onChange={(e) => set("policy", { ...p, minPercent: Number(e.target.value) })} />
                </L>
                <L label="Warning %" hint="Between minimum and warning is “at risk”">
                  <Input type="number" value={p.warnPercent} onChange={(e) => set("policy", { ...p, warnPercent: Number(e.target.value) })} />
                </L>
                <L label="Professor edit window (hours)">
                  <Input type="number" value={p.editWindowHours} onChange={(e) => set("policy", { ...p, editWindowHours: Number(e.target.value) })} />
                </L>
                <L label="Lock registers after (hours)">
                  <Input type="number" value={p.lockAfterHours} onChange={(e) => set("policy", { ...p, lockAfterHours: Number(e.target.value) })} />
                </L>
                <L label="Counting mode">
                  <Select value={p.countMode} onChange={(e) => set("policy", { ...p, countMode: e.target.value as "session" | "hours" })}>
                    <option value="session">Per session (2-hour practical = 1)</option>
                    <option value="hours">Per hour (2-hour practical = 2)</option>
                  </Select>
                </L>
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold text-heading">Daily periods</div>
                <DayPatternEditor doc={state.blueprint} update={updateDoc} />
              </div>
            </div>
          )}

          {state.step === 7 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Object.entries(counts).map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-navy-50 p-3 text-center">
                    <div className="text-2xl font-bold text-heading tabular-nums">{v}</div>
                    <div className="text-xs text-muted capitalize">{k}</div>
                  </div>
                ))}
              </div>
              <div className="text-sm text-muted">
                <b className="text-ink">{c.name}</b> · Academic year {y.label}: odd term {y.oddStart} → {y.oddEnd}, even term {y.evenStart} → {y.evenEnd} · Minimum {p.minPercent}%
              </div>
              <ValidationPanel errors={validation.errors} warnings={validation.warnings} />
              <p className="text-xs text-muted">
                Activating creates the academic year and terms, branches, divisions, batches, subjects, offerings and teaching groups in one transaction. Next:
                import staff and students, assign professors, then build and publish timetables.
              </p>
              {error && (
                <div role="alert" className="flex items-center gap-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad-ink">
                  <CircleAlert className="size-4 shrink-0" /> {error}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-line-soft pt-4">
            <button type="button" className={buttonClass("secondary")} disabled={state.step === 0} onClick={() => go(state.step - 1)}>
              <ChevronLeft className="size-4" /> Back
            </button>
            {state.step < STEPS.length - 1 ? (
              <button type="button" className={buttonClass("primary")} onClick={() => go(state.step + 1)}>
                Next <ChevronRight className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                className={buttonClass("success")}
                disabled={activating || validation.errors.length > 0}
                onClick={() =>
                  startActivate(async () => {
                    setError(null);
                    const r = await completeSetup(state);
                    if (r && !r.ok) setError(r.error);
                  })
                }
              >
                {activating ? <Spinner label="Activating" /> : (<><Rocket className="size-4" /> Activate & finish</>)}
              </button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
