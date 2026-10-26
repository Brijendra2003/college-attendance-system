"use client";

import { useState } from "react";
import { ActionForm, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/forms";
import { createStudent, transferStudent } from "./actions";

interface DivisionOption {
  value: string;
  label: string;
  batches: { value: string; label: string }[];
}

function DivisionBatchSelect({ divisions, defaultDivision, defaultBatch }: { divisions: DivisionOption[]; defaultDivision?: string; defaultBatch?: string }) {
  const [division, setDivision] = useState(defaultDivision ?? divisions[0]?.value ?? "");
  const batches = divisions.find((d) => d.value === division)?.batches ?? [];
  return (
    <>
      <Field name="divisionId" label="Division">
        <Select name="divisionId" value={division} onChange={(e) => setDivision(e.target.value)}>
          {divisions.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field name="batchId" label="Practical batch">
        <Select name="batchId" key={division} defaultValue={defaultBatch && batches.some((b) => b.value === defaultBatch) ? defaultBatch : batches[0]?.value}>
          {batches.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

export function StudentCreateForm({ divisions }: { divisions: DivisionOption[] }) {
  return (
    <ActionForm action={createStudent} resetOnSuccess className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field name="name" label="Full name" className="sm:col-span-2">
        <Input name="name" placeholder="As on the admission form" />
      </Field>
      <Field name="enrollmentNo" label="Enrollment no.">
        <Input name="enrollmentNo" placeholder="26COMP0201" className="uppercase" />
      </Field>
      <Field name="prn" label="MU PRN" hint="16 digits; leave blank until issued">
        <Input name="prn" inputMode="numeric" />
      </Field>
      <Field name="gender" label="Gender">
        <Select name="gender" defaultValue="F">
          <option value="F">Female</option>
          <option value="M">Male</option>
          <option value="O">Other</option>
        </Select>
      </Field>
      <Field name="dob" label="Date of birth">
        <Input name="dob" type="date" />
      </Field>
      <Field name="email" label="Email">
        <Input name="email" type="email" />
      </Field>
      <Field name="phone" label="Mobile">
        <Input name="phone" inputMode="tel" placeholder="98XXXXXXXX" />
      </Field>
      <DivisionBatchSelect divisions={divisions} />
      <Field name="admissionType" label="Admission type" className="sm:col-span-2">
        <Select name="admissionType" defaultValue="fe_regular">
          <option value="fe_regular">FE regular</option>
          <option value="direct_second_year">Direct second year (DSE)</option>
        </Select>
      </Field>
      <div className="border-t border-line-soft pt-3 text-xs font-semibold text-navy sm:col-span-2">Primary guardian</div>
      <Field name="guardianName" label="Guardian name">
        <Input name="guardianName" />
      </Field>
      <Field name="guardianRelation" label="Relation">
        <Select name="guardianRelation" defaultValue="Father">
          <option>Father</option>
          <option>Mother</option>
          <option>Guardian</option>
        </Select>
      </Field>
      <Field name="guardianPhone" label="Guardian mobile" hint="Contact number. After verifying the link, create the parent's app login under People → Guardians">
        <Input name="guardianPhone" inputMode="tel" />
      </Field>
      <div className="flex items-end justify-end sm:col-span-2">
        <SubmitButton>Add student</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function TransferForm({
  studentId,
  divisions,
  current,
  today,
}: {
  studentId: string;
  divisions: DivisionOption[];
  current: { divisionId: string; batchId: string };
  today: string;
}) {
  return (
    <ActionForm action={transferStudent} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <input type="hidden" name="studentId" value={studentId} />
      <DivisionBatchSelect divisions={divisions} defaultDivision={current.divisionId} defaultBatch={current.batchId} />
      <Field name="effectiveFrom" label="Effective from">
        <Input type="date" name="effectiveFrom" defaultValue={today} />
      </Field>
      <Field name="reason" label="Reason" className="sm:col-span-2">
        <Textarea name="reason" placeholder="e.g. Elective group balancing approved by HOD" />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton>Save transfer</SubmitButton>
      </div>
    </ActionForm>
  );
}
