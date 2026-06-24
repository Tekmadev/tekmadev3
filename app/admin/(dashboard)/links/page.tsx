import { requireOwner } from "@/lib/admin";
import { getLinks, getRecentLinkClicks } from "@/lib/links-data";
import { PageHeader, Panel, Notice, DataTable, Badge, fmtDateTime, txt } from "@/components/admin/ui";
import { LinkForm } from "@/components/admin/LinkForm";
import { DealLink } from "@/components/admin/DealLink";
import { business } from "@/config/site";
import { toggleLinkAction, deleteLinkAction } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  config: "Supabase is not configured.",
  slug: "Enter a slug using letters, numbers and dashes.",
  reserved: "That slug is reserved by an existing page. Pick another.",
  destination: "Enter a valid destination: a path like /start or a full https:// URL.",
  dupe: "A link with that slug already exists. Pick a different slug.",
  db: "Database write failed. Please try again.",
  input: "Something was missing. Please try again.",
};

export default async function LinksAdmin({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string; slug?: string }>;
}) {
  await requireOwner();
  const [links, clicks] = await Promise.all([getLinks(), getRecentLinkClicks(25)]);
  const { ok, e, slug } = await searchParams;

  const notice =
    ok === "created"
      ? { kind: "ok" as const, text: `Link created. Share ${business.url}/${slug ?? ""}` }
      : ok === "disabled"
        ? { kind: "ok" as const, text: "Link disabled. It now returns a 404." }
        : ok === "enabled"
          ? { kind: "ok" as const, text: "Link enabled." }
          : ok === "deleted"
            ? { kind: "ok" as const, text: "Link deleted." }
            : e
              ? { kind: "err" as const, text: ERRORS[e] || "Something went wrong." }
              : null;

  const rows = links.map((l) => [
    <span key="slug" className="font-mono text-xs font-medium text-ink">
      /{l.slug}
    </span>,
    <span key="dest" className="font-mono text-xs text-ink-3">
      {l.destination}
    </span>,
    txt(l.utm_source),
    txt(l.utm_medium),
    txt(l.utm_campaign),
    <span key="clicks" className="tabular-nums text-ink">
      {l.click_count.toLocaleString("en-US")}
    </span>,
    l.active ? (
      <Badge key="s" tone="gold">
        active
      </Badge>
    ) : (
      <Badge key="s" tone="muted">
        disabled
      </Badge>
    ),
    <DealLink key="copy" url={`${business.url}/${l.slug}`} />,
    <div key="act" className="flex items-center gap-2">
      <form action={toggleLinkAction}>
        <input type="hidden" name="id" value={l.id} />
        <input type="hidden" name="active" value={(!l.active).toString()} />
        <button
          type="submit"
          className="rounded-full border border-line-strong px-3 py-1 text-xs text-ink-2 transition-colors hover:border-gold/50 hover:text-gold"
        >
          {l.active ? "Disable" : "Enable"}
        </button>
      </form>
      <form action={deleteLinkAction}>
        <input type="hidden" name="id" value={l.id} />
        <button
          type="submit"
          className="rounded-full border border-line-strong px-3 py-1 text-xs text-ink-2 transition-colors hover:border-signal/50 hover:text-signal"
        >
          Delete
        </button>
      </form>
    </div>,
  ]);

  const clickRows = clicks.map((c) => [
    fmtDateTime(c.created_at),
    <span key="s" className="font-mono text-xs text-ink-2">
      /{txt(c.slug)}
    </span>,
    txt(c.device),
    txt(c.country),
    <span key="r" className="block max-w-[16rem] truncate" title={c.referrer ?? undefined}>
      {txt(c.referrer)}
    </span>,
  ]);

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <PageHeader
        title="Links"
        subtitle="Branded tracking links. Share /slug; every visit is attributed and logged."
      />

      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      <p className="text-sm text-ink-3">
        Create a short link like <strong className="text-ink-2">{business.domain}/qr</strong> for a business-card
        QR code, or <strong className="text-ink-2">{business.domain}/ig</strong> for Instagram. When someone
        visits, we log the click and forward them to the destination tagged with your UTMs, so any booking or sale
        that follows is traced back to the source.
      </p>

      <Panel title="New link">
        <LinkForm />
      </Panel>

      <Panel title="Your links">
        <DataTable
          head={["Link", "Destination", "Source", "Medium", "Campaign", "Clicks", "Status", "Share", ""]}
          rows={rows}
          empty="No links yet. Create one above."
        />
      </Panel>

      <Panel title="Recent clicks">
        <DataTable
          head={["When", "Link", "Device", "Country", "Referrer"]}
          rows={clickRows}
          empty="No clicks yet. They appear here as soon as a link is visited."
        />
      </Panel>
    </div>
  );
}
