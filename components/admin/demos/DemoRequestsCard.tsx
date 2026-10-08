import Link from "next/link";
import { MonitorPlay } from "lucide-react";
import { adminCan, requireAdmin } from "@/lib/admin";
import { ApiError } from "@/lib/admin-api";
import { listDemos, type DemoList as DemoListResult } from "@/lib/admin-api/demos";
import { demoActorFor } from "@/lib/demos-admin";
import { Panel } from "@/components/admin/ui";
import { btnSecondary } from "@/components/portal/ui";
import { DemoList } from "@/components/admin/demos/DemoList";
import { cn } from "@/lib/cn";

const SHOWN = 20;

/**
 * A client's or a lead's demo requests, with "Request a demo" (a server
 * component: drop it into the client page or the lead page). Pass exactly one
 * of `clientId` / `leadId`. It reads the signed-in admin itself, like the
 * app's Demo card: the list needs `demos.view`, "Request a demo" needs
 * `demos.request` and shows even when the list could not load (so staff on a
 * phone can always ask for one), and nothing renders without either. Before
 * the demo requests migration it says so instead of failing the page.
 *
 *   <DemoRequestsCard clientId={client.id} businessName={client.business_name} />
 *   <DemoRequestsCard leadId={lead.id} />
 */
export async function DemoRequestsCard({
  clientId,
  leadId,
  businessName,
  area,
  id = "demos",
}: {
  clientId?: string;
  leadId?: string;
  /** Prefill for the form (it falls back to the client's or lead's own name). */
  businessName?: string | null;
  area?: string | null;
  /** The anchor of the card (the client page's section nav links to #demos). */
  id?: string;
}) {
  const ctx = await requireAdmin();
  const canView = adminCan(ctx, "demos.view");
  const canRequest = adminCan(ctx, "demos.request");
  if ((!canView && !canRequest) || Boolean(clientId) === Boolean(leadId)) return null;

  let result: DemoListResult | null = null;
  let problem: string | null = null;
  if (canView) {
    try {
      result = await listDemos(demoActorFor(ctx), { status: "all", mine: false, clientId, leadId, limit: SHOWN });
    } catch (err) {
      problem = err instanceof ApiError ? err.message : "Could not load the demo requests just now. Reload to try again.";
      if (!(err instanceof ApiError)) console.error("[demos] card failed", err instanceof Error ? err.message : String(err));
    }
  }

  const prefill = new URLSearchParams(clientId ? { clientId } : { leadId: leadId as string });
  if (businessName?.trim()) prefill.set("businessName", businessName.trim());
  if (area?.trim()) prefill.set("area", area.trim());
  const filter = new URLSearchParams(clientId ? { clientId, status: "all" } : { leadId: leadId as string, status: "all" });

  const request = canRequest && (
    <Link href={`/admin/demos/new?${prefill.toString()}`} className={cn(btnSecondary, "px-4")}>
      <MonitorPlay className="h-4 w-4" aria-hidden />
      Request a demo
    </Link>
  );

  return (
    <div id={id} className="scroll-mt-28">
      <Panel title={result && result.counts.open > 0 ? `Demos (${result.counts.open} open)` : "Demos"} action={request || undefined}>
        {!canView ? null : problem ? (
          <p className="text-sm text-ink-4">{problem}</p>
        ) : (
          <>
            <DemoList
              demos={result?.items ?? []}
              showTarget={false}
              empty={clientId ? "No demo requests for this client yet." : "No demo requests for this lead yet."}
            />
            {result?.nextCursor && (
              <Link href={`/admin/demos?${filter.toString()}`} className="mt-2 inline-flex min-h-11 items-center text-sm text-gold hover:underline">
                See all
              </Link>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
