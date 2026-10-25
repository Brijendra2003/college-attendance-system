"use client";

import { useMemo, useState, useTransition } from "react";
import { CircleAlert, CircleCheck, Rocket, Save } from "lucide-react";
import { validateBlueprint, type BlueprintDoc } from "@/shared/blueprint";
import { Badge, buttonClass, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { BranchesEditor, DayPatternEditor, DivisionsEditor, SubjectsEditor, ValidationPanel } from "./editor-parts";
import { activateBlueprint, saveBlueprintDraft } from "./actions";

const TABS = ["Branches", "Divisions & batches", "Subjects", "Day pattern", "Review"] as const;

function diff(active: BlueprintDoc | null, draft: BlueprintDoc) {
  if (!active) return [] as string[];
  const out: string[] = [];
  const a = new Map(active.departments.map((d) => [d.code, d]));
  for (const d of draft.departments) {
    const prev = a.get(d.code);
    if (!prev) out.push(`+ Branch ${d.code} (${d.name})`);
    else {
      if (prev.active !== d.active) out.push(`${d.active ? "Reactivate" : "Deactivate"} ${d.code}`);
      if (prev.name !== d.name) out.push(`Rename ${d.code}: “${prev.name}” → “${d.name}”`);
      for (const py of ["FE", "SE", "TE", "BE"] as const) {
        const x = prev.divisions[py];
        const y = d.divisions[py];
        if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${d.code} ${py}: ${x?.count ?? 0} div × ${x?.batches ?? 0} batches → ${y?.count ?? 0} div × ${y?.batches ?? 0} batches`);
      }
    }
  }
  const sa = new Map(active.subjects.map((s) => [s.code, s]));
  const sd = new Map(draft.subjects.map((s) => [s.code, s]));
  for (const [code, s] of sd) {
    const prev = sa.get(code);
    if (!prev) out.push(`+ Subject ${code} ${s.name}`);
    else if (JSON.stringify(prev) !== JSON.stringify(s)) out.push(`~ Subject ${code} changed`);
  }
  for (const code of sa.keys()) if (!sd.has(code)) out.push(`− Subject ${code} (deactivated, never deleted)`);
  if (JSON.stringify(active.periods) !== JSON.stringify(draft.periods)) out.push("Period template changed");
  if (JSON.stringify(active.workingSaturdays) !== JSON.stringify(draft.workingSaturdays)) out.push("Working Saturdays changed");
  return out;
}

export function BlueprintEditor({ initial, active, draftId, canActivate }: { initial: BlueprintDoc; active: BlueprintDoc | null; draftId: string | null; canActivate: boolean }) {
  const [doc, setDoc] = useState(initial);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Branches");
  const [id, setId] = useState(draftId);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [activating, startActivate] = useTransition();
  const validation = useMemo(() => validateBlueprint(doc), [doc]);
  const changes = useMemo(() => diff(active, doc), [active, doc]);
  const update = (fn: (d: BlueprintDoc) => BlueprintDoc) => {
    setDoc(fn);
    setDirty(true);
  };

  const save = () =>
    startSave(async () => {
      const r = await saveBlueprintDraft(doc);
      if (r.ok) {
        setId(r.data.id);
        setDirty(false);
      }
      setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Saved") : r.error });
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
          {TABS.map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={cn("rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap", t === tab ? "bg-navy text-white" : "text-muted hover:bg-navy-50")}>
              {t}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {dirty ? <Badge tone="warn">unsaved changes</Badge> : id ? <Badge tone="info">draft saved</Badge> : null}
          <button type="button" className={buttonClass("secondary")} onClick={save} disabled={saving || !dirty}>
            {saving ? <Spinner label="Saving" /> : (<><Save className="size-4" /> Save draft</>)}
          </button>
          {canActivate && (
            <button
              type="button"
              className={buttonClass("success")}
              disabled={activating || dirty || !id || validation.errors.length > 0}
              title={dirty ? "Save the draft first" : undefined}
              onClick={() => {
                if (!id || !window.confirm("Activate this blueprint? Structure is upserted by code; nothing is deleted.")) return;
                startActivate(async () => {
                  const r = await activateBlueprint(id);
                  setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Activated") : r.error });
                  if (r.ok) setId(null);
                });
              }}
            >
              {activating ? <Spinner label="Activating" /> : (<><Rocket className="size-4" /> Activate</>)}
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div role="status" className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-ok-soft text-ok-ink" : "bg-bad-soft text-bad-ink")}>
          {msg.ok ? <CircleCheck className="size-4" /> : <CircleAlert className="size-4" />} {msg.text}
        </div>
      )}

      <Card>
        <CardHeader title={tab} description={tab === "Review" ? "Validation and the changes this draft makes to the active blueprint" : "Changes are saved to a draft until you activate"} />
        <CardBody>
          {tab === "Branches" && <BranchesEditor doc={doc} update={update} />}
          {tab === "Divisions & batches" && <DivisionsEditor doc={doc} update={update} />}
          {tab === "Subjects" && <SubjectsEditor doc={doc} update={update} />}
          {tab === "Day pattern" && <DayPatternEditor doc={doc} update={update} />}
          {tab === "Review" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-heading">Validation</h3>
                <ValidationPanel errors={validation.errors} warnings={validation.warnings} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-heading">Changes vs active ({changes.length})</h3>
                {changes.length === 0 ? (
                  <p className="text-sm text-muted">No changes.</p>
                ) : (
                  <ul className="max-h-96 space-y-1 overflow-y-auto font-mono text-xs">
                    {changes.map((c) => (
                      <li key={c} className={c.startsWith("+") ? "text-ok" : c.startsWith("−") ? "text-bad" : "text-ink"}>
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
