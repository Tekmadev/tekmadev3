import { PageLoader } from "@/components/BlackHole";

/** Add lead has its own loader, so the Leads list skeleton never flashes on the way to the form. */
export default function Loading() {
  return <PageLoader className="min-h-[60dvh]" />;
}
