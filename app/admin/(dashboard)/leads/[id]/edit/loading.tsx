import { PageLoader } from "@/components/BlackHole";

/** Edit lead has its own loader, so the lead page's skeleton (and its contact dock) never flashes on the way to the form. */
export default function Loading() {
  return <PageLoader className="min-h-[60dvh]" />;
}
