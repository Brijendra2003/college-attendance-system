"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import type { NavSection } from "@/lib/nav.config";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

function isActive(pathname: string, href: string) {
  if (href === "/timetable" || href === "/attendance") return pathname === href || (pathname.startsWith(`${href}/`) && !/\/(sessions|registers|corrections|shortage)/.test(pathname));
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ sections, badges }: { sections: NavSection[]; badges: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5 px-3 pb-6">
      {sections.map((section) => (
        <div key={section.label}>
          <div className="mb-1.5 px-3 text-[10px] font-semibold tracking-[0.12em] text-blue-200/60 uppercase">{section.label}</div>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                      active ? "bg-white text-navy shadow-sm" : "text-blue-50/85 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <NavIcon name={item.icon} className={cn("size-4 shrink-0", active ? "text-primary" : "text-blue-200/80")} />
                    <span className="truncate">{item.label}</span>
                    {badges[item.href] ? (
                      <span
                        className={cn(
                          "ml-auto rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums",
                          active ? "bg-navy text-white" : "bg-amber-400 text-navy",
                        )}
                      >
                        {badges[item.href]}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function MobileNavToggle({ children }: { children: React.ReactNode }) {
  // Remember which page the drawer was opened on; navigating closes it.
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null);
  return (
    <>
      <button
        type="button"
        className="grid size-9 place-items-center rounded-lg border border-line bg-white text-navy lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="size-4" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col overflow-y-auto bg-navy">
            <button
              type="button"
              className="absolute top-4 right-3 rounded-md p-1 text-white/80 hover:bg-white/10"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
