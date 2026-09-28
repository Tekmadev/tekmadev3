import { inspectCrmContact, type CrmInspection, type TheirSide } from "@/lib/crm/admin-data";
import { Badge, DataTable, Panel, fmtDateTime, txt } from "@/components/admin/ui";
import { confirmResubscribeAction } from "@/app/admin/(dashboard)/crm/actions";

/**
 * One address, ours beside theirs, plus its consent history.
 *
 * This is the page's answer to "is it working": type a test address after
 * setup and the two columns should agree. Where they do not, the row says
 * which side is suppressed, because an unsubscribe anywhere has to stick
 * everywhere and this is where you see whether it did.
 */

/** Our statuses and their DND states, as one question: can this address be mailed. */
function mailable(ours: string | null, theirs: TheirSide): { ours: string; theirs: string; agree: boolean | null } {
  const o = ours == null ? "not a subscriber" : ours === "active" ? "mailable" : "suppressed";
  if (theirs.state !== "found") return { ours: o, theirs: "-", agree: null };
  const t = theirs.dnd === "inactive" ? "mailable" : theirs.dnd === "unknown" ? "unknown" : "suppressed";
  if (ours == null || t === "unknown") return { ours: o, theirs: t, agree: null };
  return { ours: o, theirs: t, agree: o === t };
}

const EVENT: Record<string, string> = {
  subscribed: "Subscribed",
  resubscribed: "Subscribed again",
  unsubscribed: "Unsubscribed",
  bounced: "Bounced",
  complained: "Marked as spam",
  feedback: "Said why they left",
};

const SOURCE: Record<string, string> = {
  signup: "a signup form",
  email_link: "the link in an email",
  unsubscribe_page: "the unsubscribe page",
  admin: "the admin",
  ghl: "GoHighLevel",
  ghl_permanent: "GoHighLevel, as permanent",
  reconcile: "the nightly reconcile",
  resend: "the transactional sender",
  unknown: "unknown",
};

function Row({ label, ours, theirs, warn }: { label: string; ours: React.ReactNode; theirs: React.ReactNode; warn?: boolean }) {
  return (
    <tr className="border-b border-line last:border-0">
      <th className="py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-ink-4">{label}</th>
      <td className="py-2 pr-4 text-ink-2">{ours}</td>
      <td className={"py-2 text-ink-2" + (warn ? " text-signal" : "")}>{theirs}</td>
    </tr>
  );
}

function theirLine(t: TheirSide): string {
  if (t.state === "not_checked") return t.why;
  if (t.state === "error") return `Could not read the CRM: ${t.message}`;
  if (t.state === "absent") return "No contact with this email in the CRM.";
  return "";
}

function Result({ r }: { r: CrmInspection }) {
  const s = r.subscriber;
  const t = r.theirs;
  const m = mailable(s?.status ?? null, t);
  const found = t.state === "found" ? t : null;
  // The CRM says contactable while we hold an unsubscribe: the one case that
  // needs a human, because a CRM event cannot prove the person asked for it.
  const offerResubscribe = s?.status === "unsubscribed" && found?.dnd === "inactive";

  return (
    <div className="mt-5 space-y-5">
      {!found && <p className="text-sm text-ink-3">{theirLine(t)}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-4">
            <th className="py-2 pr-4 text-left font-medium" />
            <th className="py-2 pr-4 text-left font-medium">This site</th>
            <th className="py-2 text-left font-medium">GoHighLevel</th>
          </tr>
        </thead>
        <tbody>
          <Row
            label="Can be emailed"
            ours={m.ours}
            theirs={
              <>
                {m.theirs}
                {m.agree === false && <Badge tone="neutral">disagree</Badge>}
              </>
            }
            warn={m.agree === false}
          />
          <Row
            label="Status"
            ours={s ? `${s.status}${s.statusSource ? ` (from ${SOURCE[s.statusSource] ?? s.statusSource})` : ""}` : "not on the list"}
            theirs={found ? `DND ${found.dnd}${found.dndCode ? ` (${found.dndCode})` : ""}${found.globalDnd != null ? `, global DND ${found.globalDnd ? "on" : "off"}` : ""}` : "-"}
            warn={!!found?.conflict}
          />
          <Row label="Consented" ours={s?.consentedAt ? `${fmtDateTime(s.consentedAt)}${s.consentPolicyVersion ? `, policy ${s.consentPolicyVersion}` : ""}` : "-"} theirs="-" />
          <Row label="Tags" ours={r.mirror?.ghl_tags.length ? r.mirror.ghl_tags.join(", ") : "-"} theirs={found?.tags.length ? found.tags.join(", ") : "-"} />
          <Row
            label="Last synced"
            ours={fmtDateTime(r.mirror?.synced_at ?? s?.syncedAt ?? null)}
            theirs={found?.updatedAt ? `updated ${fmtDateTime(found.updatedAt)}` : "-"}
          />
          <Row label="Contact id" ours={txt(r.mirror?.ghl_contact_id)} theirs={found ? found.contactId : "-"} />
        </tbody>
      </table>

      {found?.conflict && (
        <p className="text-sm text-signal">
          GoHighLevel&apos;s global DND and its email DND disagree about this contact. Nothing was changed because of it. Check the contact by
          hand in GoHighLevel.
        </p>
      )}
      {r.mirror?.erased_at && <p className="text-sm text-ink-3">This address was erased on {fmtDateTime(r.mirror.erased_at)} and is never pushed again.</p>}

      {offerResubscribe && (
        <div className="rounded-xl border border-line p-4">
          <p className="text-sm text-ink-2">
            GoHighLevel says this person can be emailed again, but on this site they are unsubscribed. The CRM cannot tell us whether the
            person did that, a workflow did, or someone on your team did, and only the first is consent. Confirm only if you know they asked
            to come back.
          </p>
          <form action={confirmResubscribeAction} className="mt-3">
            <input type="hidden" name="email" value={r.email} />
            <button
              type="submit"
              className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-gold hover:text-gold"
            >
              They asked to come back, resubscribe them
            </button>
          </form>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-4">Consent history</h3>
        <DataTable
          head={["When", "What", "From", "Detail"]}
          empty={s ? "No history recorded." : "Not a newsletter subscriber, so there is no consent history."}
          rows={r.history.map((e) => [
            fmtDateTime(e.at),
            EVENT[e.type] ?? e.type,
            SOURCE[e.source] ?? e.source,
            e.reason ?? (e.policyVersion ? `policy ${e.policyVersion}` : "-"),
          ])}
        />
      </div>
    </div>
  );
}

export async function InspectorPanel({ email }: { email?: string }) {
  const result = email ? await inspectCrmContact(email) : null;

  return (
    <Panel title="Contact inspector">
      <form method="get" action="/admin/crm" className="flex flex-wrap gap-2">
        <input
          type="email"
          name="email"
          defaultValue={email ?? ""}
          placeholder="someone@example.com"
          required
          className="min-w-0 flex-1 rounded-full border border-line-strong bg-bg px-4 py-2 text-sm text-ink placeholder:text-ink-4 focus:border-gold focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-gold hover:text-gold"
        >
          Look up
        </button>
      </form>
      <p className="mt-2 text-xs text-ink-4">Shows what this site holds beside what GoHighLevel holds right now, and the full consent history.</p>
      {email && !result && <p className="mt-4 text-sm text-ink-3">That is not a valid email address.</p>}
      {result && <Result r={result} />}
    </Panel>
  );
}
