"use client";

import { useMemo, useState } from "react";
import { Field, Select } from "@/components/ui/forms";
import { ExportMenu } from "./export-menu";

interface Division {
  id: string;
  label: string;
  department_id: string;
  program_year: string;
  batches: { id: string; code: string }[];
}
interface Offering {
  id: string;
  department_id: string;
  program_year: string;
  label: string;
  hasPractical: boolean;
}

export function MusterForm({ divisions, offerings, months }: { divisions: Division[]; offerings: Offering[]; months: { value: string; label: string }[] }) {
  const [division, setDivision] = useState(divisions[0]?.id ?? "");
  const div = divisions.find((d) => d.id === division);
  const subjects = useMemo(() => offerings.filter((o) => o.department_id === div?.department_id && o.program_year === div?.program_year), [offerings, div]);
  const [offering, setOffering] = useState(subjects[0]?.id ?? "");
  const [batch, setBatch] = useState("");
  const [month, setMonth] = useState(months.at(-1)?.value ?? "");
  const effectiveOffering = subjects.some((s) => s.id === offering) ? offering : (subjects[0]?.id ?? "");

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <Field name="division" label="Division">
        <Select value={division} onChange={(e) => (setDivision(e.target.value), setBatch(""))}>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field name="offering" label="Subject">
        <Select value={effectiveOffering} onChange={(e) => setOffering(e.target.value)}>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field name="batch" label="Batch" hint="Practicals are marked per batch">
        <Select value={batch} onChange={(e) => setBatch(e.target.value)}>
          <option value="">Whole division (theory)</option>
          {(div?.batches ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              Batch {b.code} (practical)
            </option>
          ))}
        </Select>
      </Field>
      <Field name="month" label="Month">
        <Select value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="pb-0.5">
        <ExportMenu reportKey="muster" formats={["pdf", "xlsx"]} filters={{ division, offering: effectiveOffering, month, ...(batch ? { batch } : {}) }} />
      </div>
    </div>
  );
}
