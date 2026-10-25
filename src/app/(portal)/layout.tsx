import { Suspense, type ReactNode } from "react";
import { Sidebar, SidebarSkeleton } from "@/components/shell/sidebar";
import { Topbar, TopbarSkeleton } from "@/components/shell/topbar";

// The shell prerenders statically; the session-dependent sidebar and top bar
// stream in behind their own boundaries (Cache Components).
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto bg-gradient-to-b from-navy to-navy-700 lg:block">
        <Suspense fallback={<SidebarSkeleton />}>
          <Sidebar />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
          <Suspense fallback={<TopbarSkeleton />}>
            <Topbar />
          </Suspense>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
