import { SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center p-6">
      <div className="text-center">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-navy-50 text-navy">
          <SearchX className="size-7" />
        </div>
        <h1 className="text-xl font-bold text-navy">Not found</h1>
        <p className="mt-1 text-sm text-muted">That record doesn&apos;t exist or was archived.</p>
        <ButtonLink href="/dashboard" className="mt-5">
          Back to dashboard
        </ButtonLink>
      </div>
    </div>
  );
}
