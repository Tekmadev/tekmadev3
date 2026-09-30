import { PageLoader } from "@/components/BlackHole";

/** Shown inside the portal shell while a page renders on the server. */
export default function PortalLoading() {
  return <PageLoader className="min-h-[60vh]" />;
}
