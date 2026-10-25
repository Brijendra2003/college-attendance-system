"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  startTransition,
  use,
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { CircleAlert, CircleCheck, Search, X } from "lucide-react";
import type { ActionResult } from "@/lib/auth/action";
import { cn } from "@/lib/utils";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./primitives";
import { Spinner } from "./spinner";
import { signalNavigation } from "./navigation-progress";

type ServerAction = (prev: ActionResult<any> | null, fd: FormData) => Promise<ActionResult<any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

const FieldErrors = createContext<Record<string, string>>({});
const DialogClose = createContext<(() => void) | null>(null);
const FormPending = createContext(false);

// ── Inputs ───────────────────────────────────────────────────────────────
const control =
  "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-faint focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "h-auto min-h-24 py-2", className)} {...props} />;
}

export function Field({ name, label, hint, children, className }: { name: string; label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  const error = use(FieldErrors)[name];
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-semibold text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-bad">{error}</span> : hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  pendingLabel,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; pendingLabel?: string }) {
  const status = useFormStatus();
  const pending = status.pending || use(FormPending);
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass(variant, size, className)} {...props}>
      {pending ? <Spinner label={pendingLabel ?? "Saving"} /> : children}
    </button>
  );
}

// ── Action forms ─────────────────────────────────────────────────────────
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  compact = false,
}: {
  action: ServerAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const close = use(DialogClose);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      if (close) close();
    }
  }, [state, resetOnSuccess, close]);

  return (
    <FieldErrors value={state && !state.ok ? (state.fieldErrors ?? {}) : {}}>
      <FormPending value={pending}>
        <form
          ref={formRef}
          action={formAction}
          className={className}
          aria-busy={pending}
          onSubmit={(e) => {
            // Dispatch manually so React doesn't reset the fields after the
            // action (users keep their input when validation fails). The
            // action prop still covers submits before hydration.
            e.preventDefault();
            const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
            startTransition(() => formAction(fd));
          }}
        >
          {children}
          {state && !compact && <ResultBanner state={state} />}
          {state && compact && !state.ok && (
            <span role="alert" className="ml-2 text-xs text-bad">
              {state.error}
            </span>
          )}
        </form>
      </FormPending>
    </FieldErrors>
  );
}

function ResultBanner({ state }: { state: ActionResult }) {
  return (
    <div
      role="status"
      className={cn("mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm", state.ok ? "bg-ok-soft text-ok-ink" : "bg-bad-soft text-bad-ink")}
    >
      {state.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
      <span>{state.ok ? (state.message ?? "Saved.") : state.error}</span>
    </div>
  );
}

/** One-click row action (approve, verify, nudge…) posting hidden fields. */
export function RowAction({
  action,
  fields,
  label,
  variant = "secondary",
  confirm,
  icon,
}: {
  action: ServerAction;
  fields: Record<string, string>;
  label: string;
  variant?: ButtonVariant;
  confirm?: string;
  icon?: ReactNode;
}) {
  return (
    <ActionForm action={action} compact className="inline-flex items-center">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton
        size="sm"
        variant={variant}
        pendingLabel={label}
        onClick={(e) => {
          if (confirm && !window.confirm(confirm)) e.preventDefault();
        }}
      >
        {icon}
        {label}
      </SubmitButton>
    </ActionForm>
  );
}

// ── Dialog ───────────────────────────────────────────────────────────────
export function Dialog({
  trigger,
  title,
  description,
  children,
  triggerVariant = "primary",
  triggerSize = "md",
  wide = false,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    ref.current?.close();
    setOpen(false);
  };
  return (
    <>
      <button
        type="button"
        className={buttonClass(triggerVariant, triggerSize)}
        onClick={() => {
          ref.current?.showModal();
          setOpen(true);
        }}
      >
        {trigger}
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        className={cn(
          "m-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-black/40 backdrop:backdrop-blur-[2px]",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
          <div>
            <h2 className="font-semibold text-heading">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          <button type="button" onClick={close} className="rounded-md p-1 text-muted hover:bg-navy-50" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{open && <DialogClose value={close}>{children}</DialogClose>}</div>
      </dialog>
    </>
  );
}

// ── URL filters (shareable, survive the back button — §10.3) ─────────────
function useUrlParam(name: string) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (value: string) => {
    const next = new URLSearchParams(sp);
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    signalNavigation();
    start(() => router.push(`${pathname}?${next.toString()}`));
  };
  return { value: sp.get(name), set, pending };
}

export function FilterSelect({
  name,
  label,
  options,
  allLabel = "All",
  fallback = "",
  className,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel?: string | null;
  fallback?: string;
  className?: string;
}) {
  const { value, set, pending } = useUrlParam(name);
  return (
    <label className={cn("flex min-w-0 flex-col", className)}>
      <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-muted uppercase">
        {label}
        {pending && <Spinner className="text-primary" />}
      </span>
      <Select value={value ?? fallback} disabled={pending} onChange={(e) => set(e.target.value)}>
        {allLabel !== null && <option value="">{allLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

export function SearchBox({ placeholder = "Search…", name = "q" }: { placeholder?: string; name?: string }) {
  const { value: initial, set, pending } = useUrlParam(name);
  const [value, setValue] = useState(initial ?? "");
  return (
    <form
      className="flex min-w-0 flex-col"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        set(value.trim());
      }}
    >
      <span className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-muted uppercase">
        Search {pending && <Spinner className="text-primary" />}
      </span>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="min-w-56 pl-8" />
      </div>
    </form>
  );
}
