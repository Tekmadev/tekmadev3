import { PageLoader } from "@/components/BlackHole";

/** Shown inside the admin shell while a page renders on the server. */
export default function AdminLoading() {
  return <PageLoader className="min-h-[60vh]" />;
}
