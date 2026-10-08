"use client";

import { Notice, btnPrimary, btnSecondary } from "@/components/portal/ui";
import { useErrorRetry } from "@/components/admin/use-error-retry";

/**
 * Something under /admin failed outside a dashboard page: most often the
 * dashboard layout itself (the inbox seed, for example), which
 * app/admin/(dashboard)/error.tsx cannot catch. It renders inside
 * app/admin/layout.tsx only, with no menu and no tab bar, so it stands
 * alone: centred, full height, clear of the notch and the home indicator.
 *
 * Same look and rules as the dashboard error screen: never the error text,
 * Retry (offline it says so and does nothing), and a plain link to Leads.
 * The Retry is shared with it: components/admin/use-error-retry.ts.
 */
export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const { message, retrying, retry } = useErrorRetry(error, unstable_retry);

  return (
    <main className="flex min-h-dvh items-center justify-center pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))]">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="font-display text-2xl font-bold text-ink">Tekmadev admin</h1>
        <div role="alert">
          <Notice kind="err">{message}</Notice>
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={retry} disabled={retrying} className={`${btnPrimary} w-full`}>
            {retrying ? "Retrying" : "Retry"}
          </button>
          {/* A full page load on purpose: it also heals a page left stale by a new deploy. */}
          <a href="/admin/leads" className={`${btnSecondary} w-full`}>
            Leads
          </a>
        </div>
      </div>
    </main>
  );
}
