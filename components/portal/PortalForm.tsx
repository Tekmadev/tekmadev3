"use client";

import { useActionState, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { Notice } from "@/components/portal/ui";

/**
 * Result every portal server action returns. `message` renders inline above
 * the form; `redirect` performs a full navigation (through the proxy) for the
 * few flows that change page: sign in/out, set password, switch account,
 * Stripe billing portal.
 *
 * Why not redirect() inside the action: the portal runs on a rewritten host
 * (account.tekmadev.com/x -> /portal/x). Next streams the redirect target's
 * data inside the action response, and the client cannot reconcile that
 * seeded tree with the new URL on a rewritten route, so it renders 404.
 * Revalidating in place and hard-navigating when needed sidesteps it.
 */
export type ActionResult = { ok: boolean; message?: string; redirect?: string } | undefined;

export function PortalForm({
  action,
  children,
  className,
  id,
  messageAtBottom = false,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** Long forms: show the result next to the submit buttons too. */
  messageAtBottom?: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(async (_prev, formData) => {
    const result = await action(formData);
    if (result?.redirect) {
      window.location.assign(result.redirect);
      return { ok: true };
    }
    return result;
  }, undefined);

  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state?.message) noticeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state]);

  const notice = state?.message ? (
    <div ref={noticeRef} role="status" aria-live="polite">
      <Notice kind={state.ok ? "ok" : "err"}>{state.message}</Notice>
    </div>
  ) : null;

  return (
    <form id={id} action={formAction} className={cn(className)}>
      {!messageAtBottom && notice}
      {children}
      {messageAtBottom && notice}
    </form>
  );
}
