"use client";

import { Notice, btnPrimary, btnSecondary } from "@/components/portal/ui";
import { useErrorRetry } from "@/components/admin/use-error-retry";

/**
 * A page under the dashboard failed to render. This shows inside the
 * dashboard layout, so the tab bar and the menu still work. Without it, the
 * home-screen app showed Next's bare "Application error" page, which has no
 * reload and no back button.
 *
 * The error text is never shown: server errors carry only a digest, and a
 * client error's message is not for staff. app/admin/error.tsx is the same
 * screen for a throw in the dashboard layout itself; both use the Retry in
 * components/admin/use-error-retry.ts.
 */
export default function AdminPageError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const { message, retrying, retry } = useErrorRetry(error, unstable_retry);

  return (
    <div className="flex flex-col gap-4">
      <div role="alert">
        <Notice kind="err">{message}</Notice>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button type="button" onClick={retry} disabled={retrying} className={`${btnPrimary} w-full sm:w-auto`}>
          {retrying ? "Retrying" : "Retry"}
        </button>
        {/* A full page load on purpose: it also heals a page left stale by a new deploy. */}
        <a href="/admin/leads" className={`${btnSecondary} w-full sm:w-auto`}>
          Leads
        </a>
      </div>
    </div>
  );
}
