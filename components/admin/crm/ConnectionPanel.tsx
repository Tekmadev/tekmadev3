import { Check, X } from "lucide-react";
import { crmConfigured, getCrmProbeSetting, getCrmSyncSetting, type CrmSyncSetting } from "@/lib/crm/config";
import { Badge, Panel, fmtDateTime } from "@/components/admin/ui";
import { RefreshButton } from "@/components/admin/PendingButton";
import { setCrmSwitchAction, verifyConnectionAction } from "@/app/admin/(dashboard)/crm/actions";

/**
 * Whether the CRM is connected, whether the connection is proven, and the three
 * switches.
 *
 * Every switch shows three states, the way the sales tax panel does, because
 * "on here but not running" has to be visible: a switch that reads on while
 * nothing is actually syncing is the one state the owner would otherwise
 * mistake for working.
 */

type Surface = keyof Omit<CrmSyncSetting, "health">;

const SURFACES: { key: Surface; title: string; does: string }[] = [
  {
    key: "outbound",
    title: "Outbound",
    does: "Pushes new leads, newsletter signups, bookings and clients into GoHighLevel as contacts with their tags and attribution, and pushes every unsubscribe from this site as email DND. Turning it on also queues everyone already in the database once.",
  },
  {
    key: "inbound",
    title: "Inbound",
    does: "Applies unsubscribes that happen inside GoHighLevel to our subscriber list, and brings client appointments in for your review. Needs the private app from step 8 of the setup guide.",
  },
  {
    key: "reconcile",
    title: "Nightly reconcile",
    does: "Once a night, checks every contact on both sides and applies any unsubscribe a webhook missed. It stops and asks you if one night would unsubscribe more than a fifth of the list.",
  },
];

/** What each probe check proves, in words the owner can act on. */
const CHECKS: Record<string, string> = {
  auth: "Your token and sub-account id work.",
  dnd_polarity:
    "\"Do not disturb\" ON really means do not email. Their documentation contradicts itself here, and read backwards an unsubscribe would become a resubscribe.",
  dnd_legacy_rejected: "An old-style consent change cannot quietly do nothing.",
  lookup_with_pit: "The site can find a contact by email with this kind of token.",
  tags_preserved_on_upsert: "Updating a contact keeps the tags your own workflows added.",
  delete_tags_body: "The site can remove the newsletter tag when someone unsubscribes.",
  dedupe_on_email: "Your account matches contacts by email, so one person's update can never land on someone else.",
  custom_fields: "The ten Tekmadev fields exist in your account and can be written.",
};

type StoredCheck = { name: string; ok: boolean; detail: string };

function storedChecks(v: unknown): StoredCheck[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (c): c is StoredCheck =>
      !!c && typeof c === "object" && typeof (c as StoredCheck).name === "string" && typeof (c as StoredCheck).ok === "boolean",
  );
}

const btn =
  "rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-50";

export async function ConnectionPanel() {
  const configured = crmConfigured();
  const [setting, probe] = await Promise.all([getCrmSyncSetting(), getCrmProbeSetting()]);
  const checks = storedChecks(probe.checks);
  const verified = configured && setting.health === "ok";

  const state = !configured
    ? { tone: "muted" as const, label: "Not connected" }
    : setting.health === "auth_failed"
      ? { tone: "neutral" as const, label: "Token rejected" }
      : setting.health === "ok"
        ? { tone: "ok" as const, label: "Verified" }
        : { tone: "neutral" as const, label: "Not verified" };

  return (
    <Panel title="Connection" action={<Badge tone={state.tone}>{state.label}</Badge>}>
      <p className="text-sm text-ink-2">
        {!configured
          ? "GHL_PIT_TOKEN and GHL_LOCATION_ID are not both set in Vercel, so nothing talks to GoHighLevel. Everything below stays off until they are, and a redeploy picks them up."
          : setting.health === "auth_failed"
            ? "GoHighLevel refused our token, so all syncing has stopped. Create a fresh Private Integration Token, put it in GHL_PIT_TOKEN in Vercel, redeploy, then verify again."
            : verified
              ? "Connected and proven against a throwaway contact. The switches below can be turned on."
              : "Connected, but not proven yet. Verify first: nothing can be switched on until every check below is green."}
      </p>

      {configured && (
        <form action={verifyConnectionAction} className="mt-4">
          <RefreshButton pendingLabel="Checking, about 20 seconds">Verify connection</RefreshButton>
        </form>
      )}

      {checks.length > 0 && (
        <ul className="mt-5 space-y-2.5">
          {checks.map((c) => (
            <li key={c.name} className="flex gap-3 text-sm">
              {c.ok ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep" aria-hidden />
              ) : (
                <X className="mt-0.5 h-4 w-4 shrink-0 text-signal" aria-hidden />
              )}
              <div>
                <p className="text-ink-2">
                  <span className="sr-only">{c.ok ? "Passed: " : "Failed: "}</span>
                  {CHECKS[c.name] ?? c.name}
                </p>
                {!c.ok && <p className="mt-0.5 text-xs text-ink-4">{c.detail}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {typeof probe.at === "string" && (
        <p className="mt-3 text-xs text-ink-4">
          Last checked {fmtDateTime(probe.at)}
          {probe.lookupPath ? ` · finds contacts through the ${probe.lookupPath === "lookup" ? "lookup" : "duplicate search"} endpoint` : ""}
          {typeof probe.probeContact === "string" ? ` · ${probe.probeContact}` : ""}
        </p>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {SURFACES.map((s) => {
          const on = setting[s.key];
          const badge = !on
            ? { tone: "muted" as const, label: "Off" }
            : verified
              ? { tone: "ok" as const, label: "Running" }
              : { tone: "neutral" as const, label: "On, not running" };
          return (
            <div key={s.key} className="flex flex-col rounded-xl border border-line p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">{s.title}</h3>
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </div>
              <p className="mt-2 flex-1 text-xs text-ink-3">{s.does}</p>
              {on && !verified && (
                <p className="mt-2 text-xs text-signal">Switched on, but nothing runs until the connection is verified.</p>
              )}
              <form action={setCrmSwitchAction} className="mt-3">
                <input type="hidden" name="surface" value={s.key} />
                <input type="hidden" name="on" value={on ? "0" : "1"} />
                <button type="submit" className={btn} disabled={!on && !verified}>
                  {on ? "Turn off" : "Turn on"}
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
