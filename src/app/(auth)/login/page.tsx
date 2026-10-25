import type { Metadata } from "next";
import { Suspense } from "react";
import { Building, GraduationCap, Layers, UsersRound } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

// Shown only when NEXT_PUBLIC_SHOW_DEMO_LOGINS=1 (local / staging demo data).
const DEMO_ACCOUNTS = [
  { email: "principal@sjcem.edu.in", role: "Principal", note: "MFA required" },
  { email: "admin@sjcem.edu.in", role: "Admin", note: "MFA required" },
  { email: "operations@sjcem.edu.in", role: "Operations", note: "" },
  { email: "examcell@sjcem.edu.in", role: "Exam Cell", note: "" },
];

export default function LoginPage(props: PageProps<"/login">) {
  const demo = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGINS === "1" ? DEMO_ACCOUNTS : [];
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#163a70] to-[#0f2c58] p-12 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-white text-[#163a70]">
            <GraduationCap className="size-6" />
          </span>
          <div>
            <div className="font-bold">St. John College of Engineering and Management</div>
            <div className="text-xs text-blue-100/80">Affiliated to the University of Mumbai</div>
          </div>
        </div>
        <div className="mt-auto max-w-lg">
          <h1 className="text-4xl leading-tight font-bold">Attendance, from Principal to every practical batch.</h1>
          <p className="mt-4 text-blue-100/85">
            One place for the academic hierarchy, timetables, registers, corrections, shortage lists and reports. Professors, students and parents use the
            mobile app.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-sm">
            {[
              { icon: Building, label: "12 branches" },
              { icon: Layers, label: "FE → BE, Sem 1–8" },
              { icon: UsersRound, label: "Divisions & batches" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="rounded-xl bg-white/10 p-3 ring-1 ring-white/15">
                <Icon className="mb-2 size-5 text-blue-200" />
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute right-24 -bottom-32 size-72 rounded-full bg-white/5" />
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-bold text-heading">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Web access for Principal, Admin, Operations, Exam Cell and HODs. Accounts are created by the college.</p>
          <Suspense>
            <LoginForm demo={demo} searchParams={props.searchParams} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
