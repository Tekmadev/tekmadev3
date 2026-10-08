"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isOffline, isResult, type LeadActionResult } from "@/lib/leads-ui";
import { actionFailure } from "./outreach-logic";

/**
 * Runs one of the leads server actions inside a transition, so `pending` stays
 * true until React has applied the revalidated page (the new lead and the new
 * first page of touches arrive with the result). It always resolves: a throw,
 * or a value that is not a result (a redirect after the session ended), turns
 * into `actionFailure()`. A refusal that carries the lead (someone else got
 * the booking credit first) refreshes the page so the rows show the server's
 * state, unless the phone is offline.
 */
export function useLeadAction(): { pending: boolean; run: (call: () => Promise<LeadActionResult>) => Promise<LeadActionResult> } {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = useCallback(
    (call: () => Promise<LeadActionResult>) =>
      new Promise<LeadActionResult>((resolve) => {
        startTransition(async () => {
          let result: LeadActionResult;
          try {
            const value: unknown = await call();
            result = isResult(value) ? (value as LeadActionResult) : actionFailure();
          } catch {
            result = actionFailure();
          }
          if (!result.ok && result.lead && !isOffline()) router.refresh();
          resolve(result);
        });
      }),
    [router],
  );

  return { pending, run };
}

export type FailedResult = Extract<LeadActionResult, { ok: false }>;

/**
 * An editor's save on top of useLeadAction: remembers which button was
 * pressed (for its pending label) and the failure to show at the top of the
 * editor. A success goes to `onSaved` with the server's message (the card
 * closes the editor and shows it); a failure keeps the editor open with the
 * choice kept. A new try clears the old failure first, so the same message
 * is announced again if it fails again.
 */
export function useEditorSave(onSaved: (message: string) => void) {
  const { pending, run } = useLeadAction();
  const [failure, setFailure] = useState<FailedResult | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);

  const save = async (button: string, call: () => Promise<LeadActionResult>): Promise<LeadActionResult> => {
    setPressed(button);
    setFailure(null);
    const result = await run(call);
    if (result.ok) onSaved(result.message);
    else setFailure(result);
    return result;
  };

  /** The label of `button`: its pending label while it is the one saving. */
  const label = (button: string, idle: string, busy: string) => (pending && pressed === button ? busy : idle);

  return { pending, pressed, failure, setFailure, save, label };
}
