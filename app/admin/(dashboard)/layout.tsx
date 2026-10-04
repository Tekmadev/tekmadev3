import { adminCapabilities, adminInboxViewer, requireAdmin } from "@/lib/admin";
import { Sidebar } from "@/components/admin/Sidebar";
import { InternalDeviceMark } from "@/components/admin/InternalDevice";
import { EMPTY_SUMMARY, getNotificationSummary, listNotifications, seedViewer } from "@/lib/admin-notifications-data";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAdmin();
  const { email, name, role } = ctx;
  // The bell's starting point. It polls from here, so a slow inbox query never
  // blocks more than this first render. Staff read Leads and Clients only.
  const viewer = adminInboxViewer(ctx);
  // First visit ever: start this person at "now" rather than at everything
  // that happened before they had access. A no-op on every visit after that.
  await seedViewer(viewer);
  const [summaryOrNull, itemsOrNull] = await Promise.all([
    getNotificationSummary(viewer),
    listNotifications(viewer, { limit: 8 }),
  ]);
  // The inbox failing to load must never take the whole admin down with it.
  const summary = summaryOrNull ?? EMPTY_SUMMARY;
  const items = itemsOrNull ?? [];

  return (
    <div className="min-h-screen">
      <InternalDeviceMark />
      <Sidebar email={email} name={name} role={role} capabilities={adminCapabilities(ctx)} notifications={{ summary, items }} />
      <div className="lg:pl-64">
        <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}
