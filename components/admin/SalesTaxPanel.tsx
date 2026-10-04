import { getTaxStatus, salesTaxState, taxReadinessLine } from "@/lib/stripe-tax";
import { getSalesTaxSetting } from "@/lib/site-settings";
import { testModeConfigured, type StripeMode } from "@/lib/stripe-mode";
import { Badge, Panel } from "@/components/admin/ui";
import { setSalesTaxAction } from "@/app/admin/(dashboard)/pricing/actions";
import { PendingSubmit } from "@/components/PendingSubmit";

/**
 * Whether checkout charges GST/HST, and the owner's switch for it.
 *
 * Two things must both hold (see lib/stripe-tax.ts): the switch here is on, and
 * Stripe Tax is ready in the Stripe account. The panel shows each one plainly,
 * because "on here but not ready there" sells without tax and must be visible.
 */

const btn =
  "rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-gold hover:text-gold";

function Switch({ mode, on }: { mode: StripeMode; on: boolean }) {
  return (
    <form action={setSalesTaxAction}>
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="on" value={on ? "0" : "1"} />
      <PendingSubmit className={btn}>
        {on ? "Turn off" : "Turn on"}
        {mode === "test" ? " in test mode" : ""}
      </PendingSubmit>
    </form>
  );
}

/** `canEdit` (pricing.write) shows the switches; without it the panel is view only. The action checks it again. */
export async function SalesTaxPanel({ canEdit }: { canEdit: boolean }) {
  const withTest = testModeConfigured();
  const [setting, live, test] = await Promise.all([
    getSalesTaxSetting(),
    getTaxStatus("live", { fresh: true }),
    withTest ? getTaxStatus("test", { fresh: true }) : Promise.resolve(null),
  ]);
  const charging = salesTaxState(setting.live, live) === "charging";

  return (
    <Panel
      title="Sales tax (GST/HST)"
      action={<Badge tone={charging ? "ok" : "muted"}>{charging ? "Charging" : setting.live ? "On, not charging" : "Off"}</Badge>}
    >
      <p className="text-sm text-ink-2">
        {charging
          ? "New checkouts add GST/HST by the buyer's province, and the tax shows on the invoice."
          : setting.live
            ? "Switched on here, but Stripe is not ready, so checkouts are going out WITHOUT tax."
            : "Checkout is charging no tax. Turn it on when you are ready for buyers to see tax added."}
      </p>
      <p className="mt-2 text-sm text-ink-3">{taxReadinessLine(live)}</p>

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Switch mode="live" on={setting.live} />
          {test && <Switch mode="test" on={setting.test} />}
        </div>
      )}
      {test && (
        <p className="mt-3 text-xs text-ink-4">
          Test mode is {setting.test ? "on" : "off"}. {test.active ? "The sandbox is ready for tax." : "The sandbox has tax settings of its own, and they are not finished."}
        </p>
      )}

      <ul className="mt-4 list-disc space-y-1.5 pl-5 text-xs text-ink-4">
        <li>Your GST/HST number prints on invoices once it is added in Stripe: Settings, Billing, Invoice template, Tax tab, set as default.</li>
        <li>Plans that are already running are not changed by this switch.</li>
      </ul>
    </Panel>
  );
}
