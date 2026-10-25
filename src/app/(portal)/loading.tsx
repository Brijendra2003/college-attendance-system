import { PageSkeleton } from "@/components/ui/primitives";

// Instant fallback while a portal page's server work streams in.
export default function Loading() {
  return <PageSkeleton />;
}
