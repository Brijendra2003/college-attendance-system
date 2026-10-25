import type { Metadata } from "next";
import { Building, GraduationCap, Layers, UsersRound } from "lucide-react";
import { db } from "@/lib/data/store";
import { departmentTones } from "@/shared/tokens";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

async function demoAccounts() {
  "use cache";
  const store = db();
  return store.profiles.map((p) => {
    const hodDept = p.staffId ? store.departments.find((d) => d.id === store.staff.find((s) => s.id === p.staffId)?.departmentId) : undefined;
    return {
      email: p.email,
      name: p.name,
      role: hodDept ? `HOD · ${hodDept.code}` : { principal: "Principal", admin: "Admin", operations: "Operations", exam_cell: "Exam Cell" }[p.roles[0] as string] ?? p.roles[0],
      tone: hodDept ? departmentTones[hodDept.code].fg : "#163a70",
    };
  });
}

export default async function LoginPage() {
  const accounts = await demoAccounts();
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-navy to-navy-700 p-12 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-white text-navy">
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
            One place for the academic hierarchy, timetables, registers, corrections, shortage lists and reports. Professors, students and
            parents use the mobile app.
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
          <h2 className="text-2xl font-bold text-navy">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Web access for Principal, Admin, Operations, Exam Cell and HODs.</p>
          <LoginForm accounts={accounts} />
        </div>
      </div>
    </div>
  );
}
