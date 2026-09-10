import { requireClient } from "@/lib/portal-auth";
import { getActiveOnboarding, isTaskOpen, listAgreements, listApprovals, listTasks } from "@/lib/onboarding-data";
import { listInAppNotifications } from "@/lib/clients-data";
import { PortalShell } from "@/components/portal/PortalShell";
import { portalSignOutAction } from "../(auth)/actions";
import { switchClientAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireClient();
  const { client, member, memberships } = session;

  const onboarding = await getActiveOnboarding(client.id);
  const [tasks, approvals, agreements, notifications] = await Promise.all([
    onboarding ? listTasks(onboarding.id) : Promise.resolve([]),
    listApprovals(client.id),
    listAgreements(client.id),
    listInAppNotifications(client.id, member.id, 30),
  ]);

  const counts = {
    onboarding: tasks.filter((t) => t.owner === "client" && isTaskOpen(t)).length,
    approvals: approvals.filter((a) => a.status === "pending").length,
    agreements: agreements.filter((a) => a.status === "sent" || a.status === "viewed").length,
    notifications: notifications.filter((n) => !n.read_at).length,
  };

  return (
    <PortalShell
      clientName={client.business_name}
      clients={memberships.map((m) => ({ id: m.client_id, name: m.client.business_name }))}
      activeClientId={client.id}
      memberName={member.name}
      email={session.email}
      counts={counts}
      signOutAction={portalSignOutAction}
      switchClientAction={switchClientAction}
    >
      {children}
    </PortalShell>
  );
}
