import Link from "next/link";
import { Users, UserPlus, MailOpen, MousePointerClick, LayoutTemplate } from "lucide-react";
import { requireOwner } from "@/lib/admin";
import { getSubscribers, getSubscriberStats } from "@/lib/subscribers-data";
import { unsubscribeCopy } from "@/config/site";
import { getCampaigns, getRecentEmailEvents, getEmailStats } from "@/lib/email-data";
import {
  PageHeader,
  StatCard,
  Panel,
  Notice,
  DataTable,
  Badge,
  fmtDateTime,
  txt,
} from "@/components/admin/ui";
import { CampaignForm } from "@/components/admin/CampaignForm";
import {
  toggleCampaignAction,
  deleteCampaignAction,
  unsubscribeSubscriberAction,
  deleteSubscriberAction,
} from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  config: "Supabase is not configured.",
  key: "Enter a campaign key using letters, numbers and dashes.",
  name: "Enter a campaign name.",
  dupe: "A campaign with that key already exists. Pick another.",
  db: "Database write failed. Please try again.",
  input: "Something was missing. Please try again.",
};

const OKS: Record<string, string> = {
  created: "Campaign added.",
  enabled: "Campaign enabled.",
  disabled: "Campaign disabled.",
  campaign_deleted: "Campaign deleted.",
  unsubscribed: "Subscriber unsubscribed.",
  subscriber_deleted: "Subscriber deleted.",
};

export default async function EmailAdmin({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  await requireOwner();

  const [subStats, emailStats, campaigns, subscribers, events] = await Promise.all([
    getSubscriberStats(),
    getEmailStats(),
    getCampaigns(),
    getSubscribers(100),
    getRecentEmailEvents(25),
  ]);

  const { ok, e } = await searchParams;
  const notice =
    ok && OKS[ok]
      ? { kind: "ok" as const, text: OKS[ok] }
      : e
        ? { kind: "err" as const, text: ERRORS[e] || "Something went wrong." }
        : null;

  const campaignRows = campaigns.map((c) => [
    <span key="n" className="font-medium text-ink">
      {c.name}
    </span>,
    <span key="k" className="font-mono text-xs text-ink-3">
      {c.key}
    </span>,
    <span key="s" className="block max-w-[14rem] truncate" title={c.subject ?? undefined}>
      {txt(c.subject)}
    </span>,
    <span key="o" className="tabular-nums text-ink">
      {c.open_count.toLocaleString("en-US")}
    </span>,
    <span key="cl" className="tabular-nums text-ink">
      {c.click_count.toLocaleString("en-US")}
    </span>,
    c.active ? (
      <Badge key="st" tone="gold">
        active
      </Badge>
    ) : (
      <Badge key="st" tone="muted">
        paused
      </Badge>
    ),
    <div key="act" className="flex items-center gap-2">
      <form action={toggleCampaignAction}>
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="active" value={(!c.active).toString()} />
        <button
          type="submit"
          className="rounded-full border border-line-strong px-3 py-1 text-xs text-ink-2 transition-colors hover:border-gold/50 hover:text-gold"
        >
          {c.active ? "Pause" : "Resume"}
        </button>
      </form>
      <form action={deleteCampaignAction}>
        <input type="hidden" name="id" value={c.id} />
        <button
          type="submit"
          className="rounded-full border border-line-strong px-3 py-1 text-xs text-ink-2 transition-colors hover:border-signal/50 hover:text-signal"
        >
          Delete
        </button>
      </form>
    </div>,
  ]);

  const subscriberRows = subscribers.map((s) => [
    fmtDateTime(s.created_at),
    <span key="em" className="font-medium text-ink">
      {s.email}
    </span>,
    txt(s.source),
    s.status === "active" ? (
      <Badge key="st" tone="gold">
        active
      </Badge>
    ) : (
      <div key="st">
        <Badge tone="muted">{s.status}</Badge>
        {/* Why and how they left, when we know. "I never signed up" is the one to act on. */}
        {(s.unsubscribe_reason || s.status_source) && (
          <p className="mt-1 text-xs text-ink-4">
            {[
              unsubscribeCopy.reasons.find((r) => r.key === s.unsubscribe_reason)?.label,
              s.status_source ? `via ${s.status_source.replace(/_/g, " ")}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
    ),
    txt(s.country),
    <div key="act" className="flex items-center gap-2">
      {s.status === "active" && (
        <form action={unsubscribeSubscriberAction}>
          <input type="hidden" name="id" value={s.id} />
          <button
            type="submit"
            className="rounded-full border border-line-strong px-3 py-1 text-xs text-ink-2 transition-colors hover:border-gold/50 hover:text-gold"
          >
            Unsubscribe
          </button>
        </form>
      )}
      <form action={deleteSubscriberAction}>
        <input type="hidden" name="id" value={s.id} />
        <button
          type="submit"
          className="rounded-full border border-line-strong px-3 py-1 text-xs text-ink-2 transition-colors hover:border-signal/50 hover:text-signal"
        >
          Delete
        </button>
      </form>
    </div>,
  ]);

  const eventRows = events.map((ev) => [
    fmtDateTime(ev.created_at),
    ev.type === "open" ? (
      <Badge key="t" tone="muted">
        open
      </Badge>
    ) : (
      <Badge key="t" tone="gold">
        click
      </Badge>
    ),
    <span key="c" className="font-mono text-xs text-ink-2">
      {txt(ev.campaign_key)}
    </span>,
    <span key="l" className="block max-w-[16rem] truncate" title={ev.url ?? undefined}>
      {txt(ev.link_label ?? ev.url)}
    </span>,
    txt(ev.device),
    txt(ev.country),
  ]);

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <PageHeader
        title="Email"
        subtitle="Newsletter subscribers and first-party open/click tracking for the emails GHL sends."
      >
        <Link
          href="/admin/email/templates"
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-bg transition-colors hover:bg-gold"
        >
          <LayoutTemplate className="h-4 w-4" /> Browse templates
        </Link>
      </PageHeader>

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active subscribers" value={subStats.active} icon={Users} />
        <StatCard label="New (30d)" value={subStats.last30} icon={UserPlus} />
        <StatCard label="Opens (30d)" value={emailStats.opens30} icon={MailOpen} />
        <StatCard label="Clicks (30d)" value={emailStats.clicks30} icon={MousePointerClick} />
      </div>

      <p className="text-sm text-ink-3">
        GHL sends the campaigns; the branded links and 1×1 pixel embedded in each template report opens and
        clicks back here, so the engagement data is first-party and owned by you. Register each campaign below
        with the same key you use in the template&apos;s tracking URLs. Preview and copy every template from{" "}
        <Link href="/admin/email/templates" className="font-medium text-gold underline-offset-2 hover:underline">
          Browse templates
        </Link>
        .
      </p>

      <Panel title="New campaign">
        <CampaignForm />
      </Panel>

      <Panel title="Campaigns">
        <DataTable
          head={["Campaign", "Key", "Subject", "Opens", "Clicks", "Status", ""]}
          rows={campaignRows}
          empty="No campaigns yet. Add one above, then use its key in the template's tracking links."
        />
      </Panel>

      <Panel title={`Subscribers (${subStats.total.toLocaleString("en-US")})`}>
        <DataTable
          head={["When", "Email", "Source", "Status", "Country", ""]}
          rows={subscriberRows}
          empty="No subscribers yet. They appear here the moment someone signs up in the footer."
        />
      </Panel>

      <Panel title="Recent engagement">
        <DataTable
          head={["When", "Type", "Campaign", "Link", "Device", "Country"]}
          rows={eventRows}
          empty="No opens or clicks yet. They appear here as soon as a sent email is opened or a link is clicked."
        />
      </Panel>
    </div>
  );
}
