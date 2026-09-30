import { PageLoader } from "@/components/BlackHole";

/**
 * The loading screen for every public page that has to wait on the server
 * (the database, a slow connection). It fades in only after the owner's delay
 * (Admin, Loader), so a page that arrives quickly never flashes it.
 */
export default function Loading() {
  return <PageLoader className="min-h-[100svh]" />;
}
