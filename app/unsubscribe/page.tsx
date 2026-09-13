import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { business } from "@/config/site";
import { confirmUnsubscribeAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

type Search = { t?: string; done?: string; e?: string };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { t, done, e } = await searchParams;

  const state: "done" | "invalid" | "error" | "confirm" =
    done === "1" ? "done" : e === "notfound" ? "invalid" : e ? "error" : t ? "confirm" : "invalid";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-5 py-16 text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line-strong bg-surface p-8 text-center shadow-sm sm:p-10">
        <Image
          src="/images/logo/TMD2_logo.svg"
          alt={`${business.name} mark`}
          width={48}
          height={48}
          className="mx-auto h-12 w-12"
        />

        {state === "confirm" && (
          <>
            <h1 className="mt-6 font-display text-xl font-bold text-ink">Unsubscribe from emails?</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-3">
              You&apos;ll stop receiving the Growth Memo and other marketing emails from {business.name}. You
              can resubscribe anytime.
            </p>
            <form action={confirmUnsubscribeAction} className="mt-6">
              <input type="hidden" name="t" value={t} />
              <button
                type="submit"
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-ink px-6 text-sm font-semibold text-bg transition-colors hover:bg-signal"
              >
                Unsubscribe
              </button>
            </form>
            <Link href="/" className="mt-4 inline-block text-sm text-ink-4 transition-colors hover:text-gold">
              Never mind, keep me subscribed
            </Link>
          </>
        )}

        {state === "done" && (
          <>
            <h1 className="mt-6 font-display text-xl font-bold text-ink">You&apos;re unsubscribed</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-3">
              You won&apos;t receive any more marketing emails from {business.name}. Changed your mind? You&apos;re
              always welcome back.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl border border-line-strong px-6 text-sm font-semibold text-ink transition-colors hover:border-gold hover:text-gold"
            >
              Back to {business.domain}
            </Link>
          </>
        )}

        {(state === "invalid" || state === "error") && (
          <>
            <h1 className="mt-6 font-display text-xl font-bold text-ink">
              {state === "invalid" ? "Link not recognized" : "Something went wrong"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-3">
              {state === "invalid"
                ? "This unsubscribe link is invalid or has expired. If you keep getting emails, reply to any of them and we'll remove you."
                : "We couldn't process that just now. Please try again in a moment."}
            </p>
            <a
              href={`mailto:${business.email}?subject=Unsubscribe`}
              className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl border border-line-strong px-6 text-sm font-semibold text-ink transition-colors hover:border-gold hover:text-gold"
            >
              Email us to unsubscribe
            </a>
          </>
        )}
      </div>
    </main>
  );
}
