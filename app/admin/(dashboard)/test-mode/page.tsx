import { requireOwner } from "@/lib/admin";
import { business } from "@/config/site";
import { testModeSwitchedOn } from "@/lib/test-mode";
import { getTestModeStatus, listTestOrders } from "@/lib/test-mode-data";
import { PageHeader, Panel, DataTable, Badge, Notice, fmtDateTime, fmtMoney, txt } from "@/components/admin/ui";
import { purgeTestDataAction, setupTestCatalogAction, switchTestModeAction } from "./actions";

export const dynamic = "force-dynamic";

const primary = "rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2";
const secondary = "rounded-full border border-line-strong px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-ink/40";

const ERRORS: Record<string, string> = {
  keys: "Test mode is not configured yet. Add STRIPE_TEST_SECRET_KEY and STRIPE_TEST_WEBHOOK_SECRET in Vercel, then redeploy.",
  catalog: "Set up the test catalog first, so there is something to buy in the sandbox.",
  confirm: "Tick the box to confirm before deleting test data.",
  stripe: "Stripe refused that. The message is below.",
};

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Badge tone={done ? "ok" : "muted"}>{done ? "Done" : "To do"}</Badge>
      <span className="text-sm leading-relaxed text-ink-2">{children}</span>
    </li>
  );
}

/**
 * Rehearse a real purchase on the real site without moving money. Owner only.
 * Nothing here can affect a real customer: see lib/stripe-mode.ts for the rules.
 */
export default async function TestModePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string; m?: string; n?: string; c?: string; o?: string; s?: string; l?: string }>;
}) {
  await requireOwner();
  const [p, status, on, orders] = await Promise.all([searchParams, getTestModeStatus(), testModeSwitchedOn(), listTestOrders()]);
  const active = on && status.configured && status.catalogReady;
  const webhookUrl = `${business.url.replace("://", "://www.")}/api/webhooks/stripe`;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Test mode"
        subtitle="Buy Webline on the live site with a Stripe test card, and walk the whole onboarding. No money moves, and nothing here reaches a real customer."
      />

      {p.ok === "on" && <Notice kind="ok">Test mode is on in this browser for two hours. Open the Webline page and buy it.</Notice>}
      {p.ok === "off" && <Notice kind="ok">Test mode is off. Checkout in this browser is live again.</Notice>}
      {p.ok === "catalog" && <Notice kind="ok">Test catalog is ready{p.n && p.n !== "0" ? ` (${p.n} item${p.n === "1" ? "" : "s"} created in the sandbox)` : ", nothing needed rebuilding"}.</Notice>}
      {p.ok === "purged" && (
        <Notice kind="ok">
          Deleted {p.c ?? 0} test account{p.c === "1" ? "" : "s"}, {p.o ?? 0} order{p.o === "1" ? "" : "s"}, {p.s ?? 0} subscription{p.s === "1" ? "" : "s"} and {p.l ?? 0} login{p.l === "1" ? "" : "s"}.
        </Notice>
      )}
      {p.e && (
        <Notice kind="err">
          {ERRORS[p.e] ?? "Something went wrong."}
          {p.m ? ` ${p.m}` : ""}
        </Notice>
      )}
      {status.keyIsLive && (
        <Notice kind="err">
          STRIPE_TEST_SECRET_KEY contains a LIVE key. Test mode is disabled until it holds a sandbox key (it starts with sk_test_).
        </Notice>
      )}

      <Panel title={active ? "Test mode is ON in this browser" : "Test mode is off"}>
        <p className="text-sm leading-relaxed text-ink-2">
          {active
            ? "Webline checkout in this browser now uses the Stripe sandbox. Every other visitor, and every other browser, still pays for real. It switches itself off after two hours."
            : "Checkout is live for everyone, including you. Switching it on affects only this browser, only while you are signed in as an admin."}
        </p>
        <form action={switchTestModeAction} className="mt-5 flex flex-wrap items-center gap-3">
          <input type="hidden" name="on" value={active ? "0" : "1"} />
          <button type="submit" className={active ? secondary : primary}>
            {active ? "Switch test mode off" : "Switch test mode on"}
          </button>
          {active && (
            <a href="/webline" className={primary}>
              Go buy Webline
            </a>
          )}
        </form>
        {active && (
          <dl className="mt-6 grid gap-3 border-t border-line pt-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-4">Test card</dt>
              <dd className="mt-1 font-mono text-ink">4242 4242 4242 4242</dd>
              <dd className="text-ink-3">Any future expiry, any CVC, any postal code.</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-4">Use a fresh email</dt>
              <dd className="mt-1 font-mono text-ink">you+test1@gmail.com</dd>
              <dd className="text-ink-3">It lands in your normal inbox. Never a real client's address, and not your admin login.</dd>
            </div>
          </dl>
        )}
      </Panel>

      <Panel title="Setup">
        <ol className="divide-y divide-line">
          <Step done={status.keyPresent && !status.keyIsLive}>
            In Stripe, open the account picker and create a <strong>sandbox</strong> for this site. Copy its secret key into Vercel as{" "}
            <code className="font-mono text-ink">STRIPE_TEST_SECRET_KEY</code>.
          </Step>
          <Step done={status.webhookSecretPresent}>
            Inside that sandbox, add a webhook endpoint for <code className="font-mono text-ink">{webhookUrl}</code> with the same events as your live one. Copy its signing secret into Vercel as{" "}
            <code className="font-mono text-ink">STRIPE_TEST_WEBHOOK_SECRET</code>, then redeploy.
          </Step>
          <Step done={status.catalogReady}>
            Build the test catalog: the same Webline and Webline Care, at today&apos;s prices, inside the sandbox.
          </Step>
        </ol>
        <form action={setupTestCatalogAction} className="mt-5">
          <button type="submit" className={status.catalogReady ? secondary : primary} disabled={!status.configured}>
            {status.catalogReady ? "Rebuild test catalog" : "Set up test catalog"}
          </button>
          <p className="mt-3 text-xs text-ink-4">
            Run it again after changing a price in Pricing, or after clearing the sandbox&apos;s data in Stripe. It only rebuilds what no longer matches.
          </p>
        </form>
        <ul className="mt-5 flex flex-wrap gap-2">
          {status.products.map((prod) => (
            <li key={prod.id} className="flex items-center gap-2 text-xs text-ink-3">
              {prod.name}
              <Badge tone={prod.oneTimeReady ? "ok" : "muted"}>{prod.oneTimeReady ? "price ready" : "no price"}</Badge>
              {prod.monthlyNeeded && <Badge tone={prod.monthlyReady ? "ok" : "muted"}>{prod.monthlyReady ? "care plan ready" : "no care plan"}</Badge>}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Test purchases">
        <DataTable
          head={["When", "Email", "Business", "Status", "Amount"]}
          rows={orders.map((o) => [fmtDateTime(o.created_at), txt(o.email), txt(o.business_name), txt(o.status), fmtMoney(o.amount_total, o.currency)])}
          empty="No test purchases yet. They never appear in Subscriptions or in any total."
        />
        <p className="mt-4 text-xs text-ink-4">
          Test accounts show in Clients with a Test badge, so you can see the admin side of the onboarding too.
        </p>
      </Panel>

      <Panel title="Clean up">
        <p className="text-sm leading-relaxed text-ink-2">
          {status.counts.clients} test account{status.counts.clients === 1 ? "" : "s"}, {status.counts.orders} test order{status.counts.orders === 1 ? "" : "s"},{" "}
          {status.counts.subscriptions} test subscription{status.counts.subscriptions === 1 ? "" : "s"}. Deleting removes them and everything attached: checklist, agreement, uploads,
          notifications, and the login, if it is on no real account. Real clients are never touched. Stripe&apos;s own sandbox data stays; clear it in Stripe if you want.
        </p>
        <form action={purgeTestDataAction} className="mt-5 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" name="confirm" className="h-4 w-4" />
            Delete all test data
          </label>
          <button type="submit" className={secondary}>
            Delete
          </button>
        </form>
      </Panel>
    </div>
  );
}
