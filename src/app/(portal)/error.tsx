"use client";

import { TriangleAlert } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui/primitives";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card>
      <EmptyState icon={<TriangleAlert className="size-6" />} title="Something went wrong loading this page">
        {error.digest ? `Reference ${error.digest}. ` : ""}Try again; if it keeps happening, share the reference with the admin.
        <div className="mt-5">
          <Button onClick={reset}>Try again</Button>
        </div>
      </EmptyState>
    </Card>
  );
}
