import { requireOwner } from "@/lib/admin";
import { Notice, PageHeader } from "@/components/admin/ui";
import { ConnectionPanel } from "@/components/admin/crm/ConnectionPanel";
import { AttentionPanel, QueuePanel, ReconcilePanel } from "@/components/admin/crm/QueuePanels";
import { InspectorPanel } from "@/components/admin/crm/InspectorPanel";

export const dynamic = "force-dynamic";

/**
 * CRM sync: the owner's view of the GoHighLevel integration.
 *
 * Everything the integration does is visible here: whether it is connected
 * and proven, what is waiting, what stopped and why, and what one address
 * looks like on both sides. The route and the labels say "CRM" rather than the
 * vendor; the body copy may name it because only the owner reads this page.
 */

const OK: Record<string, string> = {
  verified: "Connection verified. Every check passed, so the switches can be turned on.",
  outbound_on: "Outbound sync is on.",
  outbound_off: "Outbound sync is off. Anything already queued waits until it is back on.",
  inbound_on: "Inbound is on. Unsubscribes in GoHighLevel now apply here.",
  inbound_off: "Inbound is off. Deliveries are still stored, and they apply when it is back on.",
  reconcile_on: "Nightly reconcile is on.",
  reconcile_off: "Nightly reconcile is off.",
  synced: "Sync ran.",
  reconciled: "Reconcile ran.",
  retried: "Put back in the queue.",
  discarded: "Stopped for good. It stays on record.",
  resubscribed: "Resubscribed, stamped with the current privacy policy version.",
  already_active: "They were already subscribed. Nothing changed.",
  app_connected: "Webhook app installed. Once the Inbound switch is on, unsubscribes made in GoHighLevel reach the site.",
};

const ERR: Record<string, string> = {
  input: "That request was missing something. Try again from the page.",
  db: "The setting could not be saved. Try again.",
  not_configured: "GHL_PIT_TOKEN and GHL_LOCATION_ID are not both set in Vercel yet, so nothing can be switched on.",
  unverified: "Verify the connection first. Nothing can be switched on until every check passes.",
  probe: "The connection check failed. The checklist below says which part and why.",
  sync: "Sync could not run. Check the Needs attention list, or try again in a minute.",
  reconcile: "Reconcile could not run. Check the connection, then try again.",
  nothing: "Nothing changed. It may already have been retried or discarded.",
  resub_refused:
    "Refused. This address bounced or was marked as spam, and those are never revived, or no policy version was available to stamp.",
  resub_notfound: "No subscriber with that email.",
  resub_stale: "The subscriber changed while you were looking. Look it up again.",
  resub_db: "The change could not be saved. Try again.",
  resub_config: "The database is not configured.",
  app_denied: "The app install was cancelled in GoHighLevel. Nothing was changed.",
  app_nocode: "GoHighLevel came back without an install code. Start the install again from the app's install link.",
  app_not_configured: "GHL_APP_CLIENT_ID and GHL_APP_CLIENT_SECRET are not set in Vercel, so the install could not be finished. Add them, redeploy, then install again.",
  app_exchange: "GoHighLevel refused to finish the install. Check the app's Client ID, Client Secret and Redirect URL, then install again.",
  app_rate: "Too many install attempts in a short time. Wait ten minutes and try again.",
};

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string; n?: string; queued?: string; halted?: string; email?: string; where?: string }>;
}) {
  await requireOwner();
  const { ok, e, n, queued, halted, email, where } = await searchParams;

  let okText = ok ? OK[ok] : null;
  if (ok === "app_connected" && where === "other") {
    okText = "Webhook app installed, but on a different sub-account from the one in GHL_LOCATION_ID. That is right for a client account. For your own, install it again and pick your own sub-account.";
  }
  if (okText && queued) okText += ` ${queued} existing contact${queued === "1" ? "" : "s"} queued for their first push.`;
  if (ok === "synced" && n) okText = `Sync ran: ${n} item${n === "1" ? "" : "s"} handled.`;
  if (ok === "reconciled" && n) {
    okText = `Reconcile ran: ${n} unsubscribe${n === "1" ? "" : "s"} from GoHighLevel applied here.`;
    if (halted) okText += " It stopped early on purpose, see Last reconcile.";
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="CRM sync"
        subtitle="Leads, subscribers, unsubscribes and client appointments, kept in step with GoHighLevel. This site stays the record."
      />

      {okText && <Notice kind="ok">{okText}</Notice>}
      {e && <Notice kind="err">{ERR[e] ?? "Something went wrong."}</Notice>}

      <ConnectionPanel />
      <div className="grid gap-8 xl:grid-cols-2">
        <QueuePanel />
        <ReconcilePanel />
      </div>
      <AttentionPanel />
      <InspectorPanel email={email} />

      <p className="text-xs text-ink-4">
        Setup, step by step, is in <code>docs/crm-setup.md</code>. Do not send a campaign from GoHighLevel until the Inbound switch is on
        and tested: from the first send, people can unsubscribe inside GoHighLevel, and without Inbound this site would keep treating them
        as subscribed.
      </p>
    </div>
  );
}
