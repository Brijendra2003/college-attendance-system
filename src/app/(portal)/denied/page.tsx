import { Suspense } from "react";
import { Lock } from "lucide-react";
import { ButtonLink, Card, EmptyState } from "@/components/ui/primitives";

async function Reason({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  return p ? (
    <>
      This page needs the <code className="rounded bg-navy-50 px-1.5 py-0.5 text-navy">{p}</code> permission. Ask an Admin if your role should
      have it.
    </>
  ) : (
    "Your role does not include this page."
  );
}

export default function DeniedPage(props: PageProps<"/denied">) {
  return (
    <Card>
      <EmptyState icon={<Lock className="size-6" />} title="You don't have access to this page">
        <Suspense>
          <Reason searchParams={props.searchParams as Promise<{ p?: string }>} />
        </Suspense>
        <div className="mt-5">
          <ButtonLink href="/dashboard">Go to dashboard</ButtonLink>
        </div>
      </EmptyState>
    </Card>
  );
}
