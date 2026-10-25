"use client";

import { createContext, use, type ReactNode } from "react";
import { Ban, UserRoundPlus } from "lucide-react";
import { ActionForm, Dialog, Field, Select, SubmitButton, Textarea } from "@/components/ui/forms";
import { assignSubstitute, cancelSession } from "./actions";

type Options = Record<string, { value: string; label: string }[]>;

// Department staff lists are sent once for the whole board, not once per row.
const StaffOptions = createContext<Options>({});

export function StaffOptionsProvider({ options, children }: { options: Options; children: ReactNode }) {
  return <StaffOptions value={options}>{children}</StaffOptions>;
}

export function SessionRowActions({ sessionId, departmentId, staffId, title }: { sessionId: string; departmentId: string; staffId: string; title: string }) {
  const staff = (use(StaffOptions)[departmentId] ?? []).filter((s) => s.value !== staffId);
  return (
    <div className="flex justify-end gap-1.5">
      <Dialog trigger={<><UserRoundPlus className="size-3.5" /> Substitute</>} triggerVariant="secondary" triggerSize="sm" title="Assign substitute" description={title}>
        <ActionForm action={assignSubstitute} className="space-y-4">
          <input type="hidden" name="sessionId" value={sessionId} />
          <Field name="staffId" label="Substitute professor" hint="They can mark attendance; the original professor keeps read access.">
            <Select name="staffId">
              {staff.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end">
            <SubmitButton>Assign</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
      <Dialog trigger={<><Ban className="size-3.5" /> Cancel</>} triggerVariant="secondary" triggerSize="sm" title="Cancel session" description={title}>
        <ActionForm action={cancelSession} className="space-y-4">
          <input type="hidden" name="sessionId" value={sessionId} />
          <Field name="reason" label="Reason" hint="Shown to students and the professor">
            <Textarea name="reason" placeholder="e.g. Professor on university paper-setting duty" />
          </Field>
          <div className="flex justify-end">
            <SubmitButton variant="danger">Cancel session</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </div>
  );
}
